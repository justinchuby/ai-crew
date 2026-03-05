import type { Database } from '../db/database.js';
import { projectSessions, taskCostRecords, sessionRetros } from '../db/schema.js';
import { eq, sql, desc, and, inArray } from 'drizzle-orm';
import { activityLog } from '../db/schema.js';

// ── Types ─────────────────────────────────────────────────────────

export interface SessionSummary {
  leadId: string;
  projectId: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  agentCount: number;
  taskCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export interface AnalyticsOverview {
  totalSessions: number;
  totalCostUsd: number;
  avgCostPerSession: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessions: SessionSummary[];
  costTrend: Array<{ date: string; costUsd: number }>;
  roleContributions: Array<{ role: string; taskCount: number; tokenUsage: number }>;
}

export interface SessionComparison {
  sessions: SessionSummary[];
  deltas: {
    costDelta: number;
    tokenDelta: number;
    agentCountDelta: number;
  } | null;
}

// Token pricing (same as BudgetEnforcer)
const INPUT_COST_PER_TOKEN = 3.0 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000;

// ── AnalyticsService ──────────────────────────────────────────────

export class AnalyticsService {
  constructor(private db: Database) {}

  /** Get analytics overview across all sessions */
  getOverview(projectId?: string): AnalyticsOverview {
    // Get sessions
    const sessionCondition = projectId
      ? eq(projectSessions.projectId, projectId)
      : undefined;

    const sessions = this.db.drizzle
      .select()
      .from(projectSessions)
      .where(sessionCondition)
      .orderBy(desc(projectSessions.startedAt))
      .all();

    // Get cost data per lead
    const costRows = this.db.drizzle
      .select({
        leadId: taskCostRecords.leadId,
        totalInput: sql<number>`sum(${taskCostRecords.inputTokens})`,
        totalOutput: sql<number>`sum(${taskCostRecords.outputTokens})`,
        taskCount: sql<number>`count(distinct ${taskCostRecords.dagTaskId})`,
      })
      .from(taskCostRecords)
      .groupBy(taskCostRecords.leadId)
      .all();

    const costByLead = new Map(costRows.map(r => [r.leadId, r]));

    // Get agent counts per lead from activity log
    const agentCountRows = this.db.drizzle
      .select({
        projectId: activityLog.projectId,
        agentCount: sql<number>`count(distinct ${activityLog.agentId})`,
      })
      .from(activityLog)
      .groupBy(activityLog.projectId)
      .all();

    const agentCountByProject = new Map(agentCountRows.map(r => [r.projectId, r.agentCount ?? 0]));

    // Build session summaries
    const summaries: SessionSummary[] = sessions.map(s => {
      const cost = costByLead.get(s.leadId);
      const inputTokens = cost?.totalInput ?? 0;
      const outputTokens = cost?.totalOutput ?? 0;
      return {
        leadId: s.leadId,
        projectId: s.projectId,
        status: s.status ?? 'unknown',
        startedAt: s.startedAt ?? '',
        endedAt: s.endedAt ?? null,
        agentCount: agentCountByProject.get(s.leadId) ?? 0,
        taskCount: cost?.taskCount ?? 0,
        totalInputTokens: inputTokens,
        totalOutputTokens: outputTokens,
        estimatedCostUsd: Math.round((inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN) * 100) / 100,
      };
    });

    // Compute totals
    const totalInputTokens = summaries.reduce((sum, s) => sum + s.totalInputTokens, 0);
    const totalOutputTokens = summaries.reduce((sum, s) => sum + s.totalOutputTokens, 0);
    const totalCostUsd = Math.round((totalInputTokens * INPUT_COST_PER_TOKEN + totalOutputTokens * OUTPUT_COST_PER_TOKEN) * 100) / 100;

    // Cost trend by date
    const costByDate = new Map<string, number>();
    for (const s of summaries) {
      const date = s.startedAt.slice(0, 10); // YYYY-MM-DD
      costByDate.set(date, (costByDate.get(date) ?? 0) + s.estimatedCostUsd);
    }
    const costTrend = [...costByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, costUsd]) => ({ date, costUsd }));

    // Role contributions from activity log
    const roleRows = this.db.drizzle
      .select({
        role: activityLog.agentRole,
        actionCount: sql<number>`count(*)`,
      })
      .from(activityLog)
      .groupBy(activityLog.agentRole)
      .all();

    const roleContributions = roleRows.map(r => ({
      role: r.role,
      taskCount: r.actionCount ?? 0,
      tokenUsage: 0, // Would need per-agent token data join
    }));

    return {
      totalSessions: summaries.length,
      totalCostUsd,
      avgCostPerSession: summaries.length > 0 ? Math.round(totalCostUsd / summaries.length * 100) / 100 : 0,
      totalInputTokens,
      totalOutputTokens,
      sessions: summaries,
      costTrend,
      roleContributions,
    };
  }

  /** Compare two sessions side-by-side */
  compare(leadIds: string[]): SessionComparison {
    const summaries: SessionSummary[] = [];

    for (const leadId of leadIds) {
      const session = this.db.drizzle
        .select()
        .from(projectSessions)
        .where(eq(projectSessions.leadId, leadId))
        .get();

      const cost = this.db.drizzle
        .select({
          totalInput: sql<number>`sum(${taskCostRecords.inputTokens})`,
          totalOutput: sql<number>`sum(${taskCostRecords.outputTokens})`,
          taskCount: sql<number>`count(distinct ${taskCostRecords.dagTaskId})`,
        })
        .from(taskCostRecords)
        .where(eq(taskCostRecords.leadId, leadId))
        .get();

      const agentCount = this.db.drizzle
        .select({ count: sql<number>`count(distinct ${activityLog.agentId})` })
        .from(activityLog)
        .where(eq(activityLog.projectId, leadId))
        .get();

      const inputTokens = cost?.totalInput ?? 0;
      const outputTokens = cost?.totalOutput ?? 0;

      summaries.push({
        leadId,
        projectId: session?.projectId ?? null,
        status: session?.status ?? 'unknown',
        startedAt: session?.startedAt ?? '',
        endedAt: session?.endedAt ?? null,
        agentCount: agentCount?.count ?? 0,
        taskCount: cost?.taskCount ?? 0,
        totalInputTokens: inputTokens,
        totalOutputTokens: outputTokens,
        estimatedCostUsd: Math.round((inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN) * 100) / 100,
      });
    }

    // Compute deltas if exactly 2 sessions
    const deltas = summaries.length === 2 ? {
      costDelta: Math.round((summaries[1].estimatedCostUsd - summaries[0].estimatedCostUsd) * 100) / 100,
      tokenDelta: (summaries[1].totalInputTokens + summaries[1].totalOutputTokens) -
                  (summaries[0].totalInputTokens + summaries[0].totalOutputTokens),
      agentCountDelta: summaries[1].agentCount - summaries[0].agentCount,
    } : null;

    return { sessions: summaries, deltas };
  }
}
