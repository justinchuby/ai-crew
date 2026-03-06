import { qualityBarColor, qualityColor, type QualityFactor } from './types';

interface HandoffQualityBarProps {
  score: number;
  factors: QualityFactor[];
  compact?: boolean;
}

export function HandoffQualityBar({ score, factors, compact = false }: HandoffQualityBarProps) {
  const barColor = qualityBarColor(score);
  const textColor = qualityColor(score);

  if (compact) {
    return (
      <div className="flex items-center gap-2" data-testid="handoff-quality-bar">
        <div className="w-16 h-1.5 bg-th-bg-alt rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-[10px] font-medium ${textColor}`}>{score}/100</span>
      </div>
    );
  }

  return (
    <div data-testid="handoff-quality-bar">
      {/* Overall bar */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-th-text-muted">Quality:</span>
        <div className="flex-1 h-2 bg-th-bg-alt rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-xs font-semibold ${textColor}`}>{score}/100</span>
      </div>

      {/* Factor breakdown */}
      <div className="space-y-1 ml-1">
        {factors.map((f) => (
          <div key={f.name} className="flex items-center gap-2 text-[10px]">
            <span className="text-th-text-muted w-28 capitalize">{f.name.replace(/_/g, ' ')}:</span>
            <div className="w-20 h-1 bg-th-bg-alt rounded-full overflow-hidden">
              <div className={`h-full ${qualityBarColor(f.score)} rounded-full`} style={{ width: `${f.score}%` }} />
            </div>
            <span className="text-th-text-muted flex-1 truncate">{f.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
