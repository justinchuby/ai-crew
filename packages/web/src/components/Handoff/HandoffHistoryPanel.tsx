import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { HandoffRecord } from './types';
import { HandoffTimelineEntry } from './HandoffTimelineEntry';
import { HandoffBriefingViewer } from './HandoffBriefingViewer';

/**
 * Self-contained panel showing handoff history for the current session.
 * Fetches from GET /api/handoffs, renders HandoffTimelineEntry rows,
 * and opens HandoffBriefingViewer on click.
 */
export function HandoffHistoryPanel() {
  const [records, setRecords] = useState<HandoffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HandoffRecord[]>('/handoffs')
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-xs text-th-text-muted p-4">Loading handoff history...</div>;
  }

  return (
    <div data-testid="handoff-history-panel">
      <h3 className="text-xs font-semibold text-th-text-muted uppercase tracking-wide mb-2">
        📋 Handoff History ({records.length})
      </h3>

      {records.length === 0 ? (
        <div className="text-center py-4">
          <span className="text-2xl">📋</span>
          <p className="text-xs text-th-text-muted mt-1">No handoffs this session</p>
          <p className="text-[10px] text-th-text-muted">
            Handoffs occur on agent crashes, model swaps, or session end
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {records.map((r) => (
            <HandoffTimelineEntry
              key={r.id}
              record={r}
              onClick={() => setSelectedId(r.id)}
            />
          ))}
        </div>
      )}

      {selectedId && (
        <HandoffBriefingViewer
          handoffId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
