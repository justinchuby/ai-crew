import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlassTooltips } from '../useGlassTooltips';

describe('useGlassTooltips', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('registers event listeners on mount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    renderHook(() => useGlassTooltips());
    const events = addSpy.mock.calls.map(c => c[0]);
    expect(events).toContain('mouseenter');
    expect(events).toContain('mouseleave');
    expect(events).toContain('scroll');
    addSpy.mockRestore();
  });

  it('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useGlassTooltips());
    unmount();
    const events = removeSpy.mock.calls.map(c => c[0]);
    expect(events).toContain('mouseenter');
    expect(events).toContain('mouseleave');
    expect(events).toContain('scroll');
    removeSpy.mockRestore();
  });

  it('converts title to data-glass-title on mouseenter', () => {
    renderHook(() => useGlassTooltips());
    const el = document.createElement('div');
    el.setAttribute('title', 'Hello tooltip');
    document.body.appendChild(el);

    // Simulate mouseenter (captured)
    const event = new MouseEvent('mouseenter', { bubbles: true });
    Object.defineProperty(event, 'target', { value: el });
    document.dispatchEvent(event);

    expect(el.getAttribute('data-glass-title')).toBe('Hello tooltip');
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('shows tooltip after delay', () => {
    renderHook(() => useGlassTooltips());
    const el = document.createElement('div');
    el.setAttribute('title', 'Delayed tip');
    el.getBoundingClientRect = () => ({ top: 100, left: 100, bottom: 120, right: 200, width: 100, height: 20, x: 100, y: 100, toJSON: () => {} });
    document.body.appendChild(el);

    const event = new MouseEvent('mouseenter', { bubbles: true });
    Object.defineProperty(event, 'target', { value: el });
    document.dispatchEvent(event);

    // Before delay — no tooltip visible
    let tooltip = document.querySelector('.glass-tooltip');
    if (tooltip) {
      expect((tooltip as HTMLElement).style.opacity).toBe('0');
    }

    // Advance past the 400ms delay
    act(() => { vi.advanceTimersByTime(500); });

    tooltip = document.querySelector('.glass-tooltip');
    expect(tooltip).toBeTruthy();
    expect((tooltip as HTMLElement).style.opacity).toBe('1');
  });

  it('hides tooltip on mouseleave', () => {
    renderHook(() => useGlassTooltips());
    const el = document.createElement('div');
    el.setAttribute('title', 'Temp');
    el.getBoundingClientRect = () => ({ top: 100, left: 100, bottom: 120, right: 200, width: 100, height: 20, x: 100, y: 100, toJSON: () => {} });
    document.body.appendChild(el);

    // Enter
    const enterEvent = new MouseEvent('mouseenter', { bubbles: true });
    Object.defineProperty(enterEvent, 'target', { value: el });
    document.dispatchEvent(enterEvent);
    act(() => { vi.advanceTimersByTime(500); });

    // Leave
    // The element now has data-glass-title, so closest('[data-glass-title]') should find it
    const leaveEvent = new MouseEvent('mouseleave', { bubbles: true });
    Object.defineProperty(leaveEvent, 'target', { value: el });
    document.dispatchEvent(leaveEvent);

    const tooltip = document.querySelector('.glass-tooltip');
    if (tooltip) {
      expect((tooltip as HTMLElement).style.opacity).toBe('0');
    }
    // title restored
    expect(el.getAttribute('title')).toBeTruthy();
  });

  it('hides tooltip on scroll', () => {
    renderHook(() => useGlassTooltips());
    const el = document.createElement('div');
    el.setAttribute('title', 'Scrollable');
    el.getBoundingClientRect = () => ({ top: 100, left: 100, bottom: 120, right: 200, width: 100, height: 20, x: 100, y: 100, toJSON: () => {} });
    document.body.appendChild(el);

    const enterEvent = new MouseEvent('mouseenter', { bubbles: true });
    Object.defineProperty(enterEvent, 'target', { value: el });
    document.dispatchEvent(enterEvent);
    act(() => { vi.advanceTimersByTime(500); });

    // Scroll
    document.dispatchEvent(new Event('scroll'));

    const tooltip = document.querySelector('.glass-tooltip');
    if (tooltip) {
      expect((tooltip as HTMLElement).style.opacity).toBe('0');
    }
  });
});
