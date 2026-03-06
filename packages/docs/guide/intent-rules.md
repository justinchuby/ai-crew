# Intent Rules

Intent Rules control how agent decisions are handled — which ones are auto-approved, which trigger a notification, and which wait for your explicit approval.

## How It Works

When an agent makes a decision that needs confirmation, Flightdeck automatically categorizes it based on keywords in the decision title, then checks your intent rules to determine what to do.

### The Flow

1. **Agent creates a decision** — e.g., "Refactor the API module" or "Add lodash dependency"
2. **Auto-categorization** — the server classifies it by keyword matching (you don't configure this)
3. **Rule lookup** — Flightdeck finds the matching intent rule for that category
4. **Action executed** — the rule determines what happens next

### Categories

Decisions are automatically sorted into these categories:

| Category | What It Covers |
|----------|---------------|
| **Style** | Code formatting, naming, comments, linting |
| **Architecture** | Component structure, data flow, API design, refactoring |
| **Tool access** | File system operations, shell commands, external APIs |
| **Dependency** | Adding/removing packages, version changes |
| **Testing** | Writing/modifying tests, test configuration |
| **General** | Everything else |

You don't need to categorize decisions yourself — agents don't even know about categories. The server handles classification automatically.

### Actions

Each rule maps a category to one of three actions:

| Action | Color | What Happens |
|--------|-------|-------------|
| **Allow** | 🟢 Green | Decision is auto-approved immediately. No interruption. |
| **Alert** | 🟡 Yellow | Decision is auto-approved, but a toast notification appears so you're aware. |
| **Require review** | 🔴 Red | Decision is held pending until you explicitly approve or reject it. |

If no rule matches a decision, it auto-approves after a 60-second timeout.

## Trust Level Presets

Start with a preset and adjust from there:

### Autonomous (default)
Most decisions auto-approved. You get alerts for architecture and dependency changes.

| Style | Architecture | Tool Access | Dependency | Testing | General |
|:-----:|:----------:|:-----------:|:----------:|:-------:|:-------:|
| 🟢 Allow | 🟡 Alert | 🟢 Allow | 🟡 Alert | 🟢 Allow | 🟢 Allow |

### Moderate
Routine work flows through. Structural and dependency changes get more scrutiny.

| Style | Architecture | Tool Access | Dependency | Testing | General |
|:-----:|:----------:|:-----------:|:----------:|:-------:|:-------:|
| 🟢 Allow | 🔴 Review | 🟡 Alert | 🟡 Alert | 🟢 Allow | 🟡 Alert |

### Conservative
Most decisions require your approval. Only basic style decisions are auto-approved.

| Style | Architecture | Tool Access | Dependency | Testing | General |
|:-----:|:----------:|:-----------:|:----------:|:-------:|:-------:|
| 🟢 Allow | 🔴 Review | 🔴 Review | 🔴 Review | 🟡 Alert | 🔴 Review |

## Managing Rules

Open **Settings → Intent Rules** to:

- **Switch presets** — click a preset button to apply it instantly
- **Edit individual rules** — change the action for any category
- **Toggle rules on/off** — disable a rule without deleting it
- **Reorder by priority** — higher-priority rules match first

## Teach Me

After you batch-approve 3 or more decisions in the same category, Flightdeck suggests creating an "Allow" rule for that category. This is the **Teach Me** feature — it learns from your approval patterns and offers to automate them.

## Tips

- **Start with Autonomous** (the default) and tighten only if agents make decisions you disagree with
- **Use Alert for categories you want to monitor** — decisions still go through, but you see a notification
- **Require Review is for high-risk categories** — architecture changes on critical code, dependency additions to production
- **Watch for the Teach Me prompt** — if you're batch-approving the same category repeatedly, let Flightdeck create the rule for you

## API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/intents` | List all rules |
| `POST` | `/api/intents` | Create a new rule |
| `PATCH` | `/api/intents/:id` | Update a rule |
| `DELETE` | `/api/intents/:id` | Delete a rule |
| `POST` | `/api/intents/reorder` | Reorder rules by priority |
| `GET` | `/api/intents/presets` | Get available presets |
| `POST` | `/api/intents/presets/:name` | Apply a preset |
