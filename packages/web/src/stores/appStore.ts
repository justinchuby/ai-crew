import { create } from 'zustand';
import type { AgentInfo, Task, Role, ServerConfig } from '../types';

interface AppState {
  agents: AgentInfo[];
  tasks: Task[];
  roles: Role[];
  config: ServerConfig | null;
  selectedAgentId: string | null;
  connected: boolean;

  setAgents: (agents: AgentInfo[]) => void;
  addAgent: (agent: AgentInfo) => void;
  updateAgent: (id: string, patch: Partial<AgentInfo>) => void;
  removeAgent: (id: string) => void;

  setTasks: (tasks: Task[]) => void;
  updateTask: (task: Task) => void;

  setRoles: (roles: Role[]) => void;
  setConfig: (config: ServerConfig) => void;
  setSelectedAgent: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  agents: [],
  tasks: [],
  roles: [],
  config: null,
  selectedAgentId: null,
  connected: false,

  setAgents: (agents) => set({ agents }),
  addAgent: (agent) => set((s) => ({ agents: [...s.agents, agent] })),
  updateAgent: (id, patch) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),
  removeAgent: (id) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      selectedAgentId: s.selectedAgentId === id ? null : s.selectedAgentId,
    })),

  setTasks: (tasks) => set({ tasks }),
  updateTask: (task) =>
    set((s) => ({
      tasks: s.tasks.some((t) => t.id === task.id)
        ? s.tasks.map((t) => (t.id === task.id ? task : t))
        : [...s.tasks, task],
    })),

  setRoles: (roles) => set({ roles }),
  setConfig: (config) => set({ config }),
  setSelectedAgent: (selectedAgentId) => set({ selectedAgentId }),
  setConnected: (connected) => set({ connected }),
}));
