# Session Resume — Design & Invariants

## Core Invariant

**All agents must appear idle after resume.** No messages, no commands,
no prompts, no delegations — the crew is restored to a quiescent state
and waits for the user to kick off work.

## Why

A crashed or restarted server may have had agents mid-prompt. Providers
(Copilot CLI, etc.) can restore conversation history and even continue
in-flight prompts. Without suppression this causes a cascade: the lead
resumes a half-finished turn → emits DELEGATE → sub-agents start
working → secretary starts tracking → the user sees a wall of activity
they didn't ask for.

## Mechanism

### `_isResuming` flag (mutable, per-agent)

Set at spawn when `resumeSessionId` is provided (`AgentManager.spawn`).
Cleared in `conn.start().then()` in `AgentAcpBridge`, **after**
session-ready and idle notifications have fired synchronously. This
ensures every guard sees the flag as `true` during the resume window.

**Not** cleared in the `prompting` event handler — the provider can emit
`prompting: true` before `conn.start()` resolves, which would clear the
flag too early and let notifications leak through.

### `resumeSessionId` field (immutable, per-agent)

Set once at spawn, never cleared. Used as a belt-and-suspenders guard
for one-shot events like session-ready notifications where even a
timing edge case must not leak.

## Suppressed Paths

| Path | Guard | File |
|------|-------|------|
| In-flight prompt from previous session | `conn.cancel()` on `prompting` while `_isResuming` | `AgentAcpBridge.ts` |
| Agent text/command output during resume | `_isResuming` check in `text` event handler | `AgentAcpBridge.ts` |
| `[System] session ready` → parent | `resumeSessionId` check | `AgentManager.ts` |
| `finished work` idle notification → parent | `_isResuming` check on status change | `AgentManager.ts` |
| Auto-add to role-based groups | `_isResuming` check in `postSpawn` | `AgentManager.ts` |
| ContextRefresher CREW_UPDATE injection | `_isResuming` check in `refreshAll()` | `ContextRefresher.ts` |
| HeartbeatMonitor idle-lead nudge | `_isResuming` check on idle tracking | `AgentManager.ts` |
| EagerScheduler `task:ready` notification | `_isResuming` check on lead lookup | `container.ts` |
| Secretary auto-spawn (fresh) | `isResume` check skips `autoSpawnSecretary` | `projects.ts` |
| Briefing / task delivery to lead | `!isResume` guard | `projects.ts` |

## Lifecycle Timeline

```
spawn(role, task, parentId, model, cwd, resumeSessionId, ...)
  │
  ├─ agent._isResuming = true          (AgentManager.ts)
  ├─ agent.resumeSessionId = sid       (AgentManager.ts)
  │
  ├─ postSpawn()
  │   ├─ emit('agent:spawned')         → ContextRefresher schedules refresh
  │   └─ autoAddToRoleGroups SKIPPED   ← _isResuming guard
  │
  ├─ startAcpBridge(agent, config, initialPrompt=undefined)
  │   ├─ wireAcpEvents()
  │   │   ├─ 'prompting' handler: cancel() if _isResuming
  │   │   └─ 'text' handler: skip if _isResuming
  │   │
  │   └─ conn.start(resumeSessionId).then(sessionId =>
  │       ├─ notifySessionReady()      → parent NOT notified (resumeSessionId guard)
  │       ├─ cancel() if still prompting (belt-and-suspenders)
  │       ├─ status = 'idle'
  │       ├─ notifyStatusChange()      → notifyParentOfIdle SKIPPED (_isResuming)
  │       │                            → heartbeat tracking SKIPPED (_isResuming)
  │       └─ _isResuming = false       ← flag cleared AFTER all sync notifications
  │       )
  │
  └─ Agent is now idle, _isResuming = false, ready for user input
```

## Adding New Message Paths

When adding any code that sends messages to agents or their parents,
check whether it can fire during resume:

1. Does it listen to `agent:spawned`, `agent:session_ready`, or
   status-change events?
2. Does it run on a timer that could fire during the resume window?
3. Does it trigger from DAG state changes that occur at spawn?

If yes, guard it with `agent._isResuming` (for per-agent checks) or
`agent.resumeSessionId` (for immutable one-shot checks).
