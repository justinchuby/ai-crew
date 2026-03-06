import { usePredictions, usePredictionAccuracy } from '../../hooks/usePredictions';
import { PredictionCard } from './PredictionCard';
import { EmptyState } from '../Shared';

export function PredictionsPanel() {
  const { predictions, loading, dismiss } = usePredictions();
  const accuracy = usePredictionAccuracy();

  // Sort: completion_estimate first (positive), then by severity (critical > warning > info), then confidence
  const sorted = [...predictions].sort((a, b) => {
    if (a.type === 'completion_estimate') return -1;
    if (b.type === 'completion_estimate') return 1;
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    const sevDiff = (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2);
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  if (loading) {
    return (
      <div className="text-xs text-th-text-muted p-4 animate-pulse">Loading predictions…</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-th-text flex items-center gap-2">
          <span>🔮</span> Predictions
        </h3>
        {accuracy && accuracy.total > 0 && (
          <span className="text-[10px] text-th-text-muted">
            Accuracy: {Math.round(accuracy.accuracy)}% ({accuracy.total} predictions)
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon="🔮" title="No active predictions" description="Predictions appear after agents accumulate enough data." />
      ) : (
        <div className="space-y-2">
          {sorted.slice(0, 5).map(p => (
            <PredictionCard key={p.id} prediction={p} onDismiss={dismiss} />
          ))}
          {sorted.length > 5 && (
            <button className="text-[11px] text-accent hover:text-accent/80 w-full text-center">
              +{sorted.length - 5} more predictions
            </button>
          )}
        </div>
      )}

      {accuracy && accuracy.total > 0 && (
        <div className="border-t border-th-border-muted pt-2 text-[10px] text-th-text-muted">
          Last updated: just now • Refreshes every 30s
        </div>
      )}
    </div>
  );
}
