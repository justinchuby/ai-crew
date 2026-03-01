import { describe, it, expect } from 'vitest';
import { CommandDispatcher } from '../agents/CommandDispatcher.js';

// ── Legacy bracket backward compatibility ─────────────────────────────
// scanBuffer converts legacy `[[[`/`]]]` to doubled Unicode brackets (`⟦⟦`/`⟧⟧`)
// before regex matching. This file tests that conversion and the doubled-bracket
// command infrastructure (isInsideCommandBlock, buffer tail logic, etc.).

describe('Legacy triple-bracket to doubled-bracket conversion', () => {
  it('converts [[[ to doubled Unicode open bracket', () => {
    const input = '[[[ COMMIT {"message": "fix"} ]]]';
    const result = input.replace(/\[\[\[/g, '⟦⟦').replace(/\]\]\]/g, '⟧⟧');
    expect(result).toBe('⟦⟦ COMMIT {"message": "fix"} ⟧⟧');
  });

  it('converts multiple legacy commands in one buffer', () => {
    const input = '[[[ LOCK_FILE {"filePath": "a.ts"} ]]]\ntext\n[[[ COMMIT {"message": "fix"} ]]]';
    const result = input.replace(/\[\[\[/g, '⟦⟦').replace(/\]\]\]/g, '⟧⟧');
    expect(result).toContain('⟦⟦ LOCK_FILE');
    expect(result).toContain('⟧⟧\ntext\n⟦⟦');
    expect(result).toContain('COMMIT {"message": "fix"} ⟧⟧');
  });

  it('does not affect double square brackets', () => {
    const input = '[[ not a command ]]';
    const result = input.replace(/\[\[\[/g, '⟦⟦').replace(/\]\]\]/g, '⟧⟧');
    expect(result).toBe('[[ not a command ]]');
  });

  it('does not affect single square brackets', () => {
    const input = '[ not a command ]';
    const result = input.replace(/\[\[\[/g, '⟦⟦').replace(/\]\]\]/g, '⟧⟧');
    expect(result).toBe('[ not a command ]');
  });
});

// ── Doubled bracket regex matching ────────────────────────────────────
// Command regexes match doubled Unicode brackets directly.

describe('Doubled bracket regex matching', () => {
  // These regexes mirror the pattern used in handler files (Phase 1)
  const COMMIT_REGEX = /⟦⟦\s*COMMIT\s*(\{.*?\})\s*⟧⟧/s;
  const QUERY_CREW_REGEX = /⟦⟦\s*QUERY_CREW\s*⟧⟧/s;
  const AGENT_MSG_REGEX = /⟦⟦\s*AGENT_MESSAGE\s*(\{.*?\})\s*⟧⟧/s;
  const BROADCAST_REGEX = /⟦⟦\s*BROADCAST\s*(\{.*?\})\s*⟧⟧/s;
  const DELEGATE_REGEX = /⟦⟦\s*DELEGATE\s*(\{.*?\})\s*⟧⟧/s;

  it('matches COMMIT with doubled brackets', () => {
    const input = '⟦⟦ COMMIT {"message": "fix bug"} ⟧⟧';
    const match = input.match(COMMIT_REGEX);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1]).message).toBe('fix bug');
  });

  it('matches QUERY_CREW with doubled brackets (no payload)', () => {
    expect('⟦⟦ QUERY_CREW ⟧⟧'.match(QUERY_CREW_REGEX)).toBeTruthy();
  });

  it('matches AGENT_MESSAGE with doubled brackets', () => {
    const input = '⟦⟦ AGENT_MESSAGE {"to": "abc", "content": "hello"} ⟧⟧';
    const match = input.match(AGENT_MSG_REGEX);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1]).content).toBe('hello');
  });

  it('matches BROADCAST with doubled brackets', () => {
    const input = '⟦⟦ BROADCAST {"content": "team update"} ⟧⟧';
    const match = input.match(BROADCAST_REGEX);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1]).content).toBe('team update');
  });

  it('matches DELEGATE with doubled brackets', () => {
    const input = '⟦⟦ DELEGATE {"to": "dev", "task": "Fix auth"} ⟧⟧';
    const match = input.match(DELEGATE_REGEX);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1]).to).toBe('dev');
  });

  it('does NOT match single bracket delimiters', () => {
    const input = '⟦ COMMIT {"message": "fix"} ⟧';
    expect(input.match(COMMIT_REGEX)).toBeNull();
  });

  it('matches legacy triple-bracket after conversion to doubled Unicode', () => {
    const legacy = '[[[ COMMIT {"message": "fix bug"} ]]]';
    const converted = legacy.replace(/\[\[\[/g, '⟦⟦').replace(/\]\]\]/g, '⟧⟧');
    const match = converted.match(COMMIT_REGEX);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1]).message).toBe('fix bug');
  });

  it('matches multiline JSON payloads', () => {
    const input = '⟦⟦ COMMIT {"message": "line1\\nline2"} ⟧⟧';
    const match = input.match(COMMIT_REGEX);
    expect(match).toBeTruthy();
  });

  it('matches with extra whitespace around command name', () => {
    const input = '⟦⟦   COMMIT   {"message": "fix"}   ⟧⟧';
    const match = input.match(COMMIT_REGEX);
    expect(match).toBeTruthy();
  });
});

// ── isInsideCommandBlock with doubled brackets ────────────────────────

describe('isInsideCommandBlock with doubled brackets', () => {
  const check = CommandDispatcher.isInsideCommandBlock;

  it('returns false for position before any command block', () => {
    const buf = 'some text ⟦⟦ COMMIT {"message": "fix"} ⟧⟧';
    expect(check(buf, 0)).toBe(false);
    expect(check(buf, 5)).toBe(false);
  });

  it('returns true for position inside a doubled-bracket command', () => {
    const buf = '⟦⟦ COMMIT {"message": "fix"} ⟧⟧';
    // Position after the opening doubled bracket
    expect(check(buf, 3)).toBe(true);
    expect(check(buf, 10)).toBe(true);
  });

  it('returns false for position after a closed command block', () => {
    const buf = '⟦⟦ COMMIT {"message": "fix"} ⟧⟧ done';
    const afterClose = buf.indexOf('done');
    expect(check(buf, afterClose)).toBe(false);
  });

  it('detects nested doubled brackets', () => {
    const buf = '⟦⟦ OUTER ⟦⟦ INNER ⟧⟧ ⟧⟧';
    // Position of the inner ⟦⟦
    const innerOpen = buf.indexOf('⟦⟦', 2);
    expect(check(buf, innerOpen)).toBe(true);
  });

  it('handles nested depth correctly', () => {
    const buf = '⟦⟦ A ⟦⟦ B ⟧⟧ still-in-A ⟧⟧';
    const stillInA = buf.indexOf('still-in-A');
    expect(check(buf, stillInA)).toBe(true);
  });

  it('treats single brackets as non-delimiters', () => {
    // A single ⟦ should NOT change depth — only doubled brackets count
    const buf = '⟦ single bracket ⟧';
    expect(check(buf, 5)).toBe(false);
  });

  it('handles JSON string containing bracket chars', () => {
    const buf = '⟦⟦ COMMIT {"message": "use ⟦⟦ and ⟧⟧ for commands"} ⟧⟧';
    // The brackets inside the JSON string literal are inside quotes,
    // so inString tracking prevents them from affecting depth
    const msgStart = buf.indexOf('"use');
    expect(check(buf, msgStart)).toBe(true);
  });

  it('handles empty string', () => {
    expect(check('', 0)).toBe(false);
  });

  it('handles position at string boundary', () => {
    const buf = '⟦⟦ CMD ⟧⟧';
    expect(check(buf, buf.length)).toBe(false);
  });
});

// ── Buffer tail logic for doubled brackets ────────────────────────────

describe('Buffer tail logic', () => {
  it('lastIndexOf finds doubled open bracket correctly', () => {
    const buf = 'text ⟦⟦ partial command without close';
    const lastOpen = buf.lastIndexOf('⟦⟦');
    expect(lastOpen).toBeGreaterThan(0);
    expect(buf.slice(lastOpen)).toBe('⟦⟦ partial command without close');
  });

  it('lastIndexOf does not match single bracket as doubled', () => {
    const buf = 'text ⟦ single bracket only';
    const lastOpen = buf.lastIndexOf('⟦⟦');
    expect(lastOpen).toBe(-1);
  });

  it('finds the last doubled bracket in multi-command buffer', () => {
    const buf = '⟦⟦ CMD1 ⟧⟧ text ⟦⟦ CMD2 incomplete';
    const lastOpen = buf.lastIndexOf('⟦⟦');
    expect(buf.slice(lastOpen)).toBe('⟦⟦ CMD2 incomplete');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────

describe('Doubled bracket edge cases', () => {
  const COMMIT_REGEX = /⟦⟦\s*COMMIT\s*(\{.*?\})\s*⟧⟧/s;

  it('adjacent doubled commands do not interfere', () => {
    const buf = '⟦⟦ COMMIT {"message": "a"} ⟧⟧⟦⟦ COMMIT {"message": "b"} ⟧⟧';
    const matches = [...buf.matchAll(new RegExp(COMMIT_REGEX.source, 'gs'))];
    expect(matches).toHaveLength(2);
    expect(JSON.parse(matches[0][1]).message).toBe('a');
    expect(JSON.parse(matches[1][1]).message).toBe('b');
  });

  it('quadrupled brackets (⟦⟦⟦⟦) — first two form open, next two form another open', () => {
    const buf = '⟦⟦⟦⟦';
    const lastOpen = buf.lastIndexOf('⟦⟦');
    // Should find at index 2 (the second pair)
    expect(lastOpen).toBe(2);
  });

  it('empty payload command with doubled brackets', () => {
    const QUERY_REGEX = /⟦⟦\s*QUERY_CREW\s*⟧⟧/s;
    expect('⟦⟦ QUERY_CREW ⟧⟧'.match(QUERY_REGEX)).toBeTruthy();
  });

  it('legacy [[[/]]] mixed with doubled Unicode brackets', () => {
    const input = '[[[ COMMIT {"message": "old"} ]]]\n⟦⟦ COMMIT {"message": "new"} ⟧⟧';
    // After legacy conversion
    const converted = input.replace(/\[\[\[/g, '⟦⟦').replace(/\]\]\]/g, '⟧⟧');
    const matches = [...converted.matchAll(new RegExp(COMMIT_REGEX.source, 'gs'))];
    expect(matches).toHaveLength(2);
    expect(JSON.parse(matches[0][1]).message).toBe('old');
    expect(JSON.parse(matches[1][1]).message).toBe('new');
  });

  it('text with no brackets passes through unchanged', () => {
    const input = 'just plain text with no special chars';
    const converted = input.replace(/\[\[\[/g, '⟦⟦').replace(/\]\]\]/g, '⟧⟧');
    expect(converted).toBe(input);
  });
});
