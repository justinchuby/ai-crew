---
name: agent-collaboration-patterns
description: Proven collaboration patterns for multi-agent crews tackling parallel development tasks. Covers architect-first mapping, dual review, file lock coordination, and DAG management. Use when planning any crew session with 3+ agents.
---

# Agent Collaboration Patterns

Extracted from a 10-agent session that resolved 8 sub-issues across 6 GitHub issues in ~15 minutes with 966+ tests passing (retrospective #36).

## Pattern 1: Architect-First Codebase Mapping

**What:** Before any code is written, have the architect explore the entire relevant codebase, read all issues, and produce a detailed map with exact files, methods, line numbers, and proposed fixes.

**Why it works:** 5 minutes of architect analysis saved ~30 minutes of cumulative developer exploration (6 developers × 5 minutes each). The map also ensures consistent approaches — e.g., all developers agreed on `'terminated'` as the status string rather than each choosing their own.

**How to do it:**
1. Architect reads all issues and explores the codebase.
2. Architect produces a map file at `.flightdeck/shared/architect-<id>/issue-map.md`.
3. Every developer's delegation prompt includes: "Read the architect map at [path] before starting."
4. The map should include: file paths, function/method names, line numbers, and the proposed change.

**Example entry from the retro's map:**
```
### Issue #28 — Silent state failures
- File: packages/server/src/TaskDAG.ts
- Method: completeTask(), failTask()
- Line: ~45-60
- Fix: Add state guards — throw if task is already in terminal state
```

## Pattern 2: Dual Reviewer Pattern (Correctness + Security)

**What:** Use two reviewers with different focuses:
- **Code Reviewer:** "Does it work? Does it match the requirements?"
- **Critical Reviewer:** "What breaks? What are the edge cases and security implications?"

**Why it works:** In the retro, the code reviewer approved both initial implementations. The critical reviewer then found a **P0 blocker** the code reviewer missed: the frontend `AgentStatus` type didn't include `'terminated'`, meaning the server would emit a status the frontend couldn't handle.

**Guideline:** Always assign both reviewer types for changes that cross package boundaries (e.g., server + frontend). Single-package changes can use one reviewer.

## Pattern 3: Broadcast-Then-Refactor for Cross-Cutting Concerns

**What:** When a developer creates a reusable helper, they broadcast its existence so other agents use it instead of writing inline alternatives.

**Example from the retro:** Developer 355166b5 extracted `isTerminalStatus()` from Agent.ts and broadcast: "New helper available: `isTerminalStatus()` — use it instead of inline status checks." This prevented 5+ locations from using inconsistent inline checks.

**Guideline:** Any time you create a utility function, type, or constant that other agents might need, broadcast it immediately. Don't wait for code review to catch the duplication.

## Pattern 4: Parallel Execution with File-Lock Discipline

**What:** Identify independent workstreams by file ownership, then run them in parallel with strict file locking.

**How the lead did it in the retro:**
| Agent | Files | Independence |
|-------|-------|-------------|
| Dev 78f3 | 4 `.tsx` files | Fully independent (frontend) |
| Dev 3551 | AgentManager.ts, Agent.ts | Independent |
| Dev b398 | TaskDAG.ts | Independent |
| Dev 80a8 | Agent.ts, CommandDispatcher.ts | Shared Agent.ts with 3551 |
| Dev 4358 | config.ts, ChatGroupRegistry.ts | Independent |

**Result:** Zero merge conflicts despite 6+ developers editing files in the same package.

**Guideline:** When planning parallel work, map out which files each agent will touch. If two agents need the same file, sequence them explicitly and have the first agent release locks promptly.

## Anti-Pattern 1: God Files Create Bottlenecks

**Problem:** `CommandDispatcher.ts` (1,248 lines) required changes for 6 out of 8 issues. File-level locking serialized all work on it, causing ~5 minutes of blocked developer time.

**Guideline:** When you encounter a hot file (3+ agents need it), consider:
1. **Sequencing explicitly:** Assign clear order — Agent A → Agent B → Agent C — and have each release locks immediately after committing.
2. **Batching:** Have one agent make all changes to the hot file based on the architect's map, rather than passing it between 4 agents.
3. **Long-term:** Flag the file for decomposition in a future session.

## Anti-Pattern 2: Declaring a DAG But Not Updating It

**Problem:** The lead used `DECLARE_TASKS` to create the DAG but tracked progress mentally instead of using `TASK_STATUS`/`QUERY_TASKS`. The DAG showed all tasks as "pending" despite most being done.

**Guideline:**
- When agents report completion via messages, the lead (or secretary) should call `COMPLETE_TASK` for the corresponding DAG task.
- Use `QUERY_TASKS` periodically (every 3-5 minutes) to verify DAG state matches reality.
- Better yet: create a secretary agent when using `DECLARE_TASKS` with 3+ tasks. The secretary monitors DAG state and keeps it accurate.

## Anti-Pattern 3: Skipping the Secretary on Fast Sessions

**Problem:** The lead managed 10 agents, 8 issues, and multiple review rounds entirely in its own context window. By the end, context was heavily loaded and updates were processed in batches with less granular attention.

**Guideline:** Create a secretary agent when:
- You have 5+ agents running in parallel.
- You expect 3+ review-fix cycles.
- The session will last more than 10 minutes.

The secretary overhead (~30 seconds to create) pays for itself by freeing the lead's context for decision-making rather than status tracking.

## Anti-Pattern 4: Reviewers Working on Stale Diffs

**Problem:** A reviewer flagged an issue that the architect had already fixed 30 seconds earlier. The reviewer was reading a stale `git diff` snapshot.

**Guideline:**
- Reviewers should pull fresh diffs (`git diff`) immediately before writing their review, not at the start of their analysis.
- If a review takes more than 60 seconds, re-check the diff before submitting findings.
- When receiving review feedback, check if the issue is already fixed before acting on it.

## Anti-Pattern 5: Deferred Findings With No Tracking

**Problem:** The critical reviewer found 5 P1 issues but only the P0 was addressed. The other 4 P1s existed only in a shared markdown file that would be lost after the session.

**Guideline:** When deferring a finding, use `DEFER_ISSUE` (if available) or file a GitHub issue immediately. Never leave deferred findings only in ephemeral session files. A finding that isn't tracked is a finding that's lost.

## Session Planning Checklist

- [ ] Have the architect map the codebase and all issues before delegating to developers.
- [ ] Map file ownership to identify parallel workstreams and bottleneck files.
- [ ] Assign a secretary for sessions with 5+ agents or 3+ review cycles.
- [ ] Create a DAG with `DECLARE_TASKS` and assign someone to keep it updated.
- [ ] Plan explicit sequencing for shared files (who goes first, second, third).
- [ ] Assign both a code reviewer and a critical reviewer for cross-boundary changes.
- [ ] File GitHub issues for any deferred findings before the session ends.
