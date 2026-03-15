// @vitest-environment jsdom
/**
 * Extra coverage for PromptNav — DOM querySelector fallback, hasUserMention export,
 * and system/queued message filtering.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PromptNav, hasUserMention } from '../PromptNav';
import type { AcpTextChunk } from '../../types';

describe('hasUserMention', () => {
  it('returns true for text containing @user', () => {
    expect(hasUserMention('Hey @user check this')).toBe(true);
  });

  it('returns false for text without @user', () => {
    expect(hasUserMention('Hey check this')).toBe(false);
  });

  it('returns false for @username (not @user word boundary)', () => {
    expect(hasUserMention('@username')).toBe(false);
  });

  it('returns true for @user at end of string', () => {
    expect(hasUserMention('hello @user')).toBe(true);
  });
});

describe('PromptNav — DOM scrolling fallback', () => {
  afterEach(() => cleanup());

  it('scrolls to element via DOM querySelector when no onJump', () => {
    const container = document.createElement('div');
    const target = document.createElement('div');
    target.setAttribute('data-user-prompt', '0');
    target.scrollIntoView = vi.fn();
    container.appendChild(target);
    const containerRef = { current: container };

    const msgs: AcpTextChunk[] = [
      { sender: 'user', text: 'Hello', timestamp: Date.now() },
      { sender: 'agent', text: 'Reply', timestamp: Date.now() },
    ];

    render(<PromptNav containerRef={containerRef} messages={msgs} />);
    fireEvent.click(screen.getByTitle('Next prompt / @user mention'));
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('skips system messages and queued messages', () => {
    const containerRef = { current: document.createElement('div') };
    const msgs: AcpTextChunk[] = [
      { sender: 'system', text: 'System init', timestamp: Date.now() },
      { sender: 'user', text: 'Hello', timestamp: Date.now(), queued: true },
      { sender: 'user', text: 'Real message', timestamp: Date.now() },
      { sender: 'agent', text: '', timestamp: Date.now() }, // empty text
    ];

    render(<PromptNav containerRef={containerRef} messages={msgs} />);
    // Only 1 user message should be counted (the non-queued, non-system one)
    expect(screen.getByText('·/1')).toBeTruthy();
  });

  it('handles useOriginalIndices with system messages correctly', () => {
    const onJump = vi.fn();
    const msgs: AcpTextChunk[] = [
      { sender: 'system', text: 'Init', timestamp: Date.now() },
      { sender: 'user', text: 'Hello', timestamp: Date.now() },
      { sender: 'agent', text: '@user response', timestamp: Date.now() },
    ];

    render(
      <PromptNav containerRef={{ current: null }} messages={msgs} useOriginalIndices onJump={onJump} />,
    );
    // Should see 2 matches: user msg at index 1 and @user mention at index 2
    expect(screen.getByText('·/2')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Next prompt / @user mention'));
    expect(onJump).toHaveBeenCalledWith(1);
  });

  it('does nothing when container ref is null', () => {
    const msgs: AcpTextChunk[] = [
      { sender: 'user', text: 'Hello', timestamp: Date.now() },
    ];
    render(<PromptNav containerRef={{ current: null }} messages={msgs} />);
    // Should not throw when clicking nav
    fireEvent.click(screen.getByTitle('Next prompt / @user mention'));
    expect(screen.getByText('1/1')).toBeTruthy();
  });
});
