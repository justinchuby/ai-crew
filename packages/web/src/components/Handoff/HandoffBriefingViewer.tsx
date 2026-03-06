import { useState, useEffect } from 'react';
import { X, Copy, Check, Edit3 } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import { TRIGGER_DISPLAY, qualityColor, type HandoffRecord } from './types';
import { HandoffQualityBar } from './HandoffQualityBar';

interface HandoffBriefingViewerProps {
  handoffId: string;
  onClose: () => void;
}

export function HandoffBriefingViewer({ handoffId, onClose }: HandoffBriefingViewerProps) {
  const [record, setRecord] = useState<HandoffRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [narrative, setNarrative] = useState('');
  const [copied, setCopied] = useState(false);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    apiFetch<HandoffRecord>(`/handoffs/${handoffId}`)
      .then((data) => { setRecord(data); setNarrative(data.briefing.narrative); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [handoffId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleCopy = () => {
    if (record) {
      navigator.clipboard.writeText(record.briefing.narrative).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveEdit = async () => {
    if (!record) return;
    try {
      const updated = await apiFetch<HandoffRecord>(`/handoffs/${record.id}/briefing`, {
        method: 'PUT',
        body: JSON.stringify({ narrative }),
      });
      setRecord(updated);
      setEditing(false);
    } catch { /* best effort */ }
  };

  const handleDeliver = async () => {
    if (!record) return;
    setDelivering(true);
    try {
      await apiFetch(`/handoffs/${record.id}/deliver`, { method: 'POST' });
      setRecord({ ...record, status: 'delivered', deliveredAt: new Date().toISOString() });
    } catch { /* best effort */ }
    setDelivering(false);
  };

  const triggerInfo = record ? TRIGGER_DISPLAY[record.trigger] : null;

  return (
    <div
      className="fixed inset-y-0 right-0 w-[520px] bg-th-bg border-l border-th-border shadow-xl z-40 flex flex-col animate-slide-in-right"
      data-testid="handoff-briefing-viewer"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-th-border shrink-0">
        <span className="text-lg">📋</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-th-text-alt">Handoff Briefing</h3>
          {record && (
            <p className="text-[10px] text-th-text-muted">
              {record.sourceRole} ({record.sourceModel})
              {record.targetRole ? ` → ${record.targetRole}` : ''}
              {record.targetModel ? ` (${record.targetModel})` : ''}
              {triggerInfo ? ` • ${triggerInfo.icon} ${triggerInfo.label}` : ''}
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md text-th-text-muted hover:text-th-text hover:bg-th-bg-hover">
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-th-text-muted">Loading briefing...</p>
        </div>
      ) : !record ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-red-400">Briefing not found</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Quality bar */}
            {record.qualityScore != null && (
              <HandoffQualityBar score={record.qualityScore} factors={record.qualityFactors} />
            )}

            {/* Narrative */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-th-text-muted">📝 Narrative</span>
                <button
                  onClick={() => setEditing(!editing)}
                  className="text-[10px] text-accent hover:underline flex items-center gap-1"
                >
                  <Edit3 size={10} /> {editing ? 'Cancel' : 'Edit'}
                </button>
              </div>
              {editing ? (
                <div>
                  <textarea
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    className="w-full h-24 px-3 py-2 text-[11px] bg-th-bg border border-th-border rounded-md text-th-text resize-none focus:border-accent outline-none"
                  />
                  <button onClick={handleSaveEdit} className="mt-1 px-3 py-1 text-[10px] bg-accent text-white rounded-md">
                    Save
                  </button>
                </div>
              ) : (
                <div className="bg-th-bg-alt/50 rounded-md px-3 py-2 text-[11px] text-th-text-alt leading-relaxed whitespace-pre-wrap">
                  {record.briefing.narrative}
                </div>
              )}
            </div>

            {/* Tasks */}
            {record.briefing.tasks.length > 0 && (
              <Section title="📋 Task Progress">
                {record.briefing.tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-[11px]">
                    <span className={t.status === 'done' ? 'text-green-400' : t.status === 'running' ? 'text-blue-400' : 'text-th-text-muted'}>
                      {t.status === 'done' ? '✅' : t.status === 'running' ? '●' : '◐'}
                    </span>
                    <span className="text-th-text-alt">{t.name}</span>
                    {t.progress && <span className="text-th-text-muted ml-auto">{t.progress}</span>}
                  </div>
                ))}
              </Section>
            )}

            {/* Files */}
            {record.briefing.files.length > 0 && (
              <Section title={`📁 Files (${record.briefing.files.length})`}>
                {record.briefing.files.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-th-text-alt truncate flex-1">{f.path}</span>
                    <span className="text-green-400">+{f.additions}</span>
                    <span className="text-red-400">-{f.deletions}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Last messages */}
            {record.briefing.lastMessages.length > 0 && (
              <Section title={`💬 Last Messages (${record.briefing.lastMessages.length})`}>
                {record.briefing.lastMessages.map((msg, i) => (
                  <p key={i} className="text-[11px] text-th-text-muted leading-relaxed">"{msg}"</p>
                ))}
              </Section>
            )}

            {/* Discoveries */}
            {record.briefing.discoveries.length > 0 && (
              <Section title="💡 Discoveries">
                {record.briefing.discoveries.map((d, i) => (
                  <p key={i} className="text-[11px] text-th-text-alt">• {d}</p>
                ))}
              </Section>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-th-border shrink-0">
            <span className="text-[10px] text-th-text-muted">
              ~{record.briefing.tokenCount} tokens • {record.status}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={handleCopy} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-th-bg border border-th-border rounded-md text-th-text-muted hover:text-th-text">
                {copied ? <Check size={12} /> : <Copy size={12} />} Copy
              </button>
              {record.status !== 'delivered' && (
                <button
                  onClick={handleDeliver}
                  disabled={delivering}
                  className="px-3 py-1 text-[11px] bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50"
                >
                  {delivering ? 'Delivering...' : 'Deliver →'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-medium text-th-text-muted mb-1.5">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
