import { useAppStore } from '../../stores/appStore';
import type { AgentInfo } from '../../types';
import { Square, Terminal } from 'lucide-react';

interface Props {
  agent: AgentInfo;
  api: any;
  ws: any;
}

const STATUS_COLORS: Record<string, string> = {
  creating: 'text-yellow-400',
  running: 'text-green-400',
  idle: 'text-blue-400',
  completed: 'text-gray-400',
  failed: 'text-red-400',
};

export function AgentCard({ agent, api }: Props) {
  const { setSelectedAgent, selectedAgentId } = useAppStore();
  const isSelected = selectedAgentId === agent.id;

  return (
    <div
      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
        isSelected
          ? 'border-accent bg-accent/5'
          : 'border-gray-700 bg-surface-raised hover:border-gray-600'
      }`}
      onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{agent.role.icon}</span>
          <div>
            <h3 className="text-sm font-medium">{agent.role.name}</h3>
            <span className={`text-xs ${STATUS_COLORS[agent.status] || 'text-gray-400'}`}>
              {agent.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAgent(agent.id);
            }}
            className="p-1 text-gray-400 hover:text-accent"
            title="Open terminal"
          >
            <Terminal size={14} />
          </button>
          {agent.status === 'running' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                api.killAgent(agent.id);
              }}
              className="p-1 text-gray-400 hover:text-red-400"
              title="Stop agent"
            >
              <Square size={14} />
            </button>
          )}
        </div>
      </div>

      {agent.taskId && (
        <div className="text-xs text-gray-400 mb-1">
          Task: <span className="text-gray-300">{agent.taskId.slice(0, 8)}...</span>
        </div>
      )}

      {agent.childIds.length > 0 && (
        <div className="text-xs text-gray-400 mb-1">
          Sub-agents: <span className="text-gray-300">{agent.childIds.length}</span>
        </div>
      )}

      {agent.outputPreview && (
        <pre className="text-xs text-gray-500 mt-2 overflow-hidden h-12 font-mono bg-surface/50 rounded p-1">
          {agent.outputPreview.slice(-200)}
        </pre>
      )}

      <div className="flex items-center justify-between mt-2">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: agent.role.color }}
        />
        <span className="text-[10px] text-gray-500 font-mono">{agent.id.slice(0, 8)}</span>
      </div>
    </div>
  );
}
