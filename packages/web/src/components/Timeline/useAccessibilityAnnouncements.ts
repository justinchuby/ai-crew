import { useRef, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────

export type AnnouncementPriority = 'polite' | 'assertive';

export interface Announcement {
  message: string;
  priority: AnnouncementPriority;
}

export interface AccessibilityAnnouncerState {
  politeMessage: string;
  assertiveMessage: string;
}

// ── Constants ────────────────────────────────────────────────────────

/** Minimum interval between polite announcements during bursts (ms) */
const POLITE_THROTTLE_MS = 5_000;

// ── Hook ─────────────────────────────────────────────────────────────

/**
 * Manages ARIA live region announcements with throttling.
 *
 * - `polite` announcements are throttled to max 1 per 5 seconds during bursts.
 * - `assertive` announcements are never throttled (errors, connection changes).
 *
 * Returns a `setState` compatible object for rendering via AccessibilityAnnouncer.
 */
export function useAccessibilityAnnouncements() {
  const politeRef = useRef('');
  const assertiveRef = useRef('');
  const lastPoliteTimeRef = useRef(0);
  const pendingPoliteRef = useRef<string | null>(null);
  const politeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);

  const notifyUpdate = useCallback(() => {
    listenerRef.current?.();
  }, []);

  const announcePolite = useCallback((message: string) => {
    const now = Date.now();
    const elapsed = now - lastPoliteTimeRef.current;

    if (elapsed >= POLITE_THROTTLE_MS) {
      // Enough time passed — announce immediately
      politeRef.current = message;
      lastPoliteTimeRef.current = now;
      pendingPoliteRef.current = null;
      notifyUpdate();
    } else {
      // Throttle: queue the latest message, only the last one wins
      pendingPoliteRef.current = message;
      if (!politeTimerRef.current) {
        const remaining = POLITE_THROTTLE_MS - elapsed;
        politeTimerRef.current = setTimeout(() => {
          politeTimerRef.current = null;
          if (pendingPoliteRef.current) {
            politeRef.current = pendingPoliteRef.current;
            lastPoliteTimeRef.current = Date.now();
            pendingPoliteRef.current = null;
            notifyUpdate();
          }
        }, remaining);
      }
    }
  }, [notifyUpdate]);

  const announceAssertive = useCallback((message: string) => {
    assertiveRef.current = message;
    notifyUpdate();
  }, [notifyUpdate]);

  const announceNewEvents = useCallback((count: number, latestSummary?: string) => {
    if (count === 0) return;
    const msg = count === 1
      ? `New event: ${latestSummary ?? 'activity update'}`
      : `${count} new events`;
    announcePolite(msg);
  }, [announcePolite]);

  const announceError = useCallback((errorMessage: string) => {
    announceAssertive(`Error: ${errorMessage}`);
  }, [announceAssertive]);

  const announceConnectionChange = useCallback((status: string) => {
    const messages: Record<string, string> = {
      connected: 'Connection restored',
      connecting: 'Connecting to server',
      reconnecting: 'Connection lost, reconnecting',
      degraded: 'Connection degraded',
      offline: 'Connection offline',
    };
    announceAssertive(messages[status] ?? `Connection: ${status}`);
  }, [announceAssertive]);

  const getState = useCallback((): AccessibilityAnnouncerState => ({
    politeMessage: politeRef.current,
    assertiveMessage: assertiveRef.current,
  }), []);

  const subscribe = useCallback((listener: () => void) => {
    listenerRef.current = listener;
    return () => { listenerRef.current = null; };
  }, []);

  const clearTimers = useCallback(() => {
    if (politeTimerRef.current) {
      clearTimeout(politeTimerRef.current);
      politeTimerRef.current = null;
    }
  }, []);

  return {
    announcePolite,
    announceAssertive,
    announceNewEvents,
    announceError,
    announceConnectionChange,
    getState,
    subscribe,
    clearTimers,
  };
}

export type AccessibilityAnnouncements = ReturnType<typeof useAccessibilityAnnouncements>;
