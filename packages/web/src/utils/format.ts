/**
 * Shared formatting utilities for the Flightdeck UI.
 */

/**
 * Format an agent identifier as `role-xxxx` (role prefix + first 4 hex chars).
 * Falls back to just the first 8 chars if role is empty.
 */
export function formatAgentId(role: string | undefined, id: string): string {
  if (!id) return 'unknown';
  const short = id.slice(0, 4);
  if (!role) return id.slice(0, 8);
  return `${role.toLowerCase().split(' ')[0]}-${short}`;
}

/**
 * Format an ISO date string as relative time (e.g., '2 minutes ago').
 * Falls back to the raw string on parse errors.
 */
export function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diff)) return iso;
    if (diff < 0) return 'just now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months === 1) return '1 month ago';
    return `${months} months ago`;
  } catch {
    return iso;
  }
}
