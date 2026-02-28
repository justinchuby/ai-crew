# WebSocket Events

The server broadcasts real-time events over a WebSocket connection at `ws://localhost:3001`.

## Connection

```javascript
const ws = new WebSocket('ws://localhost:3001')
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log(data.type, data.payload)
}
```

## Event Types

All events follow the shape `{ type: string, payload: object }`.

### Agent Lifecycle

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:spawned` | Agent JSON | New agent created |
| `agent:killed` | `string` (agent ID) | Agent stopped by user |
| `agent:exit` | `{ agentId, code }` | Agent process exited |
| `agent:status` | `{ agentId, status }` | Status changed (running, idle, etc.) |
| `agent:crashed` | `{ agentId, code }` | Agent exited unexpectedly |
| `agent:auto_restarted` | `{ agentId, previousAgentId, crashCount }` | Agent auto-restarted after crash |
| `agent:restart_limit` | `{ agentId }` | Max restarts reached |
| `agent:restarted` | `{ oldId, newAgent }` | Agent manually restarted |

### Agent Output

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:text` | `{ agentId, text }` | Text output from agent |
| `agent:content` | `{ agentId, content }` | Structured content output |
| `agent:tool_call` | `{ agentId, toolCall }` | Agent invoked a tool |
| `agent:plan` | `{ agentId, plan }` | Agent plan updated |
| `agent:permission_request` | `{ agentId, request }` | Agent requesting tool permission |
| `agent:session_ready` | `{ agentId, sessionId }` | ACP session established |

### Communication

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:message_sent` | `{ from, fromRole, to, toRole, content }` | Inter-agent message |
| `agent:sub_spawned` | `{ parentId, child }` | Lead created a sub-agent |
| `agent:spawn_error` | `{ agentId, message }` | Failed to create agent |
| `agent:delegated` | `{ parentId, childId, delegation }` | Task delegated |
| `agent:delegate_error` | `{ agentId, message }` | Delegation failed |
| `agent:completion_reported` | `{ childId, parentId, status }` | Agent reported task complete |

### Context & Health

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:context_compacted` | `{ agentId, previousUsed, currentUsed, percentDrop }` | Context window compacted |
| `agent:hung` | `{ agentId, elapsedMs }` | Agent appears unresponsive |
| `agent:hung_killed` | `{ agentId }` | Hung agent was killed |

### Lead-Specific

| Event | Payload | Description |
|-------|---------|-------------|
| `lead:decision` | `{ id, agentId, agentRole, leadId, title, rationale, needsConfirmation, status }` | Decision recorded |
| `lead:progress` | `Record<string, any>` | Progress update |
| `lead:stalled` | `{ leadId, nudgeCount, idleDuration }` | Lead appears stalled |

### Coordination

| Event | Payload | Description |
|-------|---------|-------------|
| `dag:updated` | `{ leadId }` | Task DAG changed |
| `group:created` | `{ group, leadId }` | Group chat created |
| `group:message` | `{ message, groupName, leadId }` | Message in group chat |
