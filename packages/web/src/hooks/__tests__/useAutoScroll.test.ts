import { describe, it, expect } from 'vitest';
import { shouldAutoScroll } from '../useAutoScroll';

describe('shouldAutoScroll', () => {
  it('always scrolls on initial render regardless of position', () => {
    expect(shouldAutoScroll({
      scrollHeight: 5000,
      scrollTop: 0,
      clientHeight: 500,
      isInitialRender: true,
    })).toBe(true);
  });

  it('scrolls on initial render even when far from bottom', () => {
    expect(shouldAutoScroll({
      scrollHeight: 10000,
      scrollTop: 0,
      clientHeight: 800,
      isInitialRender: true,
    })).toBe(true);
  });

  it('scrolls when near bottom (within threshold)', () => {
    expect(shouldAutoScroll({
      scrollHeight: 1000,
      scrollTop: 860,
      clientHeight: 100,
      isInitialRender: false,
    })).toBe(true); // distance = 1000 - 860 - 100 = 40 < 150
  });

  it('does NOT scroll when far from bottom after initial render', () => {
    expect(shouldAutoScroll({
      scrollHeight: 5000,
      scrollTop: 0,
      clientHeight: 500,
      isInitialRender: false,
    })).toBe(false); // distance = 5000 - 0 - 500 = 4500 >> 150
  });

  it('respects custom threshold', () => {
    expect(shouldAutoScroll({
      scrollHeight: 1000,
      scrollTop: 700,
      clientHeight: 200,
      isInitialRender: false,
      threshold: 50,
    })).toBe(false); // distance = 1000 - 700 - 200 = 100 > 50
  });

  it('scrolls with custom threshold when within range', () => {
    expect(shouldAutoScroll({
      scrollHeight: 1000,
      scrollTop: 770,
      clientHeight: 200,
      isInitialRender: false,
      threshold: 50,
    })).toBe(true); // distance = 1000 - 770 - 200 = 30 < 50
  });

  it('scrolls when exactly at bottom', () => {
    expect(shouldAutoScroll({
      scrollHeight: 1000,
      scrollTop: 500,
      clientHeight: 500,
      isInitialRender: false,
    })).toBe(true); // distance = 0 < 150
  });

  it('default threshold is 150', () => {
    // distance = 1000 - 750 - 100 = 150, NOT less than 150
    expect(shouldAutoScroll({
      scrollHeight: 1000,
      scrollTop: 750,
      clientHeight: 100,
      isInitialRender: false,
    })).toBe(false);

    // distance = 1000 - 751 - 100 = 149, less than 150
    expect(shouldAutoScroll({
      scrollHeight: 1000,
      scrollTop: 751,
      clientHeight: 100,
      isInitialRender: false,
    })).toBe(true);
  });
});
