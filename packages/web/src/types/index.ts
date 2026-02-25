export type AgentStatus = 'creating' | 'running' | 'idle' | 'completed' | 'failed';

export interface Role {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  color: string;
  icon: string;
  builtIn: boolean;
}

export interface AgentInfo {
  id: string;
  role: Role;
  status: AgentStatus;
  taskId?: string;
  parentId?: string;
  childIds: string[];
  createdAt: string;
  outputPreview: string;
}

export type TaskStatus = 'queued' | 'assigned' | 'in_progress' | 'review' | 'done' | 'failed';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  assignedRole?: string;
  assignedAgentId?: string;
  parentTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  cliCommand: string;
  cliArgs: string[];
  maxConcurrentAgents: number;
  dbPath: string;
}

export interface WsMessage {
  type: string;
  [key: string]: any;
}
