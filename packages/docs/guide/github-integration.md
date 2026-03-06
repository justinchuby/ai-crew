# GitHub Integration

Connect Flightdeck to GitHub for PR creation, CI monitoring, and commit tracking. When not connected, GitHub features gracefully degrade — they simply don't appear in the UI.

## Setup

### Connecting to GitHub

1. Go to Settings → GitHub
2. Enter a GitHub Personal Access Token (PAT) with `repo` scope
3. Click Connect — the system auto-detects your repository
4. Connection status shows in the Settings panel and Pulse strip

```
POST /api/github/connect → { token: "ghp_..." }
GET /api/github/status → { connected: true, repo: "owner/repo", user: "username" }
```

> [!TIP]
> Use a fine-grained PAT scoped to the specific repository for better security.

### Testing Connection

```
POST /api/github/test → { ok: true, rateLimit: { remaining: 4999 } }
```

## Pull Requests

### Creating PRs

Flightdeck can create GitHub PRs with auto-generated descriptions:

1. Open the PR creation flow from the GitHub panel
2. Review the auto-generated description (includes session stats, commit list, agent attribution)
3. Optionally edit the title and description
4. Submit — PRs are created as **drafts** by default for safety

Auto-generated PR descriptions include:
- Session summary
- Commit list with agent attribution
- Files changed summary
- Task completion status

```
POST /api/github/pulls → { title, body, base, head, draft }
```

### Marking PRs Ready

Convert a draft PR to ready for review:

```
POST /api/github/pulls/:number/ready
```

## CI Status Panel

When a PR is open, the CI Status panel shows:
- Each CI check with status (pending, passing, failing)
- Check name and duration
- Auto-refreshes every 30 seconds while checks are running

## Commit → Task Linking

Commits are automatically linked to DAG tasks via commit message parsing. The timeline shows:
- Which commits belong to which tasks
- Agent attribution per commit
- Timeline pins at commit timestamps

```
GET /api/commits → [{ sha, message, agentId, taskId, timestamp }]
GET /api/commits/by-task/:taskId → [{ sha, message, ... }]
```

## UI Integration

### Pulse PR Indicator
Shows PR count and status in the Pulse strip (green = all passing, amber = pending, red = failing).

### Canvas Commit Counts
Agent nodes on the Canvas display commit count badges.

### Mission Control Panel
The GitHub panel in Mission Control shows PR status and recent commits.

---

# Conflict Detection

Flightdeck monitors agents for potential file conflicts in real-time, with four graduated detection levels.

## Detection Levels

| Level | Severity | Description |
|-------|----------|-------------|
| Same directory | Low | Two agents working in the same directory |
| Import overlap | Medium | Agents modifying files that import each other |
| Lock contention | High | Agent requesting a file already locked by another |
| Branch divergence | Critical | Agents working on diverged branches |

## How It Works

The Conflict Detection Engine scans every 15 seconds:
1. Compares agent file locks and recent changes
2. Analyzes import graphs for overlap (scoped to JS/TS files)
3. Checks for lock contention
4. Monitors branch status

## Resolution Options

When a conflict is detected, the Conflict Detail panel (slide-over) offers 4 resolution strategies:

| Option | Description |
|--------|-------------|
| Sequence work | Pause one agent until the other finishes |
| Split file | Divide the contested file so each agent owns a section |
| Proceed with risk | Acknowledge the conflict and continue (manual merge later) |
| Dismiss | Mark as false positive |

## Auto-Resolution

For crews running at the Autonomous trust level, auto-resolution can be enabled. The system will automatically apply the "Sequence work" strategy for lock contention conflicts.

> [!WARNING]
> Auto-resolution is only available at the Autonomous trust level. At lower trust levels, all conflicts require manual resolution.

## UI Integration

### Conflict Banner
Appears at the top of affected views when active conflicts exist.

### Canvas Edges
- Amber dashed lines between agents with potential conflicts
- Red dashed lines with ⚠ icon for active conflicts

### Pulse Indicator
Shows conflict count in the Pulse strip with severity coloring.

### Settings
Configure detection in Settings → Conflict Detection:
- Enable/disable detection
- Set scan interval
- Choose which detection levels to monitor
- Configure auto-resolution (Autonomous trust level only)

## Workflow Integration

Conflict events can trigger Workflow Automation rules:
- "When conflict detected, send notification"
- "When lock contention detected, automatically sequence work"

## Conflict Detection

Flightdeck's conflict detection system identifies potential file conflicts between agents in real-time, based on file locks, task descriptions, and import overlap analysis.
