import { describe, it, expect } from 'vitest';
import { formatTimestamp, type TimeRange } from '../formatTimestamp';

describe('formatTimestamp', () => {
  const baseDate = new Date('2026-03-01T14:30:45.000Z');

  it('returns 24h HH:MM:SS when range is under 24 hours', () => {
    const fullRange: TimeRange = {
      start: new Date('2026-03-01T08:00:00.000Z'),
      end: new Date('2026-03-01T20:00:00.000Z'),
    };
    const result = formatTimestamp(baseDate, fullRange);
    const expected = baseDate.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    expect(result).toBe(expected);
  });

  it('returns date+time in 24h format when range exceeds 24 hours', () => {
    const fullRange: TimeRange = {
      start: new Date('2026-02-28T08:00:00.000Z'),
      end: new Date('2026-03-02T20:00:00.000Z'),
    };
    const result = formatTimestamp(baseDate, fullRange);
    const expected = baseDate.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(result).toBe(expected);
  });

  it('uses time-only at exactly 24 hours boundary', () => {
    const fullRange: TimeRange = {
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-03-02T00:00:00.000Z'),
    };
    const result = formatTimestamp(baseDate, fullRange);
    const expected = baseDate.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    // Exactly 24h is not > 24h, so time-only
    expect(result).toBe(expected);
  });

  it('uses date+time when range is just over 24 hours', () => {
    const fullRange: TimeRange = {
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-03-02T00:00:01.000Z'),
    };
    const result = formatTimestamp(baseDate, fullRange);
    const expected = baseDate.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(result).toBe(expected);
  });
});
