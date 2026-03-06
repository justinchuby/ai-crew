import { RESOLUTION_DISPLAY, SEVERITY_STYLES, type Debate } from './types';

interface DebateCardProps {
  debate: Debate;
  variant?: 'full' | 'compact';
  onViewThread?: () => void;
  onShowTimeline?: () => void;
}

const ROLE_ICONS: Record<string, string> = {
  lead: '👑', architect: '🏗', developer: '👨‍💻', 'code-reviewer': '🔍',
  'qa-tester': '🧪', designer: '🎨', 'tech-writer': '📝', 'product-manager': '📋',
  secretary: '📋',
};

export function DebateCard({ debate, variant = 'full', onViewThread, onShowTimeline }: DebateCardProps) {
  const isOngoing = !debate.resolution || debate.resolution.type === 'ongoing';
  const resolution = debate.resolution;
  const resDisplay = resolution ? RESOLUTION_DISPLAY[resolution.type] : null;

  const borderColor = isOngoing ? 'border-l-amber-400' : resolution?.type === 'deferred' ? 'border-l-gray-400' : 'border-l-green-500';

  // Compact variant
  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 border-l-2 ${borderColor} hover:bg-th-bg-muted/30 cursor-pointer transition-colors`}
        onClick={onViewThread}
        data-testid="debate-card-compact"
      >
        <span className={isOngoing ? 'animate-pulse' : ''}>⚡</span>
        <span className="text-xs text-th-text-alt flex-1 truncate">{debate.topic}</span>
        <span className="text-[10px] text-th-text-muted">
          {debate.participants.length} agents, {debate.messageCount} msgs
        </span>
        {resDisplay && <span className={`text-[10px] ${resDisplay.color}`}>{resDisplay.icon}</span>}
      </div>
    );
  }

  // Full variant
  return (
    <div
      className={`border border-th-border border-l-4 ${borderColor} rounded-lg bg-surface-raised overflow-hidden`}
      data-testid="debate-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-th-border/40">
        <div className="flex items-center gap-1.5">
          <span className={isOngoing ? 'animate-pulse' : ''}>⚡</span>
          <span className="text-xs font-semibold text-th-text-alt">{debate.topic}</span>
        </div>
        <span className="text-[10px] text-th-text-muted">
          {new Date(debate.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>

      {/* Participants + Stats */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-th-bg-alt/50">
        <div className="flex gap-1">
          {debate.participants.map((p) => (
            <span
              key={p.agentId}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-th-bg-alt border border-th-border text-th-text-muted"
            >
              {ROLE_ICONS[p.role] ?? '🤖'} {p.role}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-th-text-muted">
          {debate.messageCount} messages • {Math.round(debate.duration / 60)}min
        </span>
      </div>

      {/* Positions */}
      <div className="px-4 py-2 space-y-1">
        {debate.participants.slice(0, 4).map((p) => (
          <div key={p.agentId} className="flex items-start gap-1.5 text-[11px]">
            <span className="shrink-0">{ROLE_ICONS[p.role] ?? '🤖'}</span>
            <span className="text-th-text-muted truncate">{p.role}:</span>
            <span className="text-th-text-alt truncate flex-1">"{p.position}"</span>
          </div>
        ))}
        {debate.participants.length > 4 && (
          <p className="text-[10px] text-th-text-muted">and {debate.participants.length - 4} more</p>
        )}
      </div>

      {/* Resolution */}
      {resolution && (
        <div className={`px-4 py-2 border-t border-th-border/40 ${
          resolution.type === 'ongoing' ? 'bg-amber-500/5' : 'bg-green-500/5'
        }`}>
          <div className="flex items-center gap-1.5">
            <span>{resDisplay?.icon}</span>
            <span className={`text-[11px] font-medium ${resDisplay?.color ?? ''}`}>
              {resolution.summary || resDisplay?.label}
            </span>
          </div>
          {resolution.decidedBy && (
            <p className="text-[10px] text-th-text-muted mt-0.5 ml-5">
              Lead tiebreaker
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-th-border/40">
        {onViewThread && (
          <button onClick={onViewThread} className="text-[11px] text-accent hover:underline">
            View Thread →
          </button>
        )}
        {onShowTimeline && (
          <button onClick={onShowTimeline} className="text-[11px] text-th-text-muted hover:text-th-text ml-auto">
            Show on Timeline
          </button>
        )}
      </div>
    </div>
  );
}
