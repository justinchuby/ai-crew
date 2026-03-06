import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi';
import { EVENT_LABELS, CHANNEL_DISPLAY, type NotificationLogEntry, type ChannelType, type NotifiableEvent } from './types';

export function NotificationActivityLog() {
  const [entries, setEntries] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<NotificationLogEntry[] | { entries: NotificationLogEntry[] }>('/notifications/log')
      .then((data) => setEntries(Array.isArray(data) ? data : data?.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-xs text-th-text-muted p-4">Loading activity log...</div>;
  }

  return (
    <div data-testid="notification-activity-log">
      <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider mb-2">
        Notification Activity Log
      </h3>

      {entries.length === 0 ? (
        <p className="text-[11px] text-th-text-muted py-4 text-center">No notifications sent yet.</p>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {entries.map((entry) => {
            const ch = CHANNEL_DISPLAY[entry.channelType];
            const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const statusColor =
              entry.status === 'sent' ? 'text-green-400' :
              entry.status === 'failed' ? 'text-red-400' :
              'text-th-text-muted';

            return (
              <div key={entry.id} className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-th-bg-hover/30 rounded">
                <span className="text-xs">{ch?.icon ?? '🔔'}</span>
                <span className="text-th-text-alt flex-1">{EVENT_LABELS[entry.event]}</span>
                <span className={`capitalize ${statusColor}`}>{entry.status}</span>
                <span className="text-[9px] text-th-text-muted font-mono">{time}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
