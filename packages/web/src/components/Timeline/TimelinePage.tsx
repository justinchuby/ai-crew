import { useState, useMemo } from 'react';
import { RefreshCw, Filter } from 'lucide-react';
import { useTimelineData } from './useTimelineData';
import type { TimelineData, CommType, TimelineStatus } from './useTimelineData';
import { TimelineContainer } from './TimelineContainer';

interface Props {
  api: any;
  ws: any;
  agents?: Array<{ id: string; role: string; parentId?: string }>;
}

// ── Filter config ────────────────────────────────────────────────────

const ALL_ROLES = ['lead', 'architect', 'developer', 'code-reviewer', 'critical-reviewer', 'designer', 'secretary', 'qa-tester'] as const;
const ALL_COMM_TYPES: CommType[] = ['delegation', 'message', 'group_message', 'broadcast'];
const HIDDEN_STATUSES: TimelineStatus[] = ['completed', 'terminated'];

const ROLE_LABELS: Record<string, string> = {
  lead: 'Lead', architect: 'Architect', developer: 'Developer',
  'code-reviewer': 'Code Rev', 'critical-reviewer': 'Crit Rev',
  designer: 'Designer', secretary: 'Secretary', 'qa-tester': 'QA',
};
const COMM_LABELS: Record<CommType, string> = {
  delegation: 'Delegation', message: 'Message', group_message: 'Group', broadcast: 'Broadcast',
};

function ToggleChips<T extends string>({ label, items, selected, labels, onChange }: {
  label: string;
  items: readonly T[];
  selected: Set<T>;
  labels: Record<string, string>;
  onChange: (next: Set<T>) => void;
}) {
  const toggle = (item: T) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item); else next.add(item);
    onChange(next);
  };

  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-th-text-muted font-medium">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <button
            key={item}
            onClick={() => toggle(item)}
            className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
              selected.has(item)
                ? 'bg-th-bg-muted border-th-border text-th-text-alt'
                : 'bg-transparent border-th-border text-th-text-muted hover:border-th-border-hover'
            }`}
          >
            {labels[item] ?? item}
          </button>
        ))}
      </div>
    </div>
  );
}

function applyFilters(
  data: TimelineData,
  roles: Set<string>,
  commTypes: Set<CommType>,
  hiddenStatuses: Set<TimelineStatus>,
): TimelineData {
  const visibleAgentIds = new Set(
    data.agents
      .filter(a => roles.has(a.role))
      .filter(a => {
        const lastSeg = a.segments[a.segments.length - 1];
        return !lastSeg || !hiddenStatuses.has(lastSeg.status);
      })
      .map(a => a.id),
  );

  return {
    ...data,
    agents: data.agents.filter(a => visibleAgentIds.has(a.id)),
    communications: data.communications.filter(
      c => commTypes.has(c.type) && visibleAgentIds.has(c.fromAgentId),
    ),
    locks: data.locks.filter(l => visibleAgentIds.has(l.agentId)),
  };
}

/** Timeline visualization page — shows agent activity over time using visx. */
export function TimelinePage({ api, ws, agents = [] }: Props) {
  // Lead selection
  const leads = agents.filter(a => !a.parentId || a.role === 'lead');
  const [selectedLead, setSelectedLead] = useState<string | null>(leads[0]?.id ?? null);
  const { data, loading, error, refetch } = useTimelineData(selectedLead);
  const [liveMode, setLiveMode] = useState(true);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Set<string>>(() => new Set(ALL_ROLES));
  const [commFilter, setCommFilter] = useState<Set<CommType>>(() => new Set(ALL_COMM_TYPES));
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<TimelineStatus>>(() => new Set());

  const filteredData = useMemo(() => {
    if (!data) return null;
    return applyFilters(data, roleFilter, commFilter, hiddenStatuses);
  }, [data, roleFilter, commFilter, hiddenStatuses]);

  const activeFilterCount =
    (ALL_ROLES.length - roleFilter.size) +
    (ALL_COMM_TYPES.length - commFilter.size) +
    hiddenStatuses.size;

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-th-text">Team Collaboration Timeline</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-indigo-900/40 border border-indigo-500/50 text-indigo-300'
                : 'bg-th-bg-alt text-th-text-alt hover:bg-th-bg-muted hover:text-th-text'
            }`}
          >
            <Filter size={14} />
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          <button
            onClick={() => setLiveMode(prev => !prev)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              liveMode
                ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 hover:bg-emerald-900/60'
                : 'bg-th-bg-alt text-th-text-muted hover:bg-th-bg-muted hover:text-th-text-alt'
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${liveMode ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            Live
          </button>
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-th-bg-alt text-th-text-alt hover:bg-th-bg-muted hover:text-th-text transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      {showFilters && (
        <div className="bg-th-bg rounded-lg border border-th-border-muted px-4 py-3 flex flex-wrap gap-6 items-start">
          <ToggleChips label="Roles" items={ALL_ROLES} selected={roleFilter} labels={ROLE_LABELS} onChange={setRoleFilter} />
          <ToggleChips label="Communication" items={ALL_COMM_TYPES} selected={commFilter} labels={COMM_LABELS} onChange={setCommFilter} />
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-th-text-muted font-medium">Hide agents</span>
            <div className="flex flex-wrap gap-1.5">
              {HIDDEN_STATUSES.map(status => (
                <button
                  key={status}
                  onClick={() => {
                    const next = new Set(hiddenStatuses);
                    if (next.has(status)) next.delete(status); else next.add(status);
                    setHiddenStatuses(next);
                  }}
                  className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                    hiddenStatuses.has(status)
                      ? 'bg-th-bg-muted border-th-border text-th-text-alt'
                      : 'bg-transparent border-th-border text-th-text-muted hover:border-th-border-hover'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setRoleFilter(new Set(ALL_ROLES));
                setCommFilter(new Set(ALL_COMM_TYPES));
                setHiddenStatuses(new Set());
              }}
              className="text-[11px] text-th-text-muted hover:text-th-text-alt self-end pb-0.5"
            >
              Reset all
            </button>
          )}
        </div>
      )}

      {loading && !data && (
        <div className="bg-th-bg rounded-lg border border-th-border-muted p-8 min-h-[400px] flex items-center justify-center">
          <RefreshCw size={24} className="animate-spin text-th-text-muted" />
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 rounded-lg border border-red-800 p-4">
          <p className="text-red-400 text-sm">Error: {error}</p>
        </div>
      )}

      {filteredData && (
        <div className="flex-1 min-h-0">
          <TimelineContainer data={filteredData} liveMode={liveMode} onLiveModeChange={setLiveMode} />
        </div>
      )}
    </div>
  );
}
