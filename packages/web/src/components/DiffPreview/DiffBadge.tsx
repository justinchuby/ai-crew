import { useDiffSummary } from '../../hooks/useFocusAgent';
import { FileCode2, Plus, Minus } from 'lucide-react';

interface DiffBadgeProps {
  agentId: string;
  onClick?: () => void;
}

/**
 * Lightweight badge showing diff summary (files changed, +additions, -deletions).
 * Polls GET /api/agents/:id/diff/summary every 10s.
 */
export function DiffBadge({ agentId, onClick }: DiffBadgeProps) {
  const { summary } = useDiffSummary(agentId);

  if (!summary || summary.filesChanged === 0) return null;

  return (
    <button
      onClick={onClick}
      title={`${summary.filesChanged} file${summary.filesChanged > 1 ? 's' : ''} changed`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono bg-th-bg-alt border border-th-border hover:border-th-border-hover transition-colors"
    >
      <FileCode2 className="w-3 h-3 text-th-text-muted" />
      <span className="text-th-text-muted">{summary.filesChanged}</span>
      {summary.additions > 0 && (
        <span className="text-green-400 flex items-center gap-px">
          <Plus className="w-2.5 h-2.5" />
          {summary.additions}
        </span>
      )}
      {summary.deletions > 0 && (
        <span className="text-red-400 flex items-center gap-px">
          <Minus className="w-2.5 h-2.5" />
          {summary.deletions}
        </span>
      )}
    </button>
  );
}
