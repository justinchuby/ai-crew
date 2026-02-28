import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { AgentInfo } from '../../types';

// ── Constants ────────────────────────────────────────────────────────

const STATUS_DOT_COLORS: Record<string, string> = {
  creating:   'bg-yellow-400',
  running:    'bg-green-400',
  idle:       'bg-blue-400',
  completed:  'bg-zinc-400',
  failed:     'bg-red-400',
  terminated: 'bg-orange-400',
};

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  idle: 1,
  creating: 2,
  completed: 3,
  failed: 4,
  terminated: 5,
};

// ── Agent row ────────────────────────────────────────────────────────

function AgentRow({ agent }: { agent: AgentInfo }) {
  const statusColor = STATUS_DOT_COLORS[agent.status] ?? 'bg-zinc-500';
  const ctxPct = agent.contextWindowSize
    ? Math.round(((agent.contextWindowUsed ?? 0) / agent.contextWindowSize) * 100)
    : null;
  const ctxColor = ctxPct === null ? 'bg-zinc-700'
    : ctxPct > 90 ? 'bg-red-500'
    : ctxPct > 80 ? 'bg-yellow-500'
    : 'bg-blue-500';

  const modelShort = (agent.model || agent.role.model || '')
    .split('/').pop()?.split('-').slice(-2).join('-') || '—';

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-zinc-800/50">
      {/* Role icon + name */}
      <span className="text-sm w-5 text-center">{agent.role.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-400 truncate">
            {agent.id.slice(0, 8)}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor} ${
            agent.status === 'running' ? 'motion-safe:animate-pulse' : ''
          }`} />
          <span className="text-xs text-zinc-500">{agent.status}</span>
        </div>
        {/* Task preview */}
        {agent.task && (
          <div className="text-[10px] text-zinc-600 truncate mt-0.5">
            {agent.task.slice(0, 60)}
          </div>
        )}
        {/* Context pressure bar */}
        {ctxPct !== null && (
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${ctxColor} rounded-full`}
                style={{ width: `${ctxPct}%` }}
              />
            </div>
            <span className={`text-[10px] font-mono ${
              ctxPct > 90 ? 'text-red-400' : ctxPct > 80 ? 'text-yellow-400' : 'text-zinc-600'
            }`}>
              {ctxPct}%
            </span>
          </div>
        )}
      </div>
      {/* Model badge */}
      <span className="text-[10px] text-zinc-600 font-mono shrink-0">{modelShort}</span>
    </div>
  );
}

// ── AgentFleet ───────────────────────────────────────────────────────

interface AgentFleetProps {
  leadId: string;
}

export function AgentFleet({ leadId }: AgentFleetProps) {
  const agents = useAppStore((s) => s.agents);

  const { teamAgents, activeCount } = useMemo(() => {
    const team = agents
      .filter((a) => a.parentId === leadId || a.id === leadId)
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));
    return {
      teamAgents: team,
      activeCount: team.filter((a) => a.status === 'running').length,
    };
  }, [agents, leadId]);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2">
        <Users size={14} className="text-zinc-500" />
        Agent Fleet
        <span className="text-xs font-normal text-zinc-600 ml-auto">
          {activeCount}/{teamAgents.length} active
        </span>
      </h3>
      <div className="flex-1 overflow-y-auto space-y-0.5 -mx-2">
        {teamAgents.length === 0 && (
          <div className="text-xs text-zinc-600 px-2 py-4 text-center">No agents yet</div>
        )}
        {teamAgents.map((a) => <AgentRow key={a.id} agent={a} />)}
      </div>
    </div>
  );
}
