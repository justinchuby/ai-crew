# Architecture Decision Records

Key architecture decisions made during AI Crew development (Waves 1–17).

---

## ADR-001: Class-based dark mode toggle

**Status**: Accepted  
**Context**: The UI needed a reliable light/dark theme toggle that persists across page loads, works without flash-of-wrong-theme (FOWT), and plays nicely with Tailwind CSS v4.

**Decision**: Use a CSS class (`dark`) on the `<html>` element to gate dark styles, toggled by a small initialization script injected into `<head>` before the React bundle loads.

**Rationale**:
- **No FOWT**: The inline script runs synchronously before any paint, reading `localStorage` and setting the class before the browser renders anything. A CSS media-query-only approach would flash light mode first on dark-preferring users until React hydrates.
- **Explicit user control**: A class toggle lets the user's saved preference override `prefers-color-scheme`, which is the correct UX for a tool people will use all day.
- **Tailwind integration**: Tailwind v4's `darkMode: 'class'` config generates `dark:` variants that apply when the class is present — zero extra CSS-in-JS overhead.
- **Framework-agnostic**: The class lives on `<html>`, so any component tree can read it without prop drilling or context.

**Alternatives considered**: CSS `prefers-color-scheme` only (no user override), `data-theme` attribute (works but less idiomatic with Tailwind), Zustand-driven class toggle (requires hydration before applying).

---

## ADR-002: CSS custom properties for theming

**Status**: Accepted  
**Context**: The app uses a rich color system for agent roles, status indicators, severity levels, and UI chrome. These colors need to be consistent across components and easy to update.

**Decision**: Define all semantic colors as CSS custom properties (variables) on `:root` and the `.dark` selector, then reference them in Tailwind config and component styles.

**Rationale**:
- **Single source of truth**: Change `--color-agent-running` once and every component using it updates automatically — no grep-and-replace across TSX files.
- **Dynamic theming**: CSS variables respond to the `.dark` class switch instantly without re-rendering any React components. The browser handles it.
- **Design token alignment**: Variables like `--color-critical`, `--color-notable`, `--color-routine` map 1:1 to the three-tier message classification system, making the relationship explicit.
- **Composability**: Tailwind's `theme()` function can consume the variables, giving us the full Tailwind utility class system on top of our semantic tokens.

**Alternatives considered**: Hardcoded Tailwind color classes (fragile, theme-blind), CSS-in-JS runtime injection (adds bundle weight and runtime cost), separate light/dark class sets (doubles the CSS).

---

## ADR-003: SQLite over PostgreSQL

**Status**: Accepted  
**Context**: AI Crew needs to persist agent conversations, decisions, activity logs, and DAG tasks. The server runs locally as a CLI tool (`npx ai-crew`), not on a cloud host.

**Decision**: Use SQLite with WAL mode via Drizzle ORM, tuned with pragmas: `busy_timeout=5000`, `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL`.

**Rationale**:
- **Zero-infrastructure install**: A user running `npx ai-crew` should not need to have PostgreSQL running. SQLite is embedded in the process — no separate server, no connection strings, no Docker.
- **WAL mode provides concurrency**: Write-Ahead Logging allows concurrent reads alongside a single writer, which matches the access pattern (many agents reading, one process writing batched activity).
- **Sufficient scale**: A local project session generates thousands of rows, not millions. SQLite handles this comfortably. The `busy_timeout` pragma prevents write-contention errors under the batched-write pattern.
- **Drizzle ORM portability**: If a team deployment scenario ever requires PostgreSQL, Drizzle's dialect system allows migrating with minimal schema changes — the SQL is largely compatible.
- **Simplicity of deployment**: The database is a single file at `~/.ai-crew/crew.db`, trivially copyable, inspectable with any SQLite browser, and deletable to reset state.

**Alternatives considered**: PostgreSQL (requires external server), PGlite (browser-only), LevelDB (no SQL, harder to query), in-memory only (no persistence).

---

## ADR-004: EventPipeline architecture

**Status**: Accepted  
**Context**: As the system grew, more cross-cutting reactions were needed: run tests after a commit, log a summary when a task completes, send a webhook when an agent fails. Wiring these directly into command handlers created tangled dependencies.

**Decision**: Implement an `EventPipeline` — a typed event bus where command handlers emit domain events (`agent.committed`, `task.completed`, `agent.failed`) and reactive handlers subscribe to them independently.

**Rationale**:
- **Decoupling**: The `COMMIT` command handler emits `agent.committed` and returns. It does not know or care that a CI runner might trigger, a webhook might fire, or an activity entry gets written. Each concern registers its own handler.
- **Testability**: Handlers can be tested in isolation by emitting mock events — no need to construct the full command execution path.
- **Extensibility**: Adding a new reaction (e.g. "notify the lead when any agent crashes") requires adding one handler, not modifying existing command code.
- **Typed events**: TypedEmitter enforces that event payloads match their declared shapes at compile time, catching integration bugs before runtime.

**Alternatives considered**: Direct method calls (tight coupling, hard to extend), Pub/Sub with string events only (no type safety), Redux-style reducers (overkill for a server-side event system).

---

## ADR-005: Command decomposition into modules

**Status**: Accepted  
**Context**: The `CommandDispatcher` originally handled all ACP commands in a single large file. As commands grew to 30+, the file exceeded 800 lines and was difficult to navigate and test.

**Decision**: Split command handling into seven domain-grouped modules: `AgentCommands`, `CommCommands`, `TaskCommands`, `CoordCommands`, `SystemCommands`, `DeferredCommands`, `TimerCommands`. The `CommandDispatcher` becomes a thin router (~193 lines) that parses triple-bracket syntax and delegates.

**Rationale**:
- **Cognitive load**: Developers working on agent coordination don't need to read messaging code. Module boundaries match mental models.
- **Parallel development**: Multiple agents on the team can work on different command modules without merge conflicts in a single file.
- **Focused tests**: Each module has its own test file. `AgentCommands.test.ts` tests agent lifecycle; it doesn't need to mock the group chat registry.
- **Discoverability**: New engineers looking for "how does LOCK_FILE work?" can go directly to `CoordCommands.ts` rather than searching a monolithic file.

**Alternatives considered**: Single file with regions/comments (common but doesn't enforce boundaries), class-per-command (over-engineered, too many files), command pattern objects (adds abstraction without benefit at this scale).

---

## ADR-006: Capability injection over role mutation

**Status**: Accepted  
**Context**: Agents accumulate expertise as they work — a developer who has touched `packages/server/src/api.ts` repeatedly has domain knowledge that should be reusable. The question was how to represent and query this: mutate the agent's role definition, or track capabilities separately.

**Decision**: Implement a `CapabilityRegistry` that stores acquired capabilities (file paths, technologies, keywords, domains) keyed by agent ID. The agent's role definition is immutable; capabilities are injected at query time via `AgentMatcher`.

**Rationale**:
- **Role immutability**: Roles are shared definitions used to spawn new agents. Mutating a role to add capabilities from one instance would corrupt the template for future spawns.
- **Queryability**: A separate registry supports rich queries (`find agents with TypeScript + React experience who are idle`) without scanning role objects.
- **Garbage collection**: When an agent is terminated, its capabilities are removed from the registry cleanly. If capabilities lived on the role, they'd be hard to scope to a session.
- **Retrospective analysis**: The capability registry provides data for the performance leaderboard and smart agent matching — it's a queryable knowledge graph, not just a tag list.
- **Capability injection pattern**: At delegation time, the system can inform a new agent "you've been matched because of your expertise in X" — this is only possible if capabilities are tracked independently.

**Alternatives considered**: Role tags mutated per session (pollutes shared role definitions), agent metadata field (works but no rich query support), in-memory only without registry (not queryable across agents).
