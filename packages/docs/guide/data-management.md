# Data Management

Flightdeck stores all session data in a local SQLite database. Over time, this database grows with historical sessions, events, messages, and task records. The Data Management feature lets you monitor database health and purge old data when needed.

## Database Statistics

The Settings page shows real-time database statistics:

- **Database Size** — Total file size including WAL journal
- **Total Records** — Sum across all tables
- **Oldest Session** — Date of the earliest recorded session
- **Table Breakdown** — Per-table record counts (expandable)

Key tables tracked: projects, project_sessions, activity_log, dag_tasks, chat_groups, chat_group_messages, conversations, messages, agent_memory, decisions, collective_memory.

## Purging Old Data

To clean up old data:

1. Open **Settings** → scroll to **Data Management**
2. Select a retention period (7 days, 30 days, 90 days, or 1 year)
3. Click **Preview** to see exactly what would be deleted (dry-run mode)
4. Review the deletion counts per table
5. Click **Permanently Delete** to execute

### Safety Features

- **Dry-run preview** — Always shows exact counts before deleting
- **Active session protection** — Only completed sessions are eligible for deletion
- **Transactional cleanup** — All deletions happen in a single database transaction
- **Cascade cleanup** — Removes associated events, tasks, chat messages, and conversations
- **Orphan cleanup** — Projects with zero remaining sessions are automatically removed

## API Endpoints

### `GET /api/data/stats`

Returns database statistics.

**Response:**
```json
{
  "fileSizeBytes": 5832256,
  "tableCounts": {
    "projects": 3,
    "project_sessions": 9,
    "activity_log": 2050,
    "dag_tasks": 29,
    ...
  },
  "totalRecords": 2972,
  "oldestSession": "2025-01-15T10:30:00Z"
}
```

### `POST /api/data/cleanup`

Purge old session data.

**Request Body:**
```json
{
  "olderThanDays": 30,
  "dryRun": true
}
```

**Response:**
```json
{
  "deleted": {
    "project_sessions": 2,
    "activity_log": 40,
    "dag_tasks": 8,
    "projects": 1
  },
  "totalDeleted": 51,
  "sessionsDeleted": 2,
  "dryRun": true,
  "cutoffDate": "2025-02-01T00:00:00.000Z"
}
```

Set `dryRun: false` to actually execute the deletion.
