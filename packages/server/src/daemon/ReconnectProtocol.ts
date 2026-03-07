/**
 * ReconnectProtocol — orchestrates reconnection to the agent host daemon
 * after server restarts or network interruptions.
 *
 * Responsibilities:
 *  1. Detect daemon-lost events (heartbeat failure / socket close)
 *  2. Retry connection with exponential backoff + jitter
 *  3. Track lastSeenEventId per agent for gapless event replay
 *  4. Reconcile daemon agent state vs local expectations
 *  5. Surface connection lifecycle to callers via typed events
 *
 * Design: packages/docs/design/hot-reload-agent-preservation.md (D4)
 */
import { TypedEmitter } from '../utils/TypedEmitter.js';
import { logger } from '../utils/logger.js';
import type { DaemonClient } from './DaemonClient.js';
import type { AgentDescriptor, DaemonEvent, AuthResult } from './DaemonProtocol.js';

// ── Types ───────────────────────────────────────────────────────────

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'failed';

export interface ReconnectProtocolOptions {
  /** Delay before first reconnect attempt in ms (default: 1000). */
  initialDelayMs?: number;
  /** Max delay between reconnect attempts in ms (default: 30000). */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2). */
  backoffMultiplier?: number;
  /** Random jitter factor 0–1 added to delay (default: 0.2). */
  jitterFactor?: number;
  /** Maximum number of reconnect attempts before giving up, 0 = infinite (default: 0). */
  maxAttempts?: number;
  /** Delay before starting reconnection after daemon-lost (default: 500). */
  reconnectGraceMs?: number;
}

export interface ReconnectProtocolEvents {
  'state_change': { from: ConnectionState; to: ConnectionState };
  'reconnecting': { attempt: number; delayMs: number };
  'reconnected': { authResult: AuthResult; reconciliation: ReconciliationResult };
  'reconnect_failed': { attempts: number; lastError: string };
  'agents_reconciled': ReconciliationResult;
  'event_replayed': { agentId: string; event: DaemonEvent };
}

/** Result of reconciling local expectations against daemon state. */
export interface ReconciliationResult {
  /** Agents found in both local state and daemon (successful reconnect). */
  reconnected: ReconciledAgent[];
  /** Agents the daemon has that we didn't expect (from previous server instance). */
  discovered: AgentDescriptor[];
  /** Agents we expected but the daemon doesn't have (daemon restarted / agent exited). */
  lost: string[];
  /** Per-agent event replay counts. */
  replayedEvents: Record<string, number>;
}

export interface ReconciledAgent {
  agentId: string;
  descriptor: AgentDescriptor;
  eventsReplayed: number;
}

/** Callback to reconnect a single adapter and replay its events. */
export type AdapterReconnector = (
  agentId: string,
  lastSeenEventId: string | undefined,
) => Promise<{ eventsReplayed: number }>;

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULTS: Required<ReconnectProtocolOptions> = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  maxAttempts: 0,
  reconnectGraceMs: 500,
};

// ── ReconnectProtocol ───────────────────────────────────────────────

export class ReconnectProtocol extends TypedEmitter<ReconnectProtocolEvents> {
  private readonly client: DaemonClient;
  private readonly opts: Required<ReconnectProtocolOptions>;

  private _state: ConnectionState = 'disconnected';
  private _attempts = 0;
  private _disposed = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _activeReconnect: Promise<ReconciliationResult> | null = null;
  private _sleepReject: ((err: Error) => void) | null = null;

  /** Per-agent checkpoint for event replay. */
  private lastSeenEventIds = new Map<string, string>();

  /** Agents we expect the daemon to have (set by caller before reconnect). */
  private expectedAgentIds = new Set<string>();

  constructor(client: DaemonClient, options?: ReconnectProtocolOptions) {
    super();
    this.client = client;
    this.opts = { ...DEFAULTS, ...options };
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Current connection state. */
  get state(): ConnectionState {
    return this._state;
  }

  /** Number of reconnect attempts in the current cycle. */
  get attempts(): number {
    return this._attempts;
  }

  /** Whether the protocol is actively monitoring / reconnecting. */
  get isActive(): boolean {
    return !this._disposed;
  }

  /**
   * Start monitoring the daemon connection.
   * Listens for disconnected / daemon-lost events and auto-reconnects.
   */
  start(): void {
    if (this._disposed) throw new Error('ReconnectProtocol has been disposed');

    this.client.on('disconnected', this.onDisconnected);
    this.client.on('daemon-lost', this.onDaemonLost);
    this.client.on('connected', this.onConnected);
    this.client.on('event', this.onEvent);

    if (this.client.isConnected) {
      this.setState('connected');
    }
  }

  /** Stop monitoring — cancels any pending reconnection. */
  stop(): void {
    this.client.off('disconnected', this.onDisconnected);
    this.client.off('daemon-lost', this.onDaemonLost);
    this.client.off('connected', this.onConnected);
    this.client.off('event', this.onEvent);
    this.cancelPendingReconnect();
  }

  /** Full disposal — stops monitoring and prevents future use. */
  dispose(): void {
    this._disposed = true;
    this.stop();
  }

  // ── Event ID Tracking ─────────────────────────────────────────

  /** Record the last event seen for an agent (for replay checkpoint). */
  trackEventId(agentId: string, eventId: string): void {
    this.lastSeenEventIds.set(agentId, eventId);
  }

  /** Get the last seen event ID for an agent (or undefined if none tracked). */
  getLastSeenEventId(agentId: string): string | undefined {
    return this.lastSeenEventIds.get(agentId);
  }

  /** Get all tracked event IDs as a snapshot. */
  getAllEventIds(): ReadonlyMap<string, string> {
    return this.lastSeenEventIds;
  }

  /** Remove tracking for an agent (e.g., after termination). */
  clearEventId(agentId: string): void {
    this.lastSeenEventIds.delete(agentId);
  }

  // ── Expected Agents ───────────────────────────────────────────

  /** Set which agents we expect the daemon to have. Used during reconciliation. */
  setExpectedAgents(agentIds: string[]): void {
    this.expectedAgentIds = new Set(agentIds);
  }

  /** Add a single agent to the expected set (e.g., after spawn). */
  addExpectedAgent(agentId: string): void {
    this.expectedAgentIds.add(agentId);
  }

  /** Remove an agent from the expected set (e.g., after terminate). */
  removeExpectedAgent(agentId: string): void {
    this.expectedAgentIds.delete(agentId);
    this.lastSeenEventIds.delete(agentId);
  }

  /** Get the current expected agent set. */
  getExpectedAgents(): ReadonlySet<string> {
    return this.expectedAgentIds;
  }

  // ── Manual Reconnect ──────────────────────────────────────────

  /**
   * Manually trigger a reconnect cycle.
   * If a reconnect is already in progress, returns the existing promise.
   * Resolves when reconnected and reconciled, or rejects if all attempts fail.
   */
  reconnect(adapterReconnector?: AdapterReconnector): Promise<ReconciliationResult> {
    if (this._disposed) return Promise.reject(new Error('ReconnectProtocol has been disposed'));
    if (this._activeReconnect) return this._activeReconnect;
    this.cancelPendingReconnect();
    const promise = this.doReconnectLoop(adapterReconnector);
    this._activeReconnect = promise;
    // Cleanup: clear _activeReconnect when done (catch prevents unhandled rejection on the cleanup chain)
    const cleanup = () => { this._activeReconnect = null; };
    promise.then(cleanup, cleanup);
    return promise;
  }

  /**
   * Reconcile daemon state against local expectations without reconnecting.
   * Assumes the DaemonClient is already connected.
   */
  async reconcile(adapterReconnector?: AdapterReconnector): Promise<ReconciliationResult> {
    if (!this.client.isConnected) {
      throw new Error('DaemonClient is not connected — call reconnect() instead');
    }
    return this.doReconciliation(adapterReconnector);
  }

  // ── Internal: Event Handlers ──────────────────────────────────

  private onDisconnected = (_data: { reason: string }): void => {
    if (this._state === 'reconnecting') return; // already handling it
    this.setState('disconnected');
    this.scheduleReconnect();
  };

  private onDaemonLost = (_data: { missedHeartbeats: number }): void => {
    if (this._state === 'reconnecting') return;
    logger.warn({
      module: 'reconnect-protocol',
      msg: 'Daemon lost — starting reconnect cycle',
    });
    this.setState('disconnected');
    this.scheduleReconnect();
  };

  private onConnected = (_data: AuthResult): void => {
    // External connect (e.g., initial connection) — track state.
    if (this._state !== 'reconnecting') {
      this.setState('connected');
      this._attempts = 0;
    }
  };

  /** Track event IDs from the live event stream. */
  private onEvent = (event: DaemonEvent): void => {
    if (event.agentId && event.eventId) {
      this.lastSeenEventIds.set(event.agentId, event.eventId);
    }
  };

  // ── Internal: Reconnect Loop ──────────────────────────────────

  private scheduleReconnect(): void {
    if (this._disposed || this._activeReconnect) return;
    this.cancelPendingReconnect();

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._activeReconnect) return;
      const promise = this.doReconnectLoop();
      // Store with cleanup + catch so the promise never goes unhandled
      this._activeReconnect = promise;
      promise.catch(() => {
        // Swallowed — reconnect_failed event already emitted by doReconnectLoop
      }).finally(() => {
        this._activeReconnect = null;
      });
    }, this.opts.reconnectGraceMs);
  }

  private async doReconnectLoop(adapterReconnector?: AdapterReconnector): Promise<ReconciliationResult> {
    this._attempts = 0;
    this.setState('reconnecting');

    let lastError = '';
    let delay = this.opts.initialDelayMs;

    while (!this._disposed) {
      this._attempts++;

      if (this.opts.maxAttempts > 0 && this._attempts > this.opts.maxAttempts) {
        this.setState('failed');
        this.emit('reconnect_failed', { attempts: this._attempts - 1, lastError });
        throw new Error(`Reconnect failed after ${this._attempts - 1} attempts: ${lastError}`);
      }

      this.emit('reconnecting', { attempt: this._attempts, delayMs: delay });
      logger.info({
        module: 'reconnect-protocol',
        msg: 'Reconnecting to daemon',
        attempt: this._attempts,
        delayMs: delay,
      });

      try {
        // Disconnect stale socket if needed
        if (this.client.isConnected) {
          this.client.disconnect();
        }

        const authResult = await this.client.connect();

        // Connected — now reconcile agent state
        const reconciliation = await this.doReconciliation(adapterReconnector);

        this._attempts = 0;
        this.setState('connected');
        this.emit('reconnected', { authResult, reconciliation });
        return reconciliation;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        logger.warn({
          module: 'reconnect-protocol',
          msg: 'Reconnect attempt failed',
          attempt: this._attempts,
          error: lastError,
        });

        // Wait before next attempt (exponential backoff + jitter)
        try {
          await this.sleep(delay);
        } catch {
          // Sleep was cancelled (dispose or new reconnect call) — exit loop
          break;
        }
        delay = this.nextDelay(delay);
      }
    }

    // Disposed during reconnection
    throw new Error('ReconnectProtocol disposed during reconnection');
  }

  // ── Internal: Reconciliation ──────────────────────────────────

  private async doReconciliation(adapterReconnector?: AdapterReconnector): Promise<ReconciliationResult> {
    const { agents: daemonAgents } = await this.client.listAgents();
    const daemonAgentMap = new Map(daemonAgents.map(a => [a.agentId, a]));

    const result: ReconciliationResult = {
      reconnected: [],
      discovered: [],
      lost: [],
      replayedEvents: {},
    };

    // 1. Check each expected agent against daemon state
    for (const agentId of this.expectedAgentIds) {
      const descriptor = daemonAgentMap.get(agentId);

      if (!descriptor) {
        // Agent was expected but not in daemon (daemon restarted or agent exited)
        result.lost.push(agentId);
        continue;
      }

      // Agent is alive in daemon — reconnect its adapter
      let eventsReplayed = 0;
      if (adapterReconnector) {
        try {
          const lastSeenEventId = this.lastSeenEventIds.get(agentId);
          const res = await adapterReconnector(agentId, lastSeenEventId);
          eventsReplayed = res.eventsReplayed;
        } catch (err) {
          logger.warn({
            module: 'reconnect-protocol',
            msg: 'Failed to reconnect adapter',
            agentId,
            error: String(err),
          });
        }
      }

      result.reconnected.push({ agentId, descriptor, eventsReplayed });
      result.replayedEvents[agentId] = eventsReplayed;
    }

    // 2. Find agents in daemon that we didn't expect (discovered)
    for (const descriptor of daemonAgents) {
      if (!this.expectedAgentIds.has(descriptor.agentId)) {
        // Skip exited/crashed agents — they're not useful to discover
        if (descriptor.status !== 'exited' && descriptor.status !== 'crashed') {
          result.discovered.push(descriptor);
        }
      }
    }

    logger.info({
      module: 'reconnect-protocol',
      msg: 'Session reconciliation complete',
      reconnected: result.reconnected.length,
      discovered: result.discovered.length,
      lost: result.lost.length,
    });

    this.emit('agents_reconciled', result);
    return result;
  }

  // ── Internal: Backoff Helpers ─────────────────────────────────

  private nextDelay(currentDelay: number): number {
    const base = Math.min(currentDelay * this.opts.backoffMultiplier, this.opts.maxDelayMs);
    const jitter = base * this.opts.jitterFactor * Math.random();
    return Math.floor(base + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this._sleepReject = reject;
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        this._sleepReject = null;
        resolve();
      }, ms);
    });
  }

  private cancelPendingReconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._sleepReject) {
      this._sleepReject(new Error('Reconnect cancelled'));
      this._sleepReject = null;
    }
  }

  private setState(state: ConnectionState): void {
    if (state === this._state) return;
    const from = this._state;
    this._state = state;
    this.emit('state_change', { from, to: state });
  }
}
