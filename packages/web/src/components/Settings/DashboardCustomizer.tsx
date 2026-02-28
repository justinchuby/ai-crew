import { LayoutDashboard, RotateCcw, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { useDashboardLayout } from '../../hooks/useDashboardLayout';

// ── DashboardCustomizer ───────────────────────────────────────────────

export function DashboardCustomizer() {
  const { allPanels, togglePanel, movePanel, reset } = useDashboardLayout();

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
        Toggle panels on/off and reorder them. Changes apply to Mission Control immediately.
      </p>

      {/* Panel list */}
      <div className="space-y-1.5">
        {allPanels.map((panel, idx) => (
          <div
            key={panel.id}
            className={`flex items-center gap-3 px-3 py-2 rounded-md border transition-colors ${
              panel.visible
                ? 'bg-th-bg-alt border-th-border'
                : 'bg-th-bg/30 border-th-border-muted opacity-60'
            }`}
          >
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

            {/* Order badge */}
            <span className="text-[10px] font-mono text-th-text-muted w-5 text-right">
              {panel.order + 1}
            </span>

            {/* Move buttons */}
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button
                onClick={() => movePanel(panel.id, 'up')}
                disabled={idx === 0}
                className="p-0.5 rounded text-th-text-muted hover:text-th-text hover:bg-th-bg-hover transition-colors disabled:opacity-20 disabled:pointer-events-none"
                aria-label={`Move ${panel.label} up`}
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => movePanel(panel.id, 'down')}
                disabled={idx === allPanels.length - 1}
                className="p-0.5 rounded text-th-text-muted hover:text-th-text hover:bg-th-bg-hover transition-colors disabled:opacity-20 disabled:pointer-events-none"
                aria-label={`Move ${panel.label} down`}
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
