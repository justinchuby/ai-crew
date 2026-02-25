export type AgentStatus = 'creating' | 'running' | 'idle' | 'completed' | 'failed';

// ACP Protocol Types

export type AgentMode = 'pty' | 'acp';

export interface AcpTextChunk {
  type: 'text';
  text: string;
}

export interface AcpToolCall {
  toolCallId: string;
  title: string;
  kind: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  content?: string;
}

export interface AcpPlanEntry {
  content: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AcpPermissionRequest {
  id: string;
  agentId: string;
  toolName: string;
  arguments: Record<string, any>;
  timestamp: string;
}

export interface AcpSessionInfo {
  sessionId: string;
  mode: AgentMode;
  isPrompting: boolean;
}

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
  mode: AgentMode;
  session?: AcpSessionInfo;
  plan?: AcpPlanEntry[];
  toolCalls?: AcpToolCall[];
  messages?: AcpTextChunk[];
  pendingPermission?: AcpPermissionRequest;
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
  type:
    | 'agent:output'
    | 'agent:status'
    | 'agent:text'
    | 'agent:tool_call'
    | 'agent:plan'
    | 'agent:permission_request'
    | 'agent:permission_response'
    | string;
  [key: string]: any;
}
