import { EventEmitter } from 'events';
import { eq, asc, and, inArray } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { decisions } from '../db/schema.js';

export type DecisionStatus = 'recorded' | 'confirmed' | 'rejected';

export type DecisionCategory = 'style' | 'architecture' | 'tool_access' | 'dependency' | 'testing' | 'general';

export interface Decision {
  id: string;
  agentId: string;
  agentRole: string;
  leadId: string | null;
  projectId: string | null;
  title: string;
  rationale: string;
  needsConfirmation: boolean;
  status: DecisionStatus;
  autoApproved: boolean;
  confirmedAt: string | null;
  timestamp: string;
  category: DecisionCategory;
}

export interface IntentRule {
  id: string;
  category: DecisionCategory;
  action: 'auto-approve';
  source: 'manual' | 'teach_me';
  approvalCount: number;
  createdAt: string;
  lastMatchedAt: string | null;
}

export interface BatchResult {
  updated: number;
  results: Decision[];
  suggestedRule?: { category: DecisionCategory; count: number; prompt: string };
}

/** Classify a decision by keywords in the title */
export function classifyDecision(title: string): DecisionCategory {
  const lower = title.toLowerCase();
  if (/\bformat\b|\blint\b|\bstyle\b|\bprettier\b|\beslint\b/.test(lower)) return 'style';
  if (/\brefactor\b|\barchitect\b|\bdesign\b|\bpattern\b|\bstructure\b/.test(lower)) return 'architecture';
  if (/\bpermission\b|\btool\b|\baccess\b|\bexecute\b|\bcommand\b/.test(lower)) return 'tool_access';
  if (/\bdependency\b|\bpackage\b|\binstall\b|\bupgrade\b|\bversion\b/.test(lower)) return 'dependency';
  if (/\btest\b|\bcoverage\b|\bassertion\b|\bspec\b/.test(lower)) return 'testing';
  return 'general';
}

function rowToDecision(row: typeof decisions.$inferSelect): Decision {
  return {
    id: row.id,
    agentId: row.agentId,
    agentRole: row.agentRole,
    leadId: row.leadId,
    projectId: row.projectId,
    title: row.title,
    rationale: row.rationale ?? '',
    needsConfirmation: row.needsConfirmation === 1,
    status: row.status as DecisionStatus,
    autoApproved: row.autoApproved === 1,
    confirmedAt: row.confirmedAt,
    timestamp: row.createdAt!,
    category: (row as any).category ?? classifyDecision(row.title),
  };
}

export class DecisionLog extends EventEmitter {
  private db: Database;
  /** Decision IDs that require human approval (system settings changes) — no auto-approve */
  private systemDecisionIds = new Set<string>();
  private autoApproveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static AUTO_APPROVE_MS = 60_000;
  private intentRules: IntentRule[] = [];

  constructor(db: Database) {
    super();
    this.db = db;
    this.loadIntentRules();
  }

  private loadIntentRules(): void {
    try {
      const raw = this.db.getSetting('intent_rules');
      if (raw) this.intentRules = JSON.parse(raw);
    } catch {
      this.intentRules = [];
    }
  }

  private saveIntentRules(): void {
    this.db.setSetting('intent_rules', JSON.stringify(this.intentRules));
  }

  // ── Intent Rules CRUD ─────────────────────────────────────────────

  getIntentRules(): IntentRule[] {
    return [...this.intentRules];
  }

  addIntentRule(category: DecisionCategory, source: 'manual' | 'teach_me'): IntentRule {
    const rule: IntentRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      action: 'auto-approve',
      source,
      approvalCount: 0,
      createdAt: new Date().toISOString(),
      lastMatchedAt: null,
    };
    this.intentRules.push(rule);
    this.saveIntentRules();
    return rule;
  }

  deleteIntentRule(ruleId: string): boolean {
    const index = this.intentRules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;
    this.intentRules.splice(index, 1);
    this.saveIntentRules();
    return true;
  }

  /** Check if a decision matches an intent rule. Returns the matching rule or undefined. */
  matchIntentRule(category: DecisionCategory): IntentRule | undefined {
    return this.intentRules.find(r => r.category === category && r.action === 'auto-approve');
  }

  add(agentId: string, agentRole: string, title: string, rationale: string, needsConfirmation = false, leadId?: string, projectId?: string): Decision {
    const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    const category = classifyDecision(title);

    this.db.drizzle.insert(decisions).values({
      id,
      agentId,
      agentRole,
      leadId: leadId || null,
      projectId: projectId || null,
      title,
      rationale,
      needsConfirmation: needsConfirmation ? 1 : 0,
      status: 'recorded',
      createdAt: timestamp,
    }).run();

    const decision: Decision = { id, agentId, agentRole, leadId: leadId || null, projectId: projectId || null, title, rationale, needsConfirmation, status: 'recorded', autoApproved: false, confirmedAt: null, timestamp, category };
    this.emit('decision', decision);

    // Check intent rules for auto-approval (only for non-system decisions needing confirmation)
    if (needsConfirmation && !this.systemDecisionIds.has(id)) {
      const matchedRule = this.matchIntentRule(category);
      if (matchedRule) {
        matchedRule.approvalCount++;
        matchedRule.lastMatchedAt = new Date().toISOString();
        this.saveIntentRules();
        return this.autoApprove(id) ?? decision;
      }
    }

    // Schedule auto-approve after 60s unless it's a system-level decision
    if (!this.systemDecisionIds.has(id)) {
      this.scheduleAutoApprove(id);
    }
    return decision;
  }

  /** Mark a decision as system-level (requires human approval, no auto-approve) */
  markSystemDecision(id: string): void {
    this.systemDecisionIds.add(id);
    // Cancel any pending auto-approve timer
    const timer = this.autoApproveTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.autoApproveTimers.delete(id);
    }
  }

  private scheduleAutoApprove(id: string): void {
    const timer = setTimeout(() => {
      this.autoApproveTimers.delete(id);
      const existing = this.getById(id);
      if (existing && existing.status === 'recorded') {
        this.autoApprove(id);
      }
    }, DecisionLog.AUTO_APPROVE_MS);
    this.autoApproveTimers.set(id, timer);
  }

  private autoApprove(id: string): Decision | undefined {
    const confirmedAt = new Date().toISOString();
    this.db.drizzle
      .update(decisions)
      .set({ status: 'confirmed', autoApproved: 1, confirmedAt })
      .where(eq(decisions.id, id))
      .run();
    const decision = this.getById(id);
    if (decision) this.emit('decision:confirmed', decision);
    return decision;
  }

  getAll(): Decision[] {
    return this.db.drizzle
      .select()
      .from(decisions)
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getByAgent(agentId: string): Decision[] {
    return this.db.drizzle
      .select()
      .from(decisions)
      .where(eq(decisions.agentId, agentId))
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getByAgents(agentIds: string[]): Decision[] {
    if (agentIds.length === 0) return [];
    return this.db.drizzle
      .select()
      .from(decisions)
      .where(inArray(decisions.agentId, agentIds))
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getByLeadId(leadId: string): Decision[] {
    return this.db.drizzle
      .select()
      .from(decisions)
      .where(eq(decisions.leadId, leadId))
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getNeedingConfirmation(): Decision[] {
    return this.db.drizzle
      .select()
      .from(decisions)
      .where(and(eq(decisions.needsConfirmation, 1), eq(decisions.status, 'recorded')))
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getById(id: string): Decision | undefined {
    const row = this.db.drizzle
      .select()
      .from(decisions)
      .where(eq(decisions.id, id))
      .get();
    return row ? rowToDecision(row) : undefined;
  }

  confirm(id: string): Decision | undefined {
    this.cancelAutoApproveTimer(id);
    const existing = this.getById(id);
    if (!existing || existing.status !== 'recorded') return existing;
    const confirmedAt = new Date().toISOString();
    this.db.drizzle
      .update(decisions)
      .set({ status: 'confirmed', confirmedAt })
      .where(eq(decisions.id, id))
      .run();
    const decision = this.getById(id);
    if (decision) this.emit('decision:confirmed', decision);
    return decision;
  }

  reject(id: string): Decision | undefined {
    this.cancelAutoApproveTimer(id);
    const existing = this.getById(id);
    if (!existing || existing.status !== 'recorded') return existing;
    const confirmedAt = new Date().toISOString();
    this.db.drizzle
      .update(decisions)
      .set({ status: 'rejected', confirmedAt })
      .where(eq(decisions.id, id))
      .run();
    const decision = this.getById(id);
    if (decision) this.emit('decision:rejected', decision);
    return decision;
  }

  private cancelAutoApproveTimer(id: string): void {
    const timer = this.autoApproveTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.autoApproveTimers.delete(id);
    }
    this.systemDecisionIds.delete(id);
  }

  // ── Batch operations ─────────────────────────────────────────────

  confirmBatch(ids: string[]): BatchResult {
    const results: Decision[] = [];
    for (const id of ids) {
      const confirmed = this.confirm(id);
      if (confirmed) results.push(confirmed);
    }

    // Generate 'Teach Me' suggestion if 3+ decisions share a category
    const categoryCounts = new Map<DecisionCategory, number>();
    for (const d of results) {
      const count = (categoryCounts.get(d.category) ?? 0) + 1;
      categoryCounts.set(d.category, count);
    }

    let suggestedRule: BatchResult['suggestedRule'];
    for (const [category, count] of categoryCounts) {
      if (count >= 3 && !this.matchIntentRule(category)) {
        suggestedRule = {
          category,
          count,
          prompt: `You approved ${count} ${category} decisions. Auto-approve these in the future?`,
        };
        break;
      }
    }

    this.emit('decisions:batch_confirmed', results);
    return { updated: results.length, results, suggestedRule };
  }

  rejectBatch(ids: string[]): BatchResult {
    const results: Decision[] = [];
    for (const id of ids) {
      const rejected = this.reject(id);
      if (rejected) results.push(rejected);
    }
    this.emit('decisions:batch_rejected', results);
    return { updated: results.length, results };
  }

  /** Get pending decisions grouped by category */
  getPendingGrouped(): Record<DecisionCategory, Decision[]> {
    const pending = this.getNeedingConfirmation();
    const grouped: Record<string, Decision[]> = {};
    for (const d of pending) {
      if (!grouped[d.category]) grouped[d.category] = [];
      grouped[d.category].push(d);
    }
    return grouped as Record<DecisionCategory, Decision[]>;
  }

  clear(): void {
    // Cancel all pending timers
    for (const timer of this.autoApproveTimers.values()) clearTimeout(timer);
    this.autoApproveTimers.clear();
    this.systemDecisionIds.clear();
    this.db.drizzle.delete(decisions).run();
  }
}
