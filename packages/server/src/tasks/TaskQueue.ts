import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type { Database } from '../db/database.js';
import type { AgentManager } from '../agents/AgentManager.js';

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

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: number;
  assignedRole?: string;
  parentTaskId?: string;
}

export class TaskQueue extends EventEmitter {
  private db: Database;
  private agentManager: AgentManager;

  constructor(db: Database, agentManager: AgentManager) {
    super();
    this.db = db;
    this.agentManager = agentManager;

    // Try to assign tasks when agents become available
    this.agentManager.on('agent:exit', () => this.tryAutoAssign());
    this.agentManager.on('agent:spawned', () => {
      // Give the agent a moment to initialize before assigning
      setTimeout(() => this.tryAutoAssign(), 2000);
    });
  }

  enqueue(input: CreateTaskInput): Task {
    const id = uuid();
    this.db.run(
      `INSERT INTO tasks (id, title, description, priority, assigned_role)
       VALUES (?, ?, ?, ?, ?)`,
      [id, input.title, input.description || '', input.priority || 0, input.assignedRole || null],
    );
    const task = this.getById(id)!;
    this.emit('task:updated', task);

    // Immediately try to assign this new task
    this.tryAutoAssign();

    return task;
  }

  update(id: string, patch: Partial<Task>): Task | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (patch.title !== undefined) {
      fields.push('title = ?');
      values.push(patch.title);
    }
    if (patch.description !== undefined) {
      fields.push('description = ?');
      values.push(patch.description);
    }
    if (patch.status !== undefined) {
      fields.push('status = ?');
      values.push(patch.status);
    }
    if (patch.priority !== undefined) {
      fields.push('priority = ?');
      values.push(patch.priority);
    }
    if (patch.assignedAgentId !== undefined) {
      fields.push('assigned_agent_id = ?');
      values.push(patch.assignedAgentId);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const task = this.getById(id)!;
    this.emit('task:updated', task);
    return task;
  }

  remove(id: string): boolean {
    const result = this.db.run('DELETE FROM tasks WHERE id = ?', [id]);
    if (result.changes > 0) {
      this.emit('task:removed', id);
    }
    return result.changes > 0;
  }

  getById(id: string): Task | null {
    const row = this.db.get<any>('SELECT * FROM tasks WHERE id = ?', [id]);
    return row ? this.mapRow(row) : null;
  }

  getAll(): Task[] {
    return this.db.all<any>('SELECT * FROM tasks ORDER BY priority DESC, created_at ASC').map(this.mapRow);
  }

  getPending(): Task[] {
    return this.db
      .all<any>("SELECT * FROM tasks WHERE status = 'queued' ORDER BY priority DESC, created_at ASC")
      .map(this.mapRow);
  }

  private tryAutoAssign(): void {
    const pending = this.getPending();
    if (pending.length === 0) return;

    const agents = this.agentManager.getAll();

    for (const task of pending) {
      // 1. First try: find an agent that's running but has no task assigned
      let candidate = agents.find(
        (a) =>
          (a.status === 'running' || a.status === 'idle') &&
          !a.taskId &&
          (!task.assignedRole || a.role.id === task.assignedRole),
      );

      // 2. Second try: auto-spawn a new agent if under concurrency limit
      if (!candidate) {
        const roleId = task.assignedRole || 'developer';
        const role = this.agentManager.getRoleRegistry()?.get(roleId);
        if (role) {
          try {
            candidate = this.agentManager.spawn(role, task.id);
          } catch {
            // Concurrency limit reached, skip
            continue;
          }
        }
      }

      if (candidate) {
        this.update(task.id, {
          status: 'in_progress',
          assignedAgentId: candidate.id,
        });
        candidate.taskId = task.id;
        const prompt = `## Task Assigned\n**${task.title}**\n\n${task.description}\n\nPlease work on this task now.`;
        candidate.write(prompt);
      }
    }
  }

  private mapRow(row: any): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assignedRole: row.assigned_role,
      assignedAgentId: row.assigned_agent_id,
      parentTaskId: row.parent_task_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
