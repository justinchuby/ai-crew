# Natural Language Commands API

API endpoints for the NL crew control system. These endpoints power the natural language command interface inside the ⌘K Command Palette.

---

## `GET /api/nl/commands`

**Description**: Returns all available NL commands grouped by category.

**Response**:
```json
[
  {
    "id": "nl-pause-agent",
    "category": "control",
    "patterns": ["pause {agent}", "stop {agent}", "hold {agent}"],
    "description": "Pause a specific agent",
    "destructive": false,
    "parameters": [{ "name": "agent", "type": "agent-selector", "required": true }]
  }
]
```

**Categories**: `control` (12 commands), `query` (10), `navigate` (5), `create` (3)

---

## `POST /api/nl/preview`

**Description**: Preview what a command will do before executing it. Required for destructive commands.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `input` | string | yes | Raw natural language input |
| `context` | object | no | Current UI context (active page, selected agent) |

**Response**:
```json
{
  "matched": true,
  "commandId": "nl-pause-all",
  "confidence": 0.95,
  "preview": {
    "description": "Pause all 5 running agents",
    "affectedAgents": ["dev-1", "arch-1", "rev-1", "qa-1", "dev-2"],
    "destructive": true,
    "reversible": true
  }
}
```

**No match response**:
```json
{
  "matched": false,
  "suggestions": ["Did you mean: pause all agents?"]
}
```

---

## `POST /api/nl/execute`

**Description**: Execute a matched NL command.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `commandId` | string | yes | Command ID from preview response |
| `parameters` | object | no | Resolved parameter values |

**Response**:
```json
{
  "success": true,
  "result": "Paused 5 agents",
  "undoId": "undo-abc123",
  "undoExpiresAt": "2024-01-15T10:05:00Z"
}
```

**Errors**: `400` invalid command · `404` command not found · `409` command cannot execute in current state

---

## `POST /api/nl/undo`

**Description**: Undo the last executed NL command. Undo expires after 5 minutes.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `undoId` | string | yes | Undo ID from execute response |

**Response**:
```json
{
  "success": true,
  "result": "Resumed 5 agents (undo of pause)"
}
```

**Errors**: `404` undo not found · `410` undo expired (5-minute TTL)

---

## `GET /api/nl/suggestions`

**Description**: Get context-aware command suggestions based on current crew state.

**Query Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `context` | string | no | Current page/view context |

**Response**:
```json
[
  {
    "commandId": "nl-review-approvals",
    "reason": "3 pending approvals",
    "priority": "high"
  },
  {
    "commandId": "nl-restart-agent",
    "reason": "Developer approaching context limit",
    "priority": "medium",
    "parameters": { "agentId": "dev-1" }
  }
]
```
