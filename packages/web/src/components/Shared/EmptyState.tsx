import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Emoji or icon to display (64px) */
  icon?: string;
  /** Primary message — one sentence explaining what's missing */
  title: string;
  /** Optional secondary description */
  description?: string;
  /** Optional CTA button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional content below the action */
  children?: ReactNode;
  /** Compact mode for inline panels (smaller spacing) */
  compact?: boolean;
}

/**
 * Shared empty state component for panels, lists, and pages with no data.
 * Pattern: Icon (64px) + one sentence + optional CTA button.
 */
export function EmptyState({ icon, title, description, action, children, compact }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-16 px-6'}`}
      role="status"
    >
      {icon && (
        <span className={`block ${compact ? 'text-4xl mb-3' : 'text-6xl mb-4'}`} aria-hidden="true">
          {icon}
        </span>
      )}
      <h3
        className={`font-medium text-[rgb(var(--th-text))] ${compact ? 'text-sm' : 'text-base'}`}
      >
        {title}
      </h3>
      {description && (
        <p
          className={`mt-1 text-[rgb(var(--th-text-muted))] max-w-sm ${compact ? 'text-xs' : 'text-sm'}`}
        >
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[rgb(var(--th-accent))] px-3 py-1.5 text-sm font-medium text-white transition-micro hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--th-accent))]"
        >
          {action.label}
        </button>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
