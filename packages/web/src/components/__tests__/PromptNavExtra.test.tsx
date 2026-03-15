// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PromptNav, hasUserMention } from '../PromptNav';
import type { AcpTextChunk } from '../../types';

describe('hasUserMention', () => {
  it('returns true when text contains @user', () => {
    expect(hasUserMention('Hey @user, check this')).toBe(true);
  });
  it('returns false when text does not contain @user', () => {
    expect(hasUserMention('Hello world')).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(hasUserMention('')).toBe(false);
  });
  it('returns false for @username (partial match)', () => {
    // @user\b means word boundary, so @username should NOT match
    expect(hasUserMention('@username')).toBe(false);
  });
  it('returns true for @user at end of string', () => {
    expect(hasUserMention('check @user')).toBe(true);
  });
});

describe('PromptNav – DOM scroll fallback', () => {
  afterEach(cleanup);

  it('scrolls to DOM element and adds ring classes when onJump is not provided', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const target = document.createElement('div');
    target.setAttribute('data-user-prompt', '0');
    target.scrollIntoView = vi.fn();
    container.appendChild(target);
    const containerRef = { current: container };

    const msgs: AcpTextChunk[] = [
      { sender: 'user', text: 'Hello', timestamp: Date.now() },
      { sender: 'agent', text: 'Response', timestamp: Date.now() },
    ];

    render(<PromptNav containerRef={containerRef} messages={msgs} />);

    // Click down to navigate to first user message
    fireEvent.click(screen.getByTitle('Next prompt / @user mention'));

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(target.classList.contains('ring-2')).toBe(true);
    expect(target.classList.contains('ring-blue-400')).toBe(true);

    // After 1500ms, ring classes should be removed
    vi.advanceTimersByTime(1600);
    expect(target.classList.contains('ring-2')).toBe(false);

    vi.useRealTimers();
  });

  it('handles missing container gracefully', () => {
    const containerRef = { current: null };
    const msgs: AcpTextChunk[] = [
      { sender: 'user', text: 'Hello', timestamp: Date.now() },
    ];
    render(<PromptNav containerRef={containerRef} messages={msgs} />);
    // Should not crash when clicking navigate
    fireEvent.click(screen.getByTitle('Next prompt / @user mention'));
    expect(screen.getByText('1/1')).toBeTruthy();
  });

  it('handles missing target element gracefully', () => {
    const container = document.createElement('div');
    // No child elements with data-user-prompt
    const containerRef = { current: container };
    const msgs: AcpTextChunk[] = [
      { sender: 'user', text: 'Hello', timestamp: Date.now() },
    ];
    render(<PromptNav containerRef={containerRef} messages={msgs} />);
    fireEvent.click(screen.getByTitle('Next prompt / @user mention'));
    // Should not crash
    expect(screen.getByText('1/1')).toBeTruthy();
  });

  it('filters out system messages and queued messages', () => {
    const containerRef = { current: document.createElement('div') };
    const msgs: AcpTextChunk[] = [
      { sender: 'system', text: 'System init', timestamp: Date.now() },
      { sender: 'user', text: 'Hello', timestamp: Date.now() },
      { sender: 'agent', text: 'Reply', timestamp: Date.now(), queued: true },
      { sender: 'user', text: '', timestamp: Date.now() },
    ];
    render(<PromptNav containerRef={containerRef} messages={msgs} useOriginalIndices />);
    // Only 1 valid user message (system filtered, empty filtered, queued filtered)
    expect(screen.getByText('·/1')).toBeTruthy();
  });
});
