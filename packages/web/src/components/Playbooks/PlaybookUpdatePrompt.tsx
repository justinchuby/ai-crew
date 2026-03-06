import type { PlaybookAgent } from './types';
import { summarizeRoles } from './types';

// ── Types ──────────────────────────────────────────────────────────

interface PlaybookDivergence {
  addedRoles: string[];
  removedRoles: string[];
  newIntentRules: number;
  costDelta: number | null;
}

interface PlaybookUpdatePromptProps {
  playbook: { id: string; name: string; agents: PlaybookAgent[] };
  divergence: PlaybookDivergence;
  onUpdate: () => void;
  onSaveNew: () => void;
  onDismiss: () => void;
}

// ── Component ──────────────────────────────────────────────────────

export function PlaybookUpdatePrompt({
  playbook,
  divergence,
  onUpdate,
  onSaveNew,
  onDismiss,
}: PlaybookUpdatePromptProps) {
  const { addedRoles, removedRoles, newIntentRules, costDelta } = divergence;
  const hasChanges = addedRoles.length > 0 || removedRoles.length > 0 || newIntentRules > 0;

  if (!hasChanges) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg mx-auto animate-slide-up"
      data-testid="playbook-update-prompt"
    >
      <div className="bg-th-bg-alt/95 backdrop-blur-md border border-th-border rounded-xl shadow-2xl p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">📋</span>
          <span className="text-xs font-semibold text-th-text-alt">Playbook Update Suggestion</span>
        </div>

        <p className="text-[11px] text-th-text-muted mb-3">
          Your session diverged from "{playbook.name}":
        </p>

        {/* Divergence list */}
        <div className="space-y-1 mb-3">
          {addedRoles.map((role) => (
            <div key={`+${role}`} className="flex items-center gap-2 text-xs">
              <span className="text-green-400 font-mono">+</span>
              <span className="text-th-text-alt">Added: {role} (not in playbook)</span>
            </div>
          ))}
          {removedRoles.map((role) => (
            <div key={`-${role}`} className="flex items-center gap-2 text-xs">
              <span className="text-red-400 font-mono">−</span>
              <span className="text-th-text-alt">Removed: {role} (was in playbook)</span>
            </div>
          ))}
          {newIntentRules > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-400 font-mono">+</span>
              <span className="text-th-text-alt">
                {newIntentRules} new intent rule{newIntentRules !== 1 ? 's' : ''} created
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onUpdate}
            className="px-3 py-1.5 text-[11px] font-medium bg-accent/20 text-accent rounded-md hover:bg-accent/30 transition-colors"
            data-testid="playbook-update-btn"
          >
            Update Playbook
          </button>
          <button
            onClick={onSaveNew}
            className="px-3 py-1.5 text-[11px] font-medium bg-th-bg/50 text-th-text-muted rounded-md border border-th-border/50 hover:text-th-text-alt transition-colors"
          >
            Save as New
          </button>
          <div className="flex-1" />
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-[11px] text-th-text-muted hover:text-th-text transition-colors"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}
