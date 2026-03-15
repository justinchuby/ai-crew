// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  CollapsibleCommandBlock,
  AgentTextBlock,
  MarkdownWithTables,
  BlockMarkdown,
  MarkdownTable,
} from '../ChatRenderers';

vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel({ agents: [] }),
    { getState: () => ({ agents: [], setSelectedAgent: vi.fn() }) },
  ),
}));

vi.mock('../../../utils/markdown', () => ({
  InlineMarkdownWithMentions: ({ text }: { text: string }) => <span>{text}</span>,
}));

// IMPORTANT: Do NOT mock commandParser — let the real splitCommandBlocks run

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

/* ── CollapsibleCommandBlock ─────────────────────────────────── */

describe('CollapsibleCommandBlock', () => {
  it('extracts label and JSON preview, expands on click', () => {
    const text = '⟦⟦ EXECUTE {"task":"build"} ⟧⟧';
    const { container } = render(<CollapsibleCommandBlock text={text} />);
    // Label extracted from ⟦⟦ <NAME>
    expect(screen.getByText('EXECUTE')).toBeDefined();
    // Preview shows first string field: "task: build"
    expect(screen.getByText(/task: build/)).toBeDefined();

    // Click to expand
    fireEvent.click(container.firstElementChild!);
    // Full text visible in <pre>
    expect(screen.getByText(text)).toBeDefined();
  });

  it('shows truncated raw text as preview for non-JSON payload', () => {
    const text = '⟦⟦ EXECUTE {malformed json} ⟧⟧';
    render(<CollapsibleCommandBlock text={text} />);
    expect(screen.getByText('EXECUTE')).toBeDefined();
    // Falls back to raw text preview (the JSON-like fragment)
    expect(screen.getByText(/malformed json/)).toBeDefined();
  });

  it('defaults label to "command" when no name match', () => {
    const text = 'no brackets here';
    render(<CollapsibleCommandBlock text={text} />);
    expect(screen.getByText('command')).toBeDefined();
  });

  it('truncates long string values in preview', () => {
    const longVal = 'a'.repeat(100);
    const text = `⟦⟦ DO_THING {"msg":"${longVal}"} ⟧⟧`;
    render(<CollapsibleCommandBlock text={text} />);
    // Preview should be truncated to 80 chars with "..."
    expect(screen.getByText(/\.\.\./)).toBeDefined();
  });

  it('skips non-string fields when building preview', () => {
    const text = '⟦⟦ CMD {"count":5,"name":"hello"} ⟧⟧';
    render(<CollapsibleCommandBlock text={text} />);
    // Should pick "name" (first string field), not "count"
    expect(screen.getByText(/name: hello/)).toBeDefined();
  });
});

/* ── AgentTextBlock ──────────────────────────────────────────── */

describe('AgentTextBlock', () => {
  it('renders a complete ⟦⟦ ⟧⟧ real-command as collapsible block', () => {
    const text = '⟦⟦ COMPLETE_TASK {"summary":"done"} ⟧⟧';
    render(<AgentTextBlock text={text} />);
    expect(screen.getByText('COMPLETE_TASK')).toBeDefined();
  });

  it('renders unclosed ⟦⟦ block as collapsible when real command', () => {
    const text = '⟦⟦ EXECUTE {"task":"x"}';
    render(<AgentTextBlock text={text} />);
    expect(screen.getByText('EXECUTE')).toBeDefined();
  });

  it('renders unclosed ⟦⟦ non-command as markdown', () => {
    const text = '⟦⟦ hello world';
    render(<AgentTextBlock text={text} />);
    // Not a real command so rendered as markdown (InlineMarkdown stub renders <span>)
    expect(screen.getByText(/hello world/)).toBeDefined();
  });

  it('handles dangling ⟧⟧ — renders command block and remaining text', () => {
    // The real splitCommandBlocks will keep dangling ⟧⟧ as part of the text segment
    const text = 'some text ⟧⟧ more text';
    render(<AgentTextBlock text={text} />);
    // The "more text" part should be rendered
    expect(screen.getByText(/more text/)).toBeDefined();
  });

  it('renders non-command ⟦⟦ ⟧⟧ block as markdown', () => {
    const text = '⟦⟦ hello world ⟧⟧';
    render(<AgentTextBlock text={text} />);
    // Not ALL_CAPS so rendered as MarkdownWithTables → InlineMarkdown
    expect(screen.getByText(/hello world/)).toBeDefined();
  });

  it('renders plain text segments as markdown', () => {
    const text = 'just some regular text';
    render(<AgentTextBlock text={text} />);
    expect(screen.getByText('just some regular text')).toBeDefined();
  });

  it('skips empty segments', () => {
    const { container } = render(<AgentTextBlock text="" />);
    expect(container.innerHTML).toBe('');
  });
});

/* ── MarkdownWithTables ──────────────────────────────────────── */

describe('MarkdownWithTables', () => {
  it('detects and renders a markdown table as HTML table', () => {
    const text = '|col1|col2|\n|---|---|\n|a|b|';
    const { container } = render(<MarkdownWithTables text={text} />);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(screen.getByText('col1')).toBeDefined();
    expect(screen.getByText('a')).toBeDefined();
  });

  it('renders non-table text as BlockMarkdown', () => {
    const text = 'Hello world, no tables here';
    render(<MarkdownWithTables text={text} />);
    expect(screen.getByText('Hello world, no tables here')).toBeDefined();
  });

  it('skips empty parts', () => {
    const text = '   ';
    const { container } = render(<MarkdownWithTables text={text} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders mixed table and text content', () => {
    const text = 'Before table\n|h1|h2|\n|--|--|\n|v1|v2|\nAfter table';
    const { container } = render(<MarkdownWithTables text={text} />);
    expect(container.querySelector('table')).not.toBeNull();
    expect(screen.getByText(/Before table/)).toBeDefined();
  });
});

/* ── BlockMarkdown ───────────────────────────────────────────── */

describe('BlockMarkdown', () => {
  it('renders code fences as <pre><code> blocks', () => {
    const text = '```js\nconsole.log("hi")\n```';
    const { container } = render(<BlockMarkdown text={text} />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe('console.log("hi")\n');
  });

  it('renders text without code fences as InlineMarkdown', () => {
    const text = 'Simple paragraph text';
    render(<BlockMarkdown text={text} />);
    expect(screen.getByText('Simple paragraph text')).toBeDefined();
  });

  it('renders mixed code fences and text', () => {
    const text = 'Before\n```\ncode\n```\nAfter';
    const { container } = render(<BlockMarkdown text={text} />);
    expect(container.querySelector('pre')).not.toBeNull();
    expect(screen.getByText(/Before/)).toBeDefined();
    expect(screen.getByText(/After/)).toBeDefined();
  });

  it('handles code fence without language specifier', () => {
    const text = '```\nplain code\n```';
    const { container } = render(<BlockMarkdown text={text} />);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toContain('plain code');
  });

  it('skips empty segments between code fences', () => {
    const text = '```\na\n```\n```\nb\n```';
    const { container } = render(<BlockMarkdown text={text} />);
    const pres = container.querySelectorAll('pre');
    expect(pres.length).toBe(2);
  });
});

/* ── MarkdownTable ───────────────────────────────────────────── */

describe('MarkdownTable', () => {
  it('renders full table with headers, separator, and body rows', () => {
    const raw = '| Name | Age |\n|---|---|\n| Alice | 30 |\n| Bob | 25 |';
    const { container } = render(<MarkdownTable raw={raw} />);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    // Header cells
    expect(screen.getByText('Name')).toBeDefined();
    expect(screen.getByText('Age')).toBeDefined();
    // Body cells
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('30')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
    // Check rows: 1 header row + 2 body rows
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(3);
  });

  it('renders table without separator row', () => {
    const raw = '| H1 | H2 |\n| D1 | D2 |';
    const { container } = render(<MarkdownTable raw={raw} />);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(screen.getByText('H1')).toBeDefined();
    expect(screen.getByText('D1')).toBeDefined();
  });

  it('falls back to inline markdown for single line', () => {
    const raw = '| only one line |';
    render(<MarkdownTable raw={raw} />);
    expect(screen.getByText('| only one line |')).toBeDefined();
  });
});
