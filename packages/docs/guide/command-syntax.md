# Command Syntax

## The `⟦ ⟧` Fence

Agents communicate via structured commands embedded in their output. Commands use mathematical bracket syntax:

```
⟦ COMMAND_NAME {"key": "value"} ⟧
```

> [!NOTE]
> The characters `⟦` (U+27E6) and `⟧` (U+27E7) are mathematical white square brackets. They were chosen because they never appear in code, JSON, or natural language — eliminating false matches.

## Why Not `[[[ ]]]`?

The original `[[[ COMMAND {json} ]]]` syntax caused issues:
1. **Parser confusion**: `[[[` inside JSON payloads triggered false command matches
2. **UI rendering**: `[[[` in displayed content was misidentified as commands
3. **Nesting ambiguity**: Required complex tracking to distinguish real commands from text
| Never appears in code/JSON/markdown | ✅ | ✅ | ❌ (>>> in Python, git conflicts) | ❌ |
| Single char each (clean regex) | ✅ (1 char) | ✅ (1 char) | ❌ (multi-char) | ❌ |
| Visually distinct from `[` | ✅ (thick double bracket) | ✅ | ✅ | ❌ |
| Copy-paste safe | ✅ | ⚠️ (emoji skin-tone modifiers) | ✅ | ✅ |
| Terminal rendering | ✅ (all modern terminals) | ⚠️ (width issues) | ✅ (macOS only) | ✅ |
| LLM tokenizer | ✅ (1-2 tokens) | ⚠️ (variable tokens) | ✅ | ✅ |
| Keyboard accessible | ⚠️ (needs copy-paste) | ⚠️ | ⚠️ | ✅ |
| UTF-8 bytes | 3 each | 4 each | 3 each | 1 each |

**Runner-up:** `⌘{ }⌘` (U+2318) — clean but macOS-centric and overloaded with Mac's Cmd key meaning.

**Rejected:** Full emoji (🔧, 🤖, ⚡) — variable-width rendering in terminals, some tokenizers split them, skin-tone/ZWJ modifiers can corrupt them during copy-paste.

### New syntax

```
⟦ COMMIT {"message": "fix: something"} ⟧
⟦ CREATE_AGENT {"role": "developer", "task": "Build API"} ⟧
⟦ AGENT_MESSAGE {"to": "abc123", "content": "hello"} ⟧
```

## Is Backtick-Escaping Sufficient Instead?

**No.** Backtick-escaping (`\[\[\[` or `` `[[[` ``) has fundamental problems:

1. **Agents can't reliably escape**: LLMs don't consistently escape special syntax in their output. The whole point is that agents discuss `[[[` naturally.
2. **UI already solved this**: Our `isRealCommandBlock` fix handles display. But the server parser still needs `isInsideCommandBlock` string tracking.
3. **Doesn't eliminate the parser complexity**: We'd still need the JSON-string-aware scanner in CommandDispatcher.

The emoji fence **eliminates the entire category of problems** — `⟦` never appears in code, JSON, markdown, task descriptions, or natural language. Zero false matches. `isInsideCommandBlock` becomes unnecessary.

## Migration Path

The migration from `[[[ ]]]` to `⟦ ⟧` was completed in four phases:

1. **Phase 1:** Updated all ~50 command regex patterns in 11 handler modules to use `⟦ ⟧`
2. **Phase 2:** Updated `CommandDispatcher.scanBuffer()` to detect `⟦` instead of `[[[`
3. **Phase 3:** Updated all UI components (regex patterns, display logic)
4. **Phase 4:** Updated all test files to use `⟦ ⟧` syntax

The `[[[` syntax is **no longer supported**. All commands must use `⟦ ⟧`.

### Escaping Brackets in Text

When agents need to discuss the bracket characters themselves (e.g., in documentation or instructions), they reference them by Unicode codepoint:

- `U+27E6` for `⟦`
- `U+27E7` for `⟧`

This avoids accidental command detection. There is no backslash-escape mechanism — the parser has no escape handling.

## Downsides & Mitigations

### 1. Unicode rendering on old terminals
**Risk:** `⟦` might render as `?` or a box on very old terminals.  
**Mitigation:** All terminals from the last 10 years support BMP Unicode (U+27E6 is Basic Multilingual Plane). VS Code, iTerm2, Windows Terminal, GNOME Terminal all render it correctly.

### 2. Keyboard input difficulty
**Risk:** Users can't type `⟦` directly (no standard keyboard shortcut).  
**Mitigation:** Users rarely type commands manually — agents generate them. For the rare manual case: copy-paste from docs.

### 3. LLM tokenizer behavior
**Risk:** Some tokenizers might split `⟦` into multiple tokens or not recognize it.  
**Mitigation:** `⟦` (U+27E6) is a standard mathematical symbol in Unicode. GPT-4, Claude, and Gemini all handle it as 1-2 tokens. Test with each model before deploying.

### 4. Git diff noise
**Risk:** Initial migration commit changes many files.  
**Mitigation:** Phase 1 only changes regex patterns (mechanical, reviewable). No logic changes.

### 5. Incomplete command detection
**Risk:** `scanBuffer()` in CommandDispatcher.ts needs to detect partial `⟦` commands.  
**Mitigation:** `buf.lastIndexOf('⟦')` handles this cleanly with a single character check.

## Implementation Effort

| Component | Files | Changes |
|-----------|-------|---------|
| Command regex patterns | 11 command modules | ~50 regex updates (mechanical) |
| CommandDispatcher.scanBuffer | 1 file | lastIndexOf dual-check |
| isInsideCommandBlock | 1 file | Skip for `⟦` matches |
| RoleRegistry prompts | 1 file | Update syntax examples |
| UI isRealCommandBlock | 2 files | Add `⟦` pattern |
| Tests | ~5 files | Add `⟦` variant tests |
| **Total** | ~20 files | ~2-3 hours for a developer |

## Decision

**Use `⟦ ⟧` (U+27E6/U+27E7).** It eliminates the entire class of bracket-parsing bugs at the source. Migration was completed in a single session across four phases. The `isInsideCommandBlock` guard was removed entirely — zero false matches with Unicode brackets.
