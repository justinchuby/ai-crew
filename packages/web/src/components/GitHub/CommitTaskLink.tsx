import type { CommitTaskLink as CommitTaskLinkType } from './types';

interface Props {
  commits: CommitTaskLinkType[];
  compact?: boolean;
}

export function CommitTaskLinkList({ commits, compact }: Props) {
  if (commits.length === 0) return null;

  const totalAdds = commits.reduce((s, c) => s + c.additions, 0);
  const totalDels = commits.reduce((s, c) => s + c.deletions, 0);
  const totalFiles = new Set(commits.flatMap((c) => c.files)).size;

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-th-text flex items-center gap-1">
        📌 Commits ({commits.length})
      </div>
      {commits.slice(0, compact ? 3 : undefined).map((c) => (
        <div key={c.commitSha} className="flex items-center gap-2 text-[11px]">
          <code className="text-accent font-mono">{c.commitSha.slice(0, 7)}</code>
          <span className="text-th-text-muted truncate flex-1">{c.message}</span>
          <span className="text-green-400 shrink-0">+{c.additions}</span>
          <span className="text-red-400 shrink-0">-{c.deletions}</span>
        </div>
      ))}
      {compact && commits.length > 3 && (
        <div className="text-[10px] text-th-text-muted">…{commits.length - 3} more</div>
      )}
      <div className="text-[10px] text-th-text-muted">
        Total: +{totalAdds} -{totalDels} across {totalFiles} files
      </div>
    </div>
  );
}
