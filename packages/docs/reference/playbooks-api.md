# Playbooks, Roles & Onboarding API

API endpoints for playbook management, custom roles, community playbooks, and onboarding progression.

---

## Playbooks

### `GET /api/playbooks`

**Description**: List all local playbooks.

**Response**:
```json
[
  {
    "id": "pb-1",
    "name": "Feature Build",
    "description": "Full team for building new features",
    "roles": ["lead", "developer", "developer", "architect", "code-reviewer"],
    "tasks": ["Implement the feature as described"],
    "config": { "trustLevel": "balanced", "budget": 10 },
    "builtin": true
  }
]
```

---

### `POST /api/playbooks`

**Description**: Create a new playbook.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | yes | Playbook name |
| `description` | string | no | What this playbook does |
| `roles` | string[] | yes | Role IDs to spawn |
| `tasks` | string[] | no | Starter task descriptions |
| `config` | object | no | Session configuration overrides |

---

### `DELETE /api/playbooks/:id`

**Description**: Delete a custom playbook. Built-in playbooks cannot be deleted.

### `POST /api/playbooks/:id/duplicate`

**Description**: Duplicate a playbook for customization.

---

## Community Playbooks

### `GET /api/playbooks/community`

**Description**: Browse community-shared playbooks.

**Query Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `search` | string | no | Search keyword |
| `category` | string | no | Filter by category |
| `sort` | string | no | Sort by: `stars`, `downloads`, `recent` |

**Response**:
```json
[
  {
    "id": "cpb-1",
    "name": "Full-Stack Sprint",
    "author": "jane_dev",
    "description": "End-to-end feature delivery with testing",
    "category": "development",
    "stars": 4.5,
    "downloads": 128,
    "tags": ["full-stack", "testing", "ci"],
    "featured": true
  }
]
```

---

### `GET /api/playbooks/community/:id`

**Description**: Get full details of a community playbook.

### `POST /api/playbooks/community`

**Description**: Publish a local playbook to the community.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `playbookId` | string | yes | Local playbook ID to publish |
| `category` | string | yes | Community category |
| `tags` | string[] | no | Search tags |

> [!WARNING]
> Privacy guardrails automatically strip system prompts, secrets, and machine-specific paths.

---

### `GET /api/playbooks/community/:id/reviews`

**Description**: Get reviews for a community playbook.

### `POST /api/playbooks/community/:id/reviews`

**Description**: Submit a review.

**Request Body**:
```json
{ "stars": 5, "comment": "Great for bootstrapping full-stack projects" }
```

---

### `POST /api/playbooks/community/:id/fork`

**Description**: Fork a community playbook to your local collection.

**Response**:
```json
{ "localPlaybookId": "pb-7", "forkedFrom": "cpb-1" }
```

---

## Custom Roles

### `GET /api/roles`

**Description**: List all roles (built-in + custom).

**Response**:
```json
[
  {
    "id": "developer",
    "name": "Developer",
    "icon": "💻",
    "color": "#3b82f6",
    "model": "claude-sonnet-4-6",
    "builtin": true
  },
  {
    "id": "custom-ml-engineer",
    "name": "ML Engineer",
    "icon": "🤖",
    "color": "#8b5cf6",
    "model": "claude-opus-4-6",
    "prompt": "You are an ML engineer specializing in...",
    "builtin": false
  }
]
```

---

### `POST /api/roles`

**Description**: Create a custom role.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | yes | Role display name |
| `icon` | string | yes | Emoji icon |
| `color` | string | no | Hex color code |
| `model` | string | no | Default model ID |
| `prompt` | string | yes | System prompt defining behavior |
| `category` | string | no | Template category |

---

### `PUT /api/roles/:id`

**Description**: Update a custom role. Built-in roles cannot be modified.

### `DELETE /api/roles/:id`

**Description**: Delete a custom role. Built-in roles cannot be deleted.

---

### `POST /api/roles/test`

**Description**: Test a role configuration with a sample task.

**Request Body**:
```json
{
  "role": { "name": "ML Engineer", "prompt": "You are an ML engineer...", "model": "claude-sonnet-4-6" },
  "sampleTask": "Evaluate the model accuracy metrics"
}
```

**Response**:
```json
{
  "response": "I'll analyze the model accuracy metrics...",
  "tokensUsed": 450
}
```

---

## Onboarding

### `GET /api/onboarding/status`

**Description**: Get the current user's onboarding progress and mastery tier.

**Response**:
```json
{
  "tier": 2,
  "tierName": "Explorer",
  "progress": {
    "firstSession": true,
    "agentInteractions": 5,
    "playbookCreated": false,
    "batchApprovalUsed": true,
    "customRoleCreated": false,
    "playbookPublished": false
  },
  "tourCompleted": true,
  "coachTipsSeen": ["first-approval", "budget-warning"]
}
```

**Tiers**: `1` (Beginner), `2` (Explorer), `3` (Operator), `4` (Power User)

---

### `POST /api/onboarding/progress`

**Description**: Record an onboarding milestone event.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `event` | string | yes | Milestone event name |

**Events**: `first-session`, `agent-interaction`, `batch-approval`, `playbook-created`, `custom-role`, `playbook-published`, `tour-completed`, `coach-tip-seen`
