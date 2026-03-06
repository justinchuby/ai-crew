import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import { RESOLUTION_DISPLAY, type Debate, type DebateMessage as DebateMsg } from './types';

interface DebateThreadViewerProps {
  debate: Debate;
  onClose: () => void;
}

const ROLE_ICONS: Record<string, string> = {
  lead: '👑', architect: '🏗', developer: '👨‍💻', 'code-reviewer': '🔍',
  'qa-tester': '🧪', designer: '🎨', 'tech-writer': '📝', 'product-manager': '📋',
};

const DISAGREEMENT_KEYWORDS = /disagree|push back|instead|alternative|concern|however|but I|my recommendation differs/i;

export function DebateThreadViewer({ debate, onClose }: DebateThreadViewerProps) {
  const [messages, setMessages] = useState<DebateMsg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ messages: DebateMsg[] }>(`/debates/${debate.id}/messages`)
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [debate.id]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const resolution = debate.resolution;
  const resDisplay = resolution ? RESOLUTION_DISPLAY[resolution.type] : null;

  return (
    <div
      className="fixed inset-y-0 right-0 w-[480px] bg-th-bg border-l border-th-border shadow-xl z-40 flex flex-col animate-slide-in-right"
      data-testid="debate-thread-viewer"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-th-border shrink-0">
        <span>⚡</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-th-text-alt truncate">{debate.topic}</h3>
          <p className="text-[10px] text-th-text-muted">
            {debate.participants.length} participants • {debate.messageCount} messages •{' '}
            {resolution ? resDisplay?.label : 'Ongoing'}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md text-th-text-muted hover:text-th-text hover:bg-th-bg-hover">
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-xs text-th-text-muted text-center py-8">Loading thread...</p>
        ) : messages.length === 0 ? (
          // Show participant positions as fallback
          debate.participants.map((p) => (
            <MessageBubble
              key={p.agentId}
              role={p.role}
              content={p.position}
              timestamp={debate.startTime}
              isDisagreement={false}
            />
          ))
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              isDisagreement={msg.isDisagreement ?? DISAGREEMENT_KEYWORDS.test(msg.content)}
            />
          ))
        )}

        {/* Resolution divider */}
        {resolution && resolution.type !== 'ongoing' && (
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-px bg-th-border" />
              <span className="text-[10px] text-th-text-muted">Resolution</span>
              <div className="flex-1 h-px bg-th-border" />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span>{resDisplay?.icon}</span>
              <span className={resDisplay?.color}>{resolution.summary}</span>
            </div>
            {resolution.decidedBy && (
              <p className="text-[10px] text-th-text-muted mt-0.5 ml-5">Lead tiebreaker</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ role, content, timestamp, isDisagreement }: {
  role: string; content: string; timestamp: string; isDisagreement: boolean;
}) {
  const icon = ROLE_ICONS[role] ?? '🤖';
  const time = new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className={`border-l-2 ${isDisagreement ? 'border-l-amber-400' : 'border-l-transparent'} pl-2`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-sm">{icon}</span>
        <span className="text-[11px] font-medium text-th-text-alt capitalize">{role}</span>
        <span className="text-[9px] text-th-text-muted ml-auto">{time}</span>
      </div>
      <p className="text-[11px] text-th-text-muted leading-relaxed ml-5">"{content}"</p>
    </div>
  );
}
