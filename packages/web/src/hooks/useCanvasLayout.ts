import { useState, useCallback } from 'react';

export interface CanvasLayout {
  positions: Record<string, { x: number; y: number }>;
  zoom: number;
  viewport: { x: number; y: number };
}

const STORAGE_PREFIX = 'canvas-layout';

/** Persists user-positioned nodes + viewport to localStorage. */
export function useCanvasLayout(sessionId: string | null): [
  CanvasLayout | null,
  (update: Partial<CanvasLayout>) => void,
] {
  const storageKey = sessionId ? `${STORAGE_PREFIX}-${sessionId}` : null;

  const [layout, setLayout] = useState<CanvasLayout | null>(() => {
    if (!storageKey) return null;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const updateLayout = useCallback(
    (update: Partial<CanvasLayout>) => {
      setLayout((prev) => {
        const next: CanvasLayout = {
          positions: { ...prev?.positions, ...update.positions },
          zoom: update.zoom ?? prev?.zoom ?? 1,
          viewport: update.viewport ?? prev?.viewport ?? { x: 0, y: 0 },
        };
        if (storageKey) {
          try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* noop */ }
        }
        return next;
      });
    },
    [storageKey],
  );

  return [layout, updateLayout];
}
