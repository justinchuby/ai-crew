import type { AnalyticsInsight } from './types';

interface InsightCardProps {
  insight: AnalyticsInsight;
}

const SEVERITY_STYLES: Record<string, { icon: string; border: string }> = {
  info: { icon: '📈', border: 'border-l-sky-400' },
  suggestion: { icon: '🔄', border: 'border-l-amber-400' },
  warning: { icon: '⚠️', border: 'border-l-red-400' },
};

export function InsightCard({ insight }: InsightCardProps) {
  const style = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info;

  return (
    <div
      className={`bg-th-bg-alt border border-th-border border-l-4 ${style.border} rounded-lg p-3`}
      data-testid="insight-card"
    >
      <div className="flex items-start gap-2">
        <span className="text-sm shrink-0 mt-0.5">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-th-text-alt">{insight.title}</p>
          <p className="text-[11px] text-th-text-muted mt-0.5">{insight.description}</p>
          {insight.actionable && (
            <button className="text-[11px] text-accent hover:underline mt-1">
              {insight.actionable.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
