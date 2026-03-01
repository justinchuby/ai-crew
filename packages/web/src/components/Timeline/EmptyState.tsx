import { Users } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Override the default title */
  title?: string;
  /** Override the default description */
  description?: string;
}

// ── Component ─────────────────────────────────────────────────────────

export function EmptyState({
  title = 'No crew activity yet',
  description = 'Start a project to see your AI agents collaborate in real time. The timeline will populate as agents are created and begin working.',
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
      data-testid="empty-state"
      role="status"
      aria-label={title}
    >
      {/* Illustration placeholder */}
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-th-bg-alt border border-th-border-muted mb-6">
        <Users size={32} className="text-th-text-muted" />
      </div>

      <h2 className="text-lg font-semibold text-th-text-alt mb-2">
        {title}
      </h2>

      <p className="text-sm text-th-text-muted max-w-md leading-relaxed">
        {description}
      </p>

      <div className="mt-8 flex items-center gap-3 text-xs text-th-text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400/40" />
          Agents will appear here
        </span>
        <span className="text-th-border-muted">·</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400/40" />
          Communications shown as links
        </span>
      </div>
    </div>
  );
}
