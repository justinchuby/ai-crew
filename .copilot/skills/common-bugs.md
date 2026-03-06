---
name: common-bugs
description: >
  Known bugs and root causes encountered during Flightdeck development.
  Check this list before debugging — you may be hitting a known issue.
---

# Common Bugs and Root Causes

Bugs encountered during Flightdeck development. Check this list before debugging — you may be hitting a known issue.

## Double `/api/` Prefix

**Symptom**: API calls return HTML instead of JSON, 404 errors.
**Cause**: `apiFetch()` already prepends `/api`. Writing `apiFetch('/api/projects')` produces `/api/api/projects`.
**Fix**: Use `apiFetch('/projects')` — no `/api` prefix.

## Infinite Re-fetch Loops

**Symptom**: Network tab shows hundreds of identical requests, browser freezes.
**Cause**: Putting `setState` return value or fetched data in `useCallback`/`useEffect` dependency arrays creates a render → fetch → setState → render cycle.
**Fix**: Use refs for mutable values that shouldn't trigger re-renders, or move fetch logic into the effect body.

## Overview Panels Empty

**Symptom**: Overview page shows blank panels despite data existing.
**Cause**: Multiple possible issues:
- Keyframe type mappings missing — `SessionReplay.ts` KEYFRAME_TYPES must map activity `actionType` to keyframe `type`.
- `leadId` vs `projectId` confusion — some APIs filter by one, frontend passes the other.
- Spawn detection relies on `'Created &'` prefix in activity label — if format changes, agents aren't detected.
**Fix**: Check KEYFRAME_TYPES mapping, verify API query parameters, check activity label format.

## FocusPanel Crash on Nested Objects

**Symptom**: TypeError when rendering agent details or activity data.
**Cause**: API returns nested objects (e.g., `{ status: { phase: "running" } }`), but component expects strings.
**Fix**: Use a `safeText()` helper: `typeof val === 'object' ? JSON.stringify(val) : String(val)`.

## SVG Text Invisible in Dark Theme

**Symptom**: Chart axis labels, tick marks disappear on dark background.
**Cause**: SVG `<text>` ignores CSS classes and CSS variables. Default fill is black (#000), invisible on dark bg.
**Fix**: Pass `fill="#9ca3af"` directly via `tickLabelProps` or inline style. Never rely on Tailwind/CSS for SVG text color.

## Full Page Refresh on Navigation

**Symptom**: Clicking a link reloads the entire app, losing state.
**Cause**: Using `<a href="/path">` instead of React Router `<Link to="/path">`.
**Fix**: Replace all internal `<a href>` with `<Link to>` from `react-router-dom`.

## Components Invisible (Overflow Clipping)

**Symptom**: Component exists in DOM (visible in DevTools) but not visible on screen.
**Cause**: Parent container has `overflow: hidden` and the component renders below the visible area.
**Fix**: Either move the component outside the clipped container, make it `position: sticky`, or change `overflow: hidden` to `overflow: auto`.

## Passive Event Listener Warnings

**Symptom**: Console warning about passive event listeners on wheel events.
**Cause**: Calling `preventDefault()` on wheel events added without `{ passive: false }`.
**Fix**: Add wheel listeners via `addEventListener('wheel', handler, { passive: false })` instead of React's `onWheel`.

## Server Port Mismatch

**Symptom**: API calls fail, CORS errors, connection refused.
**Cause**: Server port comes from `SERVER_PORT` env (currently 3006). Vite proxies from `:5173`.
**Fix**: Check `SERVER_PORT` env var. In dev, always use Vite's port (5173) — it proxies to the server.

## Duplicate Variable Declarations

**Symptom**: TypeScript error "Cannot redeclare block-scoped variable".
**Cause**: Multiple developers editing the same file, each adding their own `const` declarations.
**Fix**: Check for existing declarations before adding. Use file locking to prevent concurrent edits.

## Scroll Axes Coupled

**Symptom**: Vertical mouse wheel causes horizontal movement on Timeline.
**Cause**: `wheel` handler using `deltaY` for horizontal panning.
**Fix**: `deltaY` → vertical only (let browser handle), `deltaX` / `Shift+wheel` → horizontal pan, `Ctrl+wheel` → zoom.

## Token Data "Not Available"

**Symptom**: Token tab shows "not available" for agents.
**Cause**: Agent objects lack `inputTokens`/`outputTokens` (Copilot CLI doesn't provide them).
**Fix**: Estimate from `outputPreview` length (~4 chars/token). Show with `~` prefix and `(est.)` suffix.

## Overflow:Hidden Clipping Below-Fold Components

**Symptom**: Component exists in DOM (DevTools shows it) but user can't see or interact with it.
**Cause**: Parent container has `overflow: hidden` and the component renders below the visible area. Example: ReplayScrubber rendered after a 1000px Gantt chart inside a 713px container.
**Fix**: Move the component outside the scrollable container as a sibling with `shrink-0`. Or use `position: sticky; bottom: 0` to pin it.

## CDN Fonts Break Offline

**Symptom**: Monospace text falls back to system font when offline or in restricted networks.
**Cause**: Font loaded via Google Fonts CDN `<link>` tag — requires network.
**Fix**: Always bundle fonts locally. Download woff2 files → `public/fonts/` → `@font-face` in CSS. Remove any CDN `<link>` and `preconnect` tags from `index.html`.

## react-virtuoso Elements Not in DOM

**Symptom**: Tests or Playwright can't find elements that should be in a list.
**Cause**: `react-virtuoso` only renders visible items. Off-screen items are virtualized away and not in the DOM.
**Fix**: In tests, mock Virtuoso to render all items. In production, use `Virtuoso`'s `scrollToIndex` API to bring items into view.

## Virtuoso Inline Header/Footer Cause Remounts

**Symptom**: Header or footer components inside Virtuoso flicker, lose state, or remount on every scroll.
**Cause**: Passing inline component definitions to `components={{ Header: () => <div>...</div> }}` creates new component references on every render.
**Fix**: Extract Header/Footer to stable refs or define them outside the render function.

## Backend Pre-Truncating Labels

**Symptom**: Milestone or keyframe labels cut off even though frontend has room.
**Cause**: Backend applies `.slice(0, 80)` to labels before sending to frontend.
**Fix**: Remove backend truncation. Let the frontend handle display with CSS (`line-clamp-2`, `title` tooltip).

## Playwright Can't Simulate Complex Events on SVG

**Symptom**: QA automation can't test Ctrl+wheel zoom, keyboard nav, or drag on SVG chart elements.
**Cause**: Playwright's keyboard/mouse simulation doesn't reliably trigger React synthetic events on SVG elements, especially with modifier keys.
**Fix**: Write unit tests with `fireEvent.wheel`/`fireEvent.keyDown` from `@testing-library/react` for interaction logic. Use Playwright only for visual/screenshot verification.
