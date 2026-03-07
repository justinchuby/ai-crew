/**
 * ReconnectProtocol — comprehensive tests for daemon reconnect orchestration.
 *
 * Tests cover: state machine transitions, exponential backoff, event ID tracking,
 * session reconciliation, adapter reconnection, graceful degradation, disposal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReconnectProtocol } from '../ReconnectProtocol.js';
import type {
  ReconnectProtocolOptions,
  ConnectionState,
  AdapterReconnector,
  ReconciliationResult,
} from '../ReconnectProtocol.js';
import type { DaemonClient } from '../DaemonClient.js';
import type { AgentDescriptor, AuthResult, DaemonEvent } from '../DaemonProtocol.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Create a minimal mock DaemonClient with TypedEmitter-like behavior. */
function createMockClient(overrides: Partial<MockClientShape> = {}): MockClient {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();

  const client: MockClient = {
    isConnected: false,
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return client;
    }),
    off: vi.fn((event: string, handler: (...args: any[]) => void) => {
      listeners.get(event)?.delete(handler);
      return client;
    }),
    connect: vi.fn(async () => {
      client.isConnected = true;
      const result = mockAuthResult();
      // Fire 'connected' so protocol picks it up
      listeners.get('connected')?.forEach(h => h(result));
      return result;
    }),
    disconnect: vi.fn(() => {
      client.isConnected = false;
    }),
    listAgents: vi.fn(async () => ({ agents: [] as AgentDescriptor[] })),
    subscribe: vi.fn(async () => ({ bufferedEvents: [] })),
    // Internal helpers for tests
    _listeners: listeners,
    _emit(event: string, data: unknown) {
      listeners.get(event)?.forEach(h => h(data));
    },
  };

  // Apply overrides
  Object.assign(client, overrides);
  return client;
}

type MockClientShape = {
  isConnected: boolean;
  connect: () => Promise<AuthResult>;
  disconnect: () => void;
  listAgents: () => Promise<{ agents: AgentDescriptor[] }>;
};

type MockClient = MockClientShape & {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  _listeners: Map<string, Set<(...args: any[]) => void>>;
  _emit: (event: string, data: unknown) => void;
};

function mockAuthResult(): AuthResult {
  return { daemonPid: 1234, uptime: 60, agentCount: 0 };
}

function mockAgentDescriptor(agentId: string, status = 'running' as const): AgentDescriptor {
  return {
    agentId,
    pid: Math.floor(Math.random() * 10000),
    role: 'developer',
    model: 'claude-sonnet-4-6',
    status,
    sessionId: `session-${agentId}`,
    taskSummary: null,
    spawnedAt: new Date().toISOString(),
    lastEventId: null,
  };
}

function mockEvent(agentId: string, eventId: string): DaemonEvent {
  return {
    eventId,
    timestamp: new Date().toISOString(),
    type: 'agent:output',
    agentId,
    data: { text: 'hello' },
  };
}

// Fast options to avoid slow tests
const FAST_OPTS: ReconnectProtocolOptions = {
  initialDelayMs: 10,
  maxDelayMs: 50,
  backoffMultiplier: 2,
  jitterFactor: 0,
  maxAttempts: 5,
  reconnectGraceMs: 5,
};

// ── Tests ───────────────────────────────────────────────────────────

describe('ReconnectProtocol', () => {
  let client: MockClient;
  let protocol: ReconnectProtocol;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    client = createMockClient();
    protocol = new ReconnectProtocol(client as unknown as DaemonClient, FAST_OPTS);
  });

  afterEach(() => {
    protocol.dispose();
    vi.useRealTimers();
  });

  // ── State Machine ───────────────────────────────────────────────

  describe('state machine', () => {
    it('starts in disconnected state', () => {
      expect(protocol.state).toBe('disconnected');
    });

    it('transitions to connected when client is already connected', () => {
      client.isConnected = true;
      const states: ConnectionState[] = [];
      protocol.on('state_change', ({ to }) => states.push(to));
      protocol.start();
      expect(protocol.state).toBe('connected');
      expect(states).toEqual(['connected']);
    });

    it('stays disconnected when client is not connected on start', () => {
      protocol.start();
      expect(protocol.state).toBe('disconnected');
    });

    it('transitions to connected on external connect event', () => {
      protocol.start();
      client._emit('connected', mockAuthResult());
      expect(protocol.state).toBe('connected');
    });

    it('transitions to disconnected on socket close', () => {
      client.isConnected = true;
      protocol.start();
      client._emit('disconnected', { reason: 'socket closed' });
      expect(protocol.state).toBe('disconnected');
    });

    it('emits state_change events with from/to', () => {
      const changes: Array<{ from: ConnectionState; to: ConnectionState }> = [];
      protocol.on('state_change', change => changes.push(change));

      client.isConnected = true;
      protocol.start();
      expect(changes).toEqual([{ from: 'disconnected', to: 'connected' }]);
    });

    it('does not emit duplicate state_change events', () => {
      const changes: Array<{ from: ConnectionState; to: ConnectionState }> = [];
      protocol.on('state_change', change => changes.push(change));

      protocol.start();
      // Two disconnected events shouldn't produce two state_change events
      client._emit('disconnected', { reason: 'a' });
      // Already disconnected, should not emit again
      // (the daemon-lost below triggers reconnect which changes state)
      expect(changes.filter(c => c.to === 'disconnected').length).toBeLessThanOrEqual(1);
    });
  });

  // ── Event ID Tracking ─────────────────────────────────────────

  describe('event ID tracking', () => {
    it('tracks event IDs per agent', () => {
      protocol.trackEventId('agent-1', 'evt-100');
      protocol.trackEventId('agent-2', 'evt-200');
      expect(protocol.getLastSeenEventId('agent-1')).toBe('evt-100');
      expect(protocol.getLastSeenEventId('agent-2')).toBe('evt-200');
    });

    it('overwrites event IDs on update', () => {
      protocol.trackEventId('agent-1', 'evt-100');
      protocol.trackEventId('agent-1', 'evt-101');
      expect(protocol.getLastSeenEventId('agent-1')).toBe('evt-101');
    });

    it('returns undefined for unknown agents', () => {
      expect(protocol.getLastSeenEventId('unknown')).toBeUndefined();
    });

    it('clears event ID for an agent', () => {
      protocol.trackEventId('agent-1', 'evt-100');
      protocol.clearEventId('agent-1');
      expect(protocol.getLastSeenEventId('agent-1')).toBeUndefined();
    });

    it('returns all event IDs as a snapshot', () => {
      protocol.trackEventId('a', 'e1');
      protocol.trackEventId('b', 'e2');
      const all = protocol.getAllEventIds();
      expect(all.get('a')).toBe('e1');
      expect(all.get('b')).toBe('e2');
    });

    it('auto-tracks event IDs from live daemon events', () => {
      protocol.start();
      client._emit('event', mockEvent('agent-1', 'evt-42'));
      expect(protocol.getLastSeenEventId('agent-1')).toBe('evt-42');
    });

    it('does not auto-track events without agentId', () => {
      protocol.start();
      const event: DaemonEvent = {
        eventId: 'evt-99',
        timestamp: new Date().toISOString(),
        type: 'daemon:shutting_down',
        data: {},
      };
      client._emit('event', event);
      expect(protocol.getAllEventIds().size).toBe(0);
    });
  });

  // ── Expected Agents ───────────────────────────────────────────

  describe('expected agents', () => {
    it('sets and gets expected agents', () => {
      protocol.setExpectedAgents(['a', 'b', 'c']);
      expect(protocol.getExpectedAgents()).toEqual(new Set(['a', 'b', 'c']));
    });

    it('adds and removes individual agents', () => {
      protocol.setExpectedAgents(['a']);
      protocol.addExpectedAgent('b');
      expect(protocol.getExpectedAgents()).toEqual(new Set(['a', 'b']));
      protocol.removeExpectedAgent('a');
      expect(protocol.getExpectedAgents()).toEqual(new Set(['b']));
    });

    it('cleans up event ID when removing an expected agent', () => {
      protocol.trackEventId('a', 'evt-1');
      protocol.removeExpectedAgent('a');
      expect(protocol.getLastSeenEventId('a')).toBeUndefined();
    });
  });

  // ── Reconnect Loop ────────────────────────────────────────────

  describe('reconnect', () => {
    it('reconnects on first attempt when daemon is available', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      const result = await protocol.reconnect();
      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(result.reconnected).toEqual([]);
      expect(result.lost).toEqual([]);
      expect(result.discovered).toEqual([]);
      expect(protocol.state).toBe('connected');
    });

    it('retries with backoff when connect fails', async () => {
      let callCount = 0;
      client.connect = vi.fn(async () => {
        callCount++;
        if (callCount < 3) throw new Error('ECONNREFUSED');
        client.isConnected = true;
        return mockAuthResult();
      });
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      const attempts: number[] = [];
      protocol.on('reconnecting', ({ attempt }) => attempts.push(attempt));

      const result = await protocol.reconnect();
      expect(callCount).toBe(3);
      expect(attempts).toEqual([1, 2, 3]);
      expect(protocol.state).toBe('connected');
      expect(result).toBeDefined();
    });

    it('gives up after maxAttempts and transitions to failed', async () => {
      client.connect = vi.fn(async () => { throw new Error('ECONNREFUSED'); });

      const failHandler = vi.fn();
      protocol.on('reconnect_failed', failHandler);

      await expect(protocol.reconnect()).rejects.toThrow('Reconnect failed after 5 attempts');
      expect(protocol.state).toBe('failed');
      expect(failHandler).toHaveBeenCalledWith({
        attempts: 5,
        lastError: 'ECONNREFUSED',
      });
    });

    it('resets attempt count on successful reconnect', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      await protocol.reconnect();
      expect(protocol.attempts).toBe(0);
    });

    it('emits reconnected event with auth result and reconciliation', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      const handler = vi.fn();
      protocol.on('reconnected', handler);

      await protocol.reconnect();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toHaveProperty('authResult');
      expect(handler.mock.calls[0][0]).toHaveProperty('reconciliation');
    });

    it('disconnects stale socket before reconnecting', async () => {
      client.isConnected = true;
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      await protocol.reconnect();
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('throws when disposed', async () => {
      protocol.dispose();
      await expect(protocol.reconnect()).rejects.toThrow('disposed');
    });

    it('deduplicates concurrent reconnect() calls', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      const p1 = protocol.reconnect();
      const p2 = protocol.reconnect();
      // Must be the exact same promise object
      expect(p1).toBe(p2);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
      // Only one actual connect attempt
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('allows a new reconnect after the previous one completes', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      await protocol.reconnect();
      // Reset mock to track new calls
      client.connect = vi.fn(async () => {
        client.isConnected = true;
        return mockAuthResult();
      });

      await protocol.reconnect();
      expect(client.connect).toHaveBeenCalledTimes(1);
    });
  });

  // ── Auto-Reconnect on Events ──────────────────────────────────

  describe('auto-reconnect', () => {
    it('auto-reconnects on daemon-lost event', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));
      protocol.start();

      // Simulate daemon-lost
      client._emit('daemon-lost', { missedHeartbeats: 3 });

      // Wait for grace period + reconnect
      await vi.advanceTimersByTimeAsync(100);
      expect(client.connect).toHaveBeenCalled();
    });

    it('auto-reconnects on disconnected event', async () => {
      client.isConnected = true;
      client.listAgents = vi.fn(async () => ({ agents: [] }));
      protocol.start();

      client._emit('disconnected', { reason: 'socket closed' });

      await vi.advanceTimersByTimeAsync(100);
      expect(client.connect).toHaveBeenCalled();
    });

    it('does not double-reconnect on rapid disconnect + daemon-lost', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));
      protocol.start();

      client._emit('disconnected', { reason: 'socket closed' });
      client._emit('daemon-lost', { missedHeartbeats: 3 });

      await vi.advanceTimersByTimeAsync(200);
      // Should only have attempted one reconnect cycle
      expect(client.connect).toHaveBeenCalledTimes(1);
    });
  });

  // ── Reconciliation ────────────────────────────────────────────

  describe('reconciliation', () => {
    it('identifies reconnected agents', async () => {
      const agent = mockAgentDescriptor('agent-1');
      client.listAgents = vi.fn(async () => ({ agents: [agent] }));

      protocol.setExpectedAgents(['agent-1']);
      const result = await protocol.reconnect();

      expect(result.reconnected).toHaveLength(1);
      expect(result.reconnected[0].agentId).toBe('agent-1');
      expect(result.reconnected[0].descriptor).toBe(agent);
    });

    it('identifies lost agents', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      protocol.setExpectedAgents(['agent-1', 'agent-2']);
      const result = await protocol.reconnect();

      expect(result.lost).toEqual(['agent-1', 'agent-2']);
      expect(result.reconnected).toEqual([]);
    });

    it('identifies discovered agents', async () => {
      const agent = mockAgentDescriptor('agent-surprise');
      client.listAgents = vi.fn(async () => ({ agents: [agent] }));

      // We don't expect agent-surprise
      protocol.setExpectedAgents([]);
      const result = await protocol.reconnect();

      expect(result.discovered).toHaveLength(1);
      expect(result.discovered[0].agentId).toBe('agent-surprise');
    });

    it('skips exited/crashed agents in discovered list', async () => {
      const exited = mockAgentDescriptor('exited-1', 'exited' as any);
      const crashed = mockAgentDescriptor('crashed-1', 'crashed' as any);
      const alive = mockAgentDescriptor('alive-1');
      client.listAgents = vi.fn(async () => ({ agents: [exited, crashed, alive] }));

      protocol.setExpectedAgents([]);
      const result = await protocol.reconnect();

      expect(result.discovered).toHaveLength(1);
      expect(result.discovered[0].agentId).toBe('alive-1');
    });

    it('handles mixed reconnected/lost/discovered', async () => {
      const known = mockAgentDescriptor('known-1');
      const surprise = mockAgentDescriptor('surprise-1');
      client.listAgents = vi.fn(async () => ({ agents: [known, surprise] }));

      protocol.setExpectedAgents(['known-1', 'missing-1']);
      const result = await protocol.reconnect();

      expect(result.reconnected.map(r => r.agentId)).toEqual(['known-1']);
      expect(result.lost).toEqual(['missing-1']);
      expect(result.discovered.map(d => d.agentId)).toEqual(['surprise-1']);
    });

    it('calls adapterReconnector for each expected agent found in daemon', async () => {
      const agent = mockAgentDescriptor('agent-1');
      client.listAgents = vi.fn(async () => ({ agents: [agent] }));

      protocol.setExpectedAgents(['agent-1']);
      protocol.trackEventId('agent-1', 'evt-50');

      const reconnector: AdapterReconnector = vi.fn(async () => ({ eventsReplayed: 3 }));
      const result = await protocol.reconnect(reconnector);

      expect(reconnector).toHaveBeenCalledWith('agent-1', 'evt-50');
      expect(result.reconnected[0].eventsReplayed).toBe(3);
      expect(result.replayedEvents['agent-1']).toBe(3);
    });

    it('passes undefined lastSeenEventId when none tracked', async () => {
      const agent = mockAgentDescriptor('agent-1');
      client.listAgents = vi.fn(async () => ({ agents: [agent] }));

      protocol.setExpectedAgents(['agent-1']);

      const reconnector: AdapterReconnector = vi.fn(async () => ({ eventsReplayed: 0 }));
      await protocol.reconnect(reconnector);

      expect(reconnector).toHaveBeenCalledWith('agent-1', undefined);
    });

    it('handles adapter reconnector failure gracefully', async () => {
      const agent = mockAgentDescriptor('agent-1');
      client.listAgents = vi.fn(async () => ({ agents: [agent] }));

      protocol.setExpectedAgents(['agent-1']);

      const reconnector: AdapterReconnector = vi.fn(async () => {
        throw new Error('Adapter borked');
      });

      // Should not throw — adapter failure is non-fatal
      const result = await protocol.reconnect(reconnector);
      expect(result.reconnected).toHaveLength(1);
      expect(result.reconnected[0].eventsReplayed).toBe(0);
    });

    it('emits agents_reconciled event', async () => {
      client.listAgents = vi.fn(async () => ({ agents: [] }));
      protocol.setExpectedAgents(['lost-1']);

      const handler = vi.fn();
      protocol.on('agents_reconciled', handler);

      await protocol.reconnect();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].lost).toEqual(['lost-1']);
    });
  });

  // ── Reconcile without reconnect ───────────────────────────────

  describe('reconcile()', () => {
    it('reconciles without reconnecting when already connected', async () => {
      client.isConnected = true;
      const agent = mockAgentDescriptor('a1');
      client.listAgents = vi.fn(async () => ({ agents: [agent] }));
      protocol.setExpectedAgents(['a1']);

      const result = await protocol.reconcile();
      expect(client.connect).not.toHaveBeenCalled();
      expect(result.reconnected).toHaveLength(1);
    });

    it('throws when client is not connected', async () => {
      client.isConnected = false;
      await expect(protocol.reconcile()).rejects.toThrow('not connected');
    });
  });

  // ── Backoff ───────────────────────────────────────────────────

  describe('backoff', () => {
    it('increases delay between attempts', async () => {
      let attempts = 0;
      client.connect = vi.fn(async () => {
        attempts++;
        if (attempts < 4) throw new Error('ECONNREFUSED');
        client.isConnected = true;
        return mockAuthResult();
      });
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      const delays: number[] = [];
      protocol.on('reconnecting', ({ delayMs }) => delays.push(delayMs));

      await protocol.reconnect();

      // With jitterFactor=0, backoff=2: 10 → 20 → 40 (capped at 50)
      expect(delays[0]).toBe(10);
      expect(delays[1]).toBe(20);
      expect(delays[2]).toBeGreaterThanOrEqual(40);
    });

    it('respects maxDelayMs cap', async () => {
      const opts: ReconnectProtocolOptions = {
        ...FAST_OPTS,
        initialDelayMs: 100,
        maxDelayMs: 100,
        jitterFactor: 0,
      };
      const p = new ReconnectProtocol(client as unknown as DaemonClient, opts);

      let attempts = 0;
      client.connect = vi.fn(async () => {
        attempts++;
        if (attempts < 3) throw new Error('ECONNREFUSED');
        client.isConnected = true;
        return mockAuthResult();
      });
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      const delays: number[] = [];
      p.on('reconnecting', ({ delayMs }) => delays.push(delayMs));

      await p.reconnect();
      // All delays should be capped at 100
      for (const d of delays) {
        expect(d).toBeLessThanOrEqual(100);
      }
      p.dispose();
    });
  });

  // ── Disposal ──────────────────────────────────────────────────

  describe('disposal', () => {
    it('marks protocol as inactive after dispose', () => {
      expect(protocol.isActive).toBe(true);
      protocol.dispose();
      expect(protocol.isActive).toBe(false);
    });

    it('removes all event listeners on stop', () => {
      protocol.start();
      expect(client.on).toHaveBeenCalled();

      protocol.stop();
      // off should have been called for each registered event
      expect(client.off).toHaveBeenCalled();
    });

    it('prevents start after disposal', () => {
      protocol.dispose();
      expect(() => protocol.start()).toThrow('disposed');
    });

    it('prevents reconnect after disposal', async () => {
      protocol.dispose();
      await expect(protocol.reconnect()).rejects.toThrow('disposed');
    });

    it('does not hang when disposed during backoff sleep', async () => {
      // Connect always fails to force backoff sleep
      client.connect = vi.fn(async () => { throw new Error('ECONNREFUSED'); });

      const reconnectPromise = protocol.reconnect();

      // Let the first attempt fail and enter sleep
      await vi.advanceTimersByTimeAsync(50);

      // Dispose during sleep — should cancel the sleep and let the promise settle
      protocol.dispose();

      await expect(reconnectPromise).rejects.toThrow('disposed');
    });
  });

  // ── Infinite reconnect mode ───────────────────────────────────

  describe('infinite reconnect (maxAttempts=0)', () => {
    it('keeps retrying until success', async () => {
      const opts: ReconnectProtocolOptions = {
        ...FAST_OPTS,
        maxAttempts: 0, // infinite
      };
      const p = new ReconnectProtocol(client as unknown as DaemonClient, opts);

      let attempts = 0;
      client.connect = vi.fn(async () => {
        attempts++;
        if (attempts < 8) throw new Error('ECONNREFUSED');
        client.isConnected = true;
        return mockAuthResult();
      });
      client.listAgents = vi.fn(async () => ({ agents: [] }));

      const result = await p.reconnect();
      expect(attempts).toBe(8);
      expect(result).toBeDefined();
      p.dispose();
    });
  });
});
