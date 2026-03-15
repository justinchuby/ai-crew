// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  CollapsibleCommandBlock,
  AgentTextBlock,
  BlockMarkdown,
  MarkdownWithTables,
  InlineMarkdown,
  RichContentBlock,
  CollapsibleReasoningBlock,
  isRealCommandBlock,
} from '../ChatRenderers';

vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ agents: [], setSelectedAgent: vi.fn() }),
    { getState: () => ({ agents: [], setSelectedAgent: vi.fn() }) },
  ),
}));

vi.mock('../../../utils/markdown', () => ({
  InlineMarkdownWithMentions: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('../../../utils/commandParser', () => ({
  splitCommandBlocks: (text: string) => {
    const blocks: string[] = [];
    const re = /⟦⟦[\s\S]*?⟧⟧/g;
    let match;
    let lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        blocks.push(text.slice(lastIndex, match.index));
      }
      blocks.push(match[0]);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      blocks.push(text.slice(lastIndex));
    }
    if (blocks.length === 0) blocks.push(text);
    return blocks;
  },
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

// ---------------------------------------------------------------------------
// CollapsibleCommandBlock
// ---------------------------------------------------------------------------
describe('CollapsibleCommandBlock', () => {
  it('renders collapsed with label extracted from command name', () => {
    render(<CollapsibleCommandBlock text='⟦⟦ COMPLETE_TASK {"summary":"done"} ⟧⟧' />);
    expect(screen.getByText('COMPLETE_TASK')).toBeDefined();
  });

  it('defaults label to "command" when no name matches', () => {
    render(<CollapsibleCommandBlock text="some random text without markers" />);
    expect(screen.getByText('command')).toBeDefined();
  });

  it('shows JSON preview with first string field', () => {
    render(<CollapsibleCommandBlock text='⟦⟦ AGENT_MESSAGE {"to":"bob","body":"hello world"} ⟧⟧' />);
    expect(screen.getByText(/to: bob/)).toBeDefined();
  });

  it('truncates long JSON preview values with ellipsis', () => {
    const longVal = 'x'.repeat(100);
    render(<CollapsibleCommandBlock text={`⟦⟦ CMD {"msg":"${longVal}"} ⟧⟧`} />);
    expect(screen.getByText(/\.\.\./)).toBeDefined();
  });

  it('falls back to raw text preview on invalid JSON', () => {
    render(<CollapsibleCommandBlock text="⟦⟦ CMD {invalid json} ⟧⟧" />);
    // Should show the raw braces content as preview
    expect(screen.getByText(/invalid json/)).toBeDefined();
  });

  it('expands on click to show full text', () => {
    const fullText = '⟦⟦ COMPLETE_TASK {"summary":"done"} ⟧⟧';
    render(<CollapsibleCommandBlock text={fullText} />);
    fireEvent.click(screen.getByText('COMPLETE_TASK'));
    expect(screen.getByText(fullText)).toBeDefined();
  });

  it('hides preview when expanded', () => {
    render(<CollapsibleCommandBlock text='⟦⟦ AGENT_MESSAGE {"to":"bob"} ⟧⟧' />);
    // preview visible before click
    expect(screen.getByText(/to: bob/)).toBeDefined();
    fireEvent.click(screen.getByText('AGENT_MESSAGE'));
    // After expansion, the preview span is removed; the full text <pre> is shown
    const previewSpans = screen.queryAllByText(/— to: bob/);
    expect(previewSpans.length).toBe(0);
  });

  it('skips non-string fields in JSON for preview', () => {
    render(<CollapsibleCommandBlock text='⟦⟦ CMD {"count":42,"name":"test"} ⟧⟧' />);
    // Should show name (first string field), not count
    expect(screen.getByText(/name: test/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AgentTextBlock
// ---------------------------------------------------------------------------
describe('AgentTextBlock', () => {
  it('renders complete ⟦⟦ ... ⟧⟧ with real command as CollapsibleCommandBlock', () => {
    render(<AgentTextBlock text='⟦⟦ COMPLETE_TASK {"summary":"ok"} ⟧⟧' />);
    // CollapsibleCommandBlock renders the label
    expect(screen.getByText('COMPLETE_TASK')).toBeDefined();
  });

  it('renders complete ⟦⟦ ... ⟧⟧ with non-command as markdown', () => {
    render(<AgentTextBlock text="⟦⟦ hello world ⟧⟧" />);
    // Non-command → MarkdownWithTables → InlineMarkdown mock → <span>
    expect(screen.getByText('⟦⟦ hello world ⟧⟧')).toBeDefined();
  });

  it('renders plain text as markdown', () => {
    render(<AgentTextBlock text="Just plain text here" />);
    expect(screen.getByText('Just plain text here')).toBeDefined();
  });

  it('skips empty segments', () => {
    const { container } = render(<AgentTextBlock text="" />);
    // empty text → splitCommandBlocks returns [''] → trimmed is empty → null
    expect(container.innerHTML).toBe('');
  });

  it('renders mixed text and command blocks', () => {
    render(<AgentTextBlock text='Before ⟦⟦ AGENT_MESSAGE {"to":"x"} ⟧⟧ After' />);
    expect(screen.getByText('Before')).toBeDefined();
    expect(screen.getByText('AGENT_MESSAGE')).toBeDefined();
    expect(screen.getByText('After')).toBeDefined();
  });

  it('handles dangling ⟧⟧ by splitting into command block + remaining text', () => {
    // Simulate a segment that has ⟧⟧ but no ⟦⟦ (i.e., continuation from previous message)
    // Our mock splits on ⟦⟦...⟧⟧, so passing raw text with ⟧⟧ but no ⟦⟦
    render(<AgentTextBlock text='some payload ⟧⟧ and then more text' />);
    // The dangling handler creates a CollapsibleCommandBlock for "some payload ⟧⟧"
    expect(screen.getByText('command')).toBeDefined(); // default label
    // Remaining text rendered as markdown
    expect(screen.getByText('and then more text')).toBeDefined();
  });

  it('handles dangling ⟧⟧ with no remaining text after', () => {
    render(<AgentTextBlock text="payload ⟧⟧" />);
    expect(screen.getByText('command')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// BlockMarkdown
// ---------------------------------------------------------------------------
describe('BlockMarkdown', () => {
  it('renders plain text through InlineMarkdown', () => {
    render(<BlockMarkdown text="Simple paragraph" />);
    expect(screen.getByText('Simple paragraph')).toBeDefined();
  });

  it('renders fenced code blocks as <pre><code>', () => {
    const text = 'Before\n```js\nconsole.log("hi");\n```\nAfter';
    const { container } = render(<BlockMarkdown text={text} />);
    const codeEl = container.querySelector('pre code');
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toBe('console.log("hi");\n');
  });

  it('strips language identifier from code blocks', () => {
    const text = '```typescript\nconst x = 1;\n```';
    const { container } = render(<BlockMarkdown text={text} />);
    const codeEl = container.querySelector('pre code');
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toBe('const x = 1;\n');
    expect(codeEl!.textContent).not.toContain('typescript');
  });

  it('renders multiple code blocks with text between them', () => {
    const text = 'Intro\n```\nblock1\n```\nMiddle\n```\nblock2\n```\nEnd';
    const { container } = render(<BlockMarkdown text={text} />);
    const codeEls = container.querySelectorAll('pre code');
    expect(codeEls.length).toBe(2);
    expect(codeEls[0].textContent).toBe('block1\n');
    expect(codeEls[1].textContent).toBe('block2\n');
    expect(screen.getByText('Intro')).toBeDefined();
    expect(screen.getByText('End')).toBeDefined();
  });

  it('handles code block with no language identifier', () => {
    const text = '```\nplain code\n```';
    const { container } = render(<BlockMarkdown text={text} />);
    const codeEl = container.querySelector('pre code');
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toBe('plain code\n');
  });

  it('skips empty segments between code blocks', () => {
    const text = '```\nfoo\n```\n```\nbar\n```';
    const { container } = render(<BlockMarkdown text={text} />);
    const codeEls = container.querySelectorAll('pre code');
    expect(codeEls.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// MarkdownWithTables
// ---------------------------------------------------------------------------
describe('MarkdownWithTables', () => {
  it('renders text without tables through BlockMarkdown', () => {
    render(<MarkdownWithTables text="No table here" />);
    expect(screen.getByText('No table here')).toBeDefined();
  });

  it('renders embedded table as MarkdownTable', () => {
    const text = '| Col1 | Col2 |\n|---|---|\n| a | b |';
    const { container } = render(<MarkdownWithTables text={text} />);
    expect(container.querySelector('table')).not.toBeNull();
    expect(screen.getByText('Col1')).toBeDefined();
    expect(screen.getByText('a')).toBeDefined();
  });

  it('renders text interleaved with multiple tables', () => {
    const text =
      'Before\n| H1 | H2 |\n|---|---|\n| a | b |\nMiddle\n| H3 | H4 |\n|---|---|\n| c | d |\nAfter';
    const { container } = render(<MarkdownWithTables text={text} />);
    const tables = container.querySelectorAll('table');
    expect(tables.length).toBe(2);
    expect(screen.getByText('H1')).toBeDefined();
    expect(screen.getByText('H3')).toBeDefined();
  });

  it('skips empty parts', () => {
    const text = '| A | B |\n|---|---|\n| 1 | 2 |';
    const { container } = render(<MarkdownWithTables text={text} />);
    expect(container.querySelector('table')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// InlineMarkdown
// ---------------------------------------------------------------------------
describe('InlineMarkdown', () => {
  it('passes text to InlineMarkdownWithMentions mock', () => {
    render(<InlineMarkdown text="hello @agent" />);
    expect(screen.getByText('hello @agent')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// RichContentBlock extras
// ---------------------------------------------------------------------------
describe('RichContentBlock extras', () => {
  it('renders image without URI (no caption)', () => {
    const { container } = render(
      <RichContentBlock msg={{ contentType: 'image', data: 'imgdata' } as never} />,
    );
    const img = screen.getByAltText('Agent image');
    expect(img).toBeDefined();
    // Default mimeType is image/png
    expect(img.getAttribute('src')).toContain('data:image/png;base64,imgdata');
    // No URI paragraph
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('renders image with URI showing caption', () => {
    render(
      <RichContentBlock msg={{ contentType: 'image', data: 'imgdata', uri: 'https://example.com/img.png' } as never} />,
    );
    expect(screen.getByText('https://example.com/img.png')).toBeDefined();
  });

  it('renders audio with default mimeType when not provided', () => {
    const { container } = render(
      <RichContentBlock msg={{ contentType: 'audio', data: 'audiodata' } as never} />,
    );
    const source = container.querySelector('source');
    expect(source).not.toBeNull();
    expect(source!.getAttribute('src')).toContain('data:audio/wav;base64,audiodata');
    expect(source!.getAttribute('type')).toBe('audio/wav');
  });
});

// ---------------------------------------------------------------------------
// CollapsibleReasoningBlock extras
// ---------------------------------------------------------------------------
describe('CollapsibleReasoningBlock extras', () => {
  it('shows ellipsis when text is longer than 80 chars', () => {
    const longText = 'A'.repeat(100);
    render(<CollapsibleReasoningBlock text={longText} timestamp="12:34" />);
    expect(screen.getByText(/…/)).toBeDefined();
  });

  it('does not show ellipsis when text is 80 chars or fewer', () => {
    const shortText = 'B'.repeat(80);
    render(<CollapsibleReasoningBlock text={shortText} timestamp="12:34" />);
    const container = screen.getByText(/Reasoning/).closest('div')!;
    expect(container.textContent).not.toContain('…');
  });

  it('displays timestamp', () => {
    render(<CollapsibleReasoningBlock text="Thinking" timestamp="14:30" />);
    expect(screen.getByText('14:30')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// isRealCommandBlock additional cases
// ---------------------------------------------------------------------------
describe('isRealCommandBlock additional', () => {
  it('rejects short all-caps names (less than 3 chars)', () => {
    expect(isRealCommandBlock('⟦⟦ AB something')).toBe(false);
  });

  it('accepts names with underscores', () => {
    expect(isRealCommandBlock('⟦⟦ DO_THE_THING {}')).toBe(true);
  });

  it('rejects lowercase command names', () => {
    expect(isRealCommandBlock('⟦⟦ do_thing {}')).toBe(false);
  });

  it('requires ⟦⟦ at the start', () => {
    expect(isRealCommandBlock('text ⟦⟦ CMD_NAME')).toBe(false);
  });
});
