import { useState, useEffect, useRef } from 'react';
import { PaletteSearchEngine } from '../../services/PaletteSearchEngine';
import type { PaletteItem } from '../../services/PaletteSearchEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: PaletteItem[];
}

/**
 * Bottom-sheet command palette for mobile, triggered by the CommandFAB.
 * Uses PaletteSearchEngine for fuzzy search across all palette items.
 */
export function MobileCommandSheet({ isOpen, onClose, items }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef(new PaletteSearchEngine());

  useEffect(() => {
    engineRef.current.updateItems(items);
  }, [items]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const results = query ? engineRef.current.search(query) : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-th-bg border-t border-th-border rounded-t-2xl max-h-[70vh] overflow-y-auto motion-slide-up"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="w-8 h-1 rounded-full bg-th-border mx-auto mt-2 mb-3" />
        <div className="px-4 pb-2">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="🔍 Ask anything..."
            className="w-full px-3 py-2.5 text-sm bg-th-bg-alt border border-th-border rounded-lg text-th-text placeholder:text-th-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        {results.length > 0 && (
          <div className="px-4 pb-4 space-y-1">
            {results.slice(0, 8).map(item => (
              <button
                key={item.id}
                onClick={() => { item.action(); onClose(); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-th-text hover:bg-th-bg-alt rounded-lg transition-colors text-left"
              >
                <span>{item.icon || '▸'}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )}
        {!query && (
          <div className="px-4 pb-4 space-y-1">
            <div className="text-[10px] text-th-text-muted uppercase mb-1">Quick Actions</div>
            {[
              { icon: '⏸', label: 'Pause all agents' },
              { icon: '▶', label: 'Resume all agents' },
              { icon: '🗣', label: '"Wrap it up"' },
              { icon: '📸', label: 'Save as playbook' },
            ].map(item => (
              <button
                key={item.label}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-th-text hover:bg-th-bg-alt rounded-lg transition-colors text-left"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Floating action button that opens the MobileCommandSheet. */
export function CommandFAB({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-accent text-white shadow-lg flex items-center justify-center text-xl md:hidden z-30 hover:bg-accent/80 transition-colors"
      aria-label="Open command palette"
    >
      ⌘
    </button>
  );
}
