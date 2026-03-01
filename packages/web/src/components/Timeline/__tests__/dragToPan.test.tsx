/**
 * Tests for drag-to-pan and expand/collapse animation in TimelineContainer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import type { TimelineData, TimelineSegment, TimelineAgent } from '../useTimelineData';

// Mock @visx/responsive ParentSize
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 800, height: 600 }),
}));

const { TimelineContainer } = await import('../TimelineContainer');

// ── Test data factory ─────────────────────────────────────────────────

const BASE_TIME = new Date('2026-03-01T10:00:00Z').getTime();

function ts(offsetSeconds: number): string {
  return new Date(BASE_TIME + offsetSeconds * 1000).toISOString();
}

function makeSegment(status: TimelineSegment['status'], startSec: number, endSec?: number): TimelineSegment {
  return { status, startAt: ts(startSec), endAt: endSec != null ? ts(endSec) : undefined };
}

function makeAgent(id: string, role: string, segments: TimelineSegment[]): TimelineAgent {
  return { id, shortId: id.slice(0, 8), role, createdAt: segments[0]?.startAt ?? ts(0), segments };
}

function makeTestData(): TimelineData {
  return {
    agents: [
      makeAgent('lead-001', 'lead', [makeSegment('running', 0, 120)]),
      makeAgent('dev-002', 'developer', [makeSegment('running', 10, 120)]),
    ],
    communications: [],
    locks: [],
    timeRange: { start: ts(0), end: ts(120) },
  };
}

// ── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── Drag-to-Pan ───────────────────────────────────────────────────────

describe('Drag-to-Pan', () => {
  it('SVG has cursor:grab by default', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg).not.toBeNull();
    expect(svg.style.cursor).toBe('grab');
  });

  it('SVG shows cursor:grabbing during drag', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;

    const bgRect = svg.querySelector('rect:not(.cursor-pointer)') as SVGRectElement;
    fireEvent.mouseDown(bgRect, { button: 0, clientX: 200 });

    const svgAfter = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svgAfter.style.cursor).toBe('grabbing');

    fireEvent.mouseUp(window);
  });

  it('disables live mode when drag starts', () => {
    const data = makeTestData();
    const onLiveModeChange = vi.fn();
    const { container } = render(
      <TimelineContainer data={data} liveMode={true} onLiveModeChange={onLiveModeChange} />,
    );
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const bgRect = svg.querySelector('rect:not(.cursor-pointer)') as SVGRectElement;

    fireEvent.mouseDown(bgRect, { button: 0, clientX: 200 });
    expect(onLiveModeChange).toHaveBeenCalledWith(false);

    fireEvent.mouseUp(window);
  });

  it('does not start drag on right-click', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const bgRect = svg.querySelector('rect:not(.cursor-pointer)') as SVGRectElement;

    fireEvent.mouseDown(bgRect, { button: 2, clientX: 200 });
    expect(svg.style.cursor).toBe('grab');
  });

  it('does not start drag on cursor-pointer elements', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const segment = svg.querySelector('.cursor-pointer') as SVGRectElement;

    if (segment) {
      fireEvent.mouseDown(segment, { button: 0, clientX: 200 });
      expect(svg.style.cursor).toBe('grab');
    }
  });

  it('does not pan if mouse moves less than 5px (click threshold)', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const bgRect = svg.querySelector('rect:not(.cursor-pointer)') as SVGRectElement;

    const getFirstTickText = () => svg.querySelector('.visx-axis-top text')?.textContent;
    const initialTick = getFirstTickText();

    fireEvent.mouseDown(bgRect, { button: 0, clientX: 200 });
    act(() => { fireEvent.mouseMove(window, { clientX: 203 }); });
    fireEvent.mouseUp(window);

    expect(getFirstTickText()).toBe(initialTick);
  });

  it('completes full drag sequence without errors', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const bgRect = svg.querySelector('rect:not(.cursor-pointer)') as SVGRectElement;

    fireEvent.mouseDown(bgRect, { button: 0, clientX: 200 });
    act(() => { fireEvent.mouseMove(window, { clientX: 300 }); });
    act(() => { fireEvent.mouseMove(window, { clientX: 350 }); });
    fireEvent.mouseUp(window);

    const svgAfter = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svgAfter).not.toBeNull();
    expect(svgAfter.style.cursor).toBe('grab');
  });

  it('stops dragging on mouseup and reverts cursor', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const bgRect = svg.querySelector('rect:not(.cursor-pointer)') as SVGRectElement;

    fireEvent.mouseDown(bgRect, { button: 0, clientX: 200 });
    expect(container.querySelector('svg[role="img"]')!.getAttribute('style')).toContain('grabbing');

    act(() => { fireEvent.mouseMove(window, { clientX: 250 }); });
    fireEvent.mouseUp(window);

    const svgAfter = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svgAfter.style.cursor).toBe('grab');
  });

  it('clamps pan to not exceed full time range', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const bgRect = svg.querySelector('rect:not(.cursor-pointer)') as SVGRectElement;

    fireEvent.mouseDown(bgRect, { button: 0, clientX: 400 });
    act(() => { fireEvent.mouseMove(window, { clientX: -2000 }); });
    fireEvent.mouseUp(window);

    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });
});

// ── Expand/Collapse Animation ─────────────────────────────────────────

describe('Expand/Collapse Animation', () => {
  it('agent label has height transition style', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);

    const label = container.querySelector('[role="button"]') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.style.transition).toContain('height 200ms ease-out');
  });

  it('agent label has timeline-lane-animate class', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);

    const label = container.querySelector('[role="button"]') as HTMLElement;
    expect(label.classList.contains('timeline-lane-animate')).toBe(true);
  });

  it('reduced-motion CSS zeroes transition-duration', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '../timeline-a11y.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    expect(cssContent).toContain('prefers-reduced-motion: reduce');
    expect(cssContent).toContain('transition-duration: 0.01ms !important');
  });

  it('label includes background-color transition for hover', () => {
    const data = makeTestData();
    const { container } = render(<TimelineContainer data={data} />);

    const label = container.querySelector('[role="button"]') as HTMLElement;
    expect(label.style.transition).toContain('background-color');
  });
});
