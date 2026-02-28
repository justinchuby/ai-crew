import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EagerScheduler } from '../tasks/EagerScheduler.js';
import type { TaskDAGLike } from '../tasks/EagerScheduler.js';
import type { DagTask } from '../tasks/TaskDAG.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<DagTask> & { id: string }): DagTask {
  return {
    leadId: 'lead-1',
    role: 'Developer',
    description: overrides.description ?? `Task ${overrides.id}`,
    files: [],
    dependsOn: [],
    dagStatus: 'pending',
    priority: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockDAG(tasks: DagTask[]): TaskDAGLike {
  return { getAll: () => tasks };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EagerScheduler', () => {
  let scheduler: EagerScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe('evaluate()', () => {
    it('identifies almost-ready tasks: 1 unsatisfied dep that is running', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));

      const result = scheduler.evaluate();

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task-b');
      expect(result[0].readyCondition).toEqual(['task-a']);
    });

    it('also identifies pending tasks with 1 running dep', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'pending', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));

      const result = scheduler.evaluate();

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task-b');
    });

    it('ignores tasks with 2 or more unsatisfied deps', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'running' }),
        makeTask({ id: 'task-c', dagStatus: 'blocked', dependsOn: ['task-a', 'task-b'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));

      const result = scheduler.evaluate();

      expect(result).toHaveLength(0);
    });

    it('ignores tasks where the blocking dep is not running (e.g. pending)', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'pending' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));

      const result = scheduler.evaluate();

      expect(result).toHaveLength(0);
    });

    it('ignores tasks where the blocking dep is ready (not yet running)', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'ready' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));

      expect(scheduler.evaluate()).toHaveLength(0);
    });

    it('does not duplicate pre-assignments on repeated evaluate() calls', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));

      scheduler.evaluate();
      const second = scheduler.evaluate();

      expect(second).toHaveLength(0);
      expect(scheduler.preAssignmentCount).toBe(1);
    });

    it('counts already-done deps as satisfied when checking the "almost ready" condition', () => {
      // task-c depends on task-a (done) and task-b (running) → 1 unsatisfied dep
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'done' }),
        makeTask({ id: 'task-b', dagStatus: 'running' }),
        makeTask({ id: 'task-c', dagStatus: 'blocked', dependsOn: ['task-a', 'task-b'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));

      const result = scheduler.evaluate();

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task-c');
      expect(result[0].readyCondition).toEqual(['task-b']);
    });

    it('cleans up stale pre-assignments for done tasks', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      const dag = makeMockDAG(tasks);
      scheduler = new EagerScheduler(dag);

      scheduler.evaluate();
      expect(scheduler.preAssignmentCount).toBe(1);

      // Now task-b has completed
      tasks[1].dagStatus = 'done';
      scheduler.evaluate();

      expect(scheduler.preAssignmentCount).toBe(0);
    });

    it('cleans up stale pre-assignments for failed tasks', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate();

      tasks[1].dagStatus = 'failed';
      scheduler.evaluate();

      expect(scheduler.preAssignmentCount).toBe(0);
    });

    it('cleans up stale pre-assignments for skipped tasks', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate();

      tasks[1].dagStatus = 'skipped';
      scheduler.evaluate();

      expect(scheduler.preAssignmentCount).toBe(0);
    });

    it('cleans up pre-assignment when task no longer exists in DAG', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      const mutableTasks = [...tasks];
      scheduler = new EagerScheduler({ getAll: () => mutableTasks });
      scheduler.evaluate();
      expect(scheduler.preAssignmentCount).toBe(1);

      // Remove task-b from DAG (simulates cancel)
      mutableTasks.splice(1, 1);
      scheduler.evaluate();

      expect(scheduler.preAssignmentCount).toBe(0);
    });
  });

  describe('onTaskCompleted()', () => {
    it('returns task IDs whose readyCondition is fully satisfied', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate();

      const ready = scheduler.onTaskCompleted('task-a');

      expect(ready).toEqual(['task-b']);
    });

    it('removes the pre-assignment after returning it as ready', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate();

      scheduler.onTaskCompleted('task-a');

      expect(scheduler.preAssignmentCount).toBe(0);
      expect(scheduler.getPreAssignment('task-b')).toBeUndefined();
    });

    it('does not return tasks still waiting on other deps', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'done' }),
        makeTask({ id: 'task-b', dagStatus: 'running' }),
        makeTask({ id: 'task-c', dagStatus: 'blocked', dependsOn: ['task-a', 'task-b'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate(); // pre-assigns task-c waiting on task-b

      // task-a completes — task-c still waiting on task-b
      const ready = scheduler.onTaskCompleted('task-a');

      expect(ready).toHaveLength(0);
      expect(scheduler.preAssignmentCount).toBe(1);
    });

    it('returns empty array when no pre-assignments exist', () => {
      scheduler = new EagerScheduler(makeMockDAG([]));
      expect(scheduler.onTaskCompleted('task-x')).toEqual([]);
    });

    it('returns empty array when completed task is unrelated', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate();

      const ready = scheduler.onTaskCompleted('unrelated-task');

      expect(ready).toHaveLength(0);
      expect(scheduler.preAssignmentCount).toBe(1);
    });
  });

  describe('events', () => {
    it('emits task:pre-assigned when a task is pre-assigned', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));

      const handler = vi.fn();
      scheduler.on('task:pre-assigned', handler);
      scheduler.evaluate();

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-b', readyCondition: ['task-a'] }),
      );
    });

    it('emits task:ready when onTaskCompleted satisfies all conditions', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate();

      const handler = vi.fn();
      scheduler.on('task:ready', handler);
      scheduler.onTaskCompleted('task-a');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-b' }),
      );
    });

    it('does not emit task:ready when conditions are not yet fully satisfied', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'done' }),
        makeTask({ id: 'task-b', dagStatus: 'running' }),
        makeTask({ id: 'task-c', dagStatus: 'blocked', dependsOn: ['task-a', 'task-b'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate();

      const handler = vi.fn();
      scheduler.on('task:ready', handler);
      scheduler.onTaskCompleted('task-a');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('enabled/disabled flag', () => {
    it('returns empty array and creates no pre-assignments when disabled', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.setEnabled(false);

      const result = scheduler.evaluate();

      expect(result).toHaveLength(0);
      expect(scheduler.preAssignmentCount).toBe(0);
    });

    it('resumes normal evaluation after being re-enabled', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.setEnabled(false);
      scheduler.evaluate();

      scheduler.setEnabled(true);
      const result = scheduler.evaluate();

      expect(result).toHaveLength(1);
    });
  });

  describe('getPreAssignments()', () => {
    it('returns all current pre-assignments as an array', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
        makeTask({ id: 'task-c', dagStatus: 'running' }),
        makeTask({ id: 'task-d', dagStatus: 'blocked', dependsOn: ['task-c'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      scheduler.evaluate();

      const all = scheduler.getPreAssignments();

      expect(all).toHaveLength(2);
      expect(all.map(a => a.taskId)).toEqual(expect.arrayContaining(['task-b', 'task-d']));
    });

    it('returns empty array when there are no pre-assignments', () => {
      scheduler = new EagerScheduler(makeMockDAG([]));
      expect(scheduler.getPreAssignments()).toEqual([]);
    });
  });

  describe('start() / stop()', () => {
    it('start() triggers evaluate() on each interval', () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'running' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked', dependsOn: ['task-a'] }),
      ];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      const spy = vi.spyOn(scheduler, 'evaluate');

      scheduler.start(500);
      vi.advanceTimersByTime(1500);

      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('start() is idempotent — second call does not add another timer', () => {
      const tasks: DagTask[] = [];
      scheduler = new EagerScheduler(makeMockDAG(tasks));
      const spy = vi.spyOn(scheduler, 'evaluate');

      scheduler.start(500);
      scheduler.start(500); // second call should be a no-op

      vi.advanceTimersByTime(500);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('stop() prevents further evaluate() calls', () => {
      scheduler = new EagerScheduler(makeMockDAG([]));
      const spy = vi.spyOn(scheduler, 'evaluate');

      scheduler.start(500);
      vi.advanceTimersByTime(500);
      expect(spy).toHaveBeenCalledTimes(1);

      scheduler.stop();
      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(1); // no additional calls
    });
  });
});
