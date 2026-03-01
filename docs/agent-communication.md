# Agent Communication Strategy

## Overview

AI Crew supports two layers of communication with Copilot CLI agents:

1. **Agent Client Protocol (ACP)** — Structured JSON-RPC messaging for agent lifecycle, text streaming, tool calls, plans, and permissions.
2. **MCP (Model Context Protocol)** — Crew coordination tools (team management, messaging, task DAG, file locks, etc.) exposed as MCP tools that agents call natively.

ACP handles the transport layer; MCP provides the crew command interface.

## ACP Mode (Default)

Each agent spawns a Copilot CLI process with `copilot --acp --stdio`. Communication uses [JSON-RPC 2.0](https://www.jsonrpc.org/specification) over NDJSON streams via the [`@agentclientprotocol/sdk`](https://www.npmjs.com/package/@agentclientprotocol/sdk).

### Connection Lifecycle

```
Client (AI Crew)              Agent (Copilot CLI)
     │                              │
     │── spawn copilot --acp ──────>│
     │                              │
     │── initialize ───────────────>│
     │<──────────── capabilities ───│
     │                              │
     │── session/new ──────────────>│  (includes mcpServers config)
     │<──────────── sessionId ──────│
     │                              │
     │── session/prompt ───────────>│  (user or role prompt)
     │<── session/update (text) ────│  (streamed chunks)
     │<── session/update (tool) ────│  (tool call status — includes MCP crew_* tools)
     │<── session/update (plan) ────│  (agent's plan)
     │                              │
     │<── request_permission ───────│  (needs approval)
     │── permission response ──────>│
     │                              │
     │<──────── prompt result ──────│  (stopReason: end_turn)
     │                              │
     │── session/prompt ───────────>│  (next user message)
     └──────────────────────────────┘
```

## MCP Crew Tools

All inter-agent commands are exposed as MCP tools with the `crew_` prefix. Agents discover these tools automatically via the MCP server configured in `newSession({ mcpServers })`.

### Architecture

```
Agent (Copilot CLI)  ──MCP tool call──>  AI Crew MCP Server (SSE)
                                              │
                                         CommandHandlers
                                        (same as before)
```

- Each agent connects to a per-agent MCP SSE endpoint: `GET /mcp/:agentId/sse`
- Tool calls arrive as structured JSON-RPC with validated schemas (Zod)
- The MCP server dispatches to existing command handler modules
- Tool results are returned as structured text (vs. fire-and-forget with the old `[[[` syntax)

### Available Tools

**Team Management (lead/architect only):**

| Tool | Description | Key Params |
|------|-------------|------------|
| `crew_create_agent` | Spawn a new agent with a specific role | role, task?, model?, context? |
| `crew_delegate` | Assign a task to an existing child agent | to, task, context? |
| `crew_terminate_agent` | Terminate an agent and free its slot | id, reason? |
| `crew_cancel_delegation` | Cancel an active delegation | agentId?, delegationId? |

**Communication (all agents):**

| Tool | Description | Key Params |
|------|-------------|------------|
| `crew_agent_message` | Send a direct message to another agent | to, content |
| `crew_broadcast` | Send a message to all active agents | content |
| `crew_direct_message` | Peer-to-peer message (no routing via lead) | to, content |
| `crew_create_group` | Create a named chat group | name, members?, roles? |
| `crew_group_message` | Send a message to a group | group, content |
| `crew_add_to_group` | Add agents to a group | group, members |
| `crew_remove_from_group` | Remove agents from a group | group, members |
| `crew_query_groups` | List groups the agent belongs to | (none) |
| `crew_query_peers` | List peer agents | (none) |

**Task & Progress (lead-only unless noted):**

| Tool | Description | Key Params |
|------|-------------|------------|
| `crew_declare_tasks` | Create a task DAG with dependencies | tasks[] |
| `crew_progress` | Report progress (auto-reads DAG state) | summary |
| `crew_complete_task` | Signal task completion *(any agent)* | summary |
| `crew_decision` | Log an architectural decision | title, rationale, needsConfirmation? |
| `crew_query_tasks` | Query current task DAG status | (none) |
| `crew_add_task` | Add a task to existing DAG | id, title, depends_on?, role? |
| `crew_cancel_task` | Cancel a DAG task | id |
| `crew_pause_task` | Pause a task | id |
| `crew_retry_task` | Retry a failed task | id |
| `crew_skip_task` | Skip a task | id |
| `crew_reset_dag` | Clear the entire DAG | (none) |

**Coordination (all agents):**

| Tool | Description | Key Params |
|------|-------------|------------|
| `crew_lock_file` | Acquire a file lock | filePath, reason? |
| `crew_unlock_file` | Release a file lock | filePath |
| `crew_commit` | Scoped git commit (locked files only) | message, files? |
| `crew_query_crew` | Get roster of all active agents | (none) |
| `crew_defer_issue` | Flag an issue for later | description, severity? |
| `crew_query_deferred` | List deferred issues | status? |
| `crew_resolve_deferred` | Resolve a deferred issue | id, dismiss? |

**Timers:**

| Tool | Description | Key Params |
|------|-------------|------------|
| `crew_set_timer` | Set a countdown timer | delay, label?, message? |
| `crew_cancel_timer` | Cancel a timer | id?, name? |
| `crew_list_timers` | List active timers | (none) |

**System:**

| Tool | Description | Key Params |
|------|-------------|------------|
| `crew_halt_heartbeat` | Stop heartbeat stall detection | (none) |
| `crew_request_limit_change` | Request agent concurrency change | limit, reason? |
| `crew_export_session` | Export session data | (none) |

### Advantages over Text-Embedded Commands

| Aspect | Old (`[[[` regex) | New (MCP tools) |
|--------|-------------------|-----------------|
| **Parsing** | Regex-based, edge cases (nested delimiters, incomplete buffers) | Structured JSON-RPC, schema-validated |
| **Return values** | Fire-and-forget (async ACK via sendMessage) | Synchronous result returned to agent |
| **Type safety** | Ad-hoc JSON.parse in each handler | Zod schemas validate inputs |
| **Discovery** | Agents must read documentation in system prompt | Agents discover tools via MCP protocol |
| **Error handling** | Parse errors silently dropped | Structured error responses |

### Session Updates

The ACP agent sends structured updates during processing:

| Update Type | Description | Data |
|-------------|-------------|------|
| `agent_message_chunk` | Text output from the LLM | `{ type: "text", text: "..." }` |
| `tool_call` | Agent invokes a tool | `{ toolCallId, title, kind, status }` |
| `tool_call_update` | Tool execution progress | `{ toolCallId, status, content? }` |
| `plan` | Agent reports its plan | `[{ content, priority, status }]` |

### Permission Gating

When an ACP agent wants to execute a tool (file write, terminal command, etc.), it sends a `request_permission` call. The system:

1. Forwards the request to the UI as a modal dialog
2. User can **Allow** or **Deny**
3. If no response within **60 seconds**: **auto-deny** (cancel) for non-autopilot agents, or **immediate approve** for autopilot agents
4. The "Always allow for this agent" option persists in localStorage

### Sending User Input

In ACP mode, each user message is sent as a `session/prompt` call. This starts a new prompt turn — the agent processes the message, potentially makes tool calls, and returns a `stopReason` when complete. This is fundamentally different from PTY mode where input is raw keystrokes.

## PTY Mode (Legacy Fallback)

Spawns Copilot CLI in a pseudo-terminal via `node-pty`. Raw terminal I/O — the system writes to stdin and reads from stdout. Used when:

- ACP is not supported by the CLI version
- User explicitly sets `AGENT_MODE=pty`
- Terminal-faithful rendering is needed

### Structured Commands in PTY Mode

Since PTY mode has no structured protocol, agents communicate intent via HTML comment patterns detected by regex in `AgentManager`:

```
<!-- CREATE_AGENT {"role": "developer", "model": "claude-opus-4.6", "task": "..."} -->
<!-- DELEGATE {"to": "agent-id", "task": "...", "context": "..."} -->
<!-- TERMINATE_AGENT {"id": "agent-id", "reason": "..."} -->
<!-- LOCK_REQUEST {"filePath": "src/auth.ts", "reason": "editing auth logic"} -->
<!-- LOCK_RELEASE {"filePath": "src/auth.ts"} -->
<!-- ACTIVITY {"actionType": "decision_made", "summary": "chose JWT over sessions"} -->
<!-- AGENT_MESSAGE {"to": "agent-id", "content": "please review my changes"} -->
<!-- BROADCAST {"content": "use factory pattern for all services"} -->
<!-- DECISION {"title": "Use JWT", "rationale": "stateless, scalable"} -->
<!-- PROGRESS {"summary": "2/4 done", "completed": [...], "in_progress": [...], "blocked": [...]} -->
<!-- QUERY_CREW -->
<!-- CREATE_GROUP {"name": "team-name", "members": ["id1"], "roles": ["developer"]} -->
<!-- GROUP_MESSAGE {"group": "team-name", "content": "..."} -->
<!-- QUERY_GROUPS -->
<!-- COMMIT {"message": "..."} -->
<!-- DEFER_ISSUE {"description": "...", "severity": "P2", "sourceFile": "..."} -->
<!-- QUERY_DEFERRED {"status": "open"} -->
<!-- RESOLVE_DEFERRED {"id": 42} -->
```

**Lead and Architect commands:** `CREATE_AGENT` (spawn new agent with role/model), `DELEGATE` (assign task to existing agent by ID), `TERMINATE_AGENT` (terminate agent and free slot), `DECISION`, `PROGRESS`.

> **Sub-lead delegation:** Architects can use `CREATE_AGENT` and `DELEGATE` in addition to leads. This enables architects to spin up helper agents for sub-tasks without routing everything through the lead.

**All agents:** `LOCK_REQUEST`, `LOCK_RELEASE`, `ACTIVITY`, `AGENT_MESSAGE`, `BROADCAST`, `QUERY_CREW`, `GROUP_MESSAGE`, `QUERY_GROUPS`, `COMMIT`, `COMPLETE_TASK`, `DEFER_ISSUE`, `QUERY_DEFERRED`, `RESOLVE_DEFERRED`.

These are parsed from agent output and routed to the appropriate subsystem (FileLockRegistry, ActivityLedger, AgentManager).

## @Mentions

The chat UI supports `@mention` autocomplete for targeting messages to specific agents:

1. **Trigger** — Typing `@` in the chat input opens an autocomplete dropdown showing active agents (by role and short ID)
2. **Selection** — Select an agent to insert `@{shortId}` into the message
3. **Delivery** — When the message is sent, @mentioned agents receive the message in parallel with the primary target
4. **Rendering** — Mentions are rendered as clickable badges in the message UI, with role-appropriate colors
5. **Markdown-aware** — The mention parser is integrated with the markdown renderer to avoid breaking formatting

## Scoped COMMIT

The `crew_commit` tool provides safe git operations for multi-agent workflows.

**How it works:**
1. Collects all files the agent currently holds locks on (via `crew_lock_file`)
2. Generates a `git add <file1> <file2> ...` command with only those specific files
3. Creates a commit with the provided message and co-authorship attribution
4. This prevents `git add -A` from accidentally staging other agents' uncommitted work

**Why this matters:** In multi-agent workflows, several agents may have uncommitted changes in the same repository. Without scoped commits, `git add -A` would stage *everyone's* changes into one agent's commit.

## Inter-Agent Messaging

The `MessageBus` provides a simple pub-sub channel for agent-to-agent communication:

```typescript
interface BusMessage {
  id: string;           // auto-generated
  from: string;         // sender agent ID
  to: string | '*';     // recipient or broadcast
  type: 'request' | 'response' | 'broadcast' | 'spawn_request';
  content: string;
  timestamp: string;    // ISO 8601
}
```

Messages are stored in a bounded history buffer (last 5,000 messages) and queryable by agent ID.

## Context Injection

Every agent receives awareness of the entire crew. This happens at two points:

### Initial Context (on spawn)

Before the role prompt, agents receive a `[CREW CONTEXT]` manifest. The format differs for leads vs specialists:

**Project Lead** sees its own agents with IDs, roles, and models:
```
[CREW CONTEXT]
You are agent abc12345 with role "Project Lead".

== YOUR ASSIGNMENT ==
- Task: Build the authentication system

== YOUR AGENTS ==
- def67890 — Developer [claude-opus-4.6] — running, task: Implement login endpoint
- ghi11111 — Code Reviewer [gemini-3-pro-preview] — idle
Use agent IDs above with DELEGATE to assign tasks, or AGENT_MESSAGE to communicate.

== COORDINATION RULES ==
...
[/CREW CONTEXT]
```

**Specialist agents** see peer agents with locked files:
```
[CREW CONTEXT]
You are agent def67890 with role "Developer".

== YOUR ASSIGNMENT ==
- Task: Implement login endpoint

== ACTIVE CREW MEMBERS ==
- Agent ghi11111 (Code Reviewer) — Status: idle, Files locked: none

== COORDINATION RULES ==
1. DO NOT modify files that another agent has locked.
2. Use crew_lock_file / crew_unlock_file to manage file locks.
3. Use crew_agent_message to communicate with other agents.
...
[/CREW CONTEXT]
```

### Event-Driven Refresh

The `ContextRefresher` pushes updated context (`CREW_UPDATE`) to all running agents when significant events occur (agent spawned/terminated/exited, file lock acquired/released). Updates are debounced at 2 seconds to batch rapid events.

The refresh includes current peer/agent status and the 20 most recent activity log entries.

## WebSocket Event Catalog

All events are broadcast to connected UI clients in real time:

### Agent Events
| Event | Payload | Description |
|-------|---------|-------------|
| `agent:data` | `{ agentId, data }` | Raw output (PTY mode) |
| `agent:spawned` | `{ agent }` | New agent created |
| `agent:terminated` | `{ agentId }` | Agent manually terminated |
| `agent:exit` | `{ agentId, code }` | Agent process exited |
| `agent:crashed` | `{ agentId, code }` | Non-zero exit detected |
| `agent:auto_restarted` | `{ agentId, previousAgentId }` | Automatic restart after crash |
| `agent:restart_limit` | `{ agentId }` | Max restarts exceeded |
| `agent:sub_spawned` | `{ parentId, child }` | Sub-agent created autonomously |
| `agent:hung` | `{ agentId, elapsedMs }` | No output for 5+ minutes |
| `agent:text` | `{ agentId, text }` | Structured text (ACP mode) |
| `agent:tool_call` | `{ agentId, toolCallId, ... }` | Tool invocation (ACP mode) |
| `agent:plan` | `{ agentId, entries[] }` | Agent plan update (ACP mode) |
| `agent:permission_request` | `{ agentId, ... }` | Tool permission needed |
| `agent:content` | `{ agentId, content }` | Rich content (image, audio, resource) |
| `agent:status` | `{ agentId, status }` | Agent status change |
| `agent:session_ready` | `{ agentId, sessionId }` | ACP session connected, session ID available |
| `agent:delegated` | `{ parentId, delegation }` | Work delegated to child agent |
| `agent:completion_reported` | `{ childId, parentId, status }` | Child agent finished work |
| `agent:message_sent` | `{ from, to, content }` | Inter-agent message |

### Lead Events
| Event | Payload | Description |
|-------|---------|-------------|
| `lead:decision` | `{ agentId, title, rationale, ... }` | Lead made a decision |
| `lead:progress` | `{ agentId, summary, completed, in_progress, blocked }` | Lead progress report |

### Task Events
| Event | Payload | Description |
|-------|---------|-------------|
| `task:updated` | `{ task }` | Task state changed |
| `task:removed` | `{ taskId }` | Task deleted |

### Coordination Events
| Event | Payload | Description |
|-------|---------|-------------|
| `lock:acquired` | `{ filePath, agentId, agentRole }` | File lock taken |
| `lock:released` | `{ filePath, agentId }` | File lock freed |
| `activity` | `{ entry }` | New activity logged |

### Group Chat Events
| Event | Payload | Description |
|-------|---------|-------------|
| `group:created` | `{ group, leadId }` | New group created |
| `group:message` | `{ message, groupName, leadId }` | Message sent in a group |
| `group:member_added` | `{ group, agentId, leadId }` | Member added to group |
| `group:member_removed` | `{ group, agentId, leadId }` | Member removed from group |
| `group:archived` | `{ group, leadId }` | Group auto-archived (all members terminated) |

### Client → Server Messages
| Message | Payload | Description |
|---------|---------|-------------|
| `subscribe` | `{ agentId }` | Subscribe to agent output (`*` for all) |
| `unsubscribe` | `{ agentId }` | Unsubscribe |
| `input` | `{ agentId, text }` | Send text to agent |
| `resize` | `{ agentId, cols, rows }` | Resize agent terminal |
| `permission_response` | `{ agentId, approved }` | Approve/deny tool call |
