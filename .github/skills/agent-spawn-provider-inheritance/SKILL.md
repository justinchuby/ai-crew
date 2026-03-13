---
name: agent-spawn-provider-inheritance
description: "When debugging why an agent has the wrong provider/model, or when modifying agent creation or delegation flows."
---

# Agent Spawn and Provider Inheritance

**When to use**: When debugging why an agent has the wrong provider/model, or when modifying agent creation or delegation flows.

## Agent Creation Flow

When a new agent is spawned (via DELEGATE command or API), the flow is:

1. **DELEGATE command parsed** → `AgentLifecycle.ts` `handleDelegate()`
2. **Spawn options built** → `AgentLifecycle.ts:100-104`
3. **AgentManager.spawn()** → creates Agent instance, sets provider from options
4. **upsertAgent to roster DB** → `AgentManager.ts:570-584` persists to `agent_roster` table
5. **'agent:spawned' event emitted** → `AgentManager.ts:858`
6. **SessionResumeManager.onAgentSpawned()** → calls upsertAgent() AGAIN for resume tracking

### Provider Field in agent_roster
```sql
-- Note: provider is stored in the `metadata` JSON column, not a top-level column
-- The agent_roster schema has: agent_id, role, model, status, session_id, project_id, 
--   created_at, updated_at, last_task_summary, metadata, team_id
```

## Two Provider Inheritance Bugs

### Bug 1: DELEGATE doesn't inherit parent's provider
**File**: `packages/server/src/agents/commands/AgentLifecycle.ts:100-104`

```typescript
const spawnOptions = {
  provider: req.provider,  // Only set if LLM explicitly includes it in DELEGATE JSON
  model: req.model,
  // ...
};
```

When the lead delegates to a developer, the DELEGATE command JSON rarely includes `provider`. So `req.provider` is undefined → child agent gets no provider → falls back to system default.

**Fix**: Inherit from parent:
```typescript
provider: req.provider || agent.provider,
```

### Bug 2: SessionResumeManager overwrites provider to null
**File**: `packages/server/src/agents/SessionResumeManager.ts:100-112`

The `onAgentSpawned()` handler calls `rosterRepo.upsertAgent()` but doesn't pass the agent's provider. Since `upsertAgent` uses `onConflictDoUpdate`, it overwrites the provider field to null/empty.

**Fix**: Pass provider through in the upsert call.

## How the UI Displays Provider/Model

1. **API**: `GET /agents` returns agent list from roster DB (includes metadata with provider)
2. **Frontend**: Agent cards read `agent.provider` and `agent.model` to display badges
3. If provider is null/empty, the badge is hidden → "missing provider" appearance

## Architectural Note

The Critical Reviewer suggested a shared "agent defaults resolution" function that both DELEGATE and resume paths call. This is worth considering if more fields need inheritance in the future, but for now two surgical fixes are simpler.

## Key Files

| File | Lines | Role |
|------|-------|------|
| `packages/server/src/agents/commands/AgentLifecycle.ts` | 100-104 | Spawn options — provider inheritance gap |
| `packages/server/src/agents/AgentManager.ts` | 525 | Provider set from options |
| `packages/server/src/agents/AgentManager.ts` | 570-584 | upsertAgent to roster with provider |
| `packages/server/src/agents/SessionResumeManager.ts` | 97-116 | onAgentSpawned — overwrites provider |
| `packages/server/src/db/AgentRosterRepository.ts` | 25-80 | upsertAgent with onConflictDoUpdate |
