import { v4 as uuid } from 'uuid';
import { PtyManager } from '../pty/PtyManager.js';
import type { Role } from './RoleRegistry.js';
import type { ServerConfig } from '../config.js';

export type AgentStatus = 'creating' | 'running' | 'idle' | 'completed' | 'failed';

export interface AgentContextInfo {
  id: string;
  role: string;
  roleName: string;
  status: AgentStatus;
  taskId?: string;
  lockedFiles: string[];
}

export interface AgentJSON {
  id: string;
  role: Role;
  status: AgentStatus;
  taskId?: string;
  parentId?: string;
  childIds: string[];
  createdAt: string;
  outputPreview: string;
}

export class Agent {
  public readonly id: string;
  public readonly role: Role;
  public readonly createdAt: Date;
  public status: AgentStatus = 'creating';
  public taskId?: string;
  public parentId?: string;
  public childIds: string[] = [];
  private killed = false;

  private pty: PtyManager;
  private config: ServerConfig;
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(code: number) => void> = [];
  private peers: AgentContextInfo[];

  constructor(role: Role, config: ServerConfig, taskId?: string, parentId?: string, peers: AgentContextInfo[] = []) {
    this.id = uuid();
    this.role = role;
    this.config = config;
    this.taskId = taskId;
    this.parentId = parentId;
    this.createdAt = new Date();
    this.pty = new PtyManager();
    this.peers = peers;
  }

  start(): void {
    const contextManifest = this.buildContextManifest(this.peers);
    const rolePrompt = `${this.role.systemPrompt}\n\nYou are acting as the "${this.role.name}" role. ${this.taskId ? `Your assigned task ID is: ${this.taskId}` : 'Awaiting task assignment.'}`;
    const initialPrompt = `${contextManifest}\n\n${rolePrompt}`;

    this.pty.spawn({
      command: this.config.cliCommand,
      args: [...this.config.cliArgs],
      env: {
        AI_CREW_AGENT_ID: this.id,
        AI_CREW_ROLE: this.role.id,
      },
    });

    this.status = 'running';

    // Send initial role context after a short delay for CLI to initialize
    setTimeout(() => {
      if (this.pty.isRunning) {
        this.pty.write(initialPrompt + '\n');
      }
    }, 1000);

    this.pty.on('data', (data: string) => {
      for (const listener of this.dataListeners) {
        listener(data);
      }
    });

    this.pty.on('exit', (code: number) => {
      // If kill() was called, keep 'completed' status instead of overwriting
      if (!this.killed) {
        this.status = code === 0 ? 'completed' : 'failed';
      }
      for (const listener of this.exitListeners) {
        listener(code);
      }
    });
  }

  buildContextManifest(peers: AgentContextInfo[]): string {
    const shortId = this.id.slice(0, 8);
    const taskLine = this.taskId ? this.taskId : 'Awaiting assignment';

    const peerLines = peers
      .map((p) => {
        const pShort = p.id.slice(0, 8);
        const files = p.lockedFiles.length > 0 ? p.lockedFiles.join(', ') : 'none';
        return `- Agent ${pShort} (${p.roleName}) — Status: ${p.status}, Working on: ${p.taskId || 'idle'}, Files locked: ${files}`;
      })
      .join('\n');

    return `<!-- CREW_CONTEXT
You are agent ${shortId} with role "${this.role.name}".

== YOUR ASSIGNMENT ==
- Task: ${taskLine}
- You are responsible for: ${this.role.description}

== ACTIVE CREW MEMBERS ==
${peerLines || '(no other agents)'}

== COORDINATION RULES ==
1. DO NOT modify files that another agent has locked (listed above).
2. If you need to modify a shared file, request a lock first by outputting: <!-- LOCK_REQUEST {"filePath": "path/to/file", "reason": "why"} -->
3. When you finish editing a file, release the lock: <!-- LOCK_RELEASE {"filePath": "path/to/file"} -->
4. To communicate with another agent, use: <!-- AGENT_MESSAGE {"to": "agent-id", "content": "message"} -->
5. Stay within your role's scope. Defer to the appropriate specialist for work outside your expertise.
6. Log important decisions by outputting: <!-- ACTIVITY {"action": "decision_made", "summary": "what you decided"} -->

CREW_CONTEXT -->`;
  }

  injectContextUpdate(peers: AgentContextInfo[], recentActivity: string[]): void {
    const peerLines = peers
      .map((p) => {
        const pShort = p.id.slice(0, 8);
        const files = p.lockedFiles.length > 0 ? p.lockedFiles.join(', ') : 'none';
        return `- Agent ${pShort} (${p.roleName}) — Status: ${p.status}, Working on: ${p.taskId || 'idle'}, Files locked: ${files}`;
      })
      .join('\n');

    const activityLines = recentActivity.length > 0
      ? recentActivity.join('\n')
      : '(no recent activity)';

    const update = `<!-- CREW_UPDATE
== CURRENT CREW STATUS ==
${peerLines || '(no other agents)'}
== RECENT ACTIVITY ==
${activityLines}
CREW_UPDATE -->`;

    if (this.pty.isRunning) {
      this.pty.write(update + '\n');
    }
  }

  write(data: string): void {
    if (this.pty.isRunning) {
      this.pty.write(data);
    }
  }

  kill(): void {
    this.killed = true;
    this.status = 'completed';
    this.pty.kill();
  }

  dispose(): void {
    this.dataListeners.length = 0;
    this.exitListeners.length = 0;
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows);
  }

  onData(listener: (data: string) => void): void {
    this.dataListeners.push(listener);
  }

  onExit(listener: (code: number) => void): void {
    this.exitListeners.push(listener);
  }

  getBufferedOutput(): string {
    return this.pty.getBufferedOutput();
  }

  toJSON(): AgentJSON {
    const output = this.pty.getBufferedOutput();
    return {
      id: this.id,
      role: this.role,
      status: this.status,
      taskId: this.taskId,
      parentId: this.parentId,
      childIds: this.childIds,
      createdAt: this.createdAt.toISOString(),
      outputPreview: output.slice(-500),
    };
  }
}
