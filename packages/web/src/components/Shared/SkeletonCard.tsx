interface SkeletonCardProps {
  /** Number of text lines to show in the skeleton */
  lines?: number;
  /** Show a header bar at the top */
  showHeader?: boolean;
  /** Show an avatar circle */
  showAvatar?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Shared skeleton loading card. Matches the shape of common content cards
 * (agent cards, task cards, list items). Uses Tailwind animate-pulse.
 *
 * Minimum display time of 200ms is handled by the consumer (e.g., via
 * a loading state that doesn't clear instantly).
 */
export function SkeletonCard({
  lines = 3,
  showHeader = true,
  showAvatar = false,
  className = '',
}: SkeletonCardProps) {
  return (
    <div
      className={`animate-pulse rounded-lg border border-[rgb(var(--th-border))] bg-[rgb(var(--th-bg-alt))] p-4 ${className}`}
      aria-busy="true"
      aria-hidden="true"
    >
      {showHeader && (
        <div className="flex items-center gap-3 mb-3">
          {showAvatar && (
            <div className="h-8 w-8 rounded-full bg-[rgb(var(--th-border))]" />
          )}
          <div className="h-4 w-1/3 rounded bg-[rgb(var(--th-border))]" />
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-[rgb(var(--th-border))]"
            style={{ width: `${85 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}

interface SkeletonListProps {
  /** Number of skeleton cards to show */
  count?: number;
  /** Props passed to each SkeletonCard */
  cardProps?: Omit<SkeletonCardProps, 'className'>;
  /** Additional CSS classes for the container */
  className?: string;
}

/** Renders multiple SkeletonCards in a vertical list */
export function SkeletonList({ count = 3, cardProps, className = '' }: SkeletonListProps) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading content">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} {...cardProps} />
      ))}
    </div>
  );
}
