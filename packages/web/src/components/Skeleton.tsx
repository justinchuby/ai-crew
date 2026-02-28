interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ width, height, className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-th-bg-muted/50 rounded ${className}`}
      style={{ width, height }}
    />
  );
}

/** Card-shaped skeleton matching AgentCard dimensions */
export function SkeletonCard() {
  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton width="2.5rem" height="2.5rem" className="rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton width="60%" height="0.875rem" />
          <Skeleton width="40%" height="0.75rem" />
        </div>
      </div>
      <Skeleton width="100%" height="0.75rem" />
      <Skeleton width="80%" height="0.75rem" />
    </div>
  );
}

/** Row-shaped skeleton matching TaskRow dimensions */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 bg-surface-raised border border-th-border rounded-lg p-3">
      <Skeleton width="0.875rem" height="0.875rem" />
      <Skeleton width="0.5rem" height="0.5rem" className="rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton width="50%" height="0.875rem" />
        <Skeleton width="30%" height="0.75rem" />
      </div>
      <Skeleton width="3rem" height="0.625rem" />
    </div>
  );
}
