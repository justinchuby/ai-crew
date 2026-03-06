---
name: infrastructure
description: >
  Flightdeck infrastructure reference. Covers monorepo structure, build system,
  database setup, environment config, and deployment.
---

# Flightdeck Infrastructure

## Monorepo Structure

```
packages/
  server/    — Express backend + SQLite + WebSocket
  web/       — React frontend (Vite + Tailwind)
  docs/      — VitePress documentation site
```

All packages share `tsconfig.base.json` at the repo root.

## Server (packages/server)

- **Express 5** with TypeScript, run via `tsx`.
- **SQLite** with **Drizzle ORM** — WAL mode enabled for concurrent reads.
- Port from `SERVER_PORT` environment variable (default: 3006).
- Auth token generated on startup — set `AUTH=none` to disable authentication.
- **WebSocket** for real-time updates — 30-second heartbeat interval.
- Changes picked up on restart (tsx doesn't hot-reload, but dev script watches).

## Frontend (packages/web)

- **React 19** + **Vite** + **Tailwind CSS 4**.
- Charts: **visx** (D3-based React bindings).
- Canvas: **ReactFlow** for node-based visualization.
- State management: **Zustand** stores.
- Routing: **React Router v7** with lazy-loaded routes.
- Testing: **Vitest** + **@testing-library/react** + **jsdom**.

## Development Startup

```bash
npm run dev        # From repo root
# → runs scripts/dev.mjs
# → starts server first, then Vite dev server
```

- Vite dev server on **`:5173`** — proxies `/api/*` requests to the server port.
- Always access the app via `:5173` in development (not the server port directly).

## Testing

```bash
cd packages/web
npx vitest run                    # Run all tests
npx vitest run src/path/to/test   # Run specific test file
```

- Tests use `jsdom` environment — add `// @vitest-environment jsdom` comment at top of test file if not using the global config.
- Pre-existing failures (from other work) should be filtered, not fixed: `CatchUpBanner`, `MentionText`.

## Build

```bash
npm run build      # Build all packages
cd packages/web && npx vite build   # Frontend only
cd packages/web && npx tsc --noEmit # Type check only
```

- TypeScript strict mode. Filter known pre-existing TS errors when checking your changes.

## Playwright MCP

- Available for UI testing — can take screenshots, interact with the running app.
- Useful for verifying visual regressions and end-to-end flows.

## Database

- SQLite file at `flightdeck.db` in repo root.
- Drizzle handles migrations — schema in `packages/server/src/db/`.
- WAL mode for concurrent access from multiple server processes.

## Key Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `SERVER_PORT` | Express server port | 3006 |
| `AUTH` | Auth mode (`none` to disable) | token-based |
| `NODE_ENV` | Environment | development |

## Test Suite

- **Total: 3,662 tests** — 902 web + 2,760 server.
- Run web: `cd packages/web && npx vitest run`
- Run server: `cd packages/server && npx vitest run`
- Add `// @vitest-environment jsdom` directive at top of test files that use DOM APIs.
- Pre-existing failures (not your problem): CatchUpBanner (10), MentionText (2), 2 server integration tests.
- When using `<Link>` from react-router-dom, wrap test renders in `<MemoryRouter>`.
- When testing `react-virtuoso` components, mock Virtuoso to render all items (jsdom can't measure layout).

## Production Build

```bash
npm run build          # Build all packages from root
npm test               # Run all tests
```

- Build output: `packages/web/dist/`
- Fonts copied from `public/fonts/` to `dist/fonts/` automatically by Vite.
