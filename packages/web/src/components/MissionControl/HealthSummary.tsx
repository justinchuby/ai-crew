import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useLeadStore } from '../../stores/leadStore';
import type { ProgressSnapshot } from '../../stores/leadStore';
import { useAppStore } from '../../stores/appStore';
import type { DagStatus } from '../../types';

// ── Sparkline ────────────────────────────────────────────────────────

function VelocitySparkline({ history }: { history: ProgressSnapshot[] }) {
  const deltas = history.slice(-10).map((snap, i, arr) => {
    if (i === 0) return 0;
    return snap.completed.length - arr[i - 1].completed.length;
  }).slice(1);

  if (deltas.length === 0) return null;

  const max = Math.max(...deltas, 1);
  const barChars = '▁▂▃▄▅▆▇█';

  return (
    <span className="font-mono text-sm tracking-wider">
      {deltas.map((d, i) => {
        const idx = Math.round((d / max) * (barChars.length - 1));
        const char = barChars[Math.max(0, idx)];
        return <span key={i} className="text-green-400">{char}</span>;
      })}
    </span>
  );
}

// ── HealthSummary ────────────────────────────────────────────────────

interface HealthSummaryProps {
  leadId: string;
}

export function HealthSummary({ leadId }: HealthSummaryProps) {
  const progress = useLeadStore((s) => s.projects[leadId]?.progress);
  const history = useLeadStore((s) => s.projects[leadId]?.progressHistory ?? []);
  const dagStatus = useLeadStore((s) => s.projects[leadId]?.dagStatus);
  const agents = useAppStore((s) => s.agents);

  const { teamAgents, activeCount, idleCount } = useMemo(() => {
    const team = agents.filter((a) => a.parentId === leadId || a.id === leadId);
    return {
      teamAgents: team,
      activeCount: team.filter((a) => a.status === 'running').length,
      idleCount: team.filter((a) => a.status === 'idle').length,
    };
  }, [agents, leadId]);

  const counts = useMemo(() => {
    if (dagStatus?.summary) return dagStatus.summary;
    const completed = progress?.completed ?? 0;
    const active = progress?.active ?? 0;
    const total = progress?.totalDelegations ?? 0;
    return {
      done: completed,
      running: active,
      blocked: 0,
      pending: Math.max(0, total - completed - active),
      failed: progress?.failed ?? 0,
      ready: 0,
      paused: 0,
      skipped: 0,
    } satisfies DagStatus['summary'];
  }, [dagStatus, progress]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const completionPct = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  return (
    <div className="bg-th-bg rounded-lg border border-th-border-muted p-4 space-y-3">
      <h3 className="text-sm font-semibold text-th-text-alt flex items-center gap-2">
        <BarChart3 size={14} className="text-th-text-muted" />
        Project Health
      </h3>

      {/* Progress bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-2xl font-bold text-th-text">{completionPct}%</span>
          <span className="text-xs text-th-text-muted">Progress</span>
        </div>
        <div className="h-2 bg-th-bg-alt rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Velocity sparkline */}
      {history.length > 2 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-th-text-muted">Velocity:</span>
          <VelocitySparkline history={history} />
        </div>
      )}

      {/* Status counts — 2x2 grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <span className="text-th-text-muted">✅ {counts.done} completed</span>
        <span className="text-th-text-muted">🔄 {counts.running} in progress</span>
        <span className={counts.blocked > 0 ? 'text-red-400' : 'text-th-text-muted'}>
          🚫 {counts.blocked} blocked
        </span>
        <span className="text-th-text-muted">⏳ {counts.pending} pending</span>
      </div>

      {/* Team summary line */}
      <div className="text-xs text-th-text-muted pt-1 border-t border-th-border-muted">
        {teamAgents.length} agents · {activeCount} active · {idleCount} idle
      </div>
    </div>
  );
}
