import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi';
import { useLeadStore } from '../../stores/leadStore';
import { undoStack } from '../../services/UndoStack';
import type { NLPattern } from '../../services/NLCommandRegistry';

// ── Types ───────────────────────────────────────────────────────────────────

interface ActionStep {
  action: string;
  target: string;
  params?: Record<string, unknown>;
}

interface ActionPlan {
  steps: ActionStep[];
  summary: string;
  estimatedImpact?: string;
  reversible: boolean;
}

interface Props {
  pattern: NLPattern;
  query: string;
  onClose: () => void;
  onExecuted: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function NLActionPreview({ pattern, query, onClose, onExecuted }: Props) {
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedLeadId = useLeadStore(s => s.selectedLeadId);

  // Fetch preview on mount
  useEffect(() => {
    if (!selectedLeadId) return;
    setLoading(true);
    apiFetch<{ plan: ActionPlan; matched: boolean }>('/nl/preview', {
      method: 'POST',
      body: JSON.stringify({ command: query, sessionId: selectedLeadId }),
    })
      .then(data => setPlan(data.plan))
      .catch(() => setError('Could not preview command'))
      .finally(() => setLoading(false));
  }, [query, selectedLeadId]);

  const handleExecute = async () => {
    if (!selectedLeadId) return;
    setExecuting(true);
    try {
      const result = await apiFetch<{ commandId: string; plan: ActionPlan }>('/nl/execute', {
        method: 'POST',
        body: JSON.stringify({ command: query, sessionId: selectedLeadId }),
      });
      if (plan?.reversible && result.commandId) {
        undoStack.push(result.commandId, plan.summary);
      }
      onExecuted();
    } catch {
      setError('Command execution failed');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      className="border-l border-th-border bg-th-bg-alt p-4 w-[280px] flex flex-col"
      role="complementary"
      aria-label="Action preview"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{pattern.icon}</span>
        <div>
          <div className="text-sm font-semibold text-th-text">{pattern.description}</div>
          <div className="text-[11px] text-th-text-muted">&ldquo;{query}&rdquo;</div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-xs text-th-text-muted animate-pulse">Loading preview…</div>
      )}

      {/* Error */}
      {error && <div className="text-xs text-red-400">{error}</div>}

      {/* Plan details */}
      {plan && (
        <>
          <div className="text-xs font-medium text-th-text mb-2">This will:</div>
          <ol className="space-y-1 mb-3">
            {plan.steps.map((step, i) => (
              <li key={i} className="text-xs text-th-text-muted flex gap-2">
                <span className="text-th-text-muted shrink-0">{i + 1}.</span>
                <span>
                  {step.action.replace(/_/g, ' ')}
                  {step.target !== 'all' ? ` ${step.target}` : ''}
                </span>
              </li>
            ))}
          </ol>

          {plan.estimatedImpact && (
            <div className="text-[11px] text-th-text-muted mb-2">
              Affects: {plan.estimatedImpact}
            </div>
          )}

          <div className="text-[11px] text-th-text-muted mb-3">
            Reversible: {plan.reversible ? 'Yes (⌘Z)' : 'No'}
          </div>

          {pattern.destructive && (
            <div
              className="text-[11px] text-amber-400 bg-amber-500/10 rounded px-2 py-1.5 mb-3"
              role="alert"
              aria-live="assertive"
            >
              ⚠ This is a destructive action.
            </div>
          )}
        </>
      )}

      {/* Action buttons */}
      <div className="mt-auto flex gap-2">
        <button
          onClick={handleExecute}
          disabled={executing || loading || !!error}
          className="flex-1 text-xs px-3 py-1.5 rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50 transition-colors font-medium"
        >
          {executing ? 'Executing…' : 'Execute →'}
        </button>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-md bg-th-bg-muted text-th-text-muted hover:bg-th-bg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
