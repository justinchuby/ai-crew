---
name: multi-agent-orchestration-patterns
description: Patterns and pitfalls for orchestrating multi-agent crews (5+ agents). Use when planning or running sessions with parallel workstreams, DAG-based task management, or iterative review cycles.
---

# Multi-Agent Orchestration Patterns

Extracted from a 10-agent documentation refresh session with 3 review-fix cycles and ~30 commits (retrospective #64).

## Pattern 1: Keep a Mutable Facts Store

**Problem:** An architect analyzed the codebase and flagged GitHub URLs as wrong. Mid-session, the repo was renamed — making the analysis incorrect. A developer committed URL changes in the wrong direction before the correction propagated.

**Guideline:** Maintain a shared key-value store (e.g., a file in `.flightdeck/shared/facts.md`) for session-wide facts like repo name, repo URL, version numbers, and important conventions. All agents should check this file before acting on cached analysis. When a fact changes, broadcast the update AND update the facts file.

```
# Example: .flightdeck/shared/facts.md
repo-name: ai-crew
repo-url: https://github.com/justinchuby/ai-crew
default-branch: main
```

## Pattern 2: Broadcasts Don't Guarantee Delivery Before Action

**Problem:** A broadcast about a repo rename reached some agents *after* they had already committed changes based on stale info. There is no guarantee that agents read a broadcast before their next action.

**Guideline:** For critical corrections that invalidate prior work:
1. Broadcast the correction immediately.
2. Identify which agents are actively working on affected files (check file locks).
3. Send DIRECT_MESSAGE to each affected agent specifically — don't rely on broadcast alone.
4. If possible, pause affected agents' tasks before the correction propagates.

Treat broadcasts as "best-effort notifications," not reliable delivery.

## Pattern 3: Manage DAG Task Lifecycle Actively

**Problem:** Paused tasks couldn't be completed or retried. Pending tasks didn't auto-transition to ready when dependencies completed. Premature `COMPLETE_TASK` was irreversible.

**Guidelines for leads:**
- Don't mark tasks complete prematurely — verify the work is actually done first.
- If a task gets stuck in "paused" or "pending," track it manually and re-delegate rather than fighting the state machine.
- Use `QUERY_TASKS` periodically to check DAG state — don't rely on memory.
- When `ADD_TASK` doesn't link properly to `DELEGATE`, skip the stuck task and create a fresh delegation.

## Pattern 4: Suppress Known CI Failures Early

**Problem:** A pre-existing `build:server` failure triggered on every commit, creating noise. Agents spent cycles investigating a build failure unrelated to their documentation work.

**Guideline:** At session start, identify pre-existing CI failures and broadcast them:
```
BROADCAST: "Known CI failure: `build:server` is broken pre-session. Ignore it. 
Only investigate NEW failures that appear after your commits."
```
This prevents agents from wasting time on inherited problems.

## Pattern 5: Rotate Agents on Long Sessions to Avoid Context Pressure

**Problem:** Long-running agents accumulated context over multiple review-fix iterations. Later delegations relied on accumulated (potentially stale) context rather than fresh reads.

**Guidelines:**
- For iterative work (review → fix → review → fix), consider creating a fresh agent after 2-3 cycles rather than re-delegating to the same one.
- When re-delegating to an existing agent, include a summary of what's been done so far — don't assume they remember accurately.
- If an agent starts producing inconsistent or confused output, that's a signal of context pressure — spin up a replacement.

## What Worked Well (Repeat These)

1. **Parallel workstreams with file locking** — 3 implementation tracks (README, docs site, presentation) ran simultaneously with zero merge conflicts.
2. **Dual reviewer escalation** — Code reviewer and critical reviewer found different classes of issues (field names vs schema accuracy), providing complementary coverage.
3. **Self-correcting agents** — The architect proactively corrected its own stale analysis and notified affected agents without being asked.
4. **Proactive agent initiative** — Developers applied review fixes before being explicitly asked, reducing round-trips.
5. **Shared workspace convention** — `.flightdeck/shared/<role>-<id>/` worked well for sharing analysis reports and review findings across agents.
6. **Fast iteration cycles** — Each review→fix cycle completed in ~2 minutes, enabling 3 full iterations.
