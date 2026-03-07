# Hot-Reload with Agent Process Preservation

> **Status:** Design Document (PROPOSAL) | **Author:** Architect (e7f14c5e) | **Date:** 2026-03-07

## Problem Statement

During Flightdeck development, the server runs via `tsx watch src/index.ts`, which restarts the entire Node.js process on every code change. Because Copilot CLI agent processes are spawned as child processes of the server (`child_process.spawn`), they are killed whenever the server restarts. A single code change during an active crew session causes:

1. **All agents terminated** — `SIGTERM` propagates through the process tree
2. **All in-memory state lost** — messages, tool calls, plans, context window info, delegation tracking
3. **All ACP connections severed** — stdio pipes are closed with the parent process
4. **Context window budget wasted** — agents that resume need to rebuild context from scratch

This is the primary developer experience friction for anyone iterating on the Flightdeck server codebase.

### Current Process Tree

```
tsx watch (file watcher)
└── node src/index.ts              ← KILLED on file change
    ├── copilot --acp --stdio      ← agent 1 (child process — KILLED)
    ├── copilot --acp --stdio      ← agent 2 (child process — KILLED)
    ├── copilot --acp --stdio      ← agent 3 (child process — KILLED)
    └── ...
```

### Kill Chain Detail

1. `tsx watch` detects file change → sends SIGTERM to the node process
2. `index.ts` `gracefulShutdown()` calls `agentManager.shutdownAll()`
3. Each `Agent.terminate()` calls `acpConnection.terminate()` → `this.process.kill()`
4. Even without the explicit kill, OS SIGHUP propagates to children when parent exits

### Critical Constraint

ACP uses stdio pipes (`stdin`/`stdout`) for communication via the `@agentclientprotocol/sdk`. These pipe file descriptors are intrinsically tied to the parent-child process relationship — they cannot be transferred to a different process.

---

## Options Considered

### Option 1: Agent Process Daemon (Process Separation)

Split into two processes: a long-lived **Agent Host** daemon that spawns and manages Copilot CLI processes, and a restartable **API Server** that connects to the daemon via local IPC.

```
┌─────────────────────────────────────────┐
│ Agent Host Daemon (long-lived)          │
│                                         │
│  ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ copilot   │ │ copilot   │ │  ...   │  │
│  │ (agent 1) │ │ (agent 2) │ │        │  │
│  └────┬─────┘ └────┬─────┘ └────┬───┘  │
│       │ stdio       │ stdio      │       │
│  ┌────┴─────────────┴────────────┴───┐  │
│  │    ACP Bridge Layer               │  │
│  └────────────────┬──────────────────┘  │
│                   │ Unix Domain Socket   │
└───────────────────┼─────────────────────┘
                    │
┌───────────────────┼─────────────────────┐
│ API Server (restartable via tsx watch)  │
│                   │                     │
│  ┌────────────────┴──────────────────┐  │
│  │ AgentManager (proxy to daemon)    │  │
│  │ Express + WebSocket + services    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**How it works:**
- The daemon listens on a Unix domain socket (e.g., `/tmp/flightdeck-agents.sock`)
- It spawns Copilot CLI processes and bridges ACP protocol messages over the socket
- The API server connects to the daemon on startup, reconnects after restart
- On restart, the server queries the daemon for the current agent roster

**Daemon API surface:**
- `spawn(role, cliArgs, cwd) → agentId`
- `terminate(agentId) → boolean`
- `prompt(agentId, content) → result`
- `resolvePermission(agentId, approved) → void`
- `subscribe(agentId) → event stream`
- `list() → running agent descriptors`

| Pro | Con |
|-----|-----|
| Agents survive any number of server restarts | Significant refactoring (~2-3 weeks) |
| Clean architectural separation of concerns | Need IPC protocol between daemon and server |
| Daemon is small (~300 lines), rarely needs changes | Two processes to manage during development |
| Mirrors proven OTP supervision tree pattern | Event streaming adds a hop (daemon → server → WS) |
| Enables future distributed deployment | Daemon crash still kills all agents |

**Inspired by:** Symphony's Elixir/OTP supervision trees (Task.Supervisor manages agent processes independently of the Orchestrator GenServer), Edict's separate worker processes.

---

### Option 2: Server-Side Hot Module Replacement

Use Vite's SSR HMR or a framework like Resetless to hot-swap individual server modules without full process restart.

| Pro | Con |
|-----|-----|
| Fastest possible feedback loop | Express/WebSocket servers are deeply stateful — HMR is fragile |
| No architectural changes to process model | Every `setInterval`, event listener, DB connection leaks on swap |
| Single process | 35+ interconnected services make "what to swap" unpredictable |
| | Debug nightmares when old/new module versions coexist |
| | Designed for request handlers, not long-lived daemon processes |

**Verdict: Not recommended.** The Flightdeck server has 35+ interconnected stateful services with event listeners, intervals, and shared mutable state. Module-level HMR would be endlessly fragile.

---

### Option 3: Enhanced Auto-Resume After Restart

Don't prevent agent death. Instead, make recovery automatic: persist the agent roster before shutdown, auto-resume all agents via `copilot --resume <sessionId>` on restart.

| Pro | Con |
|-----|-----|
| Simplest implementation (~1-2 days) | Agents still die and restart (5-15s downtime per agent) |
| No architectural changes needed | `--resume` consumes context window budget to rebuild |
| 80% of infrastructure already exists | In-progress tool calls interrupted (could corrupt files mid-edit) |
| Can ship immediately | Message queues between agents are lost |
| | 10-20 agents take 30-60s to fully resume |

---

### Option 4: Worker Thread with Main Thread Process Hosting

Run business logic in a `worker_thread`. Main thread spawns and holds agent processes. Replace the worker on code change; main thread stays alive.

| Pro | Con |
|-----|-----|
| Single OS process | `worker_threads` cannot share file descriptors (stdio pipes) |
| Agents survive worker restart | Need structured-clone-safe IPC for all ACP messages |
| | `http.Server` can't easily be transferred between threads |
| | Effectively same complexity as daemon, with more constraints |

**Verdict: Not recommended.** Worker thread limitations make this harder than process separation for no additional benefit.

---

### Option 5: Detached Processes + Named Pipes

Spawn agents with `detached: true`, communicate via filesystem FIFOs instead of stdio pipes. New server can reopen the same FIFOs.

| Pro | Con |
|-----|-----|
| No daemon process needed | ACP SDK expects Node.js streams, not FIFOs |
| Agent processes survive independently | Copilot CLI expects stdio, needs wrapper script |
| | Platform-specific FIFO behavior (macOS vs Linux) |
| | Untested with ndJSON ACP protocol buffering |

**Verdict: Interesting but risky.** Worth prototyping only if Option 1 proves too heavy.

---

## Recommended Approach: Phased Hybrid

Ship **Phase 1** (Enhanced Auto-Resume) immediately for developer relief, then build **Phase 2** (Agent Host Daemon) as the correct long-term architecture.

### Phase 1: Enhanced Auto-Resume (1-2 days)

Persist the full agent roster to SQLite before shutdown. On dev-mode startup, detect the persisted roster and automatically resume all agents.

#### Implementation

**On graceful shutdown** (before terminating agents):

```typescript
// index.ts — inside gracefulShutdown()
function persistAgentRoster() {
  const roster = agentManager.getAll()
    .filter(a => !isTerminalStatus(a.status))
    .map(a => ({
      id: a.id,
      roleId: a.role.id,
      task: a.task,
      sessionId: a.sessionId,
      parentId: a.parentId,
      projectId: a.projectId,
      dagTaskId: a.dagTaskId,
      model: a.model,
      cwd: a.cwd,
    }));
  db.setSetting('dev-restart-roster', JSON.stringify(roster));
}
```

**On startup** (after all services initialized):

```typescript
function autoResumeIfDevRestart() {
  const rosterJson = db.getSetting('dev-restart-roster');
  if (!rosterJson) return;
  db.setSetting('dev-restart-roster', ''); // consume once

  const roster = JSON.parse(rosterJson);
  console.log(`🔄 Auto-resuming ${roster.length} agents from dev restart...`);

  for (const entry of roster) {
    const role = roleRegistry.get(entry.roleId);
    if (!role || !entry.sessionId) continue;
    agentManager.spawn(
      role, entry.task, entry.parentId, true,
      entry.model, entry.cwd, entry.sessionId, entry.id,
      { projectId: entry.projectId }
    );
  }
}
```

**UI indication:** Show a "🔄 Resuming N agents..." banner in the web dashboard so the developer knows agents are reconnecting.

#### Limitations

- Agents restart (~5-15s per agent), losing their current turn's work in progress
- Context window budget is consumed to rebuild each agent's context
- Pending inter-agent messages are lost (though DAG state and file locks persist in SQLite)

### Phase 2: Agent Host Daemon (2-3 weeks)

Extract agent process management into a standalone daemon process.

#### New File Structure

```
bin/
  flightdeck.mjs                  # CLI entry (unchanged)
  flightdeck-agent-host.mjs       # New: daemon entry

packages/server/
  src/
    agent-host/
      AgentHostDaemon.ts          # Spawns agents, manages ACP connections
      AgentHostProtocol.ts        # JSON-RPC message definitions
      AgentHostClient.ts          # Client used by the API server
    agents/
      AgentManager.ts             # Modified: delegates spawn/terminate to client
      Agent.ts                    # Modified: ACP events arrive via IPC, not direct
```

#### Protocol

JSON-RPC over Unix domain socket at `/tmp/flightdeck-agents-{pid}.sock`:

```json
// Server → Daemon: spawn an agent
{"jsonrpc": "2.0", "method": "spawn", "params": {"role": "developer", "cliArgs": ["--model", "claude-opus-4.6"], "cwd": "/path/to/repo"}, "id": 1}

// Daemon → Server: agent event stream
{"jsonrpc": "2.0", "method": "event", "params": {"agentId": "abc123", "type": "text", "data": "Hello, I'm analyzing..."}}

// Server → Daemon: send prompt
{"jsonrpc": "2.0", "method": "prompt", "params": {"agentId": "abc123", "content": "Your task is..."}, "id": 2}
```

#### Dev Workflow

```bash
npm run dev
# 1. Starts agent-host daemon (if not already running)
# 2. Starts API server with tsx watch
# 3. Server connects to daemon via Unix socket
# 4. On file change: only the API server restarts
# 5. Server reconnects to daemon — agents are untouched
```

The `scripts/dev.mjs` launcher would be extended to:
1. Check if daemon is running (attempt socket connection)
2. Start daemon if needed
3. Start API server with `tsx watch`
4. On shutdown: leave daemon running (agents stay alive)

#### Migration Path

1. Extract `AcpConnection` into the daemon (it already has a clean boundary)
2. Create `AgentHostClient` that mirrors `AcpConnection`'s event interface
3. Modify `AgentAcpBridge.startAcp()` to use the client instead of direct spawn
4. All other code (AgentManager, CommandDispatcher, etc.) sees the same interface

---

## Decision Matrix

| Criterion | Daemon (1) | HMR (2) | Resume (3) | Worker (4) | FIFO (5) | Hybrid (6) |
|-----------|:-:|:-:|:-:|:-:|:-:|:-:|
| Agent survival | ✅ Full | ⚠️ Partial | ❌ Restart | ✅ Full | ✅ Full | ⚠️→✅ |
| Implementation effort | 🔴 High | 🟡 Med | 🟢 Low | 🔴 High | 🟡 Med | 🟢→🔴 |
| Maintenance burden | 🟢 Low | 🔴 High | 🟢 Low | 🟡 Med | 🟡 Med | 🟢 Low |
| Risk of subtle bugs | 🟢 Low | 🔴 High | 🟢 Low | 🟡 Med | 🟡 Med | 🟢 Low |
| Ships quickly | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ (Phase 1) |
| Correct long-term | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ (Phase 2) |

---

## Cross-Project Insights

- **Symphony (Elixir/OTP):** OTP supervision trees provide exactly the daemon pattern. `Task.Supervisor` manages agent worker processes independently of the `Orchestrator` GenServer. If the Orchestrator crashes, the supervisor restarts it while agents continue. Flightdeck's daemon would serve the same role as `Task.Supervisor`.

- **Edict:** Separate Orchestrator and Dispatch worker processes communicating via Redis Streams. If the orchestrator crashes, unacknowledged events are preserved in Redis for recovery. Flightdeck's SQLite persistence serves the same recovery role.

- **Key insight:** Every system that handles agent process management well separates the "agent lifecycle" concern from the "business logic" concern into different processes. Symphony does it with OTP, Edict with worker processes. Flightdeck currently conflates both in a single Node.js process.
