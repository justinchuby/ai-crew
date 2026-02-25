import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { AgentCard } from './AgentCard';
import { SpawnDialog } from './SpawnDialog';
import { Plus } from 'lucide-react';

interface Props {
  api: any;
  ws: any;
}

export function AgentDashboard({ api, ws }: Props) {
  const { agents } = useAppStore();
  const [showSpawn, setShowSpawn] = useState(false);

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Agents</h2>
        <button
          onClick={() => setShowSpawn(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black rounded-lg text-sm font-medium hover:bg-accent-muted transition-colors"
        >
          <Plus size={16} />
          Spawn Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p className="text-lg mb-2">No agents running</p>
          <p className="text-sm">Spawn an agent to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} api={api} ws={ws} />
          ))}
        </div>
      )}

      {showSpawn && <SpawnDialog api={api} onClose={() => setShowSpawn(false)} />}
    </div>
  );
}
