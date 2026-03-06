import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../hooks/useApi';
import { RESOLUTION_DISPLAY, type Debate } from './types';
import { DebateCard } from './DebateCard';
import { DebateThreadViewer } from './DebateThreadViewer';

interface DebatesPanelProps {
  leadId: string;
}

export function DebatesPanel({ leadId }: DebatesPanelProps) {
  const [debates, setDebates] = useState<Debate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDebate, setSelectedDebate] = useState<Debate | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<Debate[]>(`/debates/${leadId}`)
      .then((data) => setDebates(Array.isArray(data) ? data : []))
      .catch(() => setDebates([]))
      .finally(() => setLoading(false));
  }, [leadId]);

  // Sort: ongoing first, then by startTime descending
  const sorted = [...debates].sort((a, b) => {
    const aOngoing = !a.resolution || a.resolution.type === 'ongoing' ? 1 : 0;
    const bOngoing = !b.resolution || b.resolution.type === 'ongoing' ? 1 : 0;
    if (aOngoing !== bOngoing) return bOngoing - aOngoing;
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });

  // Stats
  const resolved = debates.filter((d) => d.resolution && d.resolution.type !== 'ongoing');
  const byConsensus = resolved.filter((d) => d.resolution?.type === 'consensus').length;
  const byLead = resolved.filter((d) => d.resolution?.type === 'lead_decision').length;
  const avgMessages = debates.length > 0
    ? Math.round(debates.reduce((s, d) => s + d.messageCount, 0) / debates.length)
    : 0;

  if (loading) {
    return <div className="text-xs text-th-text-muted p-4">Loading debates...</div>;
  }

  return (
    <div data-testid="debates-panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-th-text-muted uppercase tracking-wide">
          ⚡ Debates ({debates.length} this session)
        </h3>
      </div>

      {/* Debate list */}
      {sorted.length === 0 ? (
        <div className="text-center py-6">
          <span className="text-2xl">⚡</span>
          <p className="text-xs text-th-text-muted mt-1">No debates detected yet</p>
          <p className="text-[10px] text-th-text-muted">
            Debates are detected when agents disagree and converge
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((debate) => (
            <DebateCard
              key={debate.id}
              debate={debate}
              variant="compact"
              onViewThread={() => setSelectedDebate(debate)}
            />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {debates.length > 0 && (
        <p className="text-[10px] text-th-text-muted mt-3">
          {debates.length} debates, {byConsensus} by consensus, {byLead} by lead decision.
          Avg {avgMessages} messages.
        </p>
      )}

      {/* Thread viewer slide-over */}
      {selectedDebate && (
        <DebateThreadViewer
          debate={selectedDebate}
          onClose={() => setSelectedDebate(null)}
        />
      )}
    </div>
  );
}
