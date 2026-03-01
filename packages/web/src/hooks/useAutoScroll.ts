import { useEffect, useRef, type RefObject } from 'react';

/**
 * Auto-scroll a container to the bottom when dependencies change.
 * On first render (or after reset), scrolls unconditionally.
 * After that, only scrolls if already near the bottom (within threshold).
 */
export function useAutoScroll(
  containerRef: RefObject<HTMLElement | null>,
  endMarkerRef: RefObject<HTMLElement | null>,
  deps: unknown[],
  opts: { threshold?: number; resetKey?: unknown } = {},
) {
  const { threshold = 150, resetKey } = opts;
  const initialDone = useRef(false);

  // Reset when resetKey changes (e.g., switching agents/panels)
  useEffect(() => {
    initialDone.current = false;
  }, [resetKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // On first load, scroll unconditionally so user sees latest content
    if (!initialDone.current) {
      initialDone.current = true;
      endMarkerRef.current?.scrollIntoView();
      return;
    }

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < threshold) {
      endMarkerRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Pure decision function for whether auto-scroll should happen.
 * Extracted for testability.
 */
export function shouldAutoScroll(opts: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  isInitialRender: boolean;
  threshold?: number;
}): boolean {
  if (opts.isInitialRender) return true;
  const distance = opts.scrollHeight - opts.scrollTop - opts.clientHeight;
  return distance < (opts.threshold ?? 150);
}
