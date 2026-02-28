import { useMemo } from 'react';
import { useLeadStore } from '../../stores/leadStore';
import { useAppStore } from '../../stores/appStore';
import type { DagStatus, Decision } from '../../types';
import type { AgentInfo } from '../../types';

// ── Types ────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  icon: string;
  title: string;
  detail: string;
  timestamp: number;
}

// ── Detection ────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function detectAlerts(
  agents: AgentInfo[],
  decisions: Decision[],
  dagStatus: DagStatus | null,
): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  // 1. Context pressure (>85% critical, >70% warning)
  for (const agent of agents) {
    if (agent.contextWindowSize && agent.contextWindowUsed) {
      const pct = agent.contextWindowUsed / agent.contextWindowSize;
      const roleName = typeof agent.role === 'object' ? agent.role.name : agent.role;
      const shortId = agent.id.slice(0, 8);
      if (pct > 0.85) {
        alerts.push({
          id: `ctx-${agent.id}`,
          severity: 'critical',
          icon: '🧠',
          title: `${roleName} at ${Math.round(pct * 100)}% context`,
          detail: `Agent ${shortId} may produce lower quality output.`,
          timestamp: now,
        });
      } else if (pct > 0.70) {
        alerts.push({
          id: `ctx-warn-${agent.id}`,
          severity: 'warning',
          icon: '🧠',
          title: `${roleName} at ${Math.round(pct * 100)}% context`,
          detail: `Agent ${shortId} approaching context limit.`,
          timestamp: now,
        });
      }
    }
  }

  // 2. Stuck agents (running >10 min since creation with no indication of progress)
  for (const agent of agents) {
    if (agent.status === 'running' && agent.createdAt) {
      const runningMs = now - new Date(agent.createdAt).getTime();
      if (runningMs > 600_000) {
        const roleName = typeof agent.role === 'object' ? agent.role.name : agent.role;
        alerts.push({
          id: `stuck-${agent.id}`,
          severity: 'warning',
          icon: '⏱️',
          title: `${roleName} may be stuck`,
          detail: `Running for ${Math.round(runningMs / 60000)} min with no completion.`,
          timestamp: now,
        });
      }
    }
  }

  // 3. Pending decisions (>3 min old)
  for (const decision of decisions) {
    if (decision.needsConfirmation && decision.status === 'recorded') {
      const age = now - new Date(decision.timestamp).getTime();
      if (age > 180_000) {
        alerts.push({
          id: `decision-${decision.id}`,
          severity: 'critical',
          icon: '⚠️',
          title: `Decision pending: ${decision.title}`,
          detail: `From ${decision.agentRole}, waiting ${Math.round(age / 60000)} min.`,
          timestamp: new Date(decision.timestamp).getTime(),
        });
      }
    }
  }

  // 4. Failed agents
  for (const agent of agents) {
    if (agent.status === 'failed') {
      const roleName = typeof agent.role === 'object' ? agent.role.name : agent.role;
      alerts.push({
        id: `failed-${agent.id}`,
        severity: 'critical',
        icon: '💥',
        title: `${roleName} failed`,
        detail: `Agent ${agent.id.slice(0, 8)} exited with failure status.`,
        timestamp: now,
      });
    }
  }

  // 5. Idle agents with ready DAG tasks
  if (dagStatus) {
    const readyTasks = dagStatus.tasks.filter(t => t.dagStatus === 'ready');
    const idleAgents = agents.filter(a => a.status === 'idle');
    if (readyTasks.length > 0 && idleAgents.length > 0) {
      alerts.push({
        id: 'idle-with-ready',
        severity: 'info',
        icon: '💡',
        title: `${readyTasks.length} tasks ready, ${idleAgents.length} agents idle`,
        detail: 'Consider assigning ready tasks to idle agents.',
        timestamp: now,
      });
    }
  }

  // 6. Blocked tasks
  if (dagStatus) {
    const blockedCount = dagStatus.summary?.blocked ?? 0;
    if (blockedCount > 0) {
      alerts.push({
        id: 'blocked-tasks',
        severity: 'warning',
        icon: '🚫',
        title: `${blockedCount} task${blockedCount > 1 ? 's' : ''} blocked`,
        detail: 'Check DAG for dependency issues.',
        timestamp: now,
      });
    }
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ── Rendering ────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<AlertSeverity, { bg: string; border: string; text: string }> = {
  critical: { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400' },
  warning:  { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
  info:     { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400' },
};

interface AlertsPanelProps {
  leadId: string;
}

export function AlertsPanel({ leadId }: AlertsPanelProps) {
  const agents = useAppStore((s) => s.agents);
  const decisions = useLeadStore((s) => s.projects[leadId]?.decisions ?? []);
  const dagStatus = useLeadStore((s) => s.projects[leadId]?.dagStatus ?? null);

  const teamAgents = useMemo(
    () => agents.filter((a) => a.parentId === leadId || a.id === leadId),
    [agents, leadId],
  );

  const alerts = useMemo(
    () => detectAlerts(teamAgents, decisions, dagStatus),
    [teamAgents, decisions, dagStatus],
  );

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {alerts.map((alert) => {
        const style = SEVERITY_STYLES[alert.severity];
        return (
          <div
            key={alert.id}
            className={`flex items-start gap-2 px-3 py-2 rounded-md border ${style.bg} ${style.border}`}
          >
            <span className="text-sm flex-shrink-0">{alert.icon}</span>
            <div className="min-w-0 flex-1">
              <span className={`text-xs font-medium ${style.text}`}>{alert.title}</span>
              <p className="text-[11px] text-zinc-500 leading-tight">{alert.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
