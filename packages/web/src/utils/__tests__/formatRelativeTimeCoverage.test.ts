// @vitest-environment jsdom
/**
 * Extra coverage for formatRelativeTime — targets the Intl.RelativeTimeFormat
 * fallback branch and edge cases not covered by the original test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime } from '../formatRelativeTime';

describe('formatRelativeTime — fallback branch', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('falls back gracefully when Intl.RelativeTimeFormat throws (minutes)', () => {
    vi.useFakeTimers({ now: new Date('2026-03-08T12:15:00Z') });
    const origRTF = Intl.RelativeTimeFormat;
    // @ts-expect-error — force constructor to throw
    Intl.RelativeTimeFormat = function () { throw new Error('not supported'); };
    try {
      const result = formatRelativeTime('2026-03-08T12:00:00Z');
      expect(result).toBe('15m ago');
    } finally {
      Intl.RelativeTimeFormat = origRTF;
    }
  });

  it('falls back gracefully when Intl.RelativeTimeFormat throws (hours)', () => {
    vi.useFakeTimers({ now: new Date('2026-03-08T15:00:00Z') });
    const origRTF = Intl.RelativeTimeFormat;
    // @ts-expect-error — force constructor to throw
    Intl.RelativeTimeFormat = function () { throw new Error('not supported'); };
    try {
      const result = formatRelativeTime('2026-03-08T12:00:00Z');
      expect(result).toBe('3h ago');
    } finally {
      Intl.RelativeTimeFormat = origRTF;
    }
  });

  it('falls back gracefully when Intl.RelativeTimeFormat throws (days)', () => {
    vi.useFakeTimers({ now: new Date('2026-03-11T12:00:00Z') });
    const origRTF = Intl.RelativeTimeFormat;
    // @ts-expect-error — force constructor to throw
    Intl.RelativeTimeFormat = function () { throw new Error('not supported'); };
    try {
      const result = formatRelativeTime('2026-03-08T12:00:00Z');
      expect(result).toBe('3d ago');
    } finally {
      Intl.RelativeTimeFormat = origRTF;
    }
  });

  it('returns "just now" for exactly 0ms difference', () => {
    vi.useFakeTimers({ now: new Date('2026-03-08T12:00:00Z') });
    expect(formatRelativeTime('2026-03-08T12:00:00Z')).toBe('just now');
  });

  it('returns original string when Date constructor throws', () => {
    // A truly broken timestamp that triggers catch
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
  });
});
