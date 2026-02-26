import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { AgentCard } from './AgentCard';
import { AgentTimeline } from './AgentTimeline';
import { SpawnDialog } from './SpawnDialog';
import { Plus } from 'lucide-react';
import { SkeletonCard } from '../Skeleton';

interface Props {
  api: any;
  ws: any;
}

export function AgentDashboard({ api, ws }: Props) {
  const { agents, loading } = useAppStore();
  const [showSpawn, setShowSpawn] = useState(false);

  // Keyboard shortcut: 'n' to spawn new agent
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setShowSpawn(true);
      }
      if (e.key === 'Escape') {
        setShowSpawn(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const hasChildren = agents.some((a) => a.parentId);

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Agents</h2>
        <div className="flex items-center gap-2">
          <kbd className="hidden sm:inline-block text-[10px] text-gray-500 bg-surface border border-gray-700 rounded px-1.5 py-0.5">N</kbd>
          <button
            onClick={() => setShowSpawn(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black rounded-lg text-sm font-medium hover:bg-accent-muted transition-colors"
          >
            <Plus size={16} />
            Spawn Agent
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p className="text-lg mb-2">No agents running</p>
          <p className="text-sm">Spawn an agent to get started — press <kbd className="bg-surface border border-gray-700 rounded px-1.5 py-0.5 text-xs">N</kbd></p>
        </div>
      ) : (
        <>
          {/* Active agents */}
          {agents.filter((a) => a.status !== 'completed' && a.status !== 'failed').length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {agents.filter((a) => a.status !== 'completed' && a.status !== 'failed').map((agent) => (
                <AgentCard key={agent.id} agent={agent} api={api} ws={ws} />
              ))}
            </div>
          )}

          {/* Stopped / completed agents */}
          {agents.filter((a) => a.status === 'completed' || a.status === 'failed').length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                Stopped ({agents.filter((a) => a.status === 'completed' || a.status === 'failed').length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 opacity-70">
                {agents.filter((a) => a.status === 'completed' || a.status === 'failed').map((agent) => (
                  <AgentCard key={agent.id} agent={agent} api={api} ws={ws} />
                ))}
              </div>
            </div>
          )}

          {hasChildren && <AgentTimeline />}
        </>
      )}

      {showSpawn && <SpawnDialog api={api} onClose={() => setShowSpawn(false)} />}
    </div>
  );
}
