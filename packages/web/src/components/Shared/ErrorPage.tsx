interface ErrorPageProps {
  /** Error title — defaults to "Something went wrong" */
  title?: string;
  /** Human-readable error description */
  message?: string;
  /** Technical error detail (shown in muted smaller text) */
  detail?: string;
  /** Retry callback — shows a Retry button */
  onRetry?: () => void;
  /** Navigate to dashboard callback — shows "Go to Dashboard" */
  onGoHome?: () => void;
  /** HTTP status code (optional, displayed when provided) */
  statusCode?: number;
}

/**
 * Shared full-page error component for route-level failures.
 * Pattern: ⚠ icon + title + message + optional detail + action buttons.
 */
export function ErrorPage({
  title = 'Something went wrong',
  message,
  detail,
  onRetry,
  onGoHome,
  statusCode,
}: ErrorPageProps) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
      role="alert"
    >
      <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>

      {statusCode && (
        <p className="text-6xl font-bold text-[rgb(var(--th-text-muted))] mb-2">
          {statusCode}
        </p>
      )}

      <h1 className="text-xl font-semibold text-[rgb(var(--th-text))]">
        {title}
      </h1>

      {message && (
        <p className="mt-2 text-sm text-[rgb(var(--th-text-muted))] max-w-md">
          {message}
        </p>
      )}

      {detail && (
        <p className="mt-2 font-mono text-xs text-[rgb(var(--th-text-muted))] max-w-lg bg-[rgb(var(--th-bg-alt))] rounded px-3 py-1.5">
          {detail}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-[rgb(var(--th-accent))] px-4 py-2 text-sm font-medium text-white transition-micro hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--th-accent))]"
          >
            Retry
          </button>
        )}
        {onGoHome && (
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--th-border))] bg-[rgb(var(--th-bg))] px-4 py-2 text-sm font-medium text-[rgb(var(--th-text))] transition-micro hover:bg-[rgb(var(--th-bg-alt))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--th-accent))]"
          >
            Go to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}
