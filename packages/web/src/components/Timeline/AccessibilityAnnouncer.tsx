import { useState, useEffect } from 'react';
import type { AccessibilityAnnouncements } from './useAccessibilityAnnouncements';

// ── Props ────────────────────────────────────────────────────────────

interface AccessibilityAnnouncerProps {
  announcements: AccessibilityAnnouncements;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Renders invisible ARIA live regions for screen reader announcements.
 *
 * Place once at the top of the Timeline component tree.
 * Content is updated via the useAccessibilityAnnouncements hook.
 */
export function AccessibilityAnnouncer({ announcements }: AccessibilityAnnouncerProps) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');

  useEffect(() => {
    const unsubscribe = announcements.subscribe(() => {
      const state = announcements.getState();
      setPoliteMessage(state.politeMessage);
      setAssertiveMessage(state.assertiveMessage);
    });
    return () => {
      unsubscribe();
      announcements.clearTimers();
    };
  }, [announcements]);

  return (
    <>
      {/* Polite live region — new events, status updates (throttled) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="log"
        className="sr-only"
        data-testid="a11y-announcer-polite"
      >
        {politeMessage}
      </div>

      {/* Assertive live region — errors, connection changes (immediate) */}
      <div
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className="sr-only"
        data-testid="a11y-announcer-assertive"
      >
        {assertiveMessage}
      </div>
    </>
  );
}
