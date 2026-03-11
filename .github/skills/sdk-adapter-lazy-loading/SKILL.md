---
name: sdk-adapter-lazy-loading
description: "Historical: SDK adapters have been removed. All providers now use AcpAdapter (ACP over stdio). This skill is retained for historical context only."
---

# SDK Adapter Lazy Loading (Archived)

> **This skill is no longer applicable.** Flightdeck migrated to an ACP-only adapter architecture — all providers (Copilot, Claude, Gemini, Cursor, Codex, OpenCode) now use `AcpAdapter`, which spawns CLI binaries as subprocesses communicating over the ACP stdio protocol.

## What Changed

Previously, Flightdeck used three adapter backends:

- **CopilotSdkAdapter** — used `@github/copilot-sdk` via JSON-RPC (lazy loaded)
- **ClaudeSdkAdapter** — used `@anthropic-ai/claude-agent-sdk` in-process (lazy loaded)
- **AcpAdapter** — subprocess via ACP stdio (used for all other providers)

Both SDK adapters required lazy dynamic `import()` to avoid crashing the server when their respective SDK packages weren't installed. SDK packages were listed as `optionalDependencies`.

## Current Architecture

All providers now use `AcpAdapter` exclusively. There are no SDK dependencies to lazy-load:

- `@github/copilot-sdk` — **removed**
- `@anthropic-ai/claude-agent-sdk` — **removed**
- `CopilotSdkAdapter.ts` — **removed**
- `ClaudeSdkAdapter.ts` — **removed**

The `BackendType` is now `'acp' | 'mock'`, and `AdapterFactory.resolveBackend()` returns `'acp'` for all providers.

For the current adapter architecture, see the [adapter-architecture-pattern](../adapter-architecture-pattern/SKILL.md) skill.
