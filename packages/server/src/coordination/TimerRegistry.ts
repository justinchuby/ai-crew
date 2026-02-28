import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────

export interface Timer {
  id: string;
  agentId: string;
  label: string;
  message: string;
  fireAt: number; // epoch ms
  createdAt: string;
  fired: boolean;
  repeat: boolean;
  intervalSeconds: number;
}

export interface TimerInput {
  label: string;
  /** Message to send to the agent when the timer fires */
  message: string;
  /** Delay in seconds from now */
  delaySeconds: number;
  /** If true, timer repeats at the same interval */
  repeat?: boolean;
}

// ── TimerRegistry ─────────────────────────────────────────────────

const MAX_TIMERS_PER_AGENT = 20;
const CHECK_INTERVAL_MS = 5_000; // check every 5s

/**
 * Manages named timers for agents. When a timer fires, emits 'timer:fired'
 * with the timer object so the dispatcher can deliver the message.
 */
export class TimerRegistry extends EventEmitter {
  private timers = new Map<string, Timer>();
  private interval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), CHECK_INTERVAL_MS);
    logger.info('timer', 'TimerRegistry started');
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Create a timer for an agent. Returns the timer or null if limit reached or invalid input. */
  create(agentId: string, input: TimerInput): Timer | null {
    if (!Number.isFinite(input.delaySeconds) || input.delaySeconds < 0 || input.delaySeconds > 86400) {
      return null;
    }

    const agentTimers = this.getAgentTimers(agentId);
    if (agentTimers.length >= MAX_TIMERS_PER_AGENT) {
      return null;
    }

    const timer: Timer = {
      id: `tmr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      label: input.label,
      message: input.message,
      fireAt: Date.now() + input.delaySeconds * 1000,
      createdAt: new Date().toISOString(),
      fired: false,
      repeat: input.repeat ?? false,
      intervalSeconds: input.delaySeconds,
    };

    this.timers.set(timer.id, timer);
    logger.info('timer', `Timer "${timer.label}" set for ${agentId.slice(0, 8)} — fires in ${input.delaySeconds}s`);
    return timer;
  }

  /** Cancel a timer by ID. Returns true if found and cancelled. */
  cancel(timerId: string, agentId: string): boolean {
    const timer = this.timers.get(timerId);
    if (!timer || timer.agentId !== agentId) return false;
    this.timers.delete(timerId);
    logger.info('timer', `Timer "${timer.label}" cancelled for ${agentId.slice(0, 8)}`);
    return true;
  }

  /** Get all active (unfired) timers for an agent */
  getAgentTimers(agentId: string): Timer[] {
    return Array.from(this.timers.values())
      .filter(t => t.agentId === agentId && !t.fired);
  }

  /** Get all timers (for lead/secretary visibility) */
  getAllTimers(): Timer[] {
    return Array.from(this.timers.values()).filter(t => !t.fired);
  }

  /** Check for timers that should fire */
  private tick(): void {
    const now = Date.now();
    for (const timer of this.timers.values()) {
      if (!timer.fired && timer.fireAt <= now) {
        timer.fired = true;
        this.emit('timer:fired', timer);
        logger.info('timer', `Timer "${timer.label}" fired for ${timer.agentId.slice(0, 8)}`);
        if (timer.repeat) {
          // Reschedule
          timer.fired = false;
          timer.fireAt = now + timer.intervalSeconds * 1000;
        } else {
          this.timers.delete(timer.id);
        }
      }
    }
  }

  /** Remove all timers for an agent (cleanup on termination) */
  clearAgent(agentId: string): number {
    let count = 0;
    for (const [id, timer] of this.timers) {
      if (timer.agentId === agentId) {
        this.timers.delete(id);
        count++;
      }
    }
    return count;
  }
}
