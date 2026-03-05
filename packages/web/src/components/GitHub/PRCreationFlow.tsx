import { useState } from 'react';
import { usePullRequests } from '../../hooks/useGitHubConnection';

interface Props {
  onClose: () => void;
  sessionData?: {
    branch?: string;
    title?: string;
    description?: string;
    agents?: { role: string; commitCount: number }[];
    taskCount?: number;
    duration?: string;
    cost?: string;
  };
}

export function PRCreationFlow({ onClose, sessionData }: Props) {
  const { createPR } = usePullRequests();
  const [title, setTitle] = useState(sessionData?.title ?? '');
  const [description, setDescription] = useState(sessionData?.description ?? '');
  const [branch, setBranch] = useState(sessionData?.branch ?? 'session/feature');
  const [baseBranch, setBaseBranch] = useState('main');
  const [draft, setDraft] = useState(true);
  const [linkTasks, setLinkTasks] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // suppress unused-var for linkTasks since it will be used when PR body generation is wired up
  void linkTasks;

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createPR({ title, description, branch, baseBranch, draft });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create PR');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-th-bg-alt border border-th-border rounded-xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-th-text">🔀 Create Pull Request</h2>
          <button onClick={onClose} className="text-th-text-muted hover:text-th-text">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Branch fields */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-th-text-muted block mb-1">Branch</label>
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-th-text-muted block mb-1">Base</label>
              <input
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text outline-none"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs text-th-text-muted block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="feat: implement user service"
              className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text placeholder-th-text-muted outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-th-text-muted block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text placeholder-th-text-muted outline-none resize-y font-mono"
              placeholder="Auto-generated PR description..."
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-th-text-muted">
              <input
                type="checkbox"
                checked={draft}
                onChange={(e) => setDraft(e.target.checked)}
                className="rounded border-th-border"
              />
              Create as draft PR
            </label>
            <label className="flex items-center gap-2 text-xs text-th-text-muted">
              <input
                type="checkbox"
                checked={linkTasks}
                onChange={(e) => setLinkTasks(e.target.checked)}
                className="rounded border-th-border"
              />
              Link to DAG tasks in PR body
            </label>
          </div>

          {error && <div className="text-xs text-red-400">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-md bg-th-bg-muted text-th-text-muted hover:bg-th-bg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !title}
              className="text-xs px-4 py-2 rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50 transition-colors font-medium"
            >
              {creating ? 'Creating…' : 'Create PR →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
