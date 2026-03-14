import { Router } from 'express';
import type { AppContext } from './context.js';
import type { DagTask } from '../tasks/TaskDAG.js';
import { projectSessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Global task routes — cross-project task queries and the attention items
 * endpoint used by the KanbanBoard, AttentionBar, and HomeDashboard.
 */
export function tasksRoutes(ctx: AppContext): Router {
  const { agentManager, decisionLog, db } = ctx;
  const router = Router();

  // ── Global task query ─────────────────────────────────────────────
  /**
   * GET /tasks
   *   ?scope=global|project|lead
   *   &projectId=<id>        (required when scope=project)
   *   &leadId=<id>           (required when scope=lead — session-scoped)
   *   &status=running,failed  (comma-separated filter)
   *   &role=developer          (filter by role)
   *   &assignedAgentId=<id>   (filter by assigned agent)
   *   &limit=200              (max results, default 200, capped at 1000)
   *   &offset=0               (skip N results for pagination)
   *
   * scope=global filters to live agents, or active session leads after restart.
   * scope=project returns ALL tasks for a project across all sessions.
   * scope=lead returns only tasks owned by the specified leadId.
   */
  router.get('/tasks', (req, res) => {
    const taskDAG = agentManager.getTaskDAG();
    const scope = (req.query.scope as string) || 'global';
    const projectId = req.query.projectId as string | undefined;
    const leadId = req.query.leadId as string | undefined;
    const statusFilter = req.query.status as string | undefined;
    const roleFilter = req.query.role as string | undefined;
    const agentFilter = req.query.assignedAgentId as string | undefined;
    const includeArchived = req.query.includeArchived === 'true';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    let tasks: DagTask[];

    if (scope === 'project') {
      // Project scope: ALL tasks for the project across ALL sessions.
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required when scope=project' });
      }
      tasks = taskDAG.getTasksByProject(projectId, { includeArchived });
    } else if (scope === 'lead') {
      // Lead scope: only tasks owned by a specific lead agent (session-scoped).
      if (!leadId) {
        return res.status(400).json({ error: 'leadId is required when scope=lead' });
      }
      const allTasks = taskDAG.getAll({ includeArchived });
      tasks = allTasks.filter(t => t.leadId === leadId);
    } else {
      // Global scope (default): filter to current session's tasks.
      // When live agents exist, use their IDs directly. After a server
      // restart (no live agents yet), derive active lead IDs from the
      // project_sessions table — no client-supplied sessionId needed.
      const allTasks = taskDAG.getAll({ includeArchived });
      const liveAgents = agentManager.getAll();
      if (liveAgents.length > 0) {
        const liveAgentIds = new Set(liveAgents.map(a => a.id));
        tasks = allTasks.filter(t => t.leadId && liveAgentIds.has(t.leadId));
      } else if (db) {
        // Derive active session leadIds from project_sessions table —
        // the server already knows which sessions are active, no client
        // input needed.
        const activeRows = db.drizzle
          .select({ leadId: projectSessions.leadId })
          .from(projectSessions)
          .where(eq(projectSessions.status, 'active'))
          .all();
        if (activeRows.length > 0) {
          const activeLeadIds = new Set(activeRows.map(r => r.leadId));
          tasks = allTasks.filter(t => t.leadId && activeLeadIds.has(t.leadId));
        } else {
          tasks = allTasks; // no active sessions tracked → show all (fresh install)
        }
      } else {
        tasks = allTasks;
      }
    }

    // Apply optional filters
    if (statusFilter) {
      const statuses = new Set(statusFilter.split(',').map(s => s.trim()));
      tasks = tasks.filter(t => statuses.has(t.dagStatus));
    }
    if (roleFilter) {
      tasks = tasks.filter(t => t.role === roleFilter);
    }
    if (agentFilter) {
      tasks = tasks.filter(t => t.assignedAgentId === agentFilter);
    }

    const total = tasks.length;

    // Apply pagination after filtering
    const paginated = tasks.slice(offset, offset + limit);

    return res.json({
      tasks: paginated,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      scope,
      ...(projectId ? { projectId } : {}),
    });
  });

  // ── Unarchive a task ────────────────────────────────────────────────
  /**
   * PATCH /tasks/:leadId/:taskId/unarchive
   * Restores an archived task by clearing its archivedAt timestamp.
   */
  router.patch('/tasks/:leadId/:taskId/unarchive', (req, res) => {
    const taskDAG = agentManager.getTaskDAG();
    const { leadId, taskId } = req.params;
    const restored = taskDAG.unarchiveTask(leadId, taskId);
    if (!restored) {
      return res.status(404).json({ error: 'Task not found or not archived' });
    }
    return res.json(restored);
  });

  // ── Attention items endpoint ──────────────────────────────────────
  /**
   * GET /attention
   *   ?scope=global|project
   *   &projectId=<id>
   *
   * Aggregates items that need user attention:
   *   - Failed tasks (with failureReason)
   *   - Blocked tasks (duration exceeds threshold)
   *   - Pending decisions (needsConfirmation && status === 'recorded')
   *
   * Used by: AttentionBar, KanbanBoard Command Center, HomeDashboard
   */
  router.get('/attention', (req, res) => {
    const taskDAG = agentManager.getTaskDAG();
    const scope = (req.query.scope as string) || 'global';
    const projectId = req.query.projectId as string | undefined;

    // Get tasks scoped appropriately
    let tasks: DagTask[];
    if (scope === 'project' && projectId) {
      tasks = taskDAG.getTasksByProject(projectId);
    } else {
      tasks = taskDAG.getAll();
    }

    const now = Date.now();

    // Failed tasks
    const failed = tasks
      .filter(t => t.dagStatus === 'failed')
      .map(t => ({
        type: 'failed' as const,
        severity: 'critical' as const,
        task: t,
        reason: t.failureReason || 'Unknown failure',
        failedAt: t.completedAt || t.startedAt || t.createdAt,
      }));

    // Blocked tasks
    const blocked = tasks
      .filter(t => t.dagStatus === 'blocked')
      .map(t => {
        const blockedSince = t.startedAt || t.createdAt;
        const durationMs = now - new Date(blockedSince).getTime();
        return {
          type: 'blocked' as const,
          severity: (durationMs > 30 * 60 * 1000 ? 'warning' : 'info') as 'warning' | 'info',
          task: t,
          durationMs,
          blockedSince,
        };
      });

    // Pending decisions
    const pendingDecisions = decisionLog.getNeedingConfirmation()
      .filter(d => {
        if (scope === 'project' && projectId) {
          return d.projectId === projectId;
        }
        return true;
      })
      .map(d => ({
        type: 'decision' as const,
        severity: 'warning' as const,
        decision: {
          id: d.id,
          title: d.title,
          rationale: d.rationale,
          agentId: d.agentId,
          agentRole: d.agentRole,
          projectId: d.projectId,
          timestamp: d.timestamp,
          category: d.category,
        },
      }));

    // Summary counts for the attention strip
    const summary = {
      failedCount: failed.length,
      blockedCount: blocked.length,
      decisionCount: pendingDecisions.length,
      totalCount: failed.length + blocked.length + pendingDecisions.length,
    };

    // Escalation level: green / yellow / red
    let escalation: 'green' | 'yellow' | 'red' = 'green';
    if (summary.totalCount > 0) escalation = 'yellow';
    if (failed.length > 0) escalation = 'red';

    return res.json({
      scope,
      ...(projectId ? { projectId } : {}),
      escalation,
      summary,
      items: [
        ...failed,
        ...pendingDecisions,
        ...blocked,
      ],
    });
  });

  return router;
}
