import { useState, useRef, useEffect } from 'react';
import { Share2, Link, FileDown, FileJson, Film, ChevronDown } from 'lucide-react';

interface ShareDropdownProps {
  onShareLink: () => void;
  onExportHTML: () => void;
  onExportJSON: () => void;
  onHighlightsReel: () => void;
}

export function ShareDropdown({ onShareLink, onExportHTML, onExportJSON, onHighlightsReel }: ShareDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(true);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Viewport-aware positioning
  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      // If not enough room above, drop down instead
      setDropUp(rect.top > 250);
    }
    setOpen(!open);
  };

  return (
    <div ref={ref} className="relative" data-testid="share-dropdown">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute right-0 w-56 bg-surface-raised border border-th-border rounded-lg shadow-xl z-50 overflow-hidden ${
          dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
        }`}>
          <p className="px-3 py-2 text-[11px] font-medium text-th-text-muted border-b border-th-border/50">
            📎 Share Session Replay
          </p>
          <ShareMenuItem icon={<Link className="w-3.5 h-3.5" />} label="Copy link" description="Shareable URL (expires in 7 days)" onClick={() => { onShareLink(); setOpen(false); }} />
          <ShareMenuItem icon={<FileDown className="w-3.5 h-3.5" />} label="Export HTML" description="Self-contained file" onClick={() => { onExportHTML(); setOpen(false); }} />
          <ShareMenuItem icon={<FileJson className="w-3.5 h-3.5" />} label="Export JSON" description="Raw data for analysis" onClick={() => { onExportJSON(); setOpen(false); }} />
          <ShareMenuItem icon={<Film className="w-3.5 h-3.5" />} label="Highlights Reel" description="Auto-curated key moments" onClick={() => { onHighlightsReel(); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function ShareMenuItem({ icon, label, description, onClick }: { icon: React.ReactNode; label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-2.5 px-3 py-2 w-full text-left hover:bg-th-bg-hover transition-colors"
    >
      <span className="text-th-text-muted mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-th-text-alt">{label}</p>
        <p className="text-[10px] text-th-text-muted">{description}</p>
      </div>
    </button>
  );
}
