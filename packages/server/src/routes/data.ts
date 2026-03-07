import { Router } from 'express';
import { sql, lt, inArray } from 'drizzle-orm';
import fs from 'node:fs';
import type { AppContext } from './context.js';
import {
  projects,
  projectSessions,
  activityLog,
  dagTasks,
  chatGroups,
  chatGroupMembers,
  chatGroupMessages,
  conversations,
  messages,
  agentMemory,
  decisions,
  fileLocks,
  agentFileHistory,
  collectiveMemory,
  taskCostRecords,
  sessionRetros,
  timers,
  deferredIssues,
  agentPlans,
} from '../db/schema.js';

/** Tables we track for stats and cleanup */
const TABLES = [
  { name: 'projects', table: projects },
  { name: 'project_sessions', table: projectSessions },
  { name: 'activity_log', table: activityLog },
  { name: 'dag_tasks', table: dagTasks },
  { name: 'chat_groups', table: chatGroups },
  { name: 'chat_group_members', table: chatGroupMembers },
  { name: 'chat_group_messages', table: chatGroupMessages },
  { name: 'conversations', table: conversations },
  { name: 'messages', table: messages },
  { name: 'agent_memory', table: agentMemory },
  { name: 'decisions', table: decisions },
  { name: 'file_locks', table: fileLocks },
  { name: 'agent_file_history', table: agentFileHistory },
  { name: 'collective_memory', table: collectiveMemory },
  { name: 'task_cost_records', table: taskCostRecords },
  { name: 'session_retros', table: sessionRetros },
  { name: 'timers', table: timers },
  { name: 'deferred_issues', table: deferredIssues },
  { name: 'agent_plans', table: agentPlans },
] as const;

export function dataRoutes(ctx: AppContext): Router {
  const { db: _db, config } = ctx;
  const router = Router();

  // ── GET /data/stats — database statistics ──────────────────────────
  router.get('/data/stats', (_req, res) => {
    try {
      // File size
      let fileSizeBytes = 0;
      try {
        const stat = fs.statSync(config.dbPath);
        fileSizeBytes = stat.size;
        // Also include WAL file if it exists
        try {
          const walStat = fs.statSync(config.dbPath + '-wal');
          fileSizeBytes += walStat.size;
        } catch { /* no WAL file */ }
      } catch { /* can't stat */ }

      // Record counts per table
      const tableCounts: Record<string, number> = {};
      for (const { name, table } of TABLES) {
        const row = _db.drizzle.select({ count: sql<number>`count(*)` }).from(table).get();
        tableCounts[name] = Number(row?.count ?? 0);
      }

      // Oldest project session
      const oldest = _db.drizzle
        .select({ startedAt: projectSessions.startedAt })
        .from(projectSessions)
        .orderBy(projectSessions.startedAt)
        .limit(1)
        .get();

      res.json({
        fileSizeBytes,
        tableCounts,
        totalRecords: Object.values(tableCounts).reduce((a, b) => a + b, 0),
        oldestSession: oldest?.startedAt ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /data/cleanup — purge old data ─────────────────────────────
  router.post('/data/cleanup', (req, res) => {
    try {
      const { olderThanDays, dryRun = false } = req.body ?? {};
      if (olderThanDays === undefined || typeof olderThanDays !== 'number' || olderThanDays < 0) {
        return res.status(400).json({ error: 'olderThanDays must be a non-negative number (0 = all data)' });
      }

      // ── Purge ALL data (olderThanDays === 0) ──────────────────────────
      // Direct table wipe — no session-based filtering needed
      if (olderThanDays === 0) {
        const counts: Record<string, number> = {};
        for (const { name, table } of TABLES) {
          const row = _db.drizzle.select({ count: sql<number>`count(*)` }).from(table).get();
          counts[name] = Number(row?.count ?? 0);
        }
        const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);

        if (dryRun) {
          return res.json({ deleted: counts, totalDeleted, sessionsDeleted: counts.project_sessions ?? 0, dryRun: true, cutoffDate: 'all' });
        }

        // Delete all data tables in referential integrity order
        _db.drizzle.transaction((tx) => {
          tx.delete(messages).run();
          tx.delete(conversations).run();
          tx.delete(chatGroupMessages).run();
          tx.delete(chatGroupMembers).run();
          tx.delete(chatGroups).run();
          tx.delete(dagTasks).run();
          tx.delete(agentFileHistory).run();
          tx.delete(taskCostRecords).run();
          tx.delete(sessionRetros).run();
          tx.delete(decisions).run();
          tx.delete(agentMemory).run();
          tx.delete(deferredIssues).run();
          tx.delete(agentPlans).run();
          tx.delete(timers).run();
          tx.delete(fileLocks).run();
          tx.delete(collectiveMemory).run();
          tx.delete(activityLog).run();
          tx.delete(projectSessions).run();
          tx.delete(projects).run();
        });

        return res.json({ deleted: counts, totalDeleted, sessionsDeleted: counts.project_sessions ?? 0, dryRun: false, cutoffDate: 'all' });
      }

      // ── Selective purge (olderThanDays > 0) ───────────────────────────
      const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();

      // Find old sessions (ended before cutoff, not currently active)
      const oldSessions = _db.drizzle
        .select({ id: projectSessions.id, leadId: projectSessions.leadId, projectId: projectSessions.projectId })
        .from(projectSessions)
        .where(sql`${projectSessions.endedAt} IS NOT NULL AND ${projectSessions.endedAt} < ${cutoff}`)
        .all();

      if (oldSessions.length === 0) {
        return res.json({ deleted: {}, totalDeleted: 0, sessionsDeleted: 0, dryRun, cutoffDate: cutoff });
      }

      const leadIds = [...new Set(oldSessions.map(s => s.leadId))];
      const projectIds = [...new Set(oldSessions.map(s => s.projectId))];

      // Collect ALL agent IDs from activity logs (covers leads + sub-agents)
      const allAgentRows = projectIds.length > 0
        ? _db.drizzle
            .selectDistinct({ agentId: activityLog.agentId })
            .from(activityLog)
            .where(inArray(activityLog.projectId, projectIds))
            .all()
        : [];
      const allAgentIds = [...new Set([...leadIds, ...allAgentRows.map(r => r.agentId)])];

      // Count what would be deleted
      const counts: Record<string, number> = {};

      const countWhere = (table: any, col: any, ids: string[]) => {
        if (ids.length === 0) return 0;
        const row = _db.drizzle
          .select({ count: sql<number>`count(*)` })
          .from(table)
          .where(inArray(col, ids))
          .get();
        return Number(row?.count ?? 0);
      };

      counts.project_sessions = oldSessions.length;
      counts.activity_log = countWhere(activityLog, activityLog.projectId, projectIds);
      counts.dag_tasks = countWhere(dagTasks, dagTasks.leadId, leadIds);
      counts.chat_group_messages = countWhere(chatGroupMessages, chatGroupMessages.leadId, leadIds);
      counts.chat_group_members = countWhere(chatGroupMembers, chatGroupMembers.leadId, leadIds);
      counts.chat_groups = countWhere(chatGroups, chatGroups.leadId, leadIds);
      counts.agent_file_history = countWhere(agentFileHistory, agentFileHistory.leadId, leadIds);
      counts.task_cost_records = countWhere(taskCostRecords, taskCostRecords.leadId, leadIds);
      counts.session_retros = countWhere(sessionRetros, sessionRetros.leadId, leadIds);
      counts.decisions = countWhere(decisions, decisions.leadId, leadIds);
      counts.agent_memory = countWhere(agentMemory, agentMemory.leadId, leadIds);
      counts.deferred_issues = countWhere(deferredIssues, deferredIssues.leadId, leadIds);
      counts.agent_plans = countWhere(agentPlans, agentPlans.leadId, leadIds);
      counts.timers = countWhere(timers, timers.leadId, leadIds);
      counts.file_locks = countWhere(fileLocks, fileLocks.projectId, projectIds);
      counts.collective_memory = countWhere(collectiveMemory, collectiveMemory.projectId, projectIds);

      // Use allAgentIds for conversations (includes sub-agents)
      counts.conversations = countWhere(conversations, conversations.agentId, allAgentIds);

      // Count conversations' messages using allAgentIds
      const convos = allAgentIds.length > 0
        ? _db.drizzle
            .select({ id: conversations.id })
            .from(conversations)
            .where(inArray(conversations.agentId, allAgentIds))
            .all()
        : [];
      const convoIds = convos.map(c => c.id);
      counts.messages = convoIds.length > 0 ? countWhere(messages, messages.conversationId, convoIds) : 0;

      // Count orphaned projects (all sessions for that project are in the old set)
      counts.projects = 0;
      for (const pid of projectIds) {
        const totalForProject = _db.drizzle
          .select({ count: sql<number>`count(*)` })
          .from(projectSessions)
          .where(sql`${projectSessions.projectId} = ${pid}`)
          .get();
        const oldForProject = oldSessions.filter(s => s.projectId === pid).length;
        if (oldForProject >= Number(totalForProject?.count ?? 0)) {
          counts.projects += 1;
        }
      }

      const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);

      if (dryRun) {
        return res.json({ deleted: counts, totalDeleted, sessionsDeleted: oldSessions.length, dryRun: true, cutoffDate: cutoff });
      }

      // Actually delete in a transaction (order matters for referential integrity)
      _db.drizzle.transaction((tx) => {
        if (convoIds.length > 0) {
          tx.delete(messages).where(inArray(messages.conversationId, convoIds)).run();
        }
        if (allAgentIds.length > 0) {
          tx.delete(conversations).where(inArray(conversations.agentId, allAgentIds)).run();
        }
        if (leadIds.length > 0) {
          tx.delete(chatGroupMessages).where(inArray(chatGroupMessages.leadId, leadIds)).run();
          tx.delete(chatGroupMembers).where(inArray(chatGroupMembers.leadId, leadIds)).run();
          tx.delete(chatGroups).where(inArray(chatGroups.leadId, leadIds)).run();
          tx.delete(dagTasks).where(inArray(dagTasks.leadId, leadIds)).run();
          tx.delete(agentFileHistory).where(inArray(agentFileHistory.leadId, leadIds)).run();
          tx.delete(taskCostRecords).where(inArray(taskCostRecords.leadId, leadIds)).run();
          tx.delete(sessionRetros).where(inArray(sessionRetros.leadId, leadIds)).run();
          tx.delete(decisions).where(inArray(decisions.leadId, leadIds)).run();
          tx.delete(agentMemory).where(inArray(agentMemory.leadId, leadIds)).run();
          tx.delete(deferredIssues).where(inArray(deferredIssues.leadId, leadIds)).run();
          tx.delete(agentPlans).where(inArray(agentPlans.leadId, leadIds)).run();
          tx.delete(timers).where(inArray(timers.leadId, leadIds)).run();
        }
        if (projectIds.length > 0) {
          tx.delete(activityLog).where(inArray(activityLog.projectId, projectIds)).run();
          tx.delete(fileLocks).where(inArray(fileLocks.projectId, projectIds)).run();
          tx.delete(collectiveMemory).where(inArray(collectiveMemory.projectId, projectIds)).run();
        }
        // Delete the old sessions themselves
        const sessionIds = oldSessions.map(s => s.id);
        tx.delete(projectSessions).where(inArray(projectSessions.id, sessionIds)).run();

        // Delete orphaned projects (no remaining sessions)
        for (const pid of projectIds) {
          const remaining = tx
            .select({ count: sql<number>`count(*)` })
            .from(projectSessions)
            .where(sql`${projectSessions.projectId} = ${pid}`)
            .get();
          if (Number(remaining?.count ?? 0) === 0) {
            tx.delete(projects).where(sql`${projects.id} = ${pid}`).run();
          }
        }
      });

      res.json({ deleted: counts, totalDeleted, sessionsDeleted: oldSessions.length, dryRun: false, cutoffDate: cutoff });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
