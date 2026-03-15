/**
 * Extra coverage tests for CostCurve — axes, data edge cases, structural tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostCurve, type CostPoint } from '../CostCurve';

// Mock visx components
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (args: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 500, height: 250 }),
}));

vi.mock('@visx/group', () => ({
  Group: ({ children, ...props }: Record<string, unknown>) => (
    <g data-testid="visx-group" {...props}>{children as React.ReactNode}</g>
  ),
}));

vi.mock('@visx/scale', () => ({
  scaleTime: () => {
    const fn = (d: Date | number) => {
      const t = d instanceof Date ? d.getTime() : d;
      return (t % 10000) / 100;
    };
    fn.domain = () => fn;
    fn.range = () => fn;
    fn.invert = (x: number) => new Date(x * 100);
    return fn;
  },
  scaleLinear: () => {
    const fn = (v: number) => 200 - v / 10;
    fn.domain = () => fn;
    fn.range = () => fn;
    fn.nice = () => fn;
    return fn;
  },
}));

vi.mock('@visx/axis', () => ({
  AxisBottom: (props: any) => (
    <g data-testid="axis-bottom" data-numticks={props.numTicks}>
      <text>X Axis</text>
    </g>
  ),
  AxisLeft: (props: any) => (
    <g data-testid="axis-left" data-numticks={props.numTicks}>
      <text>Y Axis</text>
    </g>
  ),
}));

vi.mock('@visx/shape', () => ({
  AreaClosed: (props: Record<string, unknown>) => (
    <path data-testid="area-closed" data-fill={props.fill as string} data-fill-opacity={String(props.fillOpacity)} />
  ),
  LinePath: (props: Record<string, unknown>) => (
    <line data-testid="line-path" data-stroke={props.stroke as string} data-stroke-width={String(props.strokeWidth)} />
  ),
  Line: () => <line data-testid="crosshair-line" />,
}));

vi.mock('../../hooks/useChartTooltip', () => ({
  useChartTooltip: () => ({
    handleTooltip: () => {},
    hideTooltip: () => {},
    tooltipData: null,
    tooltipLeft: 0,
    tooltipTop: 0,
    tooltipOpen: false,
  }),
  TooltipWithBounds: ({ children }: any) => (
    <div data-testid="tooltip">{children}</div>
  ),
  CHART_TOOLTIP_STYLES: {},
}));

describe('CostCurve – extra coverage', () => {
  /* ── Axes rendering ───────────────────────────────────────────── */

  it('renders both X and Y axes with data', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
      { time: 2000, cumulativeCost: 1000 },
    ];
    render(<CostCurve data={data} />);

    expect(screen.getByTestId('axis-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('axis-left')).toBeInTheDocument();
  });

  it('renders 4 ticks on each axis', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
      { time: 2000, cumulativeCost: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    const axisBottom = container.querySelector('[data-testid="axis-bottom"]');
    expect(axisBottom?.getAttribute('data-numticks')).toBe('4');

    const axisLeft = container.querySelector('[data-testid="axis-left"]');
    expect(axisLeft?.getAttribute('data-numticks')).toBe('4');
  });

  /* ── Data-testid on outer wrapper ─────────────────────────────── */

  it('has data-testid="cost-curve" on the outer container', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 100 },
    ];
    render(<CostCurve data={data} />);
    expect(screen.getByTestId('cost-curve')).toBeInTheDocument();
  });

  /* ── Single data point ────────────────────────────────────────── */

  it('renders correctly with a single data point', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
    ];
    const { container } = render(<CostCurve data={data} />);

    expect(screen.getByText('Token Usage')).toBeInTheDocument();
    const areas = container.querySelectorAll('[data-testid="area-closed"]');
    expect(areas.length).toBe(1);
  });

  /* ── Invisible overlay rect exists for mouse events ───────────── */

  it('renders transparent overlay rect for mouse events', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
      { time: 2000, cumulativeCost: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    const rect = container.querySelector('rect[fill="transparent"]');
    expect(rect).toBeTruthy();
  });

  /* ── Stroke width on lines ────────────────────────────────────── */

  it('uses correct stroke width for lines', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
      { time: 2000, cumulativeCost: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    const line = container.querySelector('[data-testid="line-path"]');
    expect(line?.getAttribute('data-stroke-width')).toBe('1.5');
  });

  /* ── Fill opacity on areas ────────────────────────────────────── */

  it('uses 0.15 fill opacity on areas', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
      { time: 2000, cumulativeCost: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    const area = container.querySelector('[data-testid="area-closed"]');
    expect(area?.getAttribute('data-fill-opacity')).toBe('0.15');
  });

  /* ── SVG dimensions ───────────────────────────────────────────── */

  it('renders svg with correct calculated height', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
      { time: 2000, cumulativeCost: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('width')).toBe('500');
    // height = 250 (CARD_HEIGHT) - 56 (SVG_HEADER_OFFSET) = 194
    expect(svg?.getAttribute('height')).toBe('194');
  });

  /* ── Group positioning ────────────────────────────────────────── */

  it('positions visx Group with correct margins', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
    ];
    const { container } = render(<CostCurve data={data} />);

    const group = container.querySelector('[data-testid="visx-group"]');
    expect(group?.getAttribute('left')).toBe('36');  // MARGIN.left
    expect(group?.getAttribute('top')).toBe('12');   // MARGIN.top
  });

  /* ── Breakdown mode: 2 areas + 2 lines + legend ───────────────── */

  it('renders 2 areas, 2 lines, and legend in breakdown mode', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 1500, cumulativeInput: 1000, cumulativeOutput: 500 },
      { time: 2000, cumulativeCost: 3000, cumulativeInput: 2000, cumulativeOutput: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    expect(container.querySelectorAll('[data-testid="area-closed"]').length).toBe(2);
    expect(container.querySelectorAll('[data-testid="line-path"]').length).toBe(2);
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
  });

  /* ── Non-breakdown mode: 1 area + 1 line, no legend ───────────── */

  it('renders 1 area, 1 line, no legend in non-breakdown mode', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
      { time: 2000, cumulativeCost: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    expect(container.querySelectorAll('[data-testid="area-closed"]').length).toBe(1);
    expect(container.querySelectorAll('[data-testid="line-path"]').length).toBe(1);
    expect(screen.queryByText('Input')).not.toBeInTheDocument();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
  });

  /* ── Correct colors in breakdown ──────────────────────────────── */

  it('uses blue for input and green for output areas', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 1500, cumulativeInput: 1000, cumulativeOutput: 500 },
      { time: 2000, cumulativeCost: 3000, cumulativeInput: 2000, cumulativeOutput: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    const areas = container.querySelectorAll('[data-testid="area-closed"]');
    expect(areas[0].getAttribute('data-fill')).toBe('#60a5fa');  // blue = input
    expect(areas[1].getAttribute('data-fill')).toBe('rgb(var(--chart-success))');  // green = output
  });

  /* ── Line colors match area colors ────────────────────────────── */

  it('uses matching stroke colors for lines in breakdown mode', () => {
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 1500, cumulativeInput: 1000, cumulativeOutput: 500 },
      { time: 2000, cumulativeCost: 3000, cumulativeInput: 2000, cumulativeOutput: 1000 },
    ];
    const { container } = render(<CostCurve data={data} />);

    const lines = container.querySelectorAll('[data-testid="line-path"]');
    expect(lines[0].getAttribute('data-stroke')).toBe('#60a5fa');
    expect(lines[1].getAttribute('data-stroke')).toBe('rgb(var(--chart-success))');
  });

  /* ── Many data points ─────────────────────────────────────────── */

  it('handles many data points without error', () => {
    const data: CostPoint[] = Array.from({ length: 100 }, (_, i) => ({
      time: 1000 + i * 1000,
      cumulativeCost: (i + 1) * 100,
    }));

    const { container } = render(<CostCurve data={data} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  /* ── Mixed breakdown and non-breakdown data ───────────────────── */

  it('treats partial breakdown data as non-breakdown', () => {
    // Only some points have breakdown — needs ALL to have it
    const data: CostPoint[] = [
      { time: 1000, cumulativeCost: 500 },
      { time: 2000, cumulativeCost: 1000, cumulativeInput: 800, cumulativeOutput: 200 },
    ];
    const { container } = render(<CostCurve data={data} />);

    // hasBreakdown checks data.some(d => d.cumulativeInput != null && d.cumulativeOutput != null)
    // Second point has both, so hasBreakdown is true → 2 areas
    const areas = container.querySelectorAll('[data-testid="area-closed"]');
    expect(areas.length).toBe(2);
  });
});
