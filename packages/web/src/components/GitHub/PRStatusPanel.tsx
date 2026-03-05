import { usePullRequests } from '../../hooks/useGitHubConnection';
import { ciConclusionIcon, PR_STATUS_LABELS, type PullRequest, type CICheck } from './types';
import { EmptyState } from '../Shared';

function CheckItem({ check }: { check: CICheck }) {
  const icon =
    check.status === 'completed'
      ? ciConclusionIcon(check.conclusion)
      : check.status === 'in_progress'
        ? '🔄'
        : '⏳';
  const duration = check.duration ? `${check.duration}s` : '';

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span>{icon}</span>
      <span className="text-th-text-muted flex-1">{check.name}</span>
      {duration && <span className="text-th-text-muted text-[10px]">({duration})</span>}
    </div>
  );
}

function PRCard({ pr, onMarkReady }: { pr: PullRequest; onMarkReady: (n: number) => void }) {
  return (
    <div className="border border-th-border-muted rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-th-text">#{pr.number}</span>
          <span className="text-xs text-th-text truncate max-w-[200px]">{pr.title}</span>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            pr.status === 'merged'
              ? 'bg-purple-500/20 text-purple-400'
              : pr.status === 'draft'
                ? 'bg-th-bg-muted text-th-text-muted'
                : 'bg-green-500/20 text-green-400'
          }`}
        >
          {PR_STATUS_LABELS[pr.status]}
        </span>
      </div>

      {/* CI Checks */}
      {pr.ciStatus.checks.length > 0 && (
        <div className="space-y-1 bg-th-bg-muted rounded p-2">
          {pr.ciStatus.checks.map((check, i) => (
            <CheckItem key={i} check={check} />
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="text-[10px] text-th-text-muted flex gap-3">
        <span>{pr.commits.length} commits</span>
        <span>
          +{pr.commits.reduce((s, c) => s + c.additions, 0)} -
          {pr.commits.reduce((s, c) => s + c.deletions, 0)}
        </span>
        <span>Reviews: {pr.reviewStatus.state}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-accent hover:text-accent/80"
        >
          View on GitHub ↗
        </a>
        {pr.status === 'draft' && (
          <button
            onClick={() => onMarkReady(pr.number)}
            className="text-[11px] text-accent hover:text-accent/80"
          >
            Mark Ready
          </button>
        )}
      </div>
    </div>
  );
}

export function PRStatusPanel() {
  const { pulls, loading, markReady } = usePullRequests();

  if (loading)
    return <div className="text-xs text-th-text-muted animate-pulse">Loading PRs…</div>;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-th-text flex items-center gap-2">
        <span>🔀</span> Pull Requests
      </h3>
      {pulls.length === 0 ? (
        <EmptyState icon="🔗" title="No pull requests" description="Connect GitHub and create a PR to see status here." />
      ) : (
        <div className="space-y-2">
          {pulls.map((pr) => (
            <PRCard key={pr.id} pr={pr} onMarkReady={markReady} />
          ))}
        </div>
      )}
    </div>
  );
}
