import { ArrowUpCircle, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface PlaybookVersionBannerProps {
  playbookName: string;
  currentVersion: string;
  newVersion: string;
  changes: string;
  onUpdate: () => void;
  onKeep: () => void;
  onViewDiff: () => void;
}

// ── Component ──────────────────────────────────────────────────────

export function PlaybookVersionBanner({
  playbookName,
  currentVersion,
  newVersion,
  changes,
  onUpdate,
  onKeep,
  onViewDiff,
}: PlaybookVersionBannerProps) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 bg-accent/10 border border-accent/20 rounded-lg"
      data-testid="playbook-version-banner"
      role="alert"
    >
      <ArrowUpCircle size={18} className="text-accent mt-0.5 shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-th-text">
          Update available for "{playbookName}"
        </p>
        <p className="text-[11px] text-th-text-muted mt-0.5">
          v{currentVersion} → v{newVersion}
        </p>
        {changes && (
          <p className="text-[11px] text-th-text-muted mt-1 line-clamp-2">{changes}</p>
        )}

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={onUpdate}
            className="px-3 py-1 text-[11px] font-medium bg-accent/20 text-accent rounded-md hover:bg-accent/30 transition-colors"
            data-testid="version-update-btn"
          >
            Update →
          </button>
          <button
            onClick={onViewDiff}
            className="px-3 py-1 text-[11px] font-medium text-th-text-muted border border-th-border rounded-md hover:text-th-text hover:border-accent/40 transition-colors"
            data-testid="version-diff-btn"
          >
            View changes
          </button>
          <button
            onClick={onKeep}
            className="px-3 py-1 text-[11px] text-th-text-muted hover:text-th-text transition-colors"
            data-testid="version-keep-btn"
          >
            Keep current
          </button>
        </div>
      </div>

      <button
        onClick={onKeep}
        className="p-1 rounded hover:bg-th-bg transition-colors shrink-0"
        aria-label="Dismiss update banner"
      >
        <X size={14} className="text-th-text-muted" />
      </button>
    </div>
  );
}
