import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FilePlus2, FileX2, Plus, Minus, Copy, Check } from 'lucide-react';
import type { FileDiff, DiffResult } from '../../hooks/useFocusAgent';

// ── Helpers ──────────────────────────────────────────────────────────

function statusIcon(status: FileDiff['status']) {
  switch (status) {
    case 'added':   return <FilePlus2 className="w-3.5 h-3.5 text-green-400" />;
    case 'deleted': return <FileX2 className="w-3.5 h-3.5 text-red-400" />;
    default:        return <FileCode2 className="w-3.5 h-3.5 text-blue-400" />;
  }
}

function statusLabel(status: FileDiff['status']): string {
  switch (status) {
    case 'added':   return 'New file';
    case 'deleted': return 'Deleted';
    default:        return 'Modified';
  }
}

interface DiffLineProps {
  line: string;
  lineNumber: number;
}

function DiffLine({ line, lineNumber }: DiffLineProps) {
  const isAdd = line.startsWith('+') && !line.startsWith('+++');
  const isDel = line.startsWith('-') && !line.startsWith('---');
  const isHunk = line.startsWith('@@');

  let bgClass = '';
  let textClass = 'text-th-text-muted';
  if (isAdd) {
    bgClass = 'bg-green-500/10';
    textClass = 'text-green-400';
  } else if (isDel) {
    bgClass = 'bg-red-500/10';
    textClass = 'text-red-400';
  } else if (isHunk) {
    bgClass = 'bg-blue-500/5';
    textClass = 'text-blue-400/70';
  }

  return (
    <div className={`flex font-mono text-[11px] leading-5 ${bgClass}`}>
      <span className="w-10 text-right pr-2 text-th-text-muted/40 select-none shrink-0">
        {isHunk ? '' : lineNumber}
      </span>
      <span className={`flex-1 px-2 whitespace-pre overflow-x-auto ${textClass}`}>
        {line}
      </span>
    </div>
  );
}

// ── File diff section ────────────────────────────────────────────────

interface FileDiffSectionProps {
  file: FileDiff;
  defaultExpanded?: boolean;
}

function FileDiffSection({ file, defaultExpanded = false }: FileDiffSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => file.diff.split('\n'), [file.diff]);

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(file.path).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [file.path]);

  const fileName = file.path.split('/').pop() ?? file.path;
  const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : '';

  return (
    <div className="border border-th-border rounded-md overflow-hidden transition-all duration-200">
      {/* File header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-th-bg-alt/60 hover:bg-th-bg-alt transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-th-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-th-text-muted shrink-0" />
        )}
        {statusIcon(file.status)}
        <span className="text-xs text-th-text-muted font-mono truncate">{dirPath}</span>
        <span className="text-xs text-th-text-alt font-mono font-medium">{fileName}</span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-th-text-muted">{statusLabel(file.status)}</span>
          {file.additions > 0 && (
            <span className="text-[10px] text-green-400 flex items-center gap-px">
              <Plus className="w-2.5 h-2.5" />
              {file.additions}
            </span>
          )}
          {file.deletions > 0 && (
            <span className="text-[10px] text-red-400 flex items-center gap-px">
              <Minus className="w-2.5 h-2.5" />
              {file.deletions}
            </span>
          )}
        </span>
      </button>

      {/* Diff content */}
      {expanded && (
        <div className="border-t border-th-border">
          {/* Copy path button */}
          <div className="flex justify-end px-2 py-0.5 bg-th-bg">
            <button
              onClick={copyPath}
              className="text-[10px] text-th-text-muted hover:text-th-text-alt flex items-center gap-1 transition-colors"
            >
              {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
              {copied ? 'Copied!' : 'Copy path'}
            </button>
          </div>
          <div className="max-h-[400px] overflow-y-auto bg-th-bg">
            {lines.map((line, i) => (
              <DiffLine key={i} line={line} lineNumber={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

interface DiffPreviewProps {
  diff: DiffResult;
  defaultExpandFirst?: boolean;
}

/**
 * Renders a file-by-file unified diff viewer with syntax highlighting.
 * Green additions, red deletions, collapsible per-file sections.
 */
export function DiffPreview({ diff, defaultExpandFirst = true }: DiffPreviewProps) {
  const { files, summary } = diff;

  if (files.length === 0) {
    return (
      <div className="text-center py-6 text-th-text-muted">
        <FileCode2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-xs">No file changes detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs text-th-text-muted px-1">
        <span className="font-medium text-th-text-alt">
          {summary.filesChanged} file{summary.filesChanged > 1 ? 's' : ''} changed
        </span>
        {summary.additions > 0 && (
          <span className="text-green-400 flex items-center gap-0.5">
            <Plus className="w-3 h-3" />
            {summary.additions} addition{summary.additions > 1 ? 's' : ''}
          </span>
        )}
        {summary.deletions > 0 && (
          <span className="text-red-400 flex items-center gap-0.5">
            <Minus className="w-3 h-3" />
            {summary.deletions} deletion{summary.deletions > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Per-file diffs */}
      {files.map((file, i) => (
        <FileDiffSection
          key={file.path}
          file={file}
          defaultExpanded={defaultExpandFirst && i === 0}
        />
      ))}
    </div>
  );
}
