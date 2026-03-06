import type { AgentInfo } from '../../types';

interface Props {
  agent: AgentInfo;
  onFocus?: () => void;
}

function contextPercent(agent: AgentInfo): number {
  if (!agent.contextWindowSize || !agent.contextWindowUsed) return 0;
  return Math.min(100, (agent.contextWindowUsed / agent.contextWindowSize) * 100);
}

function barColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function statusDot(status: string): string {
  if (status === 'running') return 'bg-green-400 animate-pulse';
  if (status === 'idle') return 'bg-yellow-400';
  if (status === 'failed') return 'bg-red-400';
  if (status === 'completed') return 'bg-blue-400';
  return 'bg-gray-400';
}

/**
 * Full-width agent card for mobile lists.
 * Displays the same data as a Canvas node: role, status, context bar,
 * current task, and output preview.
 */
export function MobileAgentCard({ agent, onFocus }: Props) {
  const pct = contextPercent(agent);

  return (
    <div className="bg-th-bg border border-th-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{agent.role.icon || '🤖'}</span>
          <span className="text-sm font-medium text-th-text">{agent.role.name}</span>
        </div>
        <span className={`w-2 h-2 rounded-full ${statusDot(agent.status)}`} />
      </div>

      {agent.outputPreview && (
        <div className="text-xs text-th-text-muted mb-2 truncate">{agent.outputPreview}</div>
      )}

      {/* Context bar */}
      {pct > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-1.5 bg-th-bg-alt rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor(pct)} rounded-full transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-th-text-muted">{Math.round(pct)}%</span>
        </div>
      )}

      {/* Task info */}
      {agent.dagTaskId && (
        <div className="text-[11px] text-th-text-muted flex items-center gap-1 mb-2">
          <span>🎯</span>
          <span className="truncate">{agent.task || agent.dagTaskId}</span>
        </div>
      )}

      {onFocus && (
        <div className="text-right">
          <button onClick={onFocus} className="text-[11px] text-accent hover:underline">
            Focus →
          </button>
        </div>
      )}
    </div>
  );
}
