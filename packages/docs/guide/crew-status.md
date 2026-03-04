# Crew Status & Heartbeat

How agents stay aware of their teammates, and how the lead gets nudged when things stall.

> [!TIP] TL;DR
> Two separate systems: **CREW_UPDATE** pushes team state to agents periodically, and **Heartbeat** nudges the lead when it goes idle with remaining tasks. They serve different purposes and have different timing.

## CREW_UPDATE (ContextRefresher)

CREW_UPDATE is a formatted status block pushed to agents so they know who else is on the team, what everyone is working on, and what happened recently.

### When It Fires

| Trigger | Condition |
|---------|-----------|
| **Periodic timer** | Every 180 seconds for sub-leads. No updates sent to idle agents. |
| **agent:spawned** | When a new agent joins the crew |
| **context_compacted** | When an agent's context is compacted (they lose memory and need a refresh) |

CREW_UPDATE is a **safety-net fallback**, not the primary communication channel. Leads get real-time information via Agent Reports and direct messages.

### Who Receives Updates

Only agents with status-receiver roles get CREW_UPDATE. The `refreshAll` method checks each agent's role before sending. Idle agents do not receive updates.

### Format (CrewFormatter)

CREW_UPDATE uses a tabular layout wrapped in crew update markers:

```
⟦⟦ CREW_UPDATE
== CURRENT CREW STATUS ==
- Agent abc123 (Developer) — Status: running, Working on: Implement auth module, Files locked: src/auth.ts
- Agent def456 (Code Reviewer) — Status: idle, Working on: Review auth changes, Files locked: none

== AGENT BUDGET ==
Running: 3 / 50 | Available slots: 47

== RECENT ACTIVITY ==
[2026-03-04 05:30:00] Agent abc123 (developer): file_edit — Commit: feat: add auth module (2 files)
[2026-03-04 05:29:30] Agent def456 (code-reviewer): message_sent — Message → Developer (abc123)
CREW_UPDATE ⟧⟧
```

### Recent Activity Filters

Not all activity appears in CREW_UPDATE. These filters reduce noise:

| Activity Type | Included? | Reason |
|--------------|-----------|--------|
| File edits / commits | ✅ Yes | High signal — shows what changed |
| Messages to lead | ✅ Yes | Lead needs to see inbound messages |
| Completion reports | ✅ Yes | Task status changes |
| Status changes | ✅ Yes | Agent lifecycle |
| Errors / CI failures | ✅ Yes | Requires attention |
| Inter-agent DMs | ❌ No | Private peer coordination |
| Group messages | ❌ No | Group-specific, not crew-wide |
| Lock acquired | ❌ No (secretary only) | Too frequent for general crew |
| Lock denied | ✅ Secretary only | Secretary monitors lock conflicts |

The secretary agent monitors lock conflicts and alerts the lead when patterns emerge (e.g., multiple agents contending for the same file).

## Heartbeat (HeartbeatMonitor)

The heartbeat system is separate from CREW_UPDATE. It nudges the lead when the lead goes idle while there are still remaining tasks.

### Behavior

1. When the lead has been idle for a configurable period and there are undone tasks, the system sends a gentle reminder.
2. The lead can pause heartbeats with `halt_heartbeat`.
3. After 3 consecutive nudges without lead activity, the system backs off.

### When It Doesn't Fire

- When all tasks are complete
- When the lead is actively working (recent output)
- After `halt_heartbeat` is called
- After 3 unanswered nudges (backoff)

## Model Selection

Projects can configure which AI models are available per role.

### Configuration

Each project has a model allowlist per role. Defaults:
- **Developer**: Opus-class models only (highest capability for code changes)
- **Architect**: Sonnet + Opus (analysis doesn't always need the largest model)
- **Other roles**: Configured per-project

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects/:id/model-config` | GET | Get current model allowlist |
| `/api/projects/:id/model-config` | PUT | Update model allowlist |

### UI

Model configuration is available on:
- **Project creation page** — set initial model allowlist
- **Lead dashboard → Models tab** — update models for a running project

## System Error Handling

When agents issue malformed commands, the system provides helpful feedback:

- **Failed commands** return the error plus a correct format example
- **Unknown commands** return the full help menu listing all available commands

This helps agents self-correct without human intervention.
