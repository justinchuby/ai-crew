# GitHub & Conflicts API

API endpoints for GitHub integration and conflict detection.

---

## GitHub Connection

### `GET /api/github/status`

**Description**: Returns current GitHub connection status.

**Response**:
```json
{
  "connected": true,
  "repo": "owner/repo",
  "user": "username",
  "rateLimit": { "remaining": 4985, "reset": "2024-01-15T11:00:00Z" }
}
```

---

### `POST /api/github/connect`

**Description**: Connect to GitHub with a Personal Access Token.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token` | string | yes | GitHub PAT with `repo` scope |

**Response**:
```json
{ "connected": true, "repo": "owner/repo", "user": "username" }
```

**Errors**: `401` invalid token · `403` insufficient scopes

---

### `POST /api/github/disconnect`

**Description**: Disconnect from GitHub and clear stored token.

### `POST /api/github/test`

**Description**: Test the current GitHub connection.

**Response**:
```json
{ "ok": true, "rateLimit": { "remaining": 4999 } }
```

---

## Pull Requests

### `GET /api/github/pulls`

**Description**: List pull requests for the connected repository.

**Response**:
```json
[
  {
    "number": 42,
    "title": "feat: add prediction engine",
    "state": "open",
    "draft": true,
    "url": "https://github.com/owner/repo/pull/42",
    "checks": { "total": 3, "passing": 2, "failing": 0, "pending": 1 },
    "createdAt": "2024-01-15T10:00:00Z"
  }
]
```

---

### `POST /api/github/pulls`

**Description**: Create a new pull request. Defaults to draft for safety.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | string | yes | PR title |
| `body` | string | no | PR description (auto-generated if omitted) |
| `base` | string | no | Base branch (default: repo default branch) |
| `head` | string | no | Head branch (default: current branch) |
| `draft` | boolean | no | Create as draft (default: true) |

---

### `POST /api/github/pulls/:number/ready`

**Description**: Convert a draft PR to ready for review.

---

## Commits

### `GET /api/commits`

**Description**: List commits with agent and task attribution.

**Response**:
```json
[
  {
    "sha": "abc1234",
    "message": "feat: add prediction engine",
    "agentId": "dev-1",
    "agentRole": "Developer",
    "taskId": "task-5",
    "timestamp": "2024-01-15T10:30:00Z"
  }
]
```

---

### `GET /api/commits/by-task/:taskId`

**Description**: Get all commits linked to a specific DAG task.

---

## Conflict Detection

### `GET /api/conflicts`

**Description**: Returns all active conflict alerts.

**Response**:
```json
[
  {
    "id": "conf-1",
    "level": "lock-contention",
    "agents": ["dev-1", "dev-2"],
    "files": ["src/components/App.tsx"],
    "detectedAt": "2024-01-15T10:30:00Z",
    "status": "active"
  }
]
```

**Conflict levels**: `same-directory`, `import-overlap`, `lock-contention`, `branch-divergence`

---

### `POST /api/conflicts/:id/resolve`

**Description**: Resolve a conflict with a chosen strategy.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `strategy` | string | yes | Resolution strategy |

**Strategies**: `sequence-work`, `split-file`, `proceed-with-risk`, `dismiss`

---

### `POST /api/conflicts/:id/dismiss`

**Description**: Dismiss a conflict as a false positive.

---

### `GET /api/conflicts/config`

**Description**: Returns conflict detection configuration.

### `PUT /api/conflicts/config`

**Description**: Update conflict detection configuration.

**Request Body**:
```json
{
  "enabled": true,
  "scanIntervalSeconds": 15,
  "levels": {
    "same-directory": true,
    "import-overlap": true,
    "lock-contention": true,
    "branch-divergence": true
  },
  "autoResolve": false
}
```
