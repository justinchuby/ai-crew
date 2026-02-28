import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimerRegistry } from '../coordination/TimerRegistry.js';
import type { Timer } from '../coordination/TimerRegistry.js';

describe('TimerRegistry', () => {
  let registry: TimerRegistry;

  beforeEach(() => {
    registry = new TimerRegistry();
  });

  afterEach(() => {
    registry.stop();
  });

  describe('create', () => {
    it('creates a timer and returns it', () => {
      const timer = registry.create('agent-1', {
        label: 'check-build',
        message: 'Check if the build passed',
        delaySeconds: 300,
      });

      expect(timer).not.toBeNull();
      expect(timer!.agentId).toBe('agent-1');
      expect(timer!.label).toBe('check-build');
      expect(timer!.message).toBe('Check if the build passed');
      expect(timer!.fired).toBe(false);
      expect(timer!.fireAt).toBeGreaterThan(Date.now());
    });

    it('returns null when agent exceeds max timers', () => {
      for (let i = 0; i < 20; i++) {
        const result = registry.create('agent-1', {
          label: `timer-${i}`,
          message: 'msg',
          delaySeconds: 600,
        });
        expect(result).not.toBeNull();
      }

      const overflow = registry.create('agent-1', {
        label: 'overflow',
        message: 'msg',
        delaySeconds: 600,
      });
      expect(overflow).toBeNull();
    });

    it('different agents have separate limits', () => {
      for (let i = 0; i < 20; i++) {
        registry.create('agent-1', { label: `t-${i}`, message: 'm', delaySeconds: 600 });
      }

      const agent2Timer = registry.create('agent-2', {
        label: 'agent2-timer',
        message: 'msg',
        delaySeconds: 300,
      });
      expect(agent2Timer).not.toBeNull();
    });
  });

  describe('cancel', () => {
    it('cancels a timer by ID', () => {
      const timer = registry.create('agent-1', {
        label: 'review',
        message: 'Follow up on review',
        delaySeconds: 600,
      })!;

      const cancelled = registry.cancel(timer.id, 'agent-1');
      expect(cancelled).toBe(true);
      expect(registry.getAgentTimers('agent-1')).toHaveLength(0);
    });

    it('returns false for wrong agent', () => {
      const timer = registry.create('agent-1', {
        label: 'review',
        message: 'msg',
        delaySeconds: 600,
      })!;

      expect(registry.cancel(timer.id, 'agent-2')).toBe(false);
      expect(registry.getAgentTimers('agent-1')).toHaveLength(1);
    });

    it('returns false for nonexistent timer', () => {
      expect(registry.cancel('tmr-nonexistent', 'agent-1')).toBe(false);
    });
  });

  describe('getAgentTimers', () => {
    it('returns only active timers for the agent', () => {
      registry.create('agent-1', { label: 'a', message: 'm', delaySeconds: 600 });
      registry.create('agent-1', { label: 'b', message: 'm', delaySeconds: 300 });
      registry.create('agent-2', { label: 'c', message: 'm', delaySeconds: 600 });

      const agent1Timers = registry.getAgentTimers('agent-1');
      expect(agent1Timers).toHaveLength(2);
      expect(agent1Timers.map(t => t.label).sort()).toEqual(['a', 'b']);
    });

    it('returns empty for unknown agent', () => {
      expect(registry.getAgentTimers('agent-unknown')).toHaveLength(0);
    });
  });

  describe('getAllTimers', () => {
    it('returns all active timers across agents', () => {
      registry.create('agent-1', { label: 'a', message: 'm', delaySeconds: 600 });
      registry.create('agent-2', { label: 'b', message: 'm', delaySeconds: 300 });

      expect(registry.getAllTimers()).toHaveLength(2);
    });
  });

  describe('timer firing', () => {
    it('emits timer:fired when timer expires', async () => {
      vi.useFakeTimers();

      const fired: Timer[] = [];
      registry.on('timer:fired', (timer: Timer) => fired.push(timer));

      registry.create('agent-1', {
        label: 'quick-check',
        message: 'Time to check',
        delaySeconds: 10,
      });

      registry.start();

      // Advance past the timer's fire time
      vi.advanceTimersByTime(15_000);

      expect(fired).toHaveLength(1);
      expect(fired[0].label).toBe('quick-check');
      expect(fired[0].message).toBe('Time to check');
      expect(fired[0].agentId).toBe('agent-1');

      // Timer should be cleaned up
      expect(registry.getAgentTimers('agent-1')).toHaveLength(0);

      vi.useRealTimers();
    });

    it('does not fire cancelled timers', async () => {
      vi.useFakeTimers();

      const fired: Timer[] = [];
      registry.on('timer:fired', (timer: Timer) => fired.push(timer));

      const timer = registry.create('agent-1', {
        label: 'cancelled',
        message: 'Should not fire',
        delaySeconds: 10,
      })!;

      registry.cancel(timer.id, 'agent-1');
      registry.start();

      vi.advanceTimersByTime(15_000);

      expect(fired).toHaveLength(0);

      vi.useRealTimers();
    });

    it('fires multiple timers in order', () => {
      vi.useFakeTimers();

      const fired: string[] = [];
      registry.on('timer:fired', (timer: Timer) => fired.push(timer.label));

      registry.create('agent-1', { label: 'second', message: 'm', delaySeconds: 20 });
      registry.create('agent-1', { label: 'first', message: 'm', delaySeconds: 10 });

      registry.start();

      vi.advanceTimersByTime(11_000);
      expect(fired).toEqual(['first']);

      vi.advanceTimersByTime(10_000);
      expect(fired).toEqual(['first', 'second']);

      vi.useRealTimers();
    });
  });

  describe('clearAgent', () => {
    it('removes all timers for an agent', () => {
      registry.create('agent-1', { label: 'a', message: 'm', delaySeconds: 600 });
      registry.create('agent-1', { label: 'b', message: 'm', delaySeconds: 300 });
      registry.create('agent-2', { label: 'c', message: 'm', delaySeconds: 600 });

      const count = registry.clearAgent('agent-1');
      expect(count).toBe(2);
      expect(registry.getAgentTimers('agent-1')).toHaveLength(0);
      expect(registry.getAgentTimers('agent-2')).toHaveLength(1);
    });

    it('returns 0 for agent with no timers', () => {
      expect(registry.clearAgent('agent-none')).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('start is idempotent', () => {
      registry.start();
      registry.start(); // no error
      registry.stop();
    });

    it('stop clears the interval', () => {
      vi.useFakeTimers();
      registry.start();

      const fired: Timer[] = [];
      registry.on('timer:fired', (t: Timer) => fired.push(t));

      registry.create('agent-1', { label: 'x', message: 'm', delaySeconds: 10 });
      registry.stop();

      vi.advanceTimersByTime(15_000);
      expect(fired).toHaveLength(0);

      vi.useRealTimers();
    });
  });
});
