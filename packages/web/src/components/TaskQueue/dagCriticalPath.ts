/**
 * Critical path computation for DAG task visualizations.
 *
 * Shared by DagGraph and DagGantt to identify the longest dependency chain
 * (the chain with the greatest cumulative wall-clock duration).
 */

export interface CriticalPathTask {
  id: string;
  dependsOn?: string[];
  createdAt?: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Returns the set of task IDs on the critical path — the chain of tasks
 * with the greatest cumulative duration from start to finish.
 *
 * "Duration" is the wall-clock span of each task. Tasks that haven't
 * completed yet stretch to `now`.
 */
export function computeCriticalPath(tasks: CriticalPathTask[], now: number): Set<string> {
  if (tasks.length === 0) return new Set();

  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // Memoised earliest-completion-time for each task (sum of self + max dep ECT).
  const ect = new Map<string, number>();
  const visiting = new Set<string>();

  function getECT(id: string): number {
    if (ect.has(id)) return ect.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);

    const task = taskMap.get(id);
    if (!task) { ect.set(id, 0); return 0; }

    const start = task.startedAt ?? task.createdAt ?? now;
    const end = task.completedAt ?? now;
    const selfDur = Math.max(0, end - start);

    const maxDepECT = (task.dependsOn ?? []).reduce<number>((m, depId) => {
      return Math.max(m, getECT(depId));
    }, 0);

    const result = maxDepECT + selfDur;
    ect.set(id, result);
    visiting.delete(id);
    return result;
  }

  tasks.forEach(t => getECT(t.id));

  const maxECT = Math.max(0, ...ect.values());
  if (maxECT === 0) return new Set();

  const onCritical = new Set<string>();
  const SLACK = 1000; // 1s tolerance for rounding

  function backtrack(id: string) {
    if (onCritical.has(id)) return;
    onCritical.add(id);
    const task = taskMap.get(id);
    if (!task) return;

    const start = task.startedAt ?? task.createdAt ?? now;
    const end = task.completedAt ?? now;
    const selfDur = Math.max(0, end - start);
    const targetDepECT = (ect.get(id) ?? 0) - selfDur;

    for (const depId of (task.dependsOn ?? [])) {
      if (Math.abs((ect.get(depId) ?? 0) - targetDepECT) <= SLACK) {
        backtrack(depId);
        break;
      }
    }
  }

  // Backtrack from every leaf task that sits on the maximum ECT.
  tasks.forEach(t => {
    if (Math.abs((ect.get(t.id) ?? 0) - maxECT) <= SLACK) backtrack(t.id);
  });

  return onCritical;
}

/**
 * Format elapsed time between two ISO timestamps (or from start to now).
 * Shared by DagGraph nodes and DagResourceView rows.
 */
export function formatElapsed(createdAt: string, completedAt?: string): string {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
