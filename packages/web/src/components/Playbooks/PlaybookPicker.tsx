import { useState, useMemo } from 'react';
import { PlaybookCard } from './PlaybookCard';
import { BUILT_IN_PLAYBOOKS } from './types';
import type { Playbook } from './types';
import { summarizeRoles } from './types';

interface PlaybookPickerProps {
  userPlaybooks?: Playbook[];
  onSelect: (playbook: Playbook) => void;
  selectedId?: string | null;
  lastUsedId?: string | null;
}

/** Compact playbook picker for project creation flow */
export function PlaybookPicker({
  userPlaybooks = [],
  onSelect,
  selectedId = null,
  lastUsedId = null,
}: PlaybookPickerProps) {
  const allPlaybooks = useMemo(
    () => [...BUILT_IN_PLAYBOOKS, ...userPlaybooks],
    [userPlaybooks],
  );

  const selected = allPlaybooks.find((pb) => pb.id === selectedId);

  return (
    <div data-testid="playbook-picker">
      <label className="block text-[11px] text-th-text-muted uppercase tracking-wider mb-2">
        Choose a Playbook
      </label>

      {/* Compact card row */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {allPlaybooks.map((pb) => (
          <PlaybookCard
            key={pb.id}
            playbook={pb}
            compact
            selected={pb.id === selectedId}
            isLastUsed={pb.id === lastUsedId}
            onClick={() => onSelect(pb)}
          />
        ))}
      </div>

      {/* Selected summary */}
      {selected && (
        <div className="mt-3 p-3 bg-th-bg-alt/60 border border-th-border rounded-lg" data-testid="playbook-summary">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{selected.icon}</span>
            <span className="text-sm font-medium text-th-text-alt">{selected.name}</span>
          </div>
          <p className="text-xs text-th-text-muted mb-1">{summarizeRoles(selected.agents)}</p>
          {selected.intentRules.length > 0 && (
            <p className="text-[11px] text-th-text-muted">
              {selected.intentRules.length} intent rule{selected.intentRules.length !== 1 ? 's' : ''}
            </p>
          )}
          {selected.settings.budget != null && (
            <p className="text-[11px] text-th-text-muted">Budget: ${selected.settings.budget}</p>
          )}
        </div>
      )}
    </div>
  );
}
