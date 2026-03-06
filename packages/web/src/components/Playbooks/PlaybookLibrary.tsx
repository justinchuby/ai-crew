import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { PlaybookCard } from './PlaybookCard';
import { BUILT_IN_PLAYBOOKS } from './types';
import type { Playbook } from './types';
import { apiFetch } from '../../hooks/useApi';
import { useToastStore } from '../Toast';

// ── PlaybookLibrary ────────────────────────────────────────────────

export function PlaybookLibrary() {
  const [userPlaybooks, setUserPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const add = useToastStore((s) => s.add);

  const fetchUserPlaybooks = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/playbooks');
      if (resp.ok) {
        const body = await resp.json();
        setUserPlaybooks(body.user ?? []);
      }
    } catch {
      // API not ready — show built-in only
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserPlaybooks();
  }, [fetchUserPlaybooks]);

  const handleApply = useCallback((pb: Playbook) => {
    add('info', `Applying playbook "${pb.name}"...`);
    // TODO: Wire to project creation API
  }, [add]);

  const handleDuplicate = useCallback(async (pb: Playbook) => {
    try {
      await apiFetch(`/playbooks/${pb.id}/duplicate`, { method: 'POST' });
      add('success', `Duplicated "${pb.name}"`);
      fetchUserPlaybooks();
    } catch {
      add('error', 'Failed to duplicate playbook');
    }
  }, [add, fetchUserPlaybooks]);

  const handleDelete = useCallback(async (pb: Playbook) => {
    try {
      await apiFetch(`/playbooks/${pb.id}`, { method: 'DELETE' });
      setUserPlaybooks((prev) => prev.filter((p) => p.id !== pb.id));
      add('success', `Deleted "${pb.name}"`);
    } catch {
      add('error', 'Failed to delete playbook');
    }
  }, [add]);

  const handleExport = useCallback((pb: Playbook) => {
    const json = JSON.stringify(pb, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pb.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    add('success', `Exported "${pb.name}"`);
  }, [add]);

  // Sort user playbooks by last used
  const sortedUser = [...userPlaybooks].sort((a, b) => {
    if (a.metadata.lastUsedAt && b.metadata.lastUsedAt) {
      return new Date(b.metadata.lastUsedAt).getTime() - new Date(a.metadata.lastUsedAt).getTime();
    }
    return a.metadata.lastUsedAt ? -1 : 1;
  });

  const lastUsedId = sortedUser[0]?.id ?? null;

  return (
    <section className="space-y-6" data-testid="playbook-library">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5" />
          Playbooks
        </h3>
      </div>

      {/* Built-in section */}
      <div>
        <h4 className="text-xs font-medium text-th-text-muted uppercase tracking-wider mb-3">
          Built-in
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BUILT_IN_PLAYBOOKS.map((pb) => (
            <PlaybookCard
              key={pb.id}
              playbook={pb}
              onApply={handleApply}
              onDuplicate={handleDuplicate}
              onExport={handleExport}
            />
          ))}
        </div>
      </div>

      {/* User section */}
      <div>
        <h4 className="text-xs font-medium text-th-text-muted uppercase tracking-wider mb-3">
          My Playbooks
        </h4>
        {loading ? (
          <div className="text-center text-th-text-muted text-xs py-8">
            Loading playbooks...
          </div>
        ) : sortedUser.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-th-border rounded-lg" data-testid="playbook-empty">
            <Plus className="w-6 h-6 text-th-text-muted mx-auto mb-2 opacity-40" />
            <p className="text-xs text-th-text-muted">
              Save your first playbook from a running session, or create one from scratch.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedUser.map((pb) => (
              <PlaybookCard
                key={pb.id}
                playbook={pb}
                onApply={handleApply}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onExport={handleExport}
                isLastUsed={pb.id === lastUsedId}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
