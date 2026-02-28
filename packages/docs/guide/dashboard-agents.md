# Agents View

The Agents view provides a unified list of all agents with full management capabilities.

## Agent List

A table view showing all agents with:

| Column | Description |
|--------|-------------|
| Agent | Role icon, name (clickable → opens chat panel), sub-agent count |
| Status | Current lifecycle state with color indicator |
| Model | Dropdown selector to change the agent's AI model |
| Task | Current delegation or task description |
| Activity | What the agent is currently doing |
| Progress | Plan progress bar (e.g., "3/5 tasks") |
| Locks | Files currently locked by this agent |
| Uptime | How long the agent has been running |
| Actions | Terminal, restart, interrupt, stop buttons |

## Hierarchy

Child agents appear **indented** below their parent with tree connectors (`├─` / `└─`). This shows the delegation hierarchy at a glance.

## Agent Actions

| Action | Description |
|--------|-------------|
| 📟 Terminal | Open agent's terminal output |
| ↻ Restart | Restart a completed/failed agent |
| ✋ Interrupt | Cancel current work (ACP cancel) |
| ■ Stop | Kill the agent process (with confirmation) |

## Clicking an Agent

Clicking an agent's name opens the right-side **chat panel** where you can:
- View the agent's conversation history
- Send direct messages
- See the agent's current task and progress
