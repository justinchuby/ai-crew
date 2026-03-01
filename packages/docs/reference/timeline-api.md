# Timeline API Reference

Component props and type definitions for the Timeline UI.

## Data Types

These types are exported from `@/components/Timeline/useTimelineData`.

### TimelineStatus

```typescript
type TimelineStatus = 'creating' | 'running' | 'idle' | 'completed' | 'failed' | 'terminated';
```

### CommType

```typescript
type CommType = 'delegation' | 'message' | 'group_message' | 'broadcast';
```

### TimelineSegment

A contiguous period where an agent has a specific status.

```typescript
interface TimelineSegment {
  status: TimelineStatus;
  startAt: string;       // ISO 8601 timestamp
  endAt?: string;        // undefined = still in progress
  taskLabel?: string;    // Displayed on running segments when space permits
}
```

### TimelineAgent

An agent's full lifecycle in the timeline.

```typescript
interface TimelineAgent {
  id: string;            // Full agent UUID
  shortId: string;       // 8-character prefix for display
  role: string;          // e.g., 'developer', 'architect', 'lead'
  model?: string;        // AI model name (e.g., 'claude-sonnet-4')
  createdAt: string;     // ISO 8601
  endedAt?: string;      // undefined = still active
  segments: TimelineSegment[];
}
```

### TimelineComm

A communication event between agents.

```typescript
interface TimelineComm {
  type: CommType;
  fromAgentId: string;
  toAgentId?: string;    // undefined for broadcasts and group messages
  summary: string;       // Message content preview
  timestamp: string;     // ISO 8601
}
```

> [!NOTE]
> The server sends `groupName` on group message events, but the `TimelineComm` type does not currently declare it. The `Communication` interface in `CommunicationLinks.tsx` does include `groupName`. This type mismatch is a known issue.

### TimelineLock

A file lock event.

```typescript
interface TimelineLock {
  agentId: string;
  filePath: string;
  acquiredAt: string;    // ISO 8601
  releasedAt?: string;   // undefined = still held
}
```

### TimelineData

The top-level data shape returned by the API and consumed by all timeline components.

```typescript
interface TimelineData {
  agents: TimelineAgent[];
  communications: TimelineComm[];
  locks: TimelineLock[];
  timeRange: { start: string; end: string };
}
```

## Hooks

### useTimelineData

Fetches timeline data for a given lead and polls every 5 seconds.

```typescript
function useTimelineData(leadId: string | null): {
  data: TimelineData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

| Return | Type | Description |
|--------|------|-------------|
| `data` | `TimelineData \| null` | Timeline data, or `null` before first load |
| `loading` | `boolean` | `true` during fetch |
| `error` | `string \| null` | Error message if fetch failed |
| `refetch` | `() => Promise<void>` | Manually trigger a re-fetch |

**Polling:** Every 5 seconds via `setInterval`. Polling starts when `leadId` is non-null and stops on unmount or when `leadId` changes.

### getLocksForAgent

Utility to filter locks by agent.

```typescript
function getLocksForAgent(locks: TimelineLock[], agentId: string): TimelineLock[]
```

## Components

### TimelinePage

Top-level page component that handles lead selection, filters, and data fetching.

```typescript
interface Props {
  api: any;   // API client instance
  ws: any;    // WebSocket client instance
}
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `api` | `any` | Yes | API client for REST calls |
| `ws` | `any` | WebSocket client for real-time events |

**Behavior:**
- Auto-selects the first lead agent on mount
- Shows a lead selector when multiple leads exist
- Provides filter toolbar (roles, communication types, hidden statuses)
- Passes filtered data to `TimelineContainer`

### TimelineContainer

The main visualization component. Renders the SVG timeline with agent lanes, communication links, zoom controls, and the minimap.

```typescript
interface TimelineContainerProps {
  data: TimelineData;
  liveMode?: boolean;
  onLiveModeChange?: (live: boolean) => void;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `TimelineData` | required | The timeline data to render |
| `liveMode` | `boolean` | `undefined` | When true, auto-scrolls to show latest activity |
| `onLiveModeChange` | `(live: boolean) => void` | `undefined` | Called when live mode is toggled (e.g., user zooms, disabling live mode) |

**Internal state:**
- `expandedAgents` — Set of agent IDs with expanded lanes (56px → 160px)
- `focusedLaneIdx` — Currently focused lane for keyboard navigation
- `visibleRange` — Visible time window `{ start: Date; end: Date }`

**Agent sorting:** Agents are sorted by role hierarchy (Lead → Architect → Secretary → Developer → Code Reviewer → Critical Reviewer → Designer → QA), then by spawn time.

**Empty state:** When `data.agents` is empty, shows "No agent activity to display."

### BrushTimeSelector

Minimap component with a draggable brush for time range selection.

```typescript
interface BrushTimeSelectorProps {
  fullRange: { start: Date; end: Date };
  visibleRange: { start: Date; end: Date };
  onRangeChange: (range: { start: Date; end: Date }) => void;
  agents: TimelineAgent[];
  width: number;
}
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `fullRange` | `{ start: Date; end: Date }` | Yes | Full time range of the project |
| `visibleRange` | `{ start: Date; end: Date }` | Yes | Currently visible time range (controlled) |
| `onRangeChange` | `(range) => void` | Yes | Called when brush selection changes |
| `agents` | `TimelineAgent[]` | Yes | Agents for the mini-timeline background |
| `width` | `number` | Yes | Component width from parent |

**Height:** Fixed at 48px. Shows mini-colored bars for each agent's status segments as background.

**Brush behavior:** Degenerate ranges (<1 second) are rejected. The brush syncs bidirectionally with external zoom controls via `ref.updateBrush()`.

### CommunicationLinks

SVG overlay that renders communication lines between agent lanes.

```typescript
interface CommunicationLinksProps {
  communications: Communication[];
  agentPositions: Map<string, number>;  // agentId → y position
  xScale: ScaleTime<number, number>;
  laneHeight: number;
  visibleTimeRange?: [Date, Date];      // Performance culling
}
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `communications` | `Communication[]` | Yes | Communication events to render |
| `agentPositions` | `Map<string, number>` | Yes | Map of agent ID to lane Y position |
| `xScale` | `ScaleTime` | Yes | @visx time scale for X positioning |
| `laneHeight` | `number` | Yes | Height of each agent lane |
| `visibleTimeRange` | `[Date, Date]` | No | Only render links within this range (performance) |

**Link styles by type:**

| Type | Color | Line Style | Marker |
|------|-------|-----------|--------|
| Delegation | Blue (`rgba(88,166,255,0.6)`) | Solid, 2px | Arrow → |
| Message | Purple (`rgba(163,113,247,0.5)`) | Dashed, 1.5px | Circle ● |
| Group Message | Gold (`rgba(210,153,34,0.5)`) | Dotted, 1.5px | Diamond ◆ |
| Broadcast | Pink (`rgba(247,120,186,0.4)`) | Dotted, 1px | Star ★ |

**Missing targets:** When `toAgentId` is undefined (broadcasts, group messages) or the target agent isn't visible, a short horizontal stub with a **?** is rendered. Tooltip still shows the group name or "?" as appropriate.

**Performance:** Links are capped at 500 visible links (`MAX_VISIBLE_LINKS`). Links outside `visibleTimeRange` are skipped.

### StatusBar <Badge type="warning" text="v1" />

> [!NOTE]
> This component is being added in v1 ([issue #43](https://github.com/justinc/ai-crew/issues/43)). API may change.

Displays unfiltered crew health at a glance. Always shows global status regardless of timeline filters.

```typescript
interface StatusBarProps {
  statusCounts: Record<TimelineStatus, number>;
  lastActivityTimestamp?: string;        // ISO 8601
  showLastActivity?: boolean;            // default: true
  staleThresholdMs?: number;             // default: 60000
  onStaleDetected?: () => void;
  connectionHealth: 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'offline';
  lastSeenEventId?: string;
  newEventCount?: number;
  onJumpToNewEvents?: () => void;
  className?: string;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `statusCounts` | `Record<TimelineStatus, number>` | required | Count of agents per status (always unfiltered) |
| `lastActivityTimestamp` | `string` | — | ISO 8601 timestamp of last crew activity |
| `showLastActivity` | `boolean` | `true` | Show "Last activity: 30s ago" text |
| `staleThresholdMs` | `number` | `60000` | Time in ms before crew is considered stale |
| `onStaleDetected` | `() => void` | — | Called when crew goes stale (no activity for `staleThresholdMs`) |
| `connectionHealth` | `string` | required | Server connection status indicator |
| `lastSeenEventId` | `string` | — | Event ID of last visit, enables "X new events" badge |
| `newEventCount` | `number` | — | Count of events since `lastSeenEventId` |
| `onJumpToNewEvents` | `() => void` | — | Called when user clicks the new events badge |

**Accessibility:** Renders with `role="status"` and `aria-live="polite"`. Error count is a clickable link that scrolls to the first error in the timeline.

### ErrorBanner <Badge type="warning" text="v1" />

> [!NOTE]
> This component is being added in v1 ([issue #43](https://github.com/justinc/ai-crew/issues/43)). API may change.

Persistent error indicator that appears when errors exist below the viewport fold. Lives inside StatusBar.

**Behavior:**
- Shows: `⚠️ {count} error(s) — click to view`
- Clicking scrolls to the first error event in the timeline
- Auto-dismisses when the error is visible in the viewport
- Errors auto-expand and receive red highlight treatment in the timeline

### EmptyState <Badge type="warning" text="v1" />

> [!NOTE]
> This component is being added in v1 ([issue #43](https://github.com/justinc/ai-crew/issues/43)). API may change.

Welcoming screen shown when no agents are active.

**Default content:** "No activity yet — agents will appear here when your crew starts working" with a call-to-action button.

```typescript
interface EmptyStateProps {
  message?: string;       // Override default message
  action?: () => void;    // CTA button click handler
  className?: string;
}
```

## Visual Reference

### Status Colors

| Status | Fill | Border | Meaning |
|--------|------|--------|---------|
| Creating | `rgba(210,153,34,0.3)` | `#d29922` | Agent is being spawned |
| Running | `rgba(63,185,80,0.3)` | `#3fb950` | Agent is actively working |
| Idle | Hatch pattern | `#484f58` | Agent is waiting for input |
| Completed | `rgba(88,166,255,0.3)` | `#58a6ff` | Agent finished successfully |
| Failed | `rgba(248,81,73,0.3)` | `#f85149` | Agent encountered an error |
| Terminated | `rgba(240,136,62,0.3)` | `#f0883e` | Agent was stopped |

### Role Colors (Lane Border)

| Role | Color | Icon |
|------|-------|------|
| Lead | `#d29922` | 👑 |
| Architect | `#f0883e` | 🏗 |
| Developer | `#3fb950` | 👨‍💻 |
| Code Reviewer | `#a371f7` | 🔍 |
| Critical Reviewer | `#a371f7` | 🛡 |
| Designer | `#f778ba` | 🎨 |
| Secretary | `#79c0ff` | 📋 |
| QA Tester | `#79c0ff` | 🧪 |
| Tech Writer | — | 📝 |

### Layout Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `LABEL_WIDTH` | 180px | Fixed width of agent label column |
| `LANE_HEIGHT` | 56px | Collapsed lane height |
| `LANE_HEIGHT_EXPANDED` | 160px | Expanded lane height |
| `LANE_GAP` | 2px | Vertical gap between lanes |
| `AXIS_HEIGHT` | 32px | Height of the time axis |
| `BRUSH_HEIGHT` | 48px | Height of the minimap |
| `MIN_VISIBLE_MS` | 5,000ms | Minimum zoom level (5 seconds) |

## Known Issues

| Issue | Description | Workaround |
|-------|-------------|------------|
| Group messages show **?** | `group_message` and `broadcast` types render a stub with "?" instead of meaningful links because `toAgentId` is null | Hover to see tooltip with group name |
| `TimelineComm` missing `groupName` | Type mismatch between `TimelineComm` (useTimelineData.ts) and `Communication` (CommunicationLinks.tsx) | Works at runtime; TypeScript type is incomplete |
