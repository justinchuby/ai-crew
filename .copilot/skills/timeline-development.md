---
name: timeline-development
description: >
  Comprehensive reference for the Timeline component — the most complex UI in Flightdeck.
  Covers scroll/zoom, layout, session replay, SVG theming, React patterns, and testing.
---

# Timeline Component Development

The Timeline is the most complex UI component in Flightdeck. This document captures every lesson learned during its development — scroll behavior, layout, replay, SVG theming, and testing patterns.

---

## Scroll & Zoom

### Decoupled Scroll Axes

The #1 usability bug was coupled scroll axes — vertical mouse wheel caused horizontal movement. The fix (commit bc503bd) decouples them completely:

```
deltaY (plain wheel)      → Vertical scroll only (let browser handle natively)
Shift+wheel / deltaX      → Horizontal pan (when zoomed in)
Ctrl+wheel / Meta+wheel   → Zoom (time axis)
```

**Implementation pattern** (in the wheel handler):

```tsx
const handleWheel = useCallback((e: React.WheelEvent) => {
  // Ctrl+wheel = zoom
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoomLevel(prev => {
      const next = e.deltaY < 0 ? prev * 1.15 : prev / 1.15;
      return Math.max(1, Math.min(50, next));
    });
    return;
  }

  // Shift+wheel or trackpad horizontal = horizontal pan (only when zoomed)
  if (zoomLevel > 1) {
    const horizontalDelta = e.shiftKey ? e.deltaY : e.deltaX;
    if (horizontalDelta !== 0) {
      e.preventDefault();
      setPanOffset(prev => Math.max(0, Math.min(1, prev + horizontalDelta * 0.002)));
      return;
    }
  }

  // Plain vertical scroll: DO NOT call preventDefault — let browser handle
}, [zoomLevel]);
```

**Critical**: The wheel event listener must use `{ passive: false }` when added via `addEventListener`. React's `onWheel` prop is passive by default — calling `preventDefault()` on it triggers console warnings. Use `useEffect` with `addEventListener` instead.

### Zoom Controls

- **Range**: 1× to 50×
- **Wheel multiplier**: 1.15× per tick (smooth feel)
- **Button multiplier**: 1.5× per click (bigger steps)
- **Fit button**: Resets to `zoomLevel=1, panOffset=0`
- **Pan offset resets** automatically when zooming out to ≤1.05×
- **Zoom anchors** to cursor position when using scroll wheel

### Drag-to-Pan

Only active when `zoomLevel > 1`. Uses pointer events (not mouse events) for touch support:

```tsx
const isDraggingRef = useRef(false);
const dragStartXRef = useRef(0);
const dragStartOffsetRef = useRef(0);
```

1. `handlePointerDown` — captures pointer, stores start position
2. `handlePointerMove` — converts pixel delta to panOffset fraction: `dx * msPerPx / maxOffsetMs`
3. `handlePointerUp` / `handlePointerCancel` — clears drag state

Cursor shows `cursor-grab` (idle) → `cursor-grabbing` (dragging).

### Arrow Key Navigation

- **↑/↓** — Move focus between agent lanes (`focusedLaneIdx` state)
- **Enter/Space** — Toggle expand/collapse on focused lane
- **Escape** — Clear lane focus
- **Tab/Shift+Tab** — Move between lanes (natural tab order)
- **f** — Focus the filter bar (dispatches `timeline:focus-filter` custom event)
- **?** — Toggle keyboard shortcut help overlay
- **+/−** — Zoom in/out
- **Home** — Fit all to view
- **End** — Jump to most recent 20% of timeline

---

## Layout

### Swim Lane Sizing

Lanes scale with agent count to prevent cramming:

```tsx
const MIN_CHART_WIDTH = Math.max(600, sortedAgents.length * 80);
const chartWidth = Math.max(containerWidth - LABEL_WIDTH, MIN_CHART_WIDTH);
```

- **Base minimum**: 600px
- **Per-agent**: 80px minimum per lane
- **Label column**: Fixed 180px on the left
- **Horizontal scrollbar** appears automatically when `chartWidth > containerWidth` (via parent `overflow-x-auto`)

This was added in commit 7b71bdb after 10+ agent sessions rendered unreadably narrow lanes.

### SVG ViewBox Alignment

**Bug**: SVG `viewBox` stretching caused Gantt bars to misalign with time axis labels.

**Fix**: Set explicit `width` and `height` attributes on the SVG element matching the container dimensions. Don't rely on `viewBox` alone — it causes proportional scaling that breaks pixel-aligned layouts.

```tsx
<svg
  width={chartWidth}
  height={totalHeight}
  viewBox={`0 0 ${chartWidth} ${totalHeight}`}
>
```

### Container Height Calculation

For small task/agent counts, the container was either too tall (wasted space) or too short (clipped). Formula:

```
totalHeight = headerHeight + (agentCount * laneHeight) + footerPadding
```

Where `laneHeight` includes the status bar, communication link space, and padding.

### Time Axis Label Overlap

When zoomed in, axis labels can overlap. The visx `AxisTop` component handles tick reduction, but at extreme zoom levels, labels still cluster. Use `tickFormat` with `timeFormat` to show appropriate precision:
- Zoomed out: `HH:mm`
- Zoomed in: `HH:mm:ss`
- Very zoomed: `HH:mm:ss.SSS`

Debounce the zoom window label updates to avoid flicker during rapid zooming.

---

## Session Replay

### State Lifting

**Critical pattern**: Replay state lives in `TimelinePage`, NOT in `TimelineContainer`.

```tsx
// TimelinePage.tsx — owns replay state
const replayLeadId = (!liveMode && effectiveLeadId) ? effectiveLeadId : null;
const replay = useSessionReplay(replayLeadId);
```

Replay data flows DOWN to `TimelineContainer` and `ReplayScrubber` as props. If you put replay state inside the visualization component, you get re-render cascades and stale closures.

### Progressive Reveal (commit 18045d10)

This was the breakthrough commit that made replay actually animate. Before this fix, hitting Play did nothing visible — the scrubber would advance but the timeline showed no visual changes.

#### What Was Broken

`useSessionReplay` was originally called inside `ReplayScrubber` only. The scrubber tracked `currentTime` internally but the Timeline visualization never saw that state — it always rendered the full dataset. Result: the scrubber moved, the speed indicator worked, but the Gantt chart was static.

#### Root Cause

The replay state (particularly `currentTime`) was trapped inside a child component (`ReplayScrubber`) with no way to flow UP to the data layer. The parent `TimelinePage` — which owned the timeline data and passed it down to `TimelineContainer` — had no access to `currentTime`.

#### The Fix — State Lifting + Data Clipping

1. **Lift `useSessionReplay`** into `TimelinePage` (the data owner):
   ```tsx
   // TimelinePage.tsx — NOW owns replay state
   const replayLeadId = (!liveMode && effectiveLeadId) ? effectiveLeadId : null;
   const replay = useSessionReplay(replayLeadId);
   ```

2. **Pass replay down** to `ReplayScrubber` as a prop (avoiding a duplicate hook call):
   ```tsx
   <ReplayScrubber leadId={effectiveLeadId} replay={replay} />
   ```
   `ReplayScrubber` accepts an optional `replay?: UseSessionReplayResult` prop. When provided, it uses the external state. When not provided, it creates its own internally (backward-compatible).

3. **Filter all timeline data** to only show events up to `currentTime`:
   ```tsx
   const displayData = useMemo(() => {
     if (!filteredData) return null;
     if (!replay.keyframes.length || liveMode) return filteredData;
     // When paused at end, show everything
     if (!replay.playing && replay.currentTime >= replay.duration && replay.duration > 0)
       return filteredData;

     const sessionStart = new Date(replay.keyframes[0].timestamp).getTime();
     const cutoffMs = sessionStart + replay.currentTime;
     const cutoff = new Date(cutoffMs).toISOString();

     return {
       ...filteredData,
       agents: filteredData.agents
         .filter(a => new Date(a.createdAt).getTime() <= cutoffMs)
         .map(a => ({
           ...a,
           segments: a.segments
             .filter(s => new Date(s.startAt).getTime() <= cutoffMs)
             .map(s => ({
               ...s,
               // Clip segment end to cutoff for partial visibility
               endAt: s.endAt && new Date(s.endAt).getTime() > cutoffMs
                 ? cutoff : s.endAt,
             })),
         })),
       communications: filteredData.communications
         .filter(c => new Date(c.timestamp).getTime() <= cutoffMs),
       locks: filteredData.locks
         .filter(l => new Date(l.acquiredAt).getTime() <= cutoffMs),
       timeRange: {
         start: filteredData.timeRange.start,
         end: cutoff < filteredData.timeRange.end ? cutoff : filteredData.timeRange.end,
       },
     };
   }, [filteredData, replay.keyframes, replay.playing,
       replay.currentTime, replay.duration, liveMode]);
   ```

4. **Pass `displayData`** (not `filteredData`) to `TimelineContainer`.

#### How Progressive Reveal Works

As the replay scrubber advances `currentTime`, the `displayData` memo recalculates:
- **Agents** — only agents spawned before the cutoff time appear (swim lanes emerge progressively)
- **Segments** — only segments that started before cutoff are shown. Segments that span the cutoff boundary get their `endAt` clipped to the cutoff time, showing a partial-length Gantt bar that grows as the scrubber advances
- **Communications** — message arrows appear when their `timestamp` is reached
- **Locks** — lock indicators appear when their `acquiredAt` is reached
- **Time range** — the chart's `timeRange.end` is clamped to the cutoff, so the visible X-axis grows with the replay

The effect is a progressive "unfolding" of the session — agents appear, their task bars grow, messages fire between them, and file locks flash on, all synchronized to the scrubber position.

#### Key Insight

Replay animation does NOT animate individual SVG elements. It progressively reveals the entire dataset by filtering on time. The visualization components are pure — they simply render whatever data they receive. The animation emerges from rapidly changing the input data.

#### Edge Cases Handled
- **Paused at end**: When `!playing && currentTime >= duration`, returns full unfiltered data (no clipping)
- **Live mode**: During live mode, replay filtering is skipped entirely
- **No keyframes**: If keyframes haven't loaded yet, returns unfiltered data
- **Scrubber seeking**: Works for both play and manual scrubber drag — the memo reacts to any `currentTime` change

### Sticky Scrubber Bar

The replay scrubber must ALWAYS be visible at the bottom. It's placed OUTSIDE the scrollable area using flex layout:

```tsx
<div className="flex flex-col h-full">
  {/* Scrollable timeline */}
  <div className="flex-1 min-h-0 overflow-auto">
    <TimelineContainer ... />
  </div>

  {/* Scrubber — shrink-0 keeps it visible */}
  <div className="shrink-0 border-t border-th-border-muted bg-th-bg px-4 py-2">
    <ReplayScrubber leadId={leadId} replay={replay} />
  </div>
</div>
```

**Bug** (commit a95dfc0): The scrubber was originally INSIDE the scrollable container. `overflow-hidden` on the parent clipped it. Fix: Move it outside the scrollable area and use `shrink-0` to guarantee space.

### Speed Options

Default speed is **4×** (commit 8e70c6b) — 1× was too slow for reviewing sessions. Available speeds use logarithmic progression: **4×, 8×, 16×, 32×, 64×, 120×, 240×, 720×**.

### Always-Visible Scrub Bar (commit e3a2ff4)

The replay scrub bar is always visible — in both live and replay modes. This makes replay discoverable:

- **Live mode**: Green fill, "● LIVE" badge, playhead at 100%
- **Replay mode**: Play/skip/speed controls + muted "Live" button to return
- **Auto-switch**: Clicking/dragging the scrub bar in live mode auto-switches to replay via `onExitLive()`
- **Keyframes always fetched**: `useSessionReplay` receives `effectiveLeadId` regardless of `liveMode`, not gated by `!liveMode`

### Drag-to-Scrub (commit d9c20dd)

Uses Pointer Events API for unified mouse + touch support:

```tsx
onPointerDown → setPointerCapture(id) → start drag
onPointerMove → compute position, update currentTime
onPointerUp → releasePointerCapture, resume if was playing
```

- `setPointerCapture(pointerId)` ensures tracking continues when cursor leaves the scrub bar
- `wasPlayingRef` stores playback state; pause during drag, resume on release
- `touch-none` CSS class prevents browser scroll interference
- Progress fill `transition` disabled during drag for smooth updates

### Fixed-Resolution Panning (commit 650386c)

During replay, the view auto-zooms to a fixed time window and pans to follow progress:

- **Window size**: 5 minutes or 20% of session duration, whichever is larger
- **Camera position**: Current replay time sits at ~70% of the visible window
- **Auto-computes** `zoomLevel` and `panOffset` from `replayProgress` (0-1 fraction)
- **User override**: Manual zoom/pan sets `userZoomedRef=true`, disabling auto-pan
- **Full time range preserved**: `displayData.timeRange` keeps the full session range; only agents/comms/segments are clipped to the replay cutoff

### stableRangeRef Fix (commit 6b3e8f1)

**Bug**: `stableRangeRef` froze the chart X-axis during replay, preventing Gantt bar animation.

**Root cause**: The `!liveMode` branch returned the previous range value, freezing the scale.

**Fix**: During replay, `fullRange` uses the same stable-only-extend logic as live mode. The auto-panning effect handles windowing separately via `zoomLevel`/`panOffset`.

### Per-Project State Reset (commit 12826db)

When `leadId` changes (project switch), `useSessionReplay` must reset:

```tsx
setCurrentTime(0);
setPlaying(false);
setWorldState(null);
sessionStartRef.current = 0;
```

Also reset `stableRangeRef.current = null` and `userZoomedRef.current = false` in `TimelineContainer` when `selectedLeadId` changes.

### Live Indicator Styling (commit f56c48e)

The "Live" button in the scrub bar must NOT use green during replay mode:
- **Live mode**: Green dot + "LIVE" text (bg-green-400, animate-pulse)
- **Replay mode**: Muted grey dot/text for the "return to live" button, green on hover

### Auto-Switch to Replay Mode

When no live agents exist but historical projects do, automatically disable live mode (commit 28d7d9d):

```tsx
useEffect(() => {
  if (leads.length === 0 && projects.length > 0 && liveMode) {
    setLiveMode(false);
  }
}, [leads.length, projects.length, liveMode]);
```

### Removed: ShareDropdown

The ShareDropdown (Reels, Copy Link, Export) was removed — these were non-functional dead features. Don't re-add sharing UI unless the backend actually supports it.

---

## SVG Theming

### The Problem

CSS custom properties (`var(--color-name)`) do NOT reliably reach SVG `<text>` elements' `fill` attribute. Tailwind classes also don't work on SVG text. This affects ALL chart components, not just Timeline.

### The Solution

Use CSS variables through the `fill` prop directly — the Timeline uses graph-scoped CSS variables:

```tsx
// visx axis labels
tickLabelProps={() => ({
  fill: 'var(--graph-text-muted)',
  fontSize: 10,
  fontFamily: 'monospace',
  textAnchor: 'middle',
})}
```

If CSS variables don't reach the SVG context (e.g., in deeply nested SVG groups), fall back to hardcoded hex: `#9ca3af` for muted text on dark backgrounds, `#6b7280` for secondary text.

### Status & Role Colors

Agent lane colors use CSS variables: `var(--st-creating)`, `var(--st-running)`, `var(--st-idle)`, etc. Role colors: `var(--role-lead)`, `var(--role-architect)`, etc. Each agent also gets a deterministic lane border color from an 8-color WCAG AA palette via `getAgentColor(agentId)`.

---

## React Patterns

### Avoid useMemo + setState

Canvas edges used `useMemo` that called `setState` internally — this is an anti-pattern that causes infinite render loops. Use `useEffect` instead when a computation needs to update state.

### Memoize Lane Components

`TimelineRow` (individual agent lanes) should be memoized with `React.memo` to prevent re-renders during scroll/zoom. The parent re-renders on every scroll event — without memoization, ALL lanes re-render.

### Passive Event Listeners

When adding wheel handlers that call `preventDefault()`, you MUST use:

```tsx
useEffect(() => {
  const el = containerRef.current;
  el?.addEventListener('wheel', handler, { passive: false });
  return () => el?.removeEventListener('wheel', handler);
}, [handler]);
```

React's `onWheel` is passive — `preventDefault()` inside it triggers browser warnings and doesn't actually prevent default behavior.

---

## Historical Data

### REST API Fallback

When no live WebSocket agents are connected, Timeline loads data from REST:
1. `useProjects()` fetches project list from `/api/projects`
2. `useHistoricalAgents(projectId)` derives agent roster from spawn/exit keyframes
3. `useSessionReplay(leadId)` loads keyframes for replay

### ProjectTabs

The `<ProjectTabs>` component shows both live and historical projects:
- **Live projects**: Green dot indicator, data from WebSocket
- **Historical projects**: No dot, data from REST API
- **Deduplication**: Projects appearing in both live and historical are shown once

### Keyframe Scoping

All keyframe queries MUST be scoped by `projectId`. Without scoping, multi-project sessions mix data from different projects. This was a P2 bug (commit 74f57f4).

---

## Common Pitfalls

1. **overflow-hidden clips sticky/fixed children** — Never nest sticky controls inside a container with `overflow-hidden`. Use flex layout with `shrink-0` siblings instead.

2. **Coupled scroll axes feel broken** — Always decouple vertical (browser-native) from horizontal (custom handler). Users expect mouse wheel = vertical scroll.

3. **Replay state must be in the data owner** — Put `useSessionReplay` in the page component that owns the data, not in the visualization component that renders it.

4. **SVG viewBox stretching** — Always set explicit `width` and `height` on SVG elements. `viewBox` alone causes proportional scaling that breaks alignment.

5. **Time window labels flicker during zoom** — Debounce label updates. `useMemo` on `visibleRange` prevents recomputation on every pixel of wheel delta.

6. **Agent lane colors must be deterministic** — Use `getAgentColor(agentId)` (hash-based) so the same agent always gets the same color across page loads.

7. **Test wheel events need `{ passive: false }`** — In tests, use `addEventListener` mocks or `fireEvent` with proper event construction. `userEvent` doesn't support wheel events well.

---

## Testing

The Timeline has **240+ tests** across 13 test files covering:

| Area | Tests | Coverage |
|------|-------|----------|
| E2E data pipeline | 61 | Segment rendering, tooltips, filtering, comms, brush, live mode |
| SSE connection | 31 | Stream handling, fragment parsing, retry logic |
| Accessibility | 30 | ARIA labels, keyboard nav, screen reader announcements |
| Status bar | 20 | Health indicators, error counts, badges |
| Since-last-visit | 23 | Event tracking, localStorage persistence |
| Zoom & pan | 16 | Wheel zoom, button zoom, pan boundaries, time labels |
| Error banner | 13 | Error display, scroll-to-error |
| Keyboard help | 11 | Help dialog rendering |
| Empty state | 8 | No-data rendering |
| Agent colors | 7 | Color assignment, determinism |
| Time formatting | 6 | Relative/absolute formatting |
| Drag-to-pan | 6 | Pointer events, constraints |
| Brush selector | 10 | Time range calculations |

Run with: `cd packages/web && npx vitest run src/components/Timeline/`

---

## Key Commits

| Commit | Change |
|--------|--------|
| a321985 | Zoom controls (+/−/Fit, Ctrl+wheel, 1-50× range) |
| 314905f | Drag-to-pan with pointer events |
| bc503bd | **Scroll axis decoupling** — the most impactful UX fix |
| a95dfc0 | Sticky scrubber bar (moved outside scrollable container) |
| 8e70c6b | Speed options: 4×–720× logarithmic progression |
| 7b71bdb | Horizontal overflow for 10+ agent sessions |
| 28d7d9d | Auto-switch to replay mode for historical sessions |
| 74f57f4 | Keyframe scoping by projectId (P2 bug fix) |
| 0483145 | Removed dead ShareDropdown |
| 18045d1 | **Replay progressive reveal** — the breakthrough that made replay animate |
| 12826db | Per-project state reset on leadId change |
| d9c20dd | Drag-to-scrub with Pointer Events API |
| 6b3e8f1 | stableRangeRef unfreeze for Gantt bar animation |
| e3a2ff4 | Always-visible scrub bar with auto-switch UX |
| 650386c | Fixed-resolution panning during replay |
| f56c48e | Live indicator muted color during replay |
