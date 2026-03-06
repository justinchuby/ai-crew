import { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { HandoffRecord } from './types';

interface AgentArchiveStatus {
  agentId: string;
  role: string;
  status: 'pending' | 'generating' | 'done' | 'failed';
  discoveries: number;
  uncommittedFiles: number;
}

interface SessionEndArchiveProps {
  sessionId: string;
  agents: { id: string; role: string }[];
  onClose: () => void;
  onArchive: () => void;
}

export function SessionEndArchive({ sessionId, agents, onClose, onArchive }: SessionEndArchiveProps) {
  const [statuses, setStatuses] = useState<AgentArchiveStatus[]>(
    agents.map((a) => ({
      agentId: a.id, role: a.role, status: 'pending', discoveries: 0, uncommittedFiles: 0,
    })),
  );
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    setArchiving(true);
    // Mark all as generating
    setStatuses((prev) => prev.map((s) => ({ ...s, status: 'generating' })));

    try {
      const records = await apiFetch<HandoffRecord[]>('/handoffs/archive-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
      // Map records back to statuses
      setStatuses((prev) =>
        prev.map((s) => {
          const rec = records.find((r) => r.sourceAgentId === s.agentId);
          if (rec) {
            return {
              ...s,
              status: 'done',
              discoveries: rec.briefing.discoveries.length,
              uncommittedFiles: rec.briefing.files.length,
            };
          }
          return { ...s, status: 'failed' };
        }),
      );
    } catch {
      setStatuses((prev) => prev.map((s) => (s.status === 'generating' ? { ...s, status: 'failed' } : s)));
    }
    setArchiving(false);
  };

  const allDone = statuses.every((s) => s.status === 'done' || s.status === 'failed');
  const hasUncommitted = statuses.some((s) => s.uncommittedFiles > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-raised border border-th-border rounded-xl shadow-2xl w-[480px] max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="session-end-archive"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-th-border">
          <h2 className="text-sm font-semibold text-th-text-alt">📦 Session Ending — Archiving Knowledge</h2>
          <button onClick={onClose} className="p-1 rounded text-th-text-muted hover:text-th-text">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-th-text-muted">
            Generating handoff briefings for future sessions...
          </p>

          {/* Agent statuses */}
          <div className="space-y-2">
            {statuses.map((s) => (
              <div key={s.agentId} className="flex items-center gap-2 text-[11px]">
                <StatusIcon status={s.status} />
                <span className="text-th-text-alt capitalize flex-1">{s.role}</span>
                {s.status === 'done' && (
                  <span className="text-th-text-muted">
                    {s.discoveries} discoveries, {s.uncommittedFiles} files
                    {s.uncommittedFiles > 0 && <AlertTriangle className="inline w-3 h-3 text-amber-400 ml-1" />}
                  </span>
                )}
                {s.status === 'generating' && (
                  <span className="text-th-text-muted">generating...</span>
                )}
                {s.status === 'failed' && (
                  <span className="text-red-400">failed</span>
                )}
              </div>
            ))}
          </div>

          {/* Uncommitted warning */}
          {hasUncommitted && allDone && (
            <div className="bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
              <p className="text-[11px] text-amber-400">
                ⚠ Some agents have uncommitted changes. Consider committing before archiving.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-th-border flex items-center justify-between">
          <p className="text-[10px] text-th-text-muted">
            Briefings will be available when starting new sessions on this project.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-th-text-muted hover:text-th-text">
              Skip
            </button>
            {allDone ? (
              <button
                onClick={onArchive}
                className="px-4 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent/90"
              >
                Archive & End →
              </button>
            ) : (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="px-4 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50"
              >
                {archiving ? 'Archiving...' : 'Archive & End →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: AgentArchiveStatus['status'] }) {
  switch (status) {
    case 'done': return <Check size={14} className="text-green-400" />;
    case 'generating': return <Loader2 size={14} className="text-accent animate-spin" />;
    case 'failed': return <X size={14} className="text-red-400" />;
    default: return <span className="w-3.5 h-3.5 rounded-full border border-th-border inline-block" />;
  }
}
