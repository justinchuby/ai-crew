# Timeline UI

The Timeline UI visualizes your AI crew's activity over time. It shows agent lifecycles, status changes, inter-agent communications, and file locks on an interactive swim-lane chart.

> [!TIP]
> The Timeline is accessible from the dashboard sidebar. It updates in real-time via polling (with SSE planned for v2).

## What You See

The timeline displays four types of information:

| Element | What it shows |
|---------|--------------|
| **Agent lanes** | Horizontal bars colored by status (running, idle, failed, etc.) |
| **Communication links** | S-curve lines between agents showing messages, delegations, broadcasts, and group chats |
| **File locks** | 🔒 icons on agent lanes indicating when files are locked |
| **Minimap** | A compressed overview at the top with a draggable brush for time range selection |

### v1 Additions (In Progress)

These components are being added as part of the v1 design spec ([issue #43](https://github.com/justinc/ai-crew/issues/43)):

| Component | Purpose |
|-----------|---------|
| **StatusBar** | Crew health at a glance — agent status counts, last activity, stale detection |
| **ErrorBanner** | Persistent notification when errors exist below the viewport fold |
| **EmptyState** | Welcoming screen when no agents are active yet |
| **Template Summary** | One-line plain-English summary above the timeline (e.g., "Your crew has 3 active agents. 1 error needs attention.") |

## Quick Start

The Timeline is rendered as a page-level component. If you're working on the dashboard, it's already wired up:

```tsx
import { TimelinePage } from '@/components/Timeline';

// TimelinePage handles lead selection, filters, and data fetching internally
<TimelinePage api={api} ws={ws} />
```

For direct access to the core visualization (e.g., embedding in a custom layout):

```tsx
import { TimelineContainer } from '@/components/Timeline';
import { useTimelineData } from '@/components/Timeline';

function MyTimeline({ leadId }: { leadId: string }) {
  const { data, loading, error } = useTimelineData(leadId);

  if (loading || !data) return <div>Loading...</div>;

  return (
    <TimelineContainer
      data={data}
      liveMode={true}
      onLiveModeChange={(live) => console.log('Live mode:', live)}
    />
  );
}
```

## Components

The Timeline is composed of several components:

```
TimelinePage
├── Lead selector (when multiple leads exist)
├── Filter toolbar (roles, communication types, status toggles)
├── StatusBar          ← v1 addition
├── Template Summary   ← v1 addition
├── ErrorBanner        ← v1 addition
└── TimelineContainer
    ├── Zoom controls + Live mode toggle
    ├── BrushTimeSelector (minimap)
    ├── Agent labels (fixed left column)
    └── SVG timeline area
        ├── Time axis (@visx/axis)
        ├── Agent lanes (status segments + lock indicators)
        └── CommunicationLinks (SVG overlay)
```

See the [Component API Reference](/reference/timeline-api) for props and configuration details.

## Filters

Click the **Filter** button in the toolbar to reveal filter controls:

- **Roles** — Toggle visibility per role (Lead, Architect, Developer, etc.)
- **Communication** — Toggle link types (Delegation, Message, Group, Broadcast)
- **Hide agents** — Hide agents by terminal status (completed, terminated)

Active filter count is shown on the Filter button. Click **Reset all** to clear filters.

> [!IMPORTANT]
> The StatusBar (v1) always shows **unfiltered** crew health. Filters only affect the timeline visualization, not the status counts.

## Zoom & Navigation

| Action | Input |
|--------|-------|
| Zoom in | `Ctrl/Cmd + Scroll wheel`, `+` key, or zoom toolbar button |
| Zoom out | `Ctrl/Cmd + Scroll wheel`, `-` key, or zoom toolbar button |
| Pan left/right | `←` / `→` arrow keys |
| Fit to view | **Fit** button or `Home` key |
| Jump to recent | `End` key (shows last 20% of timeline) |

Zoom anchors to the cursor position when using scroll wheel, and to the center when using keyboard shortcuts.

### Live Mode

When **Live** is enabled (green indicator), the timeline auto-scrolls to show the latest activity as new data arrives. Zooming or panning disables Live mode to preserve your view.

### Minimap Brush

The minimap at the top shows a compressed overview of all agent activity. Drag the brush handles to select a time range, or drag the brush body to pan. The minimap and zoom controls stay in sync.

## Data Model

Timeline data is fetched from `GET /api/coordination/timeline?leadId={leadId}` and polled every 5 seconds.

```typescript
interface TimelineData {
  agents: TimelineAgent[];          // Agent lifecycles and status segments
  communications: TimelineComm[];   // Inter-agent messages and delegations
  locks: TimelineLock[];            // File lock events
  timeRange: { start: string; end: string };
}
```

See the [API Reference](/reference/timeline-api) for the complete type definitions.

## Further Reading

- [Component API Reference](/reference/timeline-api) — Props tables for all components
- [Accessibility Guide](/guide/timeline-accessibility) — Keyboard navigation, screen reader support
- [Architecture Overview](/guide/timeline-architecture) — Data flow, component hierarchy, migration roadmap
