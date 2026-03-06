import { TRIGGER_DISPLAY, qualityBarColor, qualityColor, type HandoffRecord } from './types';

interface HandoffTimelineEntryProps {
  record: HandoffRecord;
  onClick: () => void;
}

export function HandoffTimelineEntry({ record, onClick }: HandoffTimelineEntryProps) {
  const trigger = TRIGGER_DISPLAY[record.trigger];
  const time = new Date(record.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const source = `${record.sourceRole}${record.sourceModel ? ` (${record.sourceModel})` : ''}`;
  const target = record.targetRole
    ? `${record.targetRole}${record.targetModel ? ` (${record.targetModel})` : ''}`
    : null;

  const reviewLabel = record.reviewedBy === 'user'
    ? 'User reviewed'
    : record.reviewedBy === 'system'
      ? 'Auto-delivered'
      : 'Pending';

  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-th-bg-hover transition-colors text-left"
      data-testid="handoff-timeline-entry"
    >
      {/* Time + icon */}
      <div className="shrink-0 text-center w-14">
        <p className="text-[10px] text-th-text-muted font-mono">{time}</p>
        <span className="text-lg">{trigger.icon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium ${trigger.color}`}>{trigger.label}</span>
        </div>
        <p className="text-[11px] text-th-text-alt">
          {source}{target ? ` → ${target}` : ''}
        </p>

        {/* Quality + meta */}
        <div className="flex items-center gap-3 mt-1">
          {record.qualityScore != null && (
            <div className="flex items-center gap-1">
              <div className="w-12 h-1 bg-th-bg-alt rounded-full overflow-hidden">
                <div className={`h-full ${qualityBarColor(record.qualityScore)} rounded-full`} style={{ width: `${record.qualityScore}%` }} />
              </div>
              <span className={`text-[9px] font-medium ${qualityColor(record.qualityScore)}`}>
                {record.qualityScore}
              </span>
            </div>
          )}
          <span className="text-[9px] text-th-text-muted">
            {record.briefing.tokenCount} tokens
          </span>
          <span className="text-[9px] text-th-text-muted">{reviewLabel}</span>
        </div>
      </div>
    </button>
  );
}
