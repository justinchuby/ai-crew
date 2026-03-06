import { useState, useMemo } from 'react';

// Common emoji categories for playbook icons
const EMOJI_OPTIONS = [
  '📋', '🔍', '🐛', '📝', '🏗', '🚀', '⚡', '🎯', '🧪', '🔧',
  '📦', '🌐', '🎨', '🧠', '💡', '🔒', '📊', '🗂', '🛠', '⭐',
  '🎸', '🎵', '🔥', '💬', '📡', '🤖', '🦾', '🎪', '🏆', '💎',
];

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return EMOJI_OPTIONS;
    return EMOJI_OPTIONS.filter((e) => e.includes(search));
  }, [search]);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-10 h-10 flex items-center justify-center text-2xl bg-th-bg border border-th-border rounded-md hover:border-accent/40 transition-colors"
        data-testid="icon-picker-trigger"
      >
        {value}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 top-12 z-30 w-56 bg-th-bg-alt border border-th-border rounded-lg shadow-xl p-2"
          onMouseLeave={() => setOpen(false)}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji..."
            className="w-full px-2 py-1 text-xs bg-th-bg border border-th-border rounded mb-2 text-th-text-alt focus:border-accent focus:outline-none"
          />
          <div className="grid grid-cols-6 gap-1 max-h-32 overflow-y-auto">
            {filtered.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onChange(emoji); setOpen(false); setSearch(''); }}
                className={`w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-th-bg-hover transition-colors ${
                  value === emoji ? 'bg-accent/20 ring-1 ring-accent/30' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
