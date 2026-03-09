# Unified Memory Architecture: Entropy Management & Progressive Disclosure

> **Status:** Design  
> **Author:** Architect  
> **Scope:** Agent-side memory pipeline — how context is built, delivered, preserved, and degraded

---

## Framing

Entropy Management and Progressive Disclosure are two sides of one coin: the **agent memory pipeline**.

- **Progressive Disclosure** = strategically *building* memory — what to inject, when, and how much
- **Entropy Management** = preventing memory *degradation* — preserving coherence across compactions, sessions, and agents

Both operate on the same infrastructure. This spec designs them as a unified system.

---

## Current Memory Architecture Audit

### The Five Memory Tiers (What Exists Today)

```
┌─────────────────────────────────────────────────────────┐
│ Tier 1: Working Memory (context window)                  │
│   Per-agent, ephemeral, managed by ContextCompressor     │
│   Trigger: compress at 80% utilization                   │
│   Preserve: system prompt + last 20 messages + markers   │
│   Lost on: session end, context compaction               │
├─────────────────────────────────────────────────────────┤
│ Tier 2: Session Memory (ActivityLedger + message buffers)│
│   Per-session, in-memory + buffered DB writes (250ms)    │
│   20+ action types tracked per agent                     │
│   Lost on: server restart (partially persisted to DB)    │
├─────────────────────────────────────────────────────────┤
│ Tier 3: Project Knowledge (KnowledgeStore)               │
│   Per-project, SQLite + FTS5 BM25 search                 │
│   4 categories: core(20), procedural(200), semantic(500),│
│     episodic(100, 30-day TTL)                            │
│   Injected at spawn time: 1,200 token budget             │
├─────────────────────────────────────────────────────────┤
│ Tier 4: Collective Memory                                │
│   Per-project, cross-session patterns                    │
│   Categories: pattern, decision, expertise, gotcha       │
│   Ranked by use_count (most-used bubble up)              │
│   Injected at spawn: up to 20 entries                    │
├─────────────────────────────────────────────────────────┤
│ Tier 5: Shared Workspace (filesystem)                    │
│   .flightdeck/shared/{role}-{shortId}/                   │
│   Markdown artifacts, specs, plans                       │
│   Discovered by agents via system prompt instructions    │
│   No automatic injection — agents must read explicitly   │
└─────────────────────────────────────────────────────────┘
```

### Knowledge Injection Pipeline (Current — Every Spawn)

```
AgentManager.spawnAgent()
  ├─ Agent.buildPrompt()
  │   ├─ role.systemPrompt (static template)
  │   ├─ Agent.buildContextManifest()
  │   │   ├─ Peer list (all agents, status, tasks, locked files)
  │   │   ├─ Budget section (leads only)
  │   │   ├─ Hierarchy info (sub-leads only)
  │   │   └─ Shared workspace path
  │   └─ Role-specific instructions
  ├─ KnowledgeInjector.injectKnowledge(projectId, context)
  │   ├─ Token budget: 1,200 (configurable)
  │   ├─ Priority: core (always) → procedural → semantic → episodic
  │   ├─ Search: HybridSearchEngine (FTS5 BM25 + optional vector)
  │   │   └─ RRF fusion: score = w/(k+rank_A) + w/(k+rank_B), k=60
  │   ├─ Sanitize: strip control chars, injection patterns, truncate 500 chars
  │   └─ Format: XML-like section tags (treated as context, not instructions)
  ├─ CollectiveMemory.recall(projectId)
  │   └─ Top 20 entries by use_count
  └─ SkillsLoader.getSkills()
      └─ .github/skills/**/SKILL.md files (YAML frontmatter)
```

### Context Compaction (Current)

```
ContextCompressor.compress(messages, keepRecent=20, contextLimit)
  ├─ Trigger: estimated tokens > contextLimit × 0.8
  ├─ Preserve:
  │   ├─ All system messages (role === 'system')
  │   ├─ Last 20 messages (keepRecent)
  │   └─ Important markers: ✅/❌, DECISION, PROGRESS, build/test failed, ACP commands
  ├─ Compress:
  │   ├─ Old messages grouped in batches of 10
  │   ├─ [System] messages → first 150 chars
  │   ├─ Tool calls → "[tool] operation"
  │   ├─ Long messages → 200 char truncation
  │   └─ Short messages → kept verbatim
  └─ Result: originalTokens, compressedTokens, savedTokens
```

### Session Knowledge Extraction (Current — Every Agent Exit)

```
AgentManager.extractSessionKnowledge(agent)
  ├─ Fetch last 200 messages (skip if <3)
  └─ SessionKnowledgeExtractor.extractFromSession()
      ├─ extractDecisions() → semantic category
      │   (signals: "decided", "chose", "selected")
      ├─ extractPatterns() → procedural category
      │   (workflows, approaches discovered)
      ├─ extractErrors() → procedural category
      │   (bug fixes, debugging insights)
      └─ extractSessionSummary() → episodic category
          (what was accomplished)
      → KnowledgeStore.put() + CollectiveMemory.remember()
```

### Critical Problems

| Problem | Impact | Root Cause |
|---------|--------|------------|
| **All-at-once injection** | Agent gets full knowledge dump at spawn, nothing after | KnowledgeInjector only runs once (spawn time) |
| **Compaction lossy** | Each compression pass loses detail, no fidelity metric | Summaries are 200-char truncations, not semantic distillations |
| **No mid-session injection** | Agent can't receive new knowledge as task evolves | No mechanism to push knowledge into active agent context |
| **No compaction-surviving facts** | Critical decisions/findings lost when context compresses | Only system messages and "important markers" survive |
| **Cross-agent divergence** | Agents develop inconsistent views of same problem | No shared "ground truth" document that all agents reference |
| **Session memory cliff** | Rich session context → thin extracted summaries | extractFromSession uses keyword heuristics, not semantic extraction |
| **No memory decay signal** | No way to know when agent's memory has degraded too far | No metric for "memory quality" or "context fidelity" |
| **Static injection budget** | 1,200 tokens regardless of task complexity or agent role | Should scale with task, role, and context window size |

---

## Design: Unified Memory Architecture

### Principle: Pull > Push, Late > Early, Less > More

The research is clear: **context utilization above ~40% degrades agent reasoning**. The current system front-loads everything at spawn. The redesign inverts this:

1. **Start minimal** — agent receives role + task + core knowledge only
2. **Inject on demand** — knowledge pulled when agent encounters a domain
3. **Compress intelligently** — preserve facts, not conversations
4. **Checkpoint explicitly** — critical facts survive all compactions
5. **Share coherently** — multi-agent ground truth prevents divergence

---

### Component 1: Tiered Injection Budget

Replace the static 1,200-token budget with a dynamic budget that scales with context window size, task complexity, and oversight level.

**File:** `packages/server/src/knowledge/KnowledgeInjector.ts` — modify `injectKnowledge()`  
**Estimated LOC:** ~40 modifications

```typescript
// Current: static 1,200 tokens
// New: dynamic budget

interface InjectionBudgetParams {
  contextWindowSize: number;      // Agent's total context window
  taskComplexity: 'low' | 'medium' | 'high' | 'critical';
  oversightLevel: 'detailed' | 'standard' | 'minimal';
  agentRole: string;
}

function computeInjectionBudget(params: InjectionBudgetParams): number {
  // Target: 15% of context window for initial knowledge
  // (leaves 85% for conversation — well under the 40% degradation threshold)
  const baseBudget = Math.floor(params.contextWindowSize * 0.15);

  // Scale by complexity
  const complexityMultiplier = {
    low: 0.6,       // Simple tasks need less context
    medium: 1.0,    // Standard
    high: 1.3,      // Complex tasks get more upfront
    critical: 1.5,  // Architecture/security gets maximum
  }[params.taskComplexity];

  // Scale by oversight (more trust = less upfront context needed)
  const oversightMultiplier = {
    detailed: 1.2,   // More context for careful work
    standard: 1.0,
    minimal: 0.8,    // Agent trusted to request what it needs
  }[params.oversightLevel];

  // Role-specific adjustments
  const roleMultiplier = {
    lead: 1.3,       // Leads need broad project context
    architect: 1.2,  // Architects need design history
    developer: 1.0,
    'qa-tester': 0.9,
    'code-reviewer': 0.8,  // Reviewers work from diffs, need less background
  }[params.agentRole] ?? 1.0;

  return Math.min(
    Math.floor(baseBudget * complexityMultiplier * oversightMultiplier * roleMultiplier),
    4000,  // Hard cap: never more than 4K tokens upfront
  );
}
```

**Category allocation also becomes dynamic:**

```typescript
// Current: fixed priority order, greedy fill
// New: allocation percentages by role

const CATEGORY_WEIGHTS: Record<string, Record<string, number>> = {
  lead:           { core: 0.20, semantic: 0.35, procedural: 0.25, episodic: 0.20 },
  architect:      { core: 0.15, semantic: 0.45, procedural: 0.20, episodic: 0.20 },
  developer:      { core: 0.15, semantic: 0.20, procedural: 0.45, episodic: 0.20 },
  'qa-tester':    { core: 0.15, semantic: 0.15, procedural: 0.50, episodic: 0.20 },
  'code-reviewer':{ core: 0.10, semantic: 0.30, procedural: 0.30, episodic: 0.30 },
};
// Developer gets more procedural (patterns, how-to)
// Architect gets more semantic (design decisions, architecture)
// Lead gets balanced (needs broad awareness)
```

**~40 LOC** modifications to existing KnowledgeInjector.

---

### Component 2: Mid-Session Knowledge Injection

The biggest gap: agents only receive knowledge at spawn. When an agent encounters a new domain mid-task, it has no mechanism to pull relevant knowledge.

**File:** `packages/server/src/knowledge/KnowledgeRetrievalService.ts` (new)  
**Estimated LOC:** ~120

Two injection modes:

**A. Pull-Based (Agent-Initiated):**

New flightdeck command: `RECALL_KNOWLEDGE`

```
⟦⟦ RECALL_KNOWLEDGE {"query": "authentication flow", "category": "procedural", "limit": 5} ⟧⟧
```

The agent explicitly requests knowledge when it encounters unfamiliar territory. Results injected as a system message.

```typescript
// packages/server/src/knowledge/KnowledgeRetrievalService.ts

export class KnowledgeRetrievalService {
  constructor(
    private knowledgeStore: KnowledgeStore,
    private collectiveMemory: CollectiveMemory,
    private hybridSearch: HybridSearchEngine,
  ) {}

  /**
   * Agent-initiated knowledge recall.
   * Returns formatted knowledge block ready for injection into agent context.
   */
  async recall(params: {
    projectId: string;
    query: string;
    category?: string;
    limit?: number;
    tokenBudget?: number;
  }): Promise<{ content: string; tokenEstimate: number; entriesReturned: number }> {
    const budget = params.tokenBudget ?? 800;  // Mid-session recalls are smaller
    const limit = params.limit ?? 5;

    // Search across both KnowledgeStore and CollectiveMemory
    const knowledgeResults = await this.hybridSearch.search(
      params.projectId, params.query, limit, params.category
    );
    const collectiveResults = this.collectiveMemory.recall(params.projectId)
      .filter(cm => !params.category || cm.category === params.category)
      .filter(cm => cm.value.toLowerCase().includes(params.query.toLowerCase()))
      .slice(0, 3);

    // Format within token budget
    let content = '<recalled_knowledge>\n';
    let tokens = 0;
    let entriesReturned = 0;

    for (const entry of [...knowledgeResults, ...collectiveResults]) {
      const entryText = `[${entry.category}] ${entry.content ?? entry.value}\n`;
      const entryTokens = Math.ceil(entryText.length / 4);
      if (tokens + entryTokens > budget) break;
      content += entryText;
      tokens += entryTokens;
      entriesReturned++;
    }
    content += '</recalled_knowledge>';

    return { content, tokenEstimate: tokens, entriesReturned };
  }
}
```

**Command handler addition** (~20 LOC in CommandDispatcher):

```typescript
case 'RECALL_KNOWLEDGE': {
  const { query, category, limit } = payload;
  const result = await knowledgeRetrievalService.recall({
    projectId: agent.projectId,
    query,
    category,
    limit,
  });
  // Inject as system message so it survives longer in context
  agent.sendMessage(`[System] Knowledge recall (${result.entriesReturned} entries):\n${result.content}`);
  break;
}
```

**B. Push-Based (System-Initiated):**

Inject knowledge when the system detects the agent entering a new domain — triggered by file paths in LOCK_FILE or COMMIT commands.

```typescript
// In KnowledgeRetrievalService:

/**
 * System-initiated contextual injection.
 * Called when agent touches a file in a domain it hasn't seen before.
 */
async contextualInject(params: {
  agentId: string;
  projectId: string;
  filePath: string;
  agentSeenDomains: Set<string>;
}): Promise<{ content: string; domain: string } | null> {
  // Extract domain from file path
  const domain = extractDomain(params.filePath);
  // e.g., "src/auth/" → "auth", "packages/server/src/knowledge/" → "knowledge"

  if (params.agentSeenDomains.has(domain)) return null;  // Already has context
  params.agentSeenDomains.add(domain);

  // Search for knowledge relevant to this domain
  const results = await this.hybridSearch.search(
    params.projectId, domain, 3
  );
  if (results.length === 0) return null;

  let content = `<domain_context domain="${domain}">\n`;
  for (const entry of results) {
    content += `- ${entry.content}\n`;
  }
  content += '</domain_context>';

  return { content, domain };
}

function extractDomain(filePath: string): string {
  // Extract meaningful directory segment
  const parts = filePath.split('/').filter(p => !['src', 'lib', 'index.ts', 'index.js'].includes(p));
  // Find the most specific meaningful directory
  return parts.slice(-2, -1)[0] ?? parts[0] ?? 'unknown';
}
```

**Integration point** — Post-hook in GovernancePipeline (~25 LOC):

```typescript
// New post-hook: domain-context-injector (priority 100)
// Triggers on LOCK_FILE commands
{
  name: 'domain-context-injector',
  priority: 100,
  match: (action) => action.commandName === 'LOCK_FILE',
  async evaluate(action, context) {
    const result = await knowledgeRetrievalService.contextualInject({
      agentId: action.agent.id,
      projectId: action.agent.projectId,
      filePath: action.payload.filePath,
      agentSeenDomains: getAgentDomains(action.agent.id),
    });
    if (result) {
      action.agent.sendMessage(
        `[System] Contextual knowledge for ${result.domain}:\n${result.content}`
      );
    }
  },
}
```

**~120 LOC** for service + ~20 for command + ~25 for post-hook = **~165 LOC total.**

---

### Component 3: Compaction-Surviving Facts (Sticky Memory)

Critical decisions and findings must survive all context compactions. The current system only preserves system messages and a few markers (✅/❌/DECISION). This is insufficient — important facts buried in regular messages get compressed to 200-char summaries.

**File:** `packages/server/src/agents/StickyMemory.ts` (new)  
**Estimated LOC:** ~80

```typescript
// packages/server/src/agents/StickyMemory.ts

export interface StickyFact {
  id: string;
  content: string;
  category: 'decision' | 'finding' | 'constraint' | 'error-lesson';
  source: 'agent' | 'system' | 'user';
  createdAt: number;
  tokenCost: number;
}

/**
 * Per-agent store of facts that MUST survive context compaction.
 * These are re-injected as system messages after every compression pass.
 * Token-budgeted to prevent unbounded growth.
 */
export class StickyMemory {
  private facts = new Map<string, StickyFact[]>();
  private maxTokensPerAgent = 2000;  // Hard cap on sticky memory size

  /**
   * Agent pins a fact via REMEMBER command.
   */
  remember(agentId: string, fact: Omit<StickyFact, 'id' | 'tokenCost' | 'createdAt'>): StickyFact {
    const entry: StickyFact = {
      ...fact,
      id: `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tokenCost: Math.ceil(fact.content.length / 4),
      createdAt: Date.now(),
    };

    const agentFacts = this.facts.get(agentId) ?? [];
    agentFacts.push(entry);

    // Enforce token budget: evict oldest non-constraint facts
    let totalTokens = agentFacts.reduce((sum, f) => sum + f.tokenCost, 0);
    while (totalTokens > this.maxTokensPerAgent && agentFacts.length > 1) {
      // Never evict constraints; evict oldest findings first
      const evictIdx = agentFacts.findIndex(f => f.category !== 'constraint');
      if (evictIdx === -1) break;  // All constraints — can't evict
      totalTokens -= agentFacts[evictIdx].tokenCost;
      agentFacts.splice(evictIdx, 1);
    }

    this.facts.set(agentId, agentFacts);
    return entry;
  }

  /**
   * Get all sticky facts for re-injection after compaction.
   */
  getFacts(agentId: string): StickyFact[] {
    return this.facts.get(agentId) ?? [];
  }

  /**
   * Format sticky facts as a system message block.
   */
  formatForInjection(agentId: string): string | null {
    const facts = this.getFacts(agentId);
    if (facts.length === 0) return null;
    let block = '<sticky_memory>\nThese are critical facts you must not forget:\n';
    for (const fact of facts) {
      block += `- [${fact.category}] ${fact.content}\n`;
    }
    block += '</sticky_memory>';
    return block;
  }

  forget(agentId: string, factId: string): boolean {
    const agentFacts = this.facts.get(agentId);
    if (!agentFacts) return false;
    const idx = agentFacts.findIndex(f => f.id === factId);
    if (idx === -1) return false;
    agentFacts.splice(idx, 1);
    return true;
  }

  clear(agentId: string): void {
    this.facts.delete(agentId);
  }
}
```

**New agent command: REMEMBER**

```
⟦⟦ REMEMBER {"content": "Auth uses JWT with RSA-256, NOT HMAC", "category": "finding"} ⟧⟧
```

**Integration with ContextCompressor** (~15 LOC modification):

```typescript
// In ContextCompressor.compress(), after compression:
// Re-inject sticky memory as a system message
const stickyBlock = stickyMemory.formatForInjection(agentId);
if (stickyBlock) {
  compressedMessages.splice(1, 0, {  // Insert after system prompt
    role: 'system',
    content: stickyBlock,
  });
}
```

**Integration with agent:context_compacted event** (~10 LOC):

```typescript
// In AgentManager, on context_compacted:
agentManager.on('agent:context_compacted', ({ agentId }) => {
  const stickyBlock = stickyMemory.formatForInjection(agentId);
  if (stickyBlock) {
    const agent = agentManager.getAgent(agentId);
    agent?.sendMessage(`[System] Re-injected sticky memory after compaction:\n${stickyBlock}`);
  }
});
```

**~80 LOC** for StickyMemory + ~15 for compressor integration + ~10 for event handler + ~15 for command handler = **~120 LOC total.**

---

### Component 4: Memory Fidelity Scoring

A real-time metric that quantifies how much of an agent's original context has been preserved vs. degraded. This is the "memory health" signal the system currently lacks.

**File:** `packages/server/src/agents/MemoryFidelityScorer.ts` (new)  
**Estimated LOC:** ~90

```typescript
// packages/server/src/agents/MemoryFidelityScorer.ts

export interface MemoryFidelity {
  score: number;           // 0-100 (100 = pristine, 0 = fully degraded)
  compressionPasses: number;
  originalTokens: number;
  currentTokens: number;
  stickyFactCount: number;
  contextUtilization: number;
  estimatedInfoLoss: number;  // 0-1 (fraction of information estimated lost)
}

export class MemoryFidelityScorer {
  // Track compression history per agent
  private compressionHistory = new Map<string, {
    passes: number;
    originalTokens: number;
    totalSaved: number;
  }>();

  recordCompression(agentId: string, result: CompressionResult): void {
    const history = this.compressionHistory.get(agentId) ?? {
      passes: 0, originalTokens: 0, totalSaved: 0,
    };
    if (history.passes === 0) {
      history.originalTokens = result.originalTokens;
    }
    history.passes++;
    history.totalSaved += result.savedTokens;
    this.compressionHistory.set(agentId, history);
  }

  score(agentId: string, agent: {
    contextWindowUsed: number;
    contextWindowSize: number;
  }, stickyFactCount: number): MemoryFidelity {
    const history = this.compressionHistory.get(agentId);
    const passes = history?.passes ?? 0;
    const originalTokens = history?.originalTokens ?? agent.contextWindowUsed;
    const totalSaved = history?.totalSaved ?? 0;

    // Information loss model:
    // Each compression pass loses ~30% of compressed content's detail
    // (empirical estimate — summaries are 200-char truncations of 10-message batches)
    const lossPerPass = 0.30;
    const compressedFraction = totalSaved / Math.max(originalTokens, 1);
    const estimatedInfoLoss = Math.min(1, compressedFraction * (1 - Math.pow(1 - lossPerPass, passes)));

    // Fidelity score composition:
    // 40% — inverse of info loss
    // 30% — context headroom (how much room left)
    // 20% — sticky fact preservation (more facts = more protection)
    // 10% — compression pass penalty (each pass costs 5 points)

    const utilization = agent.contextWindowUsed / Math.max(agent.contextWindowSize, 1);
    const headroom = Math.max(0, 100 * (1 - utilization));
    const stickyBonus = Math.min(20, stickyFactCount * 4);  // Up to 5 facts = full bonus
    const passPenalty = Math.min(50, passes * 5);  // Each pass costs 5, max 50 penalty

    const score = Math.max(0, Math.min(100, Math.round(
      (1 - estimatedInfoLoss) * 40 +
      headroom * 0.30 +
      stickyBonus +
      (50 - passPenalty) * 0.10 * 2
    )));

    return {
      score,
      compressionPasses: passes,
      originalTokens,
      currentTokens: agent.contextWindowUsed,
      stickyFactCount,
      contextUtilization: utilization,
      estimatedInfoLoss,
    };
  }

  clear(agentId: string): void {
    this.compressionHistory.delete(agentId);
  }
}
```

**Events and integration** (~15 LOC):

When fidelity drops below thresholds:

| Fidelity Score | Action |
|---------------|--------|
| 60-100 | Normal — no intervention |
| 40-60 | Warn Lead: "Agent {role} memory degrading ({score}/100)" |
| 20-40 | Re-inject project knowledge (force a mid-session knowledge refresh) |
| 0-20 | Recommend agent replacement: "Agent {role} memory critically degraded — consider respawning with fresh context" |

```typescript
// In AgentManager, after each context_compacted event:
const fidelity = fidelityScorer.score(agentId, agent, stickyMemory.getFacts(agentId).length);
if (fidelity.score < 40) {
  // Force knowledge re-injection
  const knowledge = await knowledgeRetrievalService.recall({
    projectId: agent.projectId,
    query: agent.currentTask ?? agent.role.name,
    tokenBudget: 600,
  });
  agent.sendMessage(`[System] Knowledge refresh (memory fidelity: ${fidelity.score}/100):\n${knowledge.content}`);
}
if (fidelity.score < 20) {
  const lead = agentManager.getLeadAgent();
  lead?.sendMessage(
    `[System] ⚠️ Agent ${agent.role.name} (${agentId.slice(0,8)}) memory critically degraded ` +
    `(fidelity: ${fidelity.score}/100, ${fidelity.compressionPasses} compressions, ` +
    `~${Math.round(fidelity.estimatedInfoLoss * 100)}% info loss). ` +
    `Consider replacing with fresh agent.`
  );
}
```

**~90 LOC** for scorer + ~15 for event integration = **~105 LOC total.**

---

### Component 5: Ground Truth Document (Multi-Agent Coherence)

The biggest source of multi-agent entropy: agents develop **inconsistent world models** because they each have different conversation histories and different compaction artifacts. The fix is a shared, authoritative document that all agents reference.

**File:** `packages/server/src/coordination/knowledge/GroundTruth.ts` (new)  
**Estimated LOC:** ~100

```typescript
// packages/server/src/coordination/knowledge/GroundTruth.ts

export interface GroundTruthEntry {
  key: string;              // e.g., "auth-strategy", "db-schema-v2"
  content: string;          // The authoritative fact
  updatedBy: string;        // agentId who last updated
  updatedAt: number;
  version: number;
}

/**
 * A shared, versioned, authoritative fact store for a project session.
 * All agents can read. Only Lead and Architect can write.
 * Entries are injected into sticky memory of all agents on update.
 *
 * This is NOT KnowledgeStore (which is long-term project knowledge).
 * GroundTruth is session-scoped and captures the *current state of decisions*
 * for the active session — preventing agents from diverging.
 */
export class GroundTruth {
  private entries = new Map<string, GroundTruthEntry>();
  private subscribers = new Set<string>();  // agentIds subscribed to updates

  constructor(
    private agentManager: AgentManager,
    private stickyMemory: StickyMemory,
  ) {}

  /**
   * Set or update a ground truth entry.
   * Broadcasts to all subscribed agents.
   */
  set(key: string, content: string, updatedBy: string): GroundTruthEntry {
    const existing = this.entries.get(key);
    const entry: GroundTruthEntry = {
      key,
      content,
      updatedBy,
      updatedAt: Date.now(),
      version: (existing?.version ?? 0) + 1,
    };
    this.entries.set(key, entry);

    // Broadcast to all subscribed agents
    for (const agentId of this.subscribers) {
      // Update sticky memory so this fact survives compaction
      this.stickyMemory.remember(agentId, {
        content: `[Ground Truth: ${key}] ${content}`,
        category: 'constraint',
        source: 'system',
      });
      // Also send as message for immediate awareness
      const agent = this.agentManager.getAgent(agentId);
      agent?.sendMessage(
        `[System] Ground truth updated — ${key} (v${entry.version}):\n${content}`
      );
    }

    return entry;
  }

  get(key: string): GroundTruthEntry | undefined {
    return this.entries.get(key);
  }

  getAll(): GroundTruthEntry[] {
    return [...this.entries.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  subscribe(agentId: string): void {
    this.subscribers.add(agentId);
    // Inject current ground truth into new subscriber's sticky memory
    for (const entry of this.entries.values()) {
      this.stickyMemory.remember(agentId, {
        content: `[Ground Truth: ${entry.key}] ${entry.content}`,
        category: 'constraint',
        source: 'system',
      });
    }
  }

  unsubscribe(agentId: string): void {
    this.subscribers.delete(agentId);
  }

  /**
   * Format all entries for initial injection into agent context.
   */
  formatForInjection(): string | null {
    if (this.entries.size === 0) return null;
    let block = '<ground_truth>\nAuthoritative decisions for this session:\n';
    for (const entry of this.getAll()) {
      block += `- ${entry.key}: ${entry.content}\n`;
    }
    block += '</ground_truth>';
    return block;
  }
}
```

**New agent commands:**

```
⟦⟦ SET_GROUND_TRUTH {"key": "auth-strategy", "content": "Using JWT with RSA-256 via jose library"} ⟧⟧
⟦⟦ GET_GROUND_TRUTH {} ⟧⟧
```

**Auto-subscription:** All agents subscribe on spawn. Lead and Architect can write; others read-only.

**Integration with KnowledgeInjector** (~10 LOC):

```typescript
// In KnowledgeInjector.injectKnowledge(), after knowledge selection:
const groundTruthBlock = groundTruth.formatForInjection();
if (groundTruthBlock) {
  sections.push(groundTruthBlock);
}
```

**~100 LOC** for GroundTruth + ~20 for commands + ~10 for injection = **~130 LOC total.**

---

### Component 6: Session-to-Session Memory Bridge

What carries over between sessions, what gets lost, and what should be forgotten.

**File:** `packages/server/src/knowledge/SessionMemoryBridge.ts` (new)  
**Estimated LOC:** ~100

Currently, session knowledge extraction (SessionKnowledgeExtractor) is **keyword-heuristic based** — it looks for "decided", "chose", etc. This produces thin, unreliable summaries.

The redesign uses the **Initializer-Handoff pattern** from the harness engineering research: outgoing agents produce a structured handoff artifact; incoming agents consume it.

```typescript
// packages/server/src/knowledge/SessionMemoryBridge.ts

export interface SessionHandoff {
  sessionId: string;
  projectId: string;
  createdAt: number;

  // What was decided (from GroundTruth)
  groundTruth: GroundTruthEntry[];

  // What was accomplished (from DAG)
  completedTasks: Array<{ taskId: string; summary: string; agent: string }>;
  pendingTasks: Array<{ taskId: string; description: string; blockedBy?: string[] }>;

  // What was learned (from StickyMemory, aggregated across agents)
  stickyFacts: Array<{ content: string; category: string; agent: string }>;

  // What went wrong (from CrashForensics + error activity)
  lessonsLearned: Array<{ issue: string; resolution: string }>;

  // Per-agent summaries (from SessionRetro scorecards)
  agentScorecards: Array<{ role: string; tasksCompleted: number; tokensUsed: number }>;
}

export class SessionMemoryBridge {
  constructor(
    private groundTruth: GroundTruth,
    private stickyMemory: StickyMemory,
    private dagManager: DagManager,
    private crashForensics: CrashForensics,
    private ledger: ActivityLedger,
  ) {}

  /**
   * Generate a structured handoff artifact when a session ends.
   * Stored in DB and injected into next session's agents.
   */
  generateHandoff(sessionId: string, projectId: string, agents: AgentInfo[]): SessionHandoff {
    // Ground truth: all session decisions
    const groundTruthEntries = this.groundTruth.getAll();

    // Tasks: from DAG
    const dagStatus = this.dagManager.getStatus();
    const completedTasks = (dagStatus.tasks ?? [])
      .filter(t => t.status === 'done')
      .map(t => ({ taskId: t.id, summary: t.summary ?? t.description, agent: t.assignee ?? 'unknown' }));
    const pendingTasks = (dagStatus.tasks ?? [])
      .filter(t => ['ready', 'pending', 'blocked'].includes(t.status))
      .map(t => ({ taskId: t.id, description: t.description, blockedBy: t.dependencies?.filter(d => d.status !== 'done').map(d => d.id) }));

    // Sticky facts: aggregate from all agents
    const allFacts: SessionHandoff['stickyFacts'] = [];
    for (const agent of agents) {
      const facts = this.stickyMemory.getFacts(agent.id);
      for (const fact of facts) {
        allFacts.push({
          content: fact.content,
          category: fact.category,
          agent: agent.role?.name ?? agent.id.slice(0, 8),
        });
      }
    }

    // Lessons: from crash reports
    const crashes = this.crashForensics.getRecent(10);
    const lessonsLearned = crashes.map(c => ({
      issue: `${c.agentRole} crashed: ${c.error}`,
      resolution: c.lastMessages.slice(-1)[0] ?? 'No resolution recorded',
    }));

    return {
      sessionId,
      projectId,
      createdAt: Date.now(),
      groundTruth: groundTruthEntries,
      completedTasks,
      pendingTasks,
      stickyFacts: allFacts,
      lessonsLearned,
      agentScorecards: [],  // Filled by SessionRetro
    };
  }

  /**
   * Format handoff for injection into next session's agents.
   * Token-budgeted to fit within injection limits.
   */
  formatForInjection(handoff: SessionHandoff, tokenBudget = 1500): string {
    let content = '<previous_session>\n';
    let tokens = 0;

    // Ground truth first (highest priority)
    if (handoff.groundTruth.length > 0) {
      content += 'Decisions from previous session:\n';
      for (const gt of handoff.groundTruth) {
        const line = `- ${gt.key}: ${gt.content}\n`;
        tokens += Math.ceil(line.length / 4);
        if (tokens > tokenBudget) break;
        content += line;
      }
    }

    // Pending tasks (what's left to do)
    if (handoff.pendingTasks.length > 0 && tokens < tokenBudget) {
      content += '\nOutstanding work:\n';
      for (const task of handoff.pendingTasks.slice(0, 10)) {
        const line = `- ${task.description}${task.blockedBy?.length ? ` (blocked by: ${task.blockedBy.join(', ')})` : ''}\n`;
        tokens += Math.ceil(line.length / 4);
        if (tokens > tokenBudget) break;
        content += line;
      }
    }

    // Lessons learned (avoid repeating mistakes)
    if (handoff.lessonsLearned.length > 0 && tokens < tokenBudget) {
      content += '\nLessons from previous session:\n';
      for (const lesson of handoff.lessonsLearned.slice(0, 5)) {
        const line = `- ${lesson.issue}\n`;
        tokens += Math.ceil(line.length / 4);
        if (tokens > tokenBudget) break;
        content += line;
      }
    }

    content += '</previous_session>';
    return content;
  }
}
```

**Persistence:** Store handoffs in `session_retros` table (extend existing JSON blob) or a new `session_handoffs` table.

**Integration with spawn:** When a new session starts for a project, load the most recent handoff and inject into all agents' initial context.

**~100 LOC** for bridge + ~15 for spawn integration = **~115 LOC total.**

---

### Component 7: Per-Project Trust Dial

Per the user's directive: oversight level must be **per-project**, stored in the project DB record, with a visible control on the project Overview page.

**Server side:**

`packages/server/src/routes/projects.ts` (~15 LOC)
```typescript
// PATCH /projects/:id
// Add oversightLevel to project update endpoint
router.patch('/:id', (req, res) => {
  const { oversightLevel, ...rest } = req.body;
  if (oversightLevel) {
    db.prepare('UPDATE project_registry SET oversight_level = ? WHERE id = ?')
      .run(oversightLevel, req.params.id);
  }
  // ... existing update logic
});
```

**Schema addition** (~3 LOC):
```sql
ALTER TABLE project_registry ADD COLUMN oversight_level TEXT DEFAULT 'standard';
```

**Client side:**

`packages/web/src/components/TrustDial/TrustDial.tsx` (new, ~60 LOC)

A dedicated, prominent component — not buried in settings. Placed on the project Overview page command center.

```tsx
export function TrustDial({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const level = project?.oversightLevel ?? 'standard';
  const [updating, setUpdating] = useState(false);

  const levels: Array<{ value: OversightLevel; label: string; icon: string; desc: string }> = [
    { value: 'detailed', label: 'Detailed', icon: '🔍',
      desc: 'Review everything — approval gates for commits, maximum context injection' },
    { value: 'standard', label: 'Standard', icon: '⚖️',
      desc: 'Balanced oversight — standard approvals, dynamic context injection' },
    { value: 'minimal', label: 'Minimal', icon: '🚀',
      desc: 'Maximum autonomy — minimal approvals, lean context, agents pull what they need' },
  ];

  const handleChange = async (newLevel: OversightLevel) => {
    setUpdating(true);
    try {
      await apiFetch(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ oversightLevel: newLevel }),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-zinc-900/50 rounded-lg px-2 py-1">
      {levels.map(({ value, label, icon, desc }) => (
        <button
          key={value}
          onClick={() => handleChange(value)}
          disabled={updating}
          title={desc}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            level === value
              ? 'bg-zinc-700 text-white font-medium'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {icon} {label}
        </button>
      ))}
    </div>
  );
}
```

**Placement:** In the QuickStatusBar of the Overview page command center, next to the running/stopped indicator.

**How oversight level flows into memory:**

| Level | Injection Budget | Approval Gates | Knowledge Strategy | Compaction |
|-------|-----------------|----------------|-------------------|------------|
| **Detailed** | 120% base (more upfront) | Commits + agent creation gated | Push-heavy: system injects domain context proactively | Preserve more (keepRecent=30) |
| **Standard** | 100% base | Standard gates | Balanced: push domain context + pull via RECALL | Standard (keepRecent=20) |
| **Minimal** | 80% base (lean) | Minimal gates | Pull-heavy: agents request knowledge via RECALL_KNOWLEDGE | Aggressive (keepRecent=15) |

**~60 LOC** for TrustDial + ~15 for API + ~3 for schema = **~78 LOC total.**

---

## Summary: File Change Map

| # | Component | File | LOC | New/Modify |
|---|-----------|------|-----|-----------|
| 1 | Tiered Injection Budget | `knowledge/KnowledgeInjector.ts` | ~40 | Modify |
| 2a | KnowledgeRetrievalService | `knowledge/KnowledgeRetrievalService.ts` | ~120 | New |
| 2b | RECALL_KNOWLEDGE command | `agents/CommandDispatcher.ts` | ~20 | Modify |
| 2c | Domain context post-hook | `governance/hooks/DomainContextHook.ts` | ~25 | New |
| 3a | StickyMemory | `agents/StickyMemory.ts` | ~80 | New |
| 3b | REMEMBER command | `agents/CommandDispatcher.ts` | ~15 | Modify |
| 3c | Compressor integration | `agents/ContextCompressor.ts` | ~15 | Modify |
| 3d | Compaction re-injection | `agents/AgentManager.ts` | ~10 | Modify |
| 4 | MemoryFidelityScorer | `agents/MemoryFidelityScorer.ts` | ~90 | New |
| 4b | Fidelity event wiring | `agents/AgentManager.ts` | ~15 | Modify |
| 5a | GroundTruth | `coordination/knowledge/GroundTruth.ts` | ~100 | New |
| 5b | Ground truth commands | `agents/CommandDispatcher.ts` | ~20 | Modify |
| 5c | Injection integration | `knowledge/KnowledgeInjector.ts` | ~10 | Modify |
| 6 | SessionMemoryBridge | `knowledge/SessionMemoryBridge.ts` | ~100 | New |
| 6b | Spawn injection | `agents/AgentManager.ts` | ~15 | Modify |
| 7a | TrustDial component | `web/components/TrustDial/TrustDial.tsx` | ~60 | New |
| 7b | Project API + schema | `routes/projects.ts` + `db/schema.ts` | ~18 | Modify |
| **Total** | | | **~753** | |

---

## Implementation Order

| Phase | What | Components | LOC | Can Ship Independently |
|-------|------|-----------|-----|----------------------|
| **1** | **Sticky Memory + REMEMBER** | 3a-d | ~120 | ✅ Yes — pure addition, no existing behavior changed |
| **2** | **Per-Project Trust Dial** | 7a-b | ~78 | ✅ Yes — UI + schema, independent |
| **3** | **Tiered Injection Budget** | 1 | ~40 | ✅ Yes — modifies existing KnowledgeInjector defaults |
| **4** | **Mid-Session Knowledge Injection** | 2a-c | ~165 | ✅ Yes — new command + service + post-hook |
| **5** | **Ground Truth** | 5a-c | ~130 | Depends on Phase 1 (StickyMemory) |
| **6** | **Memory Fidelity Scoring** | 4, 4b | ~105 | Depends on Phase 1 (StickyMemory fact count) |
| **7** | **Session Memory Bridge** | 6, 6b | ~115 | Depends on Phases 1+5 (StickyMemory + GroundTruth) |

Phases 1-4 are independent and can proceed in parallel. Phases 5-7 build on Phase 1.

---

## New Agent Commands Summary

| Command | Who Can Use | Purpose |
|---------|-------------|---------|
| `REMEMBER {"content": "...", "category": "finding"}` | All agents | Pin a fact to survive compaction |
| `RECALL_KNOWLEDGE {"query": "...", "category": "...", "limit": 5}` | All agents | Pull relevant knowledge mid-session |
| `SET_GROUND_TRUTH {"key": "...", "content": "..."}` | Lead, Architect | Set authoritative session fact |
| `GET_GROUND_TRUTH {}` | All agents | Read all ground truth entries |

---

## Risk Areas

### 1. Sticky Memory Token Budget (MEDIUM)
2,000 tokens per agent for sticky facts is ~5% of a 40K context window. If agents over-use REMEMBER, sticky memory could crowd out conversation. Mitigation: hard cap + LRU eviction of non-constraint facts. Monitor in fidelity scorer.

### 2. Domain Context False Triggers (LOW)
Push-based knowledge injection (Component 2B) uses file path heuristics to detect domain changes. May inject irrelevant knowledge for utility files that span multiple domains. Mitigation: track domains per agent and only inject once per domain.

### 3. Ground Truth Staleness (MEDIUM)
If Lead sets ground truth early and the project direction changes, stale ground truth facts propagate to all agents via sticky memory. Mitigation: ground truth entries have versions and timestamps. Lead can update or remove entries. Fidelity scorer doesn't count stale ground truth as "preserved."

### 4. Session Handoff Size (LOW)
SessionMemoryBridge handoffs could grow large for long sessions with many decisions and crashes. Mitigation: token-budgeted formatForInjection() with greedy priority-ordered inclusion. Hard cap at 1,500 tokens.

### 5. Compaction-Injection Race (LOW)
If context_compacted fires and sticky memory re-injection happens simultaneously with a compaction pass, messages could be double-counted. Mitigation: re-injection happens *after* compression completes, as a synchronous follow-up step, not a separate event handler.
