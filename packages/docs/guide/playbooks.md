# Playbooks & Custom Roles

Playbooks are reusable session templates that define goals, roles, and starter tasks. Custom Roles let you create specialized agents beyond the 13 built-in roles. Community Playbooks let you share and discover playbooks from other users.

## Playbooks

### What is a Playbook?

A playbook captures a successful session pattern so you can re-use it:
- **Goal** — what the session aims to accomplish
- **Roles** — which agent roles to spawn
- **Starter tasks** — initial tasks assigned to the lead
- **Configuration** — model preferences, trust level, budget

### Built-in Playbooks

Flightdeck ships with several starter playbooks:
- **Feature Build** — lead + developers + architect + reviewer
- **Code Review** — reviewer + developer for targeted review
- **Bug Fix** — lead + developer + QA tester
- **Documentation** — tech writer + reviewer
- **Refactoring** — architect + developers + reviewer

### Creating Playbooks

1. Go to Playbooks page
2. Click "Create Playbook"
3. Configure goal, roles, tasks, and settings
4. Save — your playbook appears in the gallery

Or save a running session as a playbook to capture a successful pattern.

### API

```
GET /api/playbooks → [{ id, name, description, roles, tasks }]
POST /api/playbooks → { name, description, roles, tasks, config }
DELETE /api/playbooks/:id
POST /api/playbooks/:id/duplicate
```

## Custom Role Builder

Create specialized agent roles beyond the 13 built-in options.

### Building a Role

The Role Builder provides a visual editor with:

1. **Identity** — name, emoji icon, color
2. **Model selection** — comparison cards showing capability stars and cost per token
3. **Prompt template** — system prompt defining the role's behavior, selected from 6 categories:
   - General purpose
   - Code-focused
   - Review-focused
   - Creative
   - Research
   - Custom
4. **Live preview** — see how the agent card will look as you configure

### Testing Roles

Before deploying a custom role, use the "Test Role" dry-run:
1. Click "Test Role" in the builder
2. Provide a sample task
3. See how the role would respond (first few messages)
4. Iterate on the prompt until satisfied

### API

```
GET /api/roles → [{ id, name, icon, color, model, prompt }]
POST /api/roles → { name, icon, color, model, prompt, category }
PUT /api/roles/:id → { ...updates }
DELETE /api/roles/:id
POST /api/roles/test → { role, sampleTask } → { response }
```

## Community Playbooks

Share and discover playbooks from the Flightdeck community.

### Browsing

The Community Gallery lets you:
- **Search** by keyword
- **Filter** by category (Development, Review, Documentation, DevOps)
- **Sort** by stars, downloads, or recency
- **Featured** section highlights top-rated playbooks

### Rating & Reviews

- **Star ratings** (1–5) on any community playbook
- **Written reviews** with your experience
- Browse reviews before forking

### Forking

Fork a community playbook to customize it:
1. Click "Fork" on any community playbook
2. The playbook is copied to your local collection
3. Modify any field — it's now yours
4. The original author and fork count are preserved

### Publishing

Share your playbooks with the community:

1. Click "Publish" on any local playbook
2. **Privacy guardrails** automatically strip:
   - System prompts (could contain proprietary instructions)
   - Secrets and tokens
   - File paths specific to your machine
3. Select a category and add tags
4. Review the included content checklist
5. Publish

> [!WARNING]
> Review the privacy guardrail summary before publishing. Ensure no sensitive information is included.

### Version Updates

When an upstream playbook you've forked receives updates:
- A banner appears on your forked copy
- Click to see a diff view of changes
- Choose to merge updates or keep your version

### API

```
GET /api/playbooks/community → [{ id, name, author, stars, downloads }]
GET /api/playbooks/community/:id → { ...detail, reviews }
POST /api/playbooks/community → { playbookId, category, tags }
GET /api/playbooks/community/:id/reviews → [{ user, stars, comment }]
POST /api/playbooks/community/:id/reviews → { stars, comment }
POST /api/playbooks/community/:id/fork → { localPlaybookId }
```
