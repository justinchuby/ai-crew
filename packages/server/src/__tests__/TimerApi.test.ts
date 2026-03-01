import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimerRegistry } from '../coordination/TimerRegistry.js';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';

function createTestDb() {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.exec(`CREATE TABLE timers (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL,
    agent_role TEXT NOT NULL,
    lead_id TEXT,
    label TEXT NOT NULL,
    message TEXT NOT NULL,
    delay_seconds INTEGER NOT NULL,
    fire_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'pending',
    repeat INTEGER DEFAULT 0
  )`);
  return drizzle(sqlite, { schema });
}

describe('Timer API data shape', () => {
  let registry: TimerRegistry;

  beforeEach(() => {
    registry = new TimerRegistry(createTestDb());
  });

  afterEach(() => {
    registry.stop();
  });

  it('getAllTimers returns timers with expected fields', () => {
    registry.create('agent-1', {
      label: 'check-build',
      message: 'Check if the build passed',
      delaySeconds: 300,
    });

    const timers = registry.getAllTimers();
    expect(timers).toHaveLength(1);
    expect(timers[0]).toMatchObject({
      agentId: 'agent-1',
      label: 'check-build',
      message: 'Check if the build passed',
      status: 'pending',
      repeat: false,
    });
    expect(timers[0].id).toBeDefined();
    expect(timers[0].fireAt).toBeGreaterThan(Date.now());
    expect(timers[0].createdAt).toBeDefined();
  });

  it('includes repeat timers with delaySeconds', () => {
    registry.create('agent-2', {
      label: 'poll-status',
      message: 'Check status',
      delaySeconds: 60,
      repeat: true,
    });

    const timers = registry.getAllTimers();
    expect(timers).toHaveLength(1);
    expect(timers[0].repeat).toBe(true);
    expect(timers[0].delaySeconds).toBe(60);
  });

  it('timer API response shape includes remainingMs', () => {
    registry.create('agent-1', {
      label: 'test-timer',
      message: 'Hello',
      delaySeconds: 120,
    });

    const timers = registry.getAllTimers();
    const apiResponse = timers.map(t => ({
      ...t,
      remainingMs: t.status === 'pending' ? Math.max(0, t.fireAt - Date.now()) : 0,
    }));

    expect(apiResponse).toHaveLength(1);
    expect(apiResponse[0].remainingMs).toBeGreaterThan(0);
    expect(apiResponse[0].remainingMs).toBeLessThanOrEqual(120_000);
  });

  it('returns timers from multiple agents', () => {
    registry.create('agent-1', { label: 'timer-a', message: 'A', delaySeconds: 60 });
    registry.create('agent-2', { label: 'timer-b', message: 'B', delaySeconds: 120 });
    registry.create('agent-1', { label: 'timer-c', message: 'C', delaySeconds: 180 });

    const timers = registry.getAllTimers();
    expect(timers).toHaveLength(3);

    const agent1Timers = timers.filter(t => t.agentId === 'agent-1');
    const agent2Timers = timers.filter(t => t.agentId === 'agent-2');
    expect(agent1Timers).toHaveLength(2);
    expect(agent2Timers).toHaveLength(1);
  });

  it('cancelled timers show status=cancelled in getAllTimers', () => {
    const timer = registry.create('agent-1', { label: 'will-cancel', message: 'X', delaySeconds: 60 });
    expect(registry.getAllTimers()).toHaveLength(1);

    registry.cancel(timer!.id, 'agent-1');
    const all = registry.getAllTimers();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('cancelled');
  });

  it('getPendingTimers excludes cancelled', () => {
    const timer = registry.create('agent-1', { label: 'will-cancel', message: 'X', delaySeconds: 60 });
    registry.cancel(timer!.id, 'agent-1');
    expect(registry.getPendingTimers()).toHaveLength(0);
  });
});
