# Lead Dashboard

The Lead Dashboard is the primary view for interacting with your AI crew.

## Layout

### Main Area (Center)

- **Chat** with the Project Lead — send messages, view responses with rich markdown rendering
- **Agent Reports** — incoming messages from team members displayed in a dedicated section
- Two send modes:
  - **Queue** (Enter): Message is queued for delivery
  - **Interrupt** (button): Message interrupts the agent immediately

### Decisions Panel (Sidebar Top)

Always visible. Shows architectural decisions that need review:
- Pending decisions highlighted with a yellow indicator
- Confirm or reject decisions inline
- Decisions include title, rationale, alternatives, and impact

### Sidebar Tabs

Below the Decisions panel, a tabbed interface with **drag-to-reorder** support:

| Tab | Content |
|-----|---------|
| **Team** | Compact cards for each agent (role, status, task, model, chat button) |
| **Comms** | Inter-agent message history |
| **Groups** | Group chat conversations |
| **DAG** | Task dependency graph (ReactFlow) |
| **Activity** | Real-time activity feed |

Tab order is persisted to localStorage.

### Chat Side Panel (Right)

Click the 💬 button on any team member card to open a direct chat panel with that agent.

## Progress Tracking

The lead reports progress via the `PROGRESS` command. The dashboard shows:
- Overall progress bar
- Completed, in-progress, and blocked items
- Team roster with current assignments
