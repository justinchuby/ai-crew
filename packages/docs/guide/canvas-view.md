# Canvas View

The Canvas is an interactive node-graph visualization of your agent crew, built with [ReactFlow](https://reactflow.dev/). It provides a spatial view of agents, their relationships, and real-time status.

![Canvas View with agent detail panel](/images/03-canvas-with-panel.png)

## Overview

Each agent is represented as a node. Edges between nodes show communication flows: delegations, messages, broadcasts, and group chats. The canvas updates in real-time as agents work.

## Agent Nodes

Each node displays:
- **Role icon and name** (e.g., 💻 Developer)
- **Current task** (truncated to fit)
- **Status indicator** — color-coded dot (green=running, yellow=idle, red=failed, blue=creating)
- **Context usage** — mini progress bar showing context window consumption
- **Token count** — compact token usage display

### Node Interactions
- **Click** — opens Focus Agent panel for that agent
- **Drag** — reposition the node (position is persisted)
- **Right-click** — context menu with actions (message, pause, restart, terminate)

## Edge Types

| Edge | Color | Style | Meaning |
|------|-------|-------|---------|
| Delegation | Blue | Solid | Lead assigned task to agent |
| Message | Gray | Dashed | Direct message between agents |
| Group | Purple | Dotted | Agents in same chat group |
| Broadcast | Amber | Dash-dot | Broadcast message sent |
| Report | Green | Solid thin | Agent reporting results |

## Overlays

### Conflict Overlays
When Conflict Detection is active:
- **Amber dashed edges** between agents with potential conflicts
- **Red dashed edges** with ⚠ icon for active conflicts
- **Conflict count** badges on affected nodes

### Commit Counts
When GitHub Integration is connected:
- **Commit count** badges on nodes showing each agent's commit contributions

## Layout

The canvas supports auto-layout and manual positioning:
- **Auto-layout** — arranges nodes in a force-directed layout
- **Manual** — drag nodes to preferred positions (persisted in localStorage)
- **Zoom** — scroll to zoom, or use +/- controls
- **Fit** — button to fit all nodes in the viewport

## Canvas Graph Hook

The `useCanvasGraph(agents)` hook transforms agent data into ReactFlow-compatible nodes and edges:

```typescript
import { useCanvasGraph } from '../hooks/useCanvasGraph';

const { nodes, edges } = useCanvasGraph(agents);
```
