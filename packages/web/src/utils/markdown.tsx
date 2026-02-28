import React from 'react';

/** Generate a consistent HSL color from a string (agent ID) */
export function idColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 65%, 65%)`;
}

/** Short ID badge component with consistent color */
export function AgentIdBadge({ id, className = '' }: { id: string; className?: string }) {
  return (
    <span
      className={`font-mono text-[10px] px-1 py-0.5 rounded bg-gray-800/80 ${className}`}
      style={{ color: idColor(id) }}
      title={id}
    >
      {id.slice(0, 8)}
    </span>
  );
}

/** Render inline markdown: **bold**, *italic*, `code` */
export function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="bg-gray-700 px-1 rounded text-yellow-300">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** Render a markdown table as an HTML table */
function MarkdownTable({ raw }: { raw: string }) {
  const lines = raw.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return <InlineMarkdown text={raw} />;

  const parseRow = (line: string) =>
    line.split('|').slice(1, -1).map((cell) => cell.trim());

  const headerCells = parseRow(lines[0]);
  const isSeparator = /^\|[\s:?-]+(\|[\s:?-]+)*\|?\s*$/.test(lines[1]);
  const dataStart = isSeparator ? 2 : 1;
  const bodyRows = lines.slice(dataStart).map(parseRow);

  return (
    <div className="my-2 overflow-x-auto">
      <table className="text-xs font-mono border-collapse border border-gray-700 w-full">
        <thead>
          <tr className="bg-gray-800">
            {headerCells.map((cell, j) => (
              <th key={j} className="border border-gray-700 px-2 py-1 text-left text-gray-300 font-semibold">
                <InlineMarkdown text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-800/30'}>
              {row.map((cell, ci) => (
                <td key={ci} className="border border-gray-700 px-2 py-1 text-gray-300">
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render text with markdown tables detected and inline markdown */
export function MarkdownContent({ text }: { text: string }) {
  const TABLE_RE = /((?:^|\n)\|[^\n]+\|[ \t]*(?:\n\|[^\n]+\|[ \t]*)+)/g;
  const parts = text.split(TABLE_RE);

  return (
    <>
      {parts.map((part, i) => {
        const trimmed = part.trim();
        if (trimmed.startsWith('|') && trimmed.includes('\n')) {
          return <MarkdownTable key={i} raw={trimmed} />;
        }
        if (!trimmed) return null;
        // Handle code blocks
        const CODE_BLOCK_RE = /(```[\s\S]*?```)/g;
        const segments = part.split(CODE_BLOCK_RE);
        return (
          <React.Fragment key={i}>
            {segments.map((seg, j) => {
              if (seg.startsWith('```') && seg.endsWith('```')) {
                const content = seg.slice(3, -3).replace(/^[^\n]*\n/, '');
                return (
                  <pre key={j} className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 my-1 overflow-x-auto text-xs font-mono text-gray-300">
                    {content}
                  </pre>
                );
              }
              return <InlineMarkdown key={j} text={seg} />;
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}
