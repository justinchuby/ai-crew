---
name: multi-agent-orchestration-patterns
description: Patterns for orchestrating multi-agent crews in flightdeck-based sessions. Covers broadcast reliability, shared facts, CI noise management, and review diffing. Use when running sessions with 5+ agents or iterative review cycles.
---

# Multi-Agent Orchestration Patterns

Extracted from a 10-agent documentation refresh session with 3 review-fix cycles and ~30 commits (retrospective #64).

For DAG task management patterns, see the `use-task-dag-for-coordination` skill. For parallel execution and file-lock discipline, see the `agent-collaboration-patterns` skill.

## When This Doesn't Apply

These patterns add overhead. Skip them for:
- Sessions with fewer than 5 agents.
- Single-issue fixes or quick tasks under 10 minutes.
- Sessions where all agents work on fully independent files with no shared facts.

## Pattern 1: Keep a Mutable Facts Store

**Problem:** An architect analyzed the codebase and flagged GitHub URLs as wrong. Mid-session, the repo was renamed — making the analysis incorrect. A developer committed URL changes in the wrong direction before the correction propagated.

**Guideline:** The **lead** creates a shared key-value store at session start (e.g., `.flightdeck/shared/facts.md`) for session-wide facts like repo name, repo URL, version numbers, and important conventions. The lead owns this file — only the lead updates it. Agents read but don't write. If an agent discovers a fact is wrong, they message the lead.

When a fact changes, the lead must both update the facts file AND broadcast the change.

```
# Example: .flightdeck/shared/facts.md
repo-name: <your-repo-name>
repo-url: <your-repo-url>
default-branch: main
```

## Pattern 2: Broadcasts Don't Guarantee Delivery Before Action

**Problem:** A broadcast about a repo rename reached some agents *after* they had already committed changes based on stale info. There is no guarantee that agents read a broadcast before their next action.

**Guideline:** For critical corrections that invalidate prior work:
1. Broadcast the correction immediately.
2. Identify which agents are actively working on affected files (check file locks).
3. Send DIRECT_MESSAGE to each affected agent specifically — don't rely on broadcast alone.
4. Include explicit instructions: "Stop current work on [topic]. Wait for updated guidance."

**Note:** There is no system-level pause command. The workaround is targeted DIRECT_MESSAGE to each affected agent. Treat broadcasts as "best-effort notifications," not reliable delivery.

## Pattern 3: Suppress Known CI Failures Early

**Problem:** A pre-existing `build:server` failure triggered on every commit, creating noise. Agents spent cycles investigating a build failure unrelated to their documentation work.

**Guideline:** At session start, identify pre-existing CI failures and broadcast them with specifics:
```
BROADCAST: "Known CI failure: `build:server` fails with 'No workspaces found: 
--workspace=packages/server'. This is pre-existing — ignore it.
Only investigate NEW failures or failures with DIFFERENT error messages."
```
Be specific about the exact error message or test name, not just the build step. A new failure in the same step could be masked otherwise. Periodically re-check whether the "known" failure is still the same failure.

## Pattern 4: Incremental Review Diffing

**Problem:** In iterative review cycles (review → fix → review → fix), reviewers re-read the entire file each round even though most of it is unchanged. Later rounds are slower and more tedious despite fewer actual changes.

**Guideline:** After the first review round, reviewers should focus on what changed since their last review:
```bash
# See only changes since the last review commit
git diff <last-reviewed-commit>..HEAD -- <file>
```
This makes iteration rounds faster and more focused, especially when most of the file is already correct.

## What Worked Well (Repeat These)

1. **Self-correcting agents** — The architect proactively corrected its own stale analysis and notified affected agents without being asked. Agents that recognize and fix their own mistakes are more valuable than agents that wait to be corrected.
2. **Proactive agent initiative** — Developers applied review fixes before being explicitly asked, reducing round-trips between reviewer and developer.
3. **Shared workspace convention** — `.flightdeck/shared/<role>-<id>/` worked well for sharing analysis reports and review findings across agents.
4. **Fast iteration cycles** — Each review→fix cycle completed in ~2 minutes, enabling 3 full iterations within a single session.
