import { useState, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { AcpTextChunk } from '../types';

const USER_MENTION_RE = /@user\b/;

/**
 * Floating navigation to jump between user prompts and @user mentions in chat.
 * Tracks both `sender === 'user'` messages and agent messages containing `@user`.
 * Uses `data-user-prompt` attributes on target elements for scrollIntoView.
 *
 * When `useOriginalIndices` is true, stored indices are positions in the original
 * messages array (for use with timeline-based rendering like AcpOutput).
 * When false (default), indices are positions in the visible-filtered array
 * (for use with simple .filter().map() rendering like LeadDashboard).
 */
export function PromptNav({
  containerRef,
  messages,
  useOriginalIndices = false,
  onJump,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  messages: AcpTextChunk[];
  useOriginalIndices?: boolean;
  /** Optional callback for virtualized lists where DOM elements may not exist.
   *  Called with the original message index. When provided, skips DOM querySelector. */
  onJump?: (messageIndex: number) => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(-1);

  const userIndices = useMemo(() => {
    const indices: number[] = [];
    if (useOriginalIndices) {
      messages.forEach((msg, i) => {
        if (msg.sender === 'system' || !msg.text || msg.queued) return;
        if (msg.sender === 'user' || USER_MENTION_RE.test(msg.text)) {
          indices.push(i);
        }
      });
    } else {
      const visible = messages.filter((m) => m.sender !== 'system' && m.text && !m.queued);
      visible.forEach((msg, i) => {
        if (msg.sender === 'user' || USER_MENTION_RE.test(msg.text)) {
          indices.push(i);
        }
      });
    }
    return indices;
  }, [messages, useOriginalIndices]);

  const total = userIndices.length;

  const jumpTo = useCallback(
    (promptIdx: number) => {
      const targetIndex = userIndices[promptIdx];
      setCurrentIdx(promptIdx);

      // Virtualized mode: use callback instead of DOM query
      if (onJump) {
        onJump(targetIndex);
        return;
      }

      // Non-virtualized fallback: DOM querySelector
      const container = containerRef.current;
      if (!container) return;
      const el = container.querySelector(`[data-user-prompt="${targetIndex}"]`) as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-1', 'ring-offset-gray-900', 'rounded-lg');
        setTimeout(
          () => el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-1', 'ring-offset-gray-900', 'rounded-lg'),
          1500,
        );
      }
    },
    [containerRef, userIndices, onJump],
  );

  const goUp = useCallback(() => {
    if (total === 0) return;
    const next = currentIdx <= 0 ? total - 1 : currentIdx - 1;
    jumpTo(next);
  }, [currentIdx, total, jumpTo]);

  const goDown = useCallback(() => {
    if (total === 0) return;
    const next = currentIdx >= total - 1 ? 0 : currentIdx + 1;
    jumpTo(next);
  }, [currentIdx, total, jumpTo]);

  if (total === 0) return null;

  return (
    <div className="absolute right-3 top-3 flex flex-col items-center gap-0.5 z-10">
      <button
        onClick={goUp}
        className="p-1 rounded bg-th-bg-alt/80 border border-th-border text-th-text-muted hover:text-th-text hover:bg-th-bg-muted transition-colors"
        title="Previous prompt / @user mention"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] font-mono text-th-text-muted select-none leading-none py-0.5">
        {currentIdx >= 0 ? currentIdx + 1 : '·'}/{total}
      </span>
      <button
        onClick={goDown}
        className="p-1 rounded bg-th-bg-alt/80 border border-th-border text-th-text-muted hover:text-th-text hover:bg-th-bg-muted transition-colors"
        title="Next prompt / @user mention"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Check if message text contains @user mention */
export function hasUserMention(text: string): boolean {
  return USER_MENTION_RE.test(text);
}
