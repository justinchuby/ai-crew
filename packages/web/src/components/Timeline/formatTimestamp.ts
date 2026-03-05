const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Format a timestamp for the timeline display.
 * Uses consistent 24h format throughout.
 * Shows time only (HH:MM:SS) when the timeline range fits within a single day,
 * or date + time (e.g. "Mar 1 14:30") when the range spans multiple days.
 */
export function formatTimestamp(date: Date, fullRange: TimeRange): string {
  const spanMs = fullRange.end.getTime() - fullRange.start.getTime();
  if (spanMs > ONE_DAY_MS) {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
