/**
 * Tests for shared critical path computation.
 */
import { describe, it, expect } from 'vitest';
import { computeCriticalPath, type CriticalPathTask } from '../dagCriticalPath';

const BASE = 1_000_000;

function task(id: string, overrides: Partial<CriticalPathTask> = {}): CriticalPathTask {
  return { id, createdAt: BASE, ...overrides };
}

describe('computeCriticalPath', () => {
  it('returns empty set for empty tasks', () => {
    expect(computeCriticalPath([], Date.now())).toEqual(new Set());
  });

  it('marks a single task as critical', () => {
    const tasks = [task('a', { createdAt: BASE, completedAt: BASE + 10_000 })];
    const result = computeCriticalPath(tasks, BASE + 10_000);
    expect(result.has('a')).toBe(true);
  });

  it('marks the longest chain as critical in a diamond DAG', () => {
    // Diamond: A → B (10s), A → C (5s), B → D, C → D
    // Critical path should be A → B → D
    const now = BASE + 30_000;
    const tasks: CriticalPathTask[] = [
      task('A', { createdAt: BASE, completedAt: BASE + 2_000 }),
      task('B', { dependsOn: ['A'], startedAt: BASE + 2_000, completedAt: BASE + 12_000 }),
      task('C', { dependsOn: ['A'], startedAt: BASE + 2_000, completedAt: BASE + 7_000 }),
      task('D', { dependsOn: ['B', 'C'], startedAt: BASE + 12_000, completedAt: BASE + 15_000 }),
    ];
    const result = computeCriticalPath(tasks, now);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
    expect(result.has('D')).toBe(true);
  });

  it('handles tasks with no dependencies (all roots)', () => {
    const tasks: CriticalPathTask[] = [
      task('A', { createdAt: BASE, completedAt: BASE + 5_000 }),
      task('B', { createdAt: BASE, completedAt: BASE + 15_000 }),
      task('C', { createdAt: BASE, completedAt: BASE + 3_000 }),
    ];
    const result = computeCriticalPath(tasks, BASE + 15_000);
    // B has the longest duration so it should be on the critical path
    expect(result.has('B')).toBe(true);
  });

  it('handles running tasks (no completedAt) by stretching to now', () => {
    const now = BASE + 20_000;
    const tasks: CriticalPathTask[] = [
      task('A', { createdAt: BASE, completedAt: BASE + 5_000 }),
      task('B', { dependsOn: ['A'], startedAt: BASE + 5_000 }), // still running
    ];
    const result = computeCriticalPath(tasks, now);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
  });

  it('handles cycles gracefully without infinite loop', () => {
    const tasks: CriticalPathTask[] = [
      task('A', { dependsOn: ['B'], createdAt: BASE, completedAt: BASE + 5_000 }),
      task('B', { dependsOn: ['A'], createdAt: BASE, completedAt: BASE + 5_000 }),
    ];
    // Should not throw
    const result = computeCriticalPath(tasks, BASE + 5_000);
    expect(result).toBeInstanceOf(Set);
  });

  it('returns empty set when all tasks have zero duration', () => {
    const tasks: CriticalPathTask[] = [
      task('A', { createdAt: BASE, completedAt: BASE }),
      task('B', { createdAt: BASE, completedAt: BASE }),
    ];
    const result = computeCriticalPath(tasks, BASE);
    expect(result.size).toBe(0);
  });

  it('handles linear chain correctly', () => {
    const tasks: CriticalPathTask[] = [
      task('A', { createdAt: BASE, completedAt: BASE + 5_000 }),
      task('B', { dependsOn: ['A'], startedAt: BASE + 5_000, completedAt: BASE + 10_000 }),
      task('C', { dependsOn: ['B'], startedAt: BASE + 10_000, completedAt: BASE + 15_000 }),
    ];
    const result = computeCriticalPath(tasks, BASE + 15_000);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
    expect(result.has('C')).toBe(true);
  });
});
