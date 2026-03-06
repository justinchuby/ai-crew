import { useState } from 'react';
import { X, AlertTriangle, ChevronDown } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import { useToastStore } from '../Toast';
import type { PlaybookCategory } from './CommunityGallery';

// ── Types ──────────────────────────────────────────────────────────

interface PlaybookPublishDialogProps {
  playbook: {
    id: string;
    name: string;
    roles: Array<{ id?: string; name?: string; [key: string]: unknown }>;
    intentRules?: number;
    budget?: number;
  };
  onClose: () => void;
  onPublished: () => void;
}

const CATEGORIES: Array<{ value: PlaybookCategory; label: string }> = [
  { value: 'development', label: 'Development' },
  { value: 'testing', label: 'Testing' },
  { value: 'security', label: 'Security' },
  { value: 'devops', label: 'DevOps' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'data', label: 'Data' },
  { value: 'design', label: 'Design' },
  { value: 'other', label: 'Other' },
];

// ── Component ──────────────────────────────────────────────────────

export function PlaybookPublishDialog({
  playbook,
  onClose,
  onPublished,
}: PlaybookPublishDialogProps) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PlaybookCategory>('development');
  const [tagsInput, setTagsInput] = useState('');
  const [publishing, setPublishing] = useState(false);
  const add = useToastStore((s) => s.add);

  const tags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const handlePublish = async () => {
    if (!description.trim()) return;
    setPublishing(true);
    try {
      await apiFetch('/playbooks/community', {
        method: 'POST',
        body: JSON.stringify({
          playbookId: playbook.id,
          description: description.trim(),
          category,
          tags,
        }),
      });
      add('success', `Published "${playbook.name}" to community`);
      onPublished();
    } catch (err) {
      add('error', err instanceof Error ? err.message : 'Failed to publish playbook');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-th-bg-alt border border-th-border rounded-xl shadow-2xl w-full max-w-md mx-4 animate-slide-in"
        data-testid="publish-playbook-dialog"
        role="dialog"
        aria-label="Publish playbook to community"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-th-border">
          <h2 className="text-sm font-semibold text-th-text">
            Publish "{playbook.name}"
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-th-bg transition-colors"
            aria-label="Close dialog"
          >
            <X size={16} className="text-th-text-muted" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Description */}
          <div>
            <label className="block text-[11px] text-th-text-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Describe what this playbook is optimized for…"
              className="w-full px-3 py-1.5 text-sm bg-th-bg border border-th-border rounded-md text-th-text focus:border-accent focus:outline-none resize-none h-20"
              maxLength={500}
              data-testid="publish-description"
            />
            <p className="text-[10px] text-th-text-muted text-right mt-0.5">
              {description.length}/500
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-[11px] text-th-text-muted mb-1">Category</label>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PlaybookCategory)}
                className="appearance-none w-full pl-3 pr-7 py-1.5 text-sm bg-th-bg border border-th-border rounded-md text-th-text focus:border-accent focus:outline-none cursor-pointer"
                data-testid="publish-category"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-th-text-muted pointer-events-none"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] text-th-text-muted mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="react, frontend, code-review"
              className="w-full px-3 py-1.5 text-sm bg-th-bg border border-th-border rounded-md text-th-text focus:border-accent focus:outline-none"
              data-testid="publish-tags"
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 text-[10px] bg-accent/20 text-accent rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* What's included */}
          <div className="bg-th-bg border border-th-border rounded-lg p-3">
            <h4 className="text-[11px] font-medium text-th-text mb-2">What&apos;s included</h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-th-text-muted">
                <span className="text-green-400">✓</span>
                {playbook.roles.length} role{playbook.roles.length !== 1 ? 's' : ''}
              </div>
              {playbook.intentRules != null && playbook.intentRules > 0 && (
                <div className="flex items-center gap-2 text-xs text-th-text-muted">
                  <span className="text-green-400">✓</span>
                  {playbook.intentRules} intent rule
                  {playbook.intentRules !== 1 ? 's' : ''}
                </div>
              )}
              {playbook.budget != null && (
                <div className="flex items-center gap-2 text-xs text-th-text-muted">
                  <span className="text-green-400">✓</span>
                  Budget: ${playbook.budget}
                </div>
              )}
            </div>
          </div>

          {/* Privacy warning */}
          <div className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle size={14} className="text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-yellow-500/90 leading-relaxed">
              System prompts and custom instructions will be visible to anyone who uses or forks
              this playbook. Remove any sensitive or proprietary information before publishing.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-th-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-th-text-muted hover:text-th-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={!description.trim() || publishing}
            className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="publish-btn"
          >
            {publishing ? 'Publishing…' : 'Publish →'}
          </button>
        </div>
      </div>
    </div>
  );
}
