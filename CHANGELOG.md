# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - Unreleased

### Added

- CHANGELOG.md to track project changes
- Comprehensive documentation refresh across README and docs site
- **Image/file attachment support** — upload images via drag-and-drop, clipboard paste, or file selection
  - `useAttachments` hook for attachment state management (add, remove, clear)
  - `AttachmentBar` component with thumbnail previews, displayed as a floating tooltip above the input
  - `DropOverlay` component for full-pane drag indicator
  - `useFileDrop` hook extended with `handlePaste` for clipboard image support
  - ACP `ContentBlock[]` support in `AcpConnection` for sending images to agents
  - Server-side `buildContentBlocks()` with `supportsImages` check (graceful text fallback)
  - Full integration in both LeadDashboard and ChatPanel
- Full-window drop zones — drag-and-drop targets now cover the entire chat area, not just the input strip
- Bezier edges in DAG visualization for clearer connectivity
- Hide incoming DMs in main chat feed and auto-scroll agent reports
- Hide outgoing DMs and make incoming messages collapsible

### Changed

- Bumped all package versions from 0.1.0 to 0.2.0
- Bumped lucide-react ^0.575.0 → ^0.577.0 and postcss ^8.5.6 → ^8.5.8
- Global JSON body parser limit raised from 1MB to 10MB to support image attachments

### Fixed

- Documentation accuracy improvements (URLs, command syntax, CLI flags)
- Attachment schema `const` ordering — `attachmentSchema` was referenced before definition (ReferenceError)
- Body parser dead code — route-level `json({ limit })` middleware was shadowed by global parser
- Attachment schema security hardening: mimeType restricted to `image/png`, `image/jpeg`, `image/gif`, `image/webp`; data field capped at ~10MB base64
- `clearAttachments()` now only runs on successful send, not after failed fetch
- @user mention styling: brighter highlights in dark mode, font-medium and light-mode text refinements
- @mentions now render inline instead of block-level
- ISO 8601 UTC timestamps (Z suffix) for all datetime defaults
- Gantt chart scroll padding and timezone-safe timestamp parsing
- Timeline legend visibility and timestamp formatting
- Exit code normalization, scroll fix, and shell safety improvements
- Use `which` instead of `command` builtin; guard against double exit
- Double-bracket command parsing in agent chat pane
- Graceful spawn error handling with preserved error details

## [0.1.0] - 2026-03-01

### Added

- Initial release of Flightdeck
- Multi-agent orchestration with 13 specialized roles
- Real-time web UI with Lead Dashboard, Agents View, and Settings
- Agent Client Protocol (ACP) support
- Task DAG with auto-dependency inference
- TIDE Protocol (Trust-Informed Dynamic Escalation)
- Timeline visualization with swim-lane display
- Chat groups with auto-creation for multi-agent coordination
- File locking and crash recovery coordination
- Mission Control with 8 configurable panels
- SQLite database with Drizzle ORM
- VitePress documentation site
