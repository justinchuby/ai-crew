# Predictive Intelligence (Removed)

::: warning Removed Feature
Predictive Intelligence was removed from Flightdeck. The prediction types (agent stall, cost overrun, context exhaustion) were found to add noise rather than value:

- **Agent stall** — Long tasks are normal for AI agents; stall detection produced false positives
- **Cost overrun** — Cost tracking was removed as it's not actionable for most users
- **Context exhaustion** — Handled automatically by Copilot's context compaction

The PredictionService source code is retained but not wired up.
:::

See [Features Overview](/guide/features) for current capabilities.
