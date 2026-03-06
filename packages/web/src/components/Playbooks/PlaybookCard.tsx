import { useState } from 'react';
import { MoreHorizontal, Play, Pencil, Copy, Download, Trash2 } from 'lucide-react';
import type { Playbook } from './types';
import { summarizeRoles } from './types';

interface PlaybookCardProps {
  playbook: Playbook;
  onApply?: (playbook: Playbook) => void;
  onEdit?: (playbook: Playbook) => void;
  onDuplicate?: (playbook: Playbook) => void;
  onDelete?: (playbook: Playbook) => void;
  onExport?: (playbook: Playbook) => void;
  /** Show "★ Last used" badge */
  isLastUsed?: boolean;
  /** Compact mode for picker */
  compact?: boolean;
  /** Selected state (picker mode) */
  selected?: boolean;
  onClick?: () => void;
}

export function PlaybookCard({
  playbook,
  onApply,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
  isLastUsed,
  compact,
  selected,
  onClick,
}: PlaybookCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isBuiltIn = playbook.metadata.source === 'built-in';
  const roleSummary = summarizeRoles(playbook.agents);

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`relative flex flex-col items-center gap-1 px-4 py-3 rounded-lg border text-center transition-all min-w-[120px] ${
          selected
            ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
            : 'border-th-border bg-th-bg hover:border-accent/40 hover:shadow-sm'
        }`}
        data-testid={`playbook-compact-${playbook.id}`}
      >
        {isLastUsed && (
          <span className="absolute -top-2 -left-1 text-[9px] font-medium bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
            ★ Last used
          </span>
        )}
        <span className="text-2xl">{playbook.icon}</span>
        <span className="text-xs font-medium text-th-text-alt truncate max-w-full">{playbook.name}</span>
        <span className="text-[10px] text-th-text-muted">{playbook.agents.length} agents</span>
        {selected && <span className="text-accent text-xs">✓</span>}
      </button>
    );
  }

  return (
    <div
      className="relative flex flex-col p-4 rounded-lg border border-th-border bg-th-bg hover:border-accent/40 hover:shadow-sm transition-all group"
      data-testid={`playbook-card-${playbook.id}`}
    >
      {isLastUsed && (
        <span className="absolute -top-2 right-3 text-[9px] font-medium bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
          ★ Last used
        </span>
      )}

      {/* Icon + Name */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{playbook.icon}</span>
        <span className="text-sm font-semibold text-th-text-alt truncate">{playbook.name}</span>
      </div>

      {/* Role summary */}
      <p className="text-xs text-th-text-muted mb-1">{roleSummary}</p>

      {/* Intent rules */}
      {playbook.intentRules.length > 0 && (
        <p className="text-[11px] text-th-text-muted">
          {playbook.intentRules.length} intent rule{playbook.intentRules.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Usage (user playbooks) */}
      {!isBuiltIn && playbook.metadata.usageCount > 0 && (
        <p className="text-[11px] text-th-text-muted mt-0.5">
          Used {playbook.metadata.usageCount} time{playbook.metadata.usageCount !== 1 ? 's' : ''}
        </p>
      )}

      {/* Description */}
      {playbook.description && (
        <p className="text-[11px] text-th-text-muted mt-1 line-clamp-2">{playbook.description}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-auto pt-3 opacity-0 group-hover:opacity-100 transition-opacity">
        {onApply && (
          <button
            onClick={() => onApply(playbook)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-accent/20 text-accent rounded-md hover:bg-accent/30 transition-colors"
            data-testid={`playbook-apply-${playbook.id}`}
          >
            <Play size={12} />
            Apply
          </button>
        )}
        {onEdit && (
          <button
            onClick={() => onEdit(playbook)}
            className="p-1.5 rounded-md text-th-text-muted hover:text-th-text hover:bg-th-bg-hover transition-colors"
            title={isBuiltIn ? 'Customize (creates copy)' : 'Edit'}
          >
            <Pencil size={13} />
          </button>
        )}

        {/* More menu */}
        <div className="relative ml-auto">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-md text-th-text-muted hover:text-th-text hover:bg-th-bg-hover transition-colors"
            data-testid={`playbook-menu-${playbook.id}`}
          >
            <MoreHorizontal size={13} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-20 w-40 bg-th-bg-alt border border-th-border rounded-lg shadow-lg py-1"
              onMouseLeave={() => setMenuOpen(false)}
            >
              {onDuplicate && (
                <button
                  onClick={() => { onDuplicate(playbook); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-th-text-muted hover:text-th-text hover:bg-th-bg-hover"
                >
                  <Copy size={12} /> Duplicate
                </button>
              )}
              {onExport && (
                <button
                  onClick={() => { onExport(playbook); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-th-text-muted hover:text-th-text hover:bg-th-bg-hover"
                >
                  <Download size={12} /> Export JSON
                </button>
              )}
              {onDelete && !isBuiltIn && (
                <button
                  onClick={() => { onDelete(playbook); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
