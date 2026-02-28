import { useState, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────

export interface PanelConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

// ── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_PANELS: PanelConfig[] = [
  { id: 'health',     label: 'Health Summary',  visible: true,  order: 0 },
  { id: 'fleet',      label: 'Agent Fleet',      visible: true,  order: 1 },
  { id: 'tokens',     label: 'Token Economics',  visible: true,  order: 2 },
  { id: 'alerts',     label: 'Alerts',           visible: true,  order: 3 },
  { id: 'activity',   label: 'Activity Feed',    visible: true,  order: 4 },
  { id: 'dag',        label: 'DAG Minimap',      visible: true,  order: 5 },
  { id: 'heatmap',    label: 'Comm Heatmap',     visible: false, order: 6 },
  { id: 'scorecards', label: 'Performance',      visible: false, order: 7 },
];

const STORAGE_KEY = 'dashboard-layout';

// ── Hook ──────────────────────────────────────────────────────────────

export function useDashboardLayout() {
  const [panels, setPanels] = useState<PanelConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as PanelConfig[]) : DEFAULT_PANELS;
    } catch {
      return DEFAULT_PANELS;
    }
  });

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  }, [panels]);

  const togglePanel = (id: string) => {
    setPanels((prev) =>
      prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)),
    );
  };

  const movePanel = (id: string, direction: 'up' | 'down') => {
    setPanels((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((p) => p.id === id);
      if (idx === -1) return prev;

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;

      // Swap orders
      const a = sorted[idx];
      const b = sorted[swapIdx];
      return prev.map((p) => {
        if (p.id === a.id) return { ...p, order: b.order };
        if (p.id === b.id) return { ...p, order: a.order };
        return p;
      });
    });
  };

  const reset = () => {
    setPanels(DEFAULT_PANELS);
  };

  return {
    /** Visible panels sorted by order — ready to render */
    panels: panels.filter((p) => p.visible).sort((a, b) => a.order - b.order),
    /** All panels including hidden — for the configurator UI */
    allPanels: [...panels].sort((a, b) => a.order - b.order),
    togglePanel,
    movePanel,
    reset,
  };
}
