# Multiproject Isolation

How Flightdeck isolates agents across projects while keeping the UI fully visible.

> [!TIP] TL;DR
> Agents can only see and message other agents in the same project. The browser dashboard sees everything. File locks are global (shared filesystem), but their visibility is project-scoped.

## Isolation Model

| Layer | Agents | Browser UI |
|-------|--------|------------|
| Commands (AGENT_MESSAGE, DIRECT_MESSAGE, QUERY_CREW, INTERRUPT) | **Project-scoped** — cross-project rejected | N/A |
| WebSocket events | Filtered by `subscribe-project` | **Full visibility** — init sends all agents/locks |
| REST API routes | Filtered by `?projectId=` | **Full visibility** — omit param to see all |
| File locks, activity log, collective memory | Stored with `projectId` column | Queryable across projects |

**Key principle:** Isolation is for agents. The human user sees everything.

## How It Works

### Agent-to-Agent Commands

When an agent sends a command that targets another agent (AGENT_MESSAGE, DIRECT_MESSAGE, INTERRUPT), the system checks whether both agents belong to the same project. If not, the command is rejected with an error:

```
Agent not found in current project
```

QUERY_CREW returns only agents from the requesting agent's project — agents in other projects are invisible.

BROADCAST is naturally project-scoped because it sends only to agents under the same lead.

### Sub-Agent Inheritance

When a lead spawns a sub-agent via CREATE_AGENT, the new agent automatically inherits the lead's `projectId`. This ensures all agents in a delegation hierarchy belong to the same project without manual assignment.

### WebSocket

On initial connection, the WebSocket sends **all** agents, locks, and state to the client. This is intentional — the browser dashboard needs full cross-project visibility.

For agent-side filtering, clients can send a `subscribe-project` message:

```json
{ "type": "subscribe-project", "projectId": "project-123" }
```

After subscribing, the client only receives events for agents in that project. Unsubscribed clients (like the browser) continue to receive everything.

### REST API Routes

All data routes support an optional `?projectId=` query parameter:

- `GET /api/agents?projectId=...` — returns only agents in that project
- `GET /api/coordination/locks?projectId=...` — returns only locks from that project
- `GET /api/coordination/summary?projectId=...` — scoped coordination summary
- `GET /api/decisions?projectId=...` — scoped decision log

When `projectId` is omitted, all data is returned (backward compatible, UI default).

### File Locks

File locks are **intentionally global** for conflict detection. Two agents in different projects editing the same file on a shared filesystem would still conflict. The lock system prevents this.

However, lock **visibility** is project-scoped: `GET /api/coordination/locks?projectId=...` returns only locks held by agents in that project.

### Supporting Systems

These systems store a `projectId` column for scoping:

| System | Column | Purpose |
|--------|--------|---------|
| `file_locks` table | `project_id` | Track which project owns each lock |
| `activity_log` table | `project_id` | Filter activity by project |
| `collective_memory` table | `project_id` | Per-project shared memory |

Concurrency limits (`getRunningCountByProject()`) are per-project, so one project's agent count doesn't block another.

## Database Migration

Migration `0016_project_isolation_supporting.sql` adds `project_id TEXT DEFAULT ''` to:
- `file_locks`
- `activity_log`
- `collective_memory`

Existing rows get an empty string default, preserving backward compatibility for single-project setups.

## Implementation

The core methods live in `AgentManager`:

| Method | Purpose |
|--------|---------|
| `getByProject(projectId)` | Returns agents belonging to a specific project |
| `getProjectIdForAgent(agentId)` | Resolves an agent's project membership |
| `getRunningCountByProject(projectId)` | Per-project concurrency count |

`getProjectIdForAgent` is available on `CommandHandlerContext`, so all command handlers can check project boundaries.
