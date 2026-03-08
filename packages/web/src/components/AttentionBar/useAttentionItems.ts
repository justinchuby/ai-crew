import { useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useLeadStore } from '../../stores/leadStore';

// ── Types ───────────────────────────────────────────────────────────

export type EscalationLevel = 'green' | 'yellow' | 'red';

export interface AttentionItem {
  id: string;
  kind: 'failed' | 'blocked' | 'stale' | 'decision';
  label: string;
  /** Route to navigate to on click, or callback action */
  action: { type: 'navigate'; to: string } | { type: 'callback'; key: string };
}

export interface AttentionState {
  items: AttentionItem[];
  escalation: EscalationLevel;
  /** "12/20 done" style summary */
  progressText: string;
  agentCount: number;
  runningCount: number;
  failedTaskCount: number;
  pendingDecisionCount: number;
}

// ── Constants ───────────────────────────────────────────────────────

const BLOCKED_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes for running tasks

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Derives attention items and escalation level from app + lead stores.
 * Pure computation — no side effects.
 */
export function useAttentionItems(): AttentionState {
  const agents = useAppStore((s) => s.agents);
  const pendingDecisions = useAppStore((s) => s.pendingDecisions);
  const projects = useLeadStore((s) => s.projects);
  const selectedLeadId = useLeadStore((s) => s.selectedLeadId);

  return useMemo(() => {
    const items: AttentionItem[] = [];
    const now = Date.now();

    // Aggregate DAG summary across all projects (or selected project)
    let totalDone = 0;
    let totalTasks = 0;
    let failedTaskCount = 0;
    let blockedTaskCount = 0;

    const projectEntries = selectedLeadId
      ? [[selectedLeadId, projects[selectedLeadId]] as const]
      : Object.entries(projects);

    for (const [projectId, project] of projectEntries) {
      if (!project?.dagStatus) continue;
      const { summary, tasks } = project.dagStatus;

      totalDone += summary.done;
      totalTasks += summary.pending + summary.ready + summary.running +
        summary.done + summary.failed + summary.blocked + summary.paused + summary.skipped;
      failedTaskCount += summary.failed;
      blockedTaskCount += summary.blocked;

      // Generate items for failed tasks
      for (const task of tasks) {
        if (task.dagStatus === 'failed') {
          items.push({
            id: `failed-${task.id}`,
            kind: 'failed',
            label: task.title || task.id,
            action: { type: 'navigate', to: `/projects/${projectId}/tasks` },
          });
        }
      }

      // Generate items for blocked tasks (>30min)
      for (const task of tasks) {
        if (task.dagStatus === 'blocked') {
          const blockedSince = task.startedAt ? new Date(task.startedAt).getTime()
            : new Date(task.createdAt).getTime();
          const blockedDuration = now - blockedSince;
          if (blockedDuration > BLOCKED_THRESHOLD_MS) {
            const mins = Math.round(blockedDuration / 60_000);
            items.push({
              id: `blocked-${task.id}`,
              kind: 'blocked',
              label: `${task.title || task.id} (blocked ${mins}m)`,
              action: { type: 'navigate', to: `/projects/${projectId}/tasks` },
            });
          }
        }
      }

      // Generate items for stale running tasks (>15min with no update)
      for (const task of tasks) {
        if (task.dagStatus === 'running') {
          const startedAt = task.startedAt ? new Date(task.startedAt).getTime() : 0;
          const runningDuration = startedAt ? now - startedAt : 0;
          if (runningDuration > STALE_THRESHOLD_MS) {
            items.push({
              id: `stale-${task.id}`,
              kind: 'stale',
              label: `${task.title || task.id} (running ${Math.round(runningDuration / 60_000)}m)`,
              action: { type: 'navigate', to: `/projects/${projectId}/tasks` },
            });
          }
        }
      }
    }

    // Pending decisions
    for (const decision of pendingDecisions) {
      items.push({
        id: `decision-${decision.id}`,
        kind: 'decision',
        label: decision.title || 'Decision pending',
        action: { type: 'callback', key: 'openApprovalQueue' },
      });
    }

    // Agent counts
    let runningCount = 0;
    for (const agent of agents) {
      if (agent.status === 'running' || agent.status === 'creating') runningCount++;
    }

    // Escalation logic
    const exceptionCount = items.length;
    let escalation: EscalationLevel = 'green';
    if (failedTaskCount > 0 || exceptionCount >= 3) {
      escalation = 'red';
    } else if (exceptionCount >= 1) {
      escalation = 'yellow';
    }

    // Progress text — avoid misleading "0/0 done" (AC-13.10)
    const progressText = totalTasks > 0
      ? `${totalDone}/${totalTasks} done`
      : '';

    return {
      items,
      escalation,
      progressText,
      agentCount: agents.length,
      runningCount,
      failedTaskCount,
      pendingDecisionCount: pendingDecisions.length,
    };
  }, [agents, pendingDecisions, projects, selectedLeadId]);
}
