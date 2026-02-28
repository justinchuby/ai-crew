import { useMemo, useRef, useEffect } from 'react';
import { Radio } from 'lucide-react';
import { useLeadStore } from '../../stores/leadStore';
import type { ActivityEvent, AgentComm } from '../../stores/leadStore';

// ── Types ────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  icon: string;
  iconColor: string;
  text: string;
  timestamp: number;
  agentRole?: string;
}

// ── Feed Builder ─────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, string> = {
  tool_call: '🔧',
  delegation: '📋',
  completion: '✅',
  message_sent: '💬',
  progress: '📊',
};

const ACTIVITY_COLORS: Record<string, string> = {
  tool_call: 'text-zinc-400',
  delegation: 'text-yellow-400',
  completion: 'text-green-400',
  message_sent: 'text-blue-400',
  progress: 'text-purple-400',
};

function buildFeedItems(activity: ActivityEvent[], comms: AgentComm[]): FeedItem[] {
  const items: FeedItem[] = [];

  for (const evt of activity) {
    items.push({
      id: `act-${evt.id}`,
      icon: ACTIVITY_ICONS[evt.type] ?? '•',
      iconColor: ACTIVITY_COLORS[evt.type] ?? 'text-zinc-500',
      text: evt.summary,
      timestamp: evt.timestamp,
      agentRole: evt.agentRole,
    });
  }

  for (const comm of comms) {
    items.push({
      id: `comm-${comm.id}`,
      icon: '💬',
      iconColor: 'text-purple-400',
      text: `${comm.fromRole} → ${comm.toRole}: ${comm.content.slice(0, 60)}`,
      timestamp: comm.timestamp,
      agentRole: comm.fromRole,
    });
  }

  return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
}

// ── Rendering ────────────────────────────────────────────────────────

interface ActivityFeedProps {
  leadId: string;
}

export function ActivityFeed({ leadId }: ActivityFeedProps) {
  const activity = useLeadStore((s) => s.projects[leadId]?.activity ?? []);
  const comms = useLeadStore((s) => s.projects[leadId]?.comms ?? []);
  const feedItems = useMemo(() => buildFeedItems(activity, comms), [activity, comms]);
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new items arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [feedItems.length]);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Radio size={14} className="text-green-400 animate-pulse" />
        Live Activity
        <span className="text-xs font-normal text-zinc-600 ml-auto">
          {feedItems.length} events
        </span>
      </h3>
      <div ref={feedRef} className="flex-1 overflow-y-auto px-2">
        {feedItems.length === 0 && (
          <p className="text-xs text-zinc-600 px-2 py-4 text-center">No activity yet</p>
        )}
        {feedItems.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 px-2 py-1.5 border-b border-zinc-800/50 hover:bg-zinc-800/30"
          >
            <span className={`text-xs mt-0.5 ${item.iconColor}`}>{item.icon}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-mono text-zinc-500">{item.agentRole}</span>
              <span className="text-xs text-zinc-400 ml-1 truncate">{item.text}</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-700 flex-shrink-0">
              {new Date(item.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
