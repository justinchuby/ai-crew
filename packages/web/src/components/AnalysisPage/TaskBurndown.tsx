import { useMemo, useCallback } from 'react';
import { Group } from '@visx/group';
import { AreaClosed, LinePath, Line } from '@visx/shape';
import { scaleLinear, scaleTime } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { bisector } from 'd3-array';

export interface FlowPoint {
  time: number;
  created: number;    // cumulative tasks created
  inProgress: number; // cumulative in-progress
  completed: number;  // cumulative completed
}

interface CumulativeFlowProps {
  data: FlowPoint[];
  width?: number;
  height?: number;
}

const MARGIN = { top: 12, right: 12, bottom: 28, left: 36 };
const SVG_HEADER_OFFSET = 24;

const SERIES = [
  { key: 'created' as const, color: 'rgb(239, 68, 68)', label: 'Created' },
  { key: 'inProgress' as const, color: 'rgb(234, 179, 8)', label: 'Active' },
  { key: 'completed' as const, color: 'rgb(168, 85, 247)', label: 'Done' },
];

const tooltipStyles = {
  ...defaultStyles,
  background: 'rgba(23, 25, 35, 0.92)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e5e7eb',
  fontSize: 11,
  lineHeight: '1.4',
  padding: '6px 10px',
  borderRadius: '6px',
};

const bisectTime = bisector<FlowPoint, number>((d) => d.time).left;

export function CumulativeFlow({ data, width = 260, height = 210 }: CumulativeFlowProps) {
  const svgH = height - SVG_HEADER_OFFSET;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = svgH - MARGIN.top - MARGIN.bottom;

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } =
    useTooltip<FlowPoint>();

  const { xScale, yScale } = useMemo(() => {
    if (data.length === 0) {
      return {
        xScale: scaleTime({ domain: [new Date(), new Date()], range: [0, innerW] }),
        yScale: scaleLinear({ domain: [0, 1], range: [innerH, 0] }),
      };
    }
    const times = data.map((d) => d.time);
    const maxVal = Math.max(
      ...data.map((d) => Math.max(d.created, d.inProgress, d.completed)),
      1,
    );

    return {
      xScale: scaleTime({ domain: [new Date(Math.min(...times)), new Date(Math.max(...times))], range: [0, innerW] }),
      yScale: scaleLinear({ domain: [0, maxVal], range: [innerH, 0], nice: true }),
    };
  }, [data, innerW, innerH]);

  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      const coords = localPoint(event);
      if (!coords || data.length === 0) return;
      const x0 = coords.x - MARGIN.left;
      const time0 = xScale.invert(x0).getTime();
      let idx = bisectTime(data, time0, 1);
      if (idx >= data.length) idx = data.length - 1;
      const d0 = data[idx - 1];
      const d1 = data[idx];
      const nearest = d0 && d1 ? (time0 - d0.time > d1.time - time0 ? d1 : d0) : (d1 ?? d0);
      if (!nearest) return;
      const tooltipX = (xScale(new Date(nearest.time)) ?? 0) + MARGIN.left;
      showTooltip({
        tooltipData: nearest,
        tooltipLeft: tooltipX,
        tooltipTop: MARGIN.top,
      });
    },
    [data, xScale, showTooltip],
  );

  if (data.length === 0) {
    return (
      <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[210px] flex items-center justify-center" data-testid="cumulative-flow">
        <p className="text-xs text-th-text-muted opacity-60">No task data</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[210px] relative" data-testid="cumulative-flow">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[11px] font-medium text-th-text-muted uppercase tracking-wider">
          Task Flow
        </h3>
        <div className="flex items-center gap-2">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1 text-[9px] text-th-text-muted">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg width={width} height={svgH}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          {/* Subtle fill under the "created" line for context */}
          <AreaClosed
            data={data}
            x={(d) => xScale(new Date(d.time)) ?? 0}
            y={(d) => yScale(d.created) ?? 0}
            yScale={yScale}
            fill="rgba(239, 68, 68, 0.08)"
            strokeWidth={0}
            curve={curveMonotoneX}
          />

          {/* Three distinct lines for each series */}
          {SERIES.map((s) => (
            <LinePath
              key={s.key}
              data={data}
              x={(d) => xScale(new Date(d.time)) ?? 0}
              y={(d) => yScale(d[s.key]) ?? 0}
              stroke={s.color}
              strokeWidth={2}
              curve={curveMonotoneX}
            />
          ))}

          {/* Crosshair on hover */}
          {tooltipOpen && tooltipData && (
            <>
              <Line
                from={{ x: xScale(new Date(tooltipData.time)) ?? 0, y: 0 }}
                to={{ x: xScale(new Date(tooltipData.time)) ?? 0, y: innerH }}
                stroke="#9ca3af"
                strokeWidth={1}
                strokeDasharray="3,3"
                pointerEvents="none"
              />
              {SERIES.map((s) => (
                <circle
                  key={s.key}
                  cx={xScale(new Date(tooltipData.time)) ?? 0}
                  cy={yScale(tooltipData[s.key]) ?? 0}
                  r={3}
                  fill={s.color}
                  stroke="#1a1a2e"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              ))}
            </>
          )}

          {/* Invisible overlay for mouse events */}
          <rect
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleTooltip}
            onTouchMove={handleTooltip}
            onMouseLeave={hideTooltip}
            onTouchEnd={hideTooltip}
          />

          <AxisBottom
            top={innerH}
            scale={xScale}
            numTicks={3}
            hideZero
            tickFormat={(d) => {
              const date = d instanceof Date ? d : new Date(d as number);
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }}
            stroke="#6b7280"
            tickStroke="#6b7280"
            tickLabelProps={() => ({
              fill: '#9ca3af',
              fontSize: 9,
              textAnchor: 'middle' as const,
            })}
          />
          <AxisLeft
            scale={yScale}
            numTicks={3}
            hideZero
            tickFormat={(v) => {
              const n = typeof v === 'number' ? v : v.valueOf();
              return Number.isInteger(n) ? String(n) : '';
            }}
            stroke="#6b7280"
            tickStroke="#6b7280"
            tickLabelProps={() => ({
              fill: '#9ca3af',
              fontSize: 9,
              textAnchor: 'end' as const,
              dx: -4,
            })}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div style={{ fontWeight: 600, marginBottom: 3 }}>
            {new Date(tooltipData.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          {SERIES.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color, flexShrink: 0 }} />
              <span>{s.label}: <strong>{tooltipData[s.key]}</strong></span>
            </div>
          ))}
        </TooltipWithBounds>
      )}
    </div>
  );
}
