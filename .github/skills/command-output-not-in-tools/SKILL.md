---
name: command-output-not-in-tools
description: Flightdeck commands (AGENT_MESSAGE, COMPLETE_TASK, GROUP_MESSAGE, etc.) must be emitted directly in your text response, not inside bash/tool calls. Use when agent commands are not being delivered or when '(no output)' appears in Agent Reports despite the agent doing work.
---

# Flightdeck Commands Go in Text, Not in Tools

Flightdeck commands like AGENT_MESSAGE, COMPLETE_TASK, GROUP_MESSAGE, BROADCAST, ACTIVITY, LOCK_FILE, etc. are parsed from your **text response stream** — the words you write between tool calls.

## The Mistake

Wrapping commands in `bash echo`:

```
# WRONG — command prints to shell stdout, flightdeck never sees it
bash: echo '⟦⟦ AGENT_MESSAGE {"to": "lead", "content": "my findings"} ⟧⟧'
```

This looks like it should work, but the flightdeck command parser reads your conversation text output, not tool call stdout. The command is silently lost.

## The Fix

Output commands directly in your text response:

```
Here are my findings: ...

⟦⟦ AGENT_MESSAGE {"to": "lead", "content": "my findings"} ⟧⟧
```

The command block appears in your text stream where the flightdeck parser can find and execute it.

## Why This Happens

- Agents biased toward tool-based execution route everything through bash
- The command bracket syntax looks like something that should be "executed"
- System prompts emphasizing brevity push agents to minimize text output
- There's no error or warning when a command is trapped inside a tool call

## Rule of Thumb

- **Tools** (bash, grep, view, edit, create): for interacting with the filesystem and codebase
- **Commands** (AGENT_MESSAGE, COMPLETE_TASK, etc.): for interacting with flightdeck — always in your text output
