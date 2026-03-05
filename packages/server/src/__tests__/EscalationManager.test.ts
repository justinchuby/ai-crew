import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EscalationManager } from '../coordination/EscalationManager.js';
import { Database } from '../db/database.js';
import { TaskDAG } from '../tasks/TaskDAG.js';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('EscalationManager', () => {
  let db: Database;
  let taskDAG: TaskDAG;
  let manager: EscalationManager;

  beforeEach(() => {
    db = new Database(':memory:');
    taskDAG = new TaskDAG(db);
    manager = new EscalationManager(taskDAG);
  });

  afterEach(() => {
    manager.stop();
    db.close();
  });

  // ── Default rules ────────────────────────────────────────────────

  it('starts with 2 default rules', () => {
    const rules = manager.getRules();
    expect(rules).toHaveLength(2);
    const ids = rules.map(r => r.id);
    expect(ids).toContain('blocked-task-15m');
    expect(ids).toContain('build-failure');
  });

  it('addRule appends a custom rule', () => {
    manager.addRule({ id: 'custom', name: 'Custom', condition: 'agent_stuck', thresholdMs: 5_000, escalateTo: 'architect' });
    expect(manager.getRules()).toHaveLength(3);
    expect(manager.getRules().find(r => r.id === 'custom')).toBeDefined();
  });

  // ── evaluate — no escalations when nothing is stale ─────────────

  it('returns empty array when nothing to escalate', () => {
    const result = manager.evaluate();
    expect(result).toHaveLength(0);
    expect(manager.getActive()).toHaveLength(0);
  });

  // ── evaluate — blocked tasks ──────────────────────────────────────

  it('escalates a blocked task older than the threshold', () => {
    taskDAG.declareTaskBatch('lead-1', [
      { taskId: 'task-1', role: 'developer', description: 'Write tests' },
    ]);
    // Force the task to be blocked and old enough to trigger escalation
    db.run(`UPDATE dag_tasks SET dag_status = 'blocked', created_at = '2020-01-01T00:00:00.000Z' WHERE id = 'task-1'`);

    const rule = manager.getRules().find(r => r.id === 'blocked-task-15m')!;
    rule.thresholdMs = 0; // trigger immediately

    const result = manager.evaluate();
    const blockEsc = result.filter(e => e.ruleId === 'blocked-task-15m');
    expect(blockEsc).toHaveLength(1);
    expect(blockEsc[0].subject).toBe('task-1');
    expect(blockEsc[0].detail).toContain('Write tests');
  });

  it('does not escalate non-blocked tasks', () => {
    taskDAG.declareTaskBatch('lead-1', [
      { taskId: 'task-ready', role: 'developer', description: 'Ready task' },
    ]);
    const rule = manager.getRules().find(r => r.id === 'blocked-task-15m')!;
    rule.thresholdMs = 0;

    const result = manager.evaluate();
    expect(result.filter(e => e.ruleId === 'blocked-task-15m')).toHaveLength(0);
  });

  // ── triggerBuildFailure ───────────────────────────────────────────

  it('triggerBuildFailure creates an escalation immediately', () => {
    const esc = manager.triggerBuildFailure('build-001', 'TypeScript compile error in src/api.ts');
    expect(esc).not.toBeNull();
    expect(esc!.ruleId).toBe('build-failure');
    expect(esc!.subject).toBe('build-001');
    expect(esc!.detail).toContain('TypeScript compile error');
    expect(manager.getActive()).toHaveLength(1);
  });

  it('does not duplicate build-failure escalation for same subject', () => {
    manager.triggerBuildFailure('build-001', 'Error A');
    const second = manager.triggerBuildFailure('build-001', 'Error B');
    expect(second).toBeNull();
    expect(manager.getActive()).toHaveLength(1);
  });

  it('allows new build-failure escalation after previous one is resolved', () => {
    const esc = manager.triggerBuildFailure('build-001', 'Error A');
    manager.resolve(esc!.id);
    const second = manager.triggerBuildFailure('build-001', 'Error B');
    expect(second).not.toBeNull();
  });

  // ── resolve ──────────────────────────────────────────────────────

  it('resolve marks escalation as resolved and sets resolvedAt', () => {
    const esc = manager.triggerBuildFailure('build-x', 'fail');
    expect(manager.resolve(esc!.id)).toBe(true);
    const found = manager.getAll().find(e => e.id === esc!.id)!;
    expect(found.resolved).toBe(true);
    expect(found.resolvedAt).toBeDefined();
    expect(typeof found.resolvedAt).toBe('number');
  });

  it('resolve returns false for unknown id', () => {
    expect(manager.resolve('esc-nonexistent')).toBe(false);
  });

  it('emits escalation:resolved event on resolve', () => {
    const handler = vi.fn();
    manager.on('escalation:resolved', handler);
    const esc = manager.triggerBuildFailure('build-y', 'fail');
    manager.resolve(esc!.id);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: esc!.id, resolved: true }));
  });

  // ── getActive / getAll ───────────────────────────────────────────

  it('getActive returns only unresolved escalations', () => {
    const a = manager.triggerBuildFailure('b1', 'fail1')!;
    manager.triggerBuildFailure('b2', 'fail2');
    manager.resolve(a.id);

    const active = manager.getActive();
    expect(active).toHaveLength(1);
    expect(active[0].subject).toBe('b2');
  });

  it('getAll returns all escalations including resolved ones', () => {
    const a = manager.triggerBuildFailure('b1', 'fail1')!;
    manager.triggerBuildFailure('b2', 'fail2');
    manager.resolve(a.id);

    expect(manager.getAll()).toHaveLength(2);
  });

  // ── start / stop ─────────────────────────────────────────────────

  it('start registers an interval and stop clears it', () => {
    const fresh = new EscalationManager(taskDAG);
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    fresh.start(5_000);
    expect(setIntervalSpy).toHaveBeenCalledOnce();
    fresh.stop();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('start is idempotent — calling twice only registers one interval', () => {
    const fresh = new EscalationManager(taskDAG);
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    fresh.start(5_000);
    fresh.start(5_000); // second call should be a no-op
    expect(setIntervalSpy).toHaveBeenCalledOnce();
    fresh.stop();
    setIntervalSpy.mockRestore();
  });

  // ── emit on new escalation ────────────────────────────────────────

  it('emits escalation event when a new escalation is created', () => {
    const handler = vi.fn();
    manager.on('escalation', handler);
    manager.triggerBuildFailure('build-z', 'fail');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'build-failure' }));
  });
});
