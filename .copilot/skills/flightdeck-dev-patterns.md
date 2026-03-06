---
name: flightdeck-dev-patterns
description: >
  Frontend development patterns for Flightdeck. Covers API calls, routing,
  component conventions, state management, and testing practices.
---

# Flightdeck Frontend Development Patterns

## API Calls

- **`apiFetch()` already prepends `/api`** — never write `apiFetch('/api/projects')`, use `apiFetch('/projects')`.
- Server runs on `SERVER_PORT` env (default 3006). Vite dev server on `:5173` proxies `/api/*` to the server automatically.

## Routing & Navigation

- **Use React Router `<Link to="...">` for internal navigation**, never `<a href="...">`. Anchor tags cause full page refreshes and lose client state.
- Route components use `React.lazy()` for code splitting — follow the pattern in `App.tsx`.

## State Management (Zustand)

- Wrap selectors with `useShallow()` on high-frequency update paths (e.g., agent list, token counters) to prevent unnecessary re-renders.
- Don't put `setState` results in `useCallback` dependency arrays — causes infinite re-fetch loops.

## SVG Rendering

- **SVG `<text>` elements ignore CSS** — Tailwind classes and CSS variables won't style SVG text. Pass `fill` directly via `tickLabelProps` or inline props.
- Hardcode colors for SVG text: use `#9ca3af` (gray-400 equivalent) for axis labels, `#6b7280` for secondary text.
- CSS variables like `var(--color-th-text)` don't reliably reach SVG — always use hex values.

## Shared Components & Hooks

- **`<ProjectTabs>`** — shared project selector used on Overview, Timeline, Canvas, Mission Control. Always use this for project switching (not dropdowns).
- **`useProjects()`** hook — fetches projects from `/projects` REST endpoint. Returns `{ projects, loading }`.
- **`useHistoricalAgents()`** hook — derives agent data from keyframes for historical sessions. Use as fallback when live store agents are empty.
- **`groupTimeline()`** — batches sequential chat messages from the same sender. Use in chat/activity views.

## Styling

- **Tailwind theme tokens**: `bg-th-bg`, `bg-th-bg-alt`, `text-th-text`, `text-th-text-alt`, `text-th-text-muted`, `border-th-border`, `bg-th-accent`.
- **`motion.css`** — three animation tiers: `micro` (100-150ms), `standard` (200-300ms), `dramatic` (400-600ms). Import and apply via class.
- **`chart-theme.css`** — defines chart color palette as CSS variables. Import in chart components.
- Use `line-clamp-2` (not `truncate`) when text may need two lines. Add `title={fullText}` for tooltip on truncated content.

## Layout Patterns

- **Sticky bottom controls**: Use `shrink-0` on a sibling outside the scrollable `flex-1 min-h-0 overflow-auto` container. Never nest fixed controls inside a scrollable area.
- **Horizontal overflow for dynamic lane counts**: Set `min-width` based on item count (e.g., `Math.max(600, agents.length * 80)`), let `overflow-auto` handle the rest.
- Separate scroll axes: `deltaY` for vertical, `Shift+wheel` / `deltaX` for horizontal, `Ctrl+wheel` for zoom.

## Virtualization

- **`react-virtuoso`** for large lists (chat messages, activity feeds). Only renders visible items — keeps DOM small.
- Mock Virtuoso in tests to render all items (jsdom has no layout measurements).
- Extract `components.Header` / `components.Footer` to stable refs — inline definitions cause remounts on every scroll.

## Data Hooks

- **`useProjects()`** — fetches from `/projects`. Shared across all pages.
- **`useHistoricalAgents(projectId)`** — derives agent list from keyframes when no live agents. Use as fallback.
- **`groupTimeline(messages)`** — batches sequential messages from same sender. Preserves message integrity.

## Fonts

- Bundle fonts in `public/fonts/` with `@font-face` declarations. Never use CDN.
- `font-feature-settings: 'liga' 1, 'calt' 1` on `.font-mono` for ligatures.
- `font-display: swap` for performance.
