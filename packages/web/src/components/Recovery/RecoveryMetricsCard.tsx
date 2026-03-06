import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi';
import { TRIGGER_LABELS, type RecoveryMetrics } from './types';

interface RecoveryMetricsCardProps {
  metrics?: RecoveryMetrics;
  triggerBreakdown?: Record<string, number>;
}

function rateColor(rate: number): string {
  if (rate >= 100) return 'text-green-500';
  if (rate >= 50) return 'text-yellow-500';
  return 'text-red-400';
}

const EMPTY_METRICS: RecoveryMetrics = {
  sessionId: '', totalCrashes: 0, totalRecoveries: 0, successRate: 0,
  avgRecoveryTimeMs: 0, tasksCompletedPostRecovery: 0, tasksAssignedPostRecovery: 0,
};

export function RecoveryMetricsCard({ metrics: propMetrics, triggerBreakdown }: RecoveryMetricsCardProps) {
  const [fetchedMetrics, setFetchedMetrics] = useState<RecoveryMetrics | null>(null);

  // Self-fetch when no metrics prop — for standalone use in Settings
  useEffect(() => {
    if (propMetrics) return;
    apiFetch<RecoveryMetrics>('/recovery/metrics')
      .then((data) => setFetchedMetrics(data))
      .catch(() => setFetchedMetrics(EMPTY_METRICS));
  }, [propMetrics]);

  const metrics = propMetrics ?? fetchedMetrics ?? EMPTY_METRICS;
  const avgSec = (metrics.avgRecoveryTimeMs / 1000).toFixed(1);
  const postRecoveryLabel = `${metrics.tasksCompletedPostRecovery}/${metrics.tasksAssignedPostRecovery}`;

  // Zero-crash celebration
  if (metrics.totalCrashes === 0) {
    return (
      <div className="bg-surface-raised border border-th-border rounded-lg p-4" data-testid="recovery-metrics-card">
        <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider mb-2">🔄 Recovery Health</h3>
        <div className="text-center py-4">
          <span className="text-2xl">🎉</span>
          <p className="text-xs text-green-500 font-medium mt-1">Zero crashes this session</p>
          <p className="text-[10px] text-th-text-muted">Crew stability: excellent</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4" data-testid="recovery-metrics-card">
      <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider mb-3">🔄 Recovery Health</h3>

      {/* Four stats */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatBox label="Crashes" value={String(metrics.totalCrashes)} />
        <StatBox
          label="Recovery rate"
          value={`${metrics.successRate}%`}
          className={rateColor(metrics.successRate)}
        />
        <StatBox label="Avg time" value={`${avgSec}s`} />
        <StatBox label="Post-recover" value={postRecoveryLabel} />
      </div>

      {/* Trigger breakdown */}
      {triggerBreakdown && Object.keys(triggerBreakdown).length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-th-text-muted mb-1">Crashes by trigger:</p>
          <div className="space-y-1">
            {Object.entries(triggerBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([trigger, count]) => {
                const maxCount = Math.max(...Object.values(triggerBreakdown));
                const pct = (count / maxCount) * 100;
                return (
                  <div key={trigger} className="flex items-center gap-2 text-[10px]">
                    <span className="w-28 text-th-text-muted truncate">
                      {TRIGGER_LABELS[trigger as keyof typeof TRIGGER_LABELS] ?? trigger}
                    </span>
                    <div className="flex-1 h-2 bg-th-bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-th-text-alt w-4 text-right">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Insight */}
      <div className="text-[10px] text-th-text-muted bg-th-bg-alt border border-th-border rounded-md p-2">
        {metrics.successRate >= 100 ? (
          <p>💡 All recovered agents completed their tasks successfully.</p>
        ) : (
          <p>⚠️ {metrics.totalCrashes - metrics.totalRecoveries} recovery attempt(s) failed. Consider reducing agent context window size.</p>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${className ?? 'text-th-text-alt'}`}>{value}</p>
      <p className="text-[9px] text-th-text-muted">{label}</p>
    </div>
  );
}
