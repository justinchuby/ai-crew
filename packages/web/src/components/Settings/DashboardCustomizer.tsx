import { useState, useRef } from 'react';
import { LayoutDashboard, RotateCcw, GripVertical, Eye, EyeOff } from 'lucide-react';
import { useDashboardLayout } from '../../hooks/useDashboardLayout';

// ── DashboardCustomizer ───────────────────────────────────────────────

export function DashboardCustomizer() {
  const { allPanels, togglePanel, reorderPanels, reset } = useDashboardLayout();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  const handleDragStart = (id: string) => {
    dragRef.current = id;
    setDragId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragRef.current && dragRef.current !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (targetId: string) => {
    if (dragRef.current && dragRef.current !== targetId) {
      reorderPanels(dragRef.current, targetId);
    }
    dragRef.current = null;
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <section className="bg-surface-raised border border-th-border rounded-lg p-4 mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider flex items-center gap-2">
          <LayoutDashboard className="w-3.5 h-3.5" />
          Dashboard Layout
        </h3>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-th-text-muted hover:text-th-text rounded-md px-2 py-1 hover:bg-th-bg-hover transition-colors"
          title="Reset to defaults"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      <p className="text-xs text-th-text-muted mb-3 leading-relaxed">
        Drag panels to reorder, toggle visibility. Changes apply to Mission Control immediately.
      </p>

      {/* Panel list */}
      <div className="space-y-1.5">
        {allPanels.map((panel) => (
          <div
            key={panel.id}
            draggable
            onDragStart={() => handleDragStart(panel.id)}
            onDragOver={(e) => handleDragOver(e, panel.id)}
            onDrop={() => handleDrop(panel.id)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 px-3 py-2 rounded-md border transition-colors cursor-grab active:cursor-grabbing ${
              dragId === panel.id
                ? 'opacity-40 border-accent'
                : dragOverId === panel.id
                  ? 'border-accent bg-accent/10'
                  : panel.visible
                    ? 'bg-th-bg-alt border-th-border'
                    : 'bg-th-bg/30 border-th-border-muted opacity-60'
            }`}
          >
            {/* Drag handle */}
            <GripVertical className="w-4 h-4 text-th-text-muted flex-shrink-0" />

            {/* Visibility toggle */}
            <button
              onClick={() => togglePanel(panel.id)}
              className={`flex-shrink-0 transition-colors ${
                panel.visible
                  ? 'text-accent hover:text-accent-muted'
                  : 'text-th-text-muted hover:text-th-text'
              }`}
              aria-label={panel.visible ? `Hide ${panel.label}` : `Show ${panel.label}`}
            >
              {panel.visible ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
            </button>

            {/* Label */}
            <span
              className={`flex-1 text-sm select-none ${
                panel.visible ? 'text-th-text-alt' : 'text-th-text-muted'
              }`}
            >
              {panel.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
