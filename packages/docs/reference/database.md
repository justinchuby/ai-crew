# Database Schema

AI Crew uses SQLite with [Drizzle ORM](https://orm.drizzle.team/). Schema is defined in `packages/server/src/db/schema.ts` with numbered migrations in `packages/server/drizzle/`.

## SQLite Configuration

```sql
PRAGMA journal_mode = WAL
PRAGMA synchronous = NORMAL
PRAGMA busy_timeout = 5000
PRAGMA cache_size = -64000
PRAGMA foreign_keys = ON
PRAGMA wal_checkpoint(PASSIVE)
```

## Tables

### conversations

Stores lead/project sessions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Unique conversation ID |
| `project_name` | TEXT | Project display name |
| `model` | TEXT | AI model used |
| `working_directory` | TEXT | Project working directory |
| `status` | TEXT | active, completed, etc. |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### messages

Chat messages within conversations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `conversation_id` | TEXT FK | → conversations.id |
| `role` | TEXT | user, assistant, system |
| `content` | TEXT | Message content |
| `created_at` | TEXT | ISO timestamp |

### roles

Custom role definitions (built-in roles are in code).

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Role identifier |
| `name` | TEXT | Display name |
| `icon` | TEXT | Emoji icon |
| `color` | TEXT | Hex color |
| `system_prompt` | TEXT | System prompt template |
| `default_model` | TEXT | Default AI model |

### settings

Key-value configuration store.

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PK | Setting key |
| `value` | TEXT | JSON-encoded value |

### file_locks

Active file locks for coordination.

| Column | Type | Description |
|--------|------|-------------|
| `file_path` | TEXT PK | Locked file path |
| `agent_id` | TEXT | Agent holding the lock |
| `acquired_at` | TEXT | ISO timestamp |

### activity_log

Batched activity entries for the real-time feed.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `agent_id` | TEXT | Agent that performed the action |
| `action` | TEXT | Action type |
| `detail` | TEXT | Action details |
| `created_at` | TEXT | ISO timestamp |

### decisions

Architectural decisions with optional user confirmation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `agent_id` | TEXT | Agent that made the decision |
| `agent_role` | TEXT | Agent's role |
| `lead_id` | TEXT | Associated lead/project |
| `title` | TEXT | Decision title |
| `rationale` | TEXT | Why this decision |
| `alternatives` | TEXT | JSON array of alternatives |
| `impact` | TEXT | Impact level |
| `needs_confirmation` | INTEGER | Requires user review (0/1) |
| `status` | TEXT | pending, confirmed, rejected |
| `created_at` | TEXT | ISO timestamp |

### agent_memory

Key-value store for agent knowledge persistence.

| Column | Type | Description |
|--------|------|-------------|
| `agent_id` | TEXT | Composite PK |
| `key` | TEXT | Composite PK |
| `value` | TEXT | Stored value |
| `created_at` | TEXT | ISO timestamp |

### chat_groups / chat_group_members / chat_group_messages

Group chat support.

| Table | Key Columns |
|-------|-------------|
| `chat_groups` | id, name, lead_id, created_at |
| `chat_group_members` | group_id, agent_id (composite PK) |
| `chat_group_messages` | id, group_id, agent_id, agent_role, content, created_at |

### dag_tasks

Task DAG nodes with dependencies.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Composite PK with lead_id |
| `lead_id` | TEXT | Composite PK |
| `title` | TEXT | Task title |
| `description` | TEXT | Task details |
| `status` | TEXT | pending, in_progress, done, blocked |
| `assigned_agent` | TEXT | Agent assigned to this task |
| `dependencies` | TEXT | JSON array of dependency IDs |
| `files` | TEXT | JSON array of related files |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### agent_plans

Persisted agent plan entries.

| Column | Type | Description |
|--------|------|-------------|
| `agent_id` | TEXT | Composite PK |
| `plan_index` | INTEGER | Composite PK (order) |
| `title` | TEXT | Plan step title |
| `status` | TEXT | Plan step status |
| `updated_at` | TEXT | ISO timestamp |
