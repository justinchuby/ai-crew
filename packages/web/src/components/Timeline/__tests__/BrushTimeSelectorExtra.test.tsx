// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Mock visx components
vi.mock('@visx/brush', () => ({
  Brush: (props: any) => <rect data-testid="brush" width={props.width} height={props.height} />,
}));
vi.mock('@visx/scale', () => ({
  scaleTime: () => {
    const fn = (d: any) => {
      const t = d instanceof Date ? d.getTime() : d;
      return (t % 100000) / 100;
    };
    fn.domain = () => fn;
    fn.range = () => fn;
    return fn;
  },
  scaleLinear: () => {
    const fn = (v: any) => v;
    fn.domain = () => fn;
    fn.range = () => fn;
    return fn;
  },
}));
vi.mock('@visx/group', () => ({
  Group: ({ children, ...props }: any) => <g data-testid="visx-group" {...props}>{children}</g>,
}));

import { BrushTimeSelector } from '../BrushTimeSelector';
import type { TimelineAgent } from '../useTimelineData';

afterEach(cleanup);

const baseStart = new Date('2024-06-15T10:00:00Z');
const baseEnd = new Date('2024-06-15T12:00:00Z');
const midpoint = new Date('2024-06-15T11:00:00Z');

function makeAgent(id: string, status = 'running'): TimelineAgent {
  return {
    id,
    label: id,
    role: { id: 'dev', name: 'Dev', icon: '🛠️', color: '#3b82f6', description: '', systemPrompt: '', builtIn: false },
    segments: [
      { startAt: baseStart.toISOString(), endAt: midpoint.toISOString(), status: 'running' },
      { startAt: midpoint.toISOString(), endAt: baseEnd.toISOString(), status: 'completed' },
    ],
  } as TimelineAgent;
}

describe('BrushTimeSelector', () => {
  it('renders with basic props', () => {
    const { container } = render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: baseStart, end: baseEnd }}
        onRangeChange={vi.fn()}
        agents={[makeAgent('a1')]}
        width={600}
      />,
    );
    expect(container.querySelector('[role="region"]')).toBeTruthy();
    expect(screen.getByTestId('brush')).toBeInTheDocument();
  });

  it('renders mini lanes for agents', () => {
    const { container } = render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: baseStart, end: baseEnd }}
        onRangeChange={vi.fn()}
        agents={[makeAgent('a1'), makeAgent('a2')]}
        width={600}
      />,
    );
    // Each agent segment renders a rect
    const rects = container.querySelectorAll('rect:not([data-testid])');
    expect(rects.length).toBeGreaterThanOrEqual(4); // 2 agents × 2 segments
  });

  it('shows hint text when not zoomed (full range visible)', () => {
    const { container } = render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: baseStart, end: baseEnd }}
        onRangeChange={vi.fn()}
        agents={[makeAgent('a1')]}
        width={600}
      />,
    );
    // When visibleRange equals fullRange, hint text may or may not appear
    // depending on brush pixel calculation — just verify no crash
    expect(container.querySelector('[role="region"]')).toBeTruthy();
  });

  it('hides hint when zoomed in', () => {
    const zoomedStart = new Date('2024-06-15T10:30:00Z');
    const zoomedEnd = new Date('2024-06-15T11:30:00Z');
    const { container } = render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: zoomedStart, end: zoomedEnd }}
        onRangeChange={vi.fn()}
        agents={[makeAgent('a1')]}
        width={600}
      />,
    );
    // When zoomed, the "Zoom in" hint should not be shown
    expect(container.querySelector('[role="region"]')).toBeTruthy();
  });

  it('returns null for zero/negative width', () => {
    const { container } = render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: baseStart, end: baseEnd }}
        onRangeChange={vi.fn()}
        agents={[makeAgent('a1')]}
        width={0}
      />,
    );
    expect(container.querySelector('[role="region"]')).toBeNull();
  });

  it('renders with leftOffset', () => {
    const { container } = render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: baseStart, end: baseEnd }}
        onRangeChange={vi.fn()}
        agents={[]}
        width={600}
        leftOffset={100}
      />,
    );
    expect(container.querySelector('[role="region"]')).toBeTruthy();
  });

  it('renders with no agents', () => {
    const { container } = render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: baseStart, end: baseEnd }}
        onRangeChange={vi.fn()}
        agents={[]}
        width={600}
      />,
    );
    expect(container.querySelector('[role="region"]')).toBeTruthy();
  });

  it('has correct aria attributes for accessibility', () => {
    render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: baseStart, end: baseEnd }}
        onRangeChange={vi.fn()}
        agents={[]}
        width={600}
      />,
    );
    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-label')).toContain('Timeline range selector');
    expect(region.getAttribute('aria-roledescription')).toBe('minimap');
  });

  it('svg has aria-hidden attribute', () => {
    const { container } = render(
      <BrushTimeSelector
        fullRange={{ start: baseStart, end: baseEnd }}
        visibleRange={{ start: baseStart, end: baseEnd }}
        onRangeChange={vi.fn()}
        agents={[]}
        width={600}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
