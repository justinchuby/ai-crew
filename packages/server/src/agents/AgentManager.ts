import { EventEmitter } from 'events';
import { Agent } from './Agent.js';
import type { AgentContextInfo } from './Agent.js';
import type { Role, RoleRegistry } from './RoleRegistry.js';
import type { ServerConfig } from '../config.js';
import type { FileLockRegistry } from '../coordination/FileLockRegistry.js';
import type { ActivityLedger } from '../coordination/ActivityLedger.js';

// JSON pattern agents can emit to request sub-agent spawning
const SPAWN_REQUEST_REGEX = /<!--\s*SPAWN_AGENT\s*(\{.*?\})\s*-->/s;
const LOCK_REQUEST_REGEX = /<!--\s*LOCK_REQUEST\s*(\{.*?\})\s*-->/s;
const LOCK_RELEASE_REGEX = /<!--\s*LOCK_RELEASE\s*(\{.*?\})\s*-->/s;
const ACTIVITY_REGEX = /<!--\s*ACTIVITY\s*(\{.*?\})\s*-->/s;

export class AgentManager extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private config: ServerConfig;
  private roleRegistry: RoleRegistry;
  private maxConcurrent: number;
  private lockRegistry: FileLockRegistry;
  private activityLedger: ActivityLedger;

  constructor(
    config: ServerConfig,
    roleRegistry: RoleRegistry,
    lockRegistry: FileLockRegistry,
    activityLedger: ActivityLedger,
  ) {
    super();
    this.config = config;
    this.roleRegistry = roleRegistry;
    this.lockRegistry = lockRegistry;
    this.activityLedger = activityLedger;
    this.maxConcurrent = config.maxConcurrentAgents;
  }

  spawn(role: Role, taskId?: string, parentId?: string): Agent {
    if (this.getRunningCount() >= this.maxConcurrent) {
      throw new Error(
        `Concurrency limit reached (${this.maxConcurrent}). Kill an agent or increase the limit.`,
      );
    }

    const peers: AgentContextInfo[] = this.getAll().map((a) => ({
      id: a.id,
      role: a.role.id,
      roleName: a.role.name,
      status: a.status,
      taskId: a.taskId,
      lockedFiles: [],
    }));

    const agent = new Agent(role, this.config, taskId, parentId, peers);

    // Track parent-child relationship
    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) {
        parent.childIds.push(agent.id);
      }
    }

    this.agents.set(agent.id, agent);

    // Listen for data to detect sub-agent spawn requests and coordination commands
    agent.onData((data) => {
      this.emit('agent:data', agent.id, data);
      this.detectSpawnRequest(agent.id, data);
      this.detectLockRequest(agent, data);
      this.detectLockRelease(agent, data);
      this.detectActivity(agent, data);
    });

    agent.onExit((code) => {
      this.emit('agent:exit', agent.id, code);
    });

    agent.start();
    this.emit('agent:spawned', agent.toJSON());
    return agent;
  }

  kill(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.kill();
    this.emit('agent:killed', id);
    return true;
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }

  getRunningCount(): number {
    return this.getAll().filter((a) => a.status === 'running' || a.status === 'creating').length;
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = n;
  }

  shutdownAll(): void {
    for (const agent of this.agents.values()) {
      if (agent.status === 'running') {
        agent.kill();
      }
    }
  }

  private detectSpawnRequest(agentId: string, data: string): void {
    const match = data.match(SPAWN_REQUEST_REGEX);
    if (!match) return;

    try {
      const request = JSON.parse(match[1]);
      const role = this.roleRegistry.get(request.roleId);
      if (!role) {
        this.emit('agent:spawn_error', agentId, `Unknown role: ${request.roleId}`);
        return;
      }
      const child = this.spawn(role, request.taskId, agentId);
      this.emit('agent:sub_spawned', agentId, child.toJSON());
    } catch (err: any) {
      this.emit('agent:spawn_error', agentId, err.message);
    }
  }

  private detectLockRequest(agent: Agent, data: string): void {
    const match = data.match(LOCK_REQUEST_REGEX);
    if (!match) return;

    try {
      const request = JSON.parse(match[1]);
      const agentRole = agent.role?.id ?? 'unknown';
      const result = this.lockRegistry.acquire(agent.id, agentRole, request.filePath, request.reason);
      if (result.ok) {
        this.activityLedger.log(agent.id, agentRole, 'lock_acquired', `Locked ${request.filePath}`, {
          filePath: request.filePath,
          reason: request.reason,
        });
      }
    } catch {
      // ignore malformed lock requests
    }
  }

  private detectLockRelease(agent: Agent, data: string): void {
    const match = data.match(LOCK_RELEASE_REGEX);
    if (!match) return;

    try {
      const request = JSON.parse(match[1]);
      const released = this.lockRegistry.release(agent.id, request.filePath);
      if (released) {
        const agentRole = agent.role?.id ?? 'unknown';
        this.activityLedger.log(agent.id, agentRole, 'lock_released', `Released ${request.filePath}`, {
          filePath: request.filePath,
        });
      }
    } catch {
      // ignore malformed lock releases
    }
  }

  private detectActivity(agent: Agent, data: string): void {
    const match = data.match(ACTIVITY_REGEX);
    if (!match) return;

    try {
      const entry = JSON.parse(match[1]);
      const agentRole = agent.role?.id ?? 'unknown';
      this.activityLedger.log(
        agent.id,
        agentRole,
        entry.actionType ?? 'message_sent',
        entry.summary ?? '',
        entry.details ?? {},
      );
    } catch {
      // ignore malformed activity entries
    }
  }
}
