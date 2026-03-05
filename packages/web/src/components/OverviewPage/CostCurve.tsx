import { useMemo } from 'react';
import { Group } from '@visx/group';
import { AreaClosed, LinePath } from '@visx/shape';
import { scaleLinear, scaleTime } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';

export interface CostPoint {
  time: number;
  cumulativeCost: number;
}

interface CostCurveProps {
  data: CostPoint[];
  budget?: number;
  width?: number;
  height?: number;
}

const MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };

export function CostCurve({ data, budget, width = 260, height = 180 }: CostCurveProps) {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const { xScale, yScale } = useMemo(() => {
    if (data.length === 0) {
      return {
        xScale: scaleTime({ domain: [new Date(), new Date()], range: [0, innerW] }),
        yScale: scaleLinear({ domain: [0, 1], range: [innerH, 0] }),
      };
    }
    const times = data.map((d) => d.time);
    const maxCost = Math.max(...data.map((d) => d.cumulativeCost), budget ?? 0, 1);

    return {
      xScale: scaleTime({
        domain: [new Date(Math.min(...times)), new Date(Math.max(...times))],
        range: [0, innerW],
      }),
      yScale: scaleLinear({
        domain: [0, maxCost * 1.1],
        range: [innerH, 0],
        nice: true,
      }),
    };
  }, [data, budget, innerW, innerH]);

  if (data.length === 0) {
    return (
      <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[180px] flex items-center justify-center" data-testid="cost-curve">
        <p className="text-xs text-th-text-muted opacity-60">No cost data</p>
      </div>
    );
  }

  // Determine fill color based on current spend vs budget
  const currentCost = data[data.length - 1]?.cumulativeCost ?? 0;
  const ratio = budget ? currentCost / budget : 0;
  const areaColor = ratio > 0.9 ? 'rgb(var(--chart-danger))' : ratio > 0.7 ? 'rgb(var(--chart-warning))' : 'rgb(var(--chart-success))';

  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[180px]" data-testid="cost-curve">
      <h3 className="text-[11px] font-medium text-th-text-muted uppercase tracking-wider mb-1">
        Cost Accumulation
      </h3>
      <svg width={width} height={height - 32}>
        <defs>
          <linearGradient id="cost-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={areaColor} stopOpacity={0.4} />
            <stop offset="100%" stopColor={areaColor} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Group left={MARGIN.left} top={MARGIN.top}>
          {/* Area fill */}
          <AreaClosed
            data={data}
            x={(d) => xScale(new Date(d.time)) ?? 0}
            y={(d) => yScale(d.cumulativeCost) ?? 0}
            yScale={yScale}
            fill="url(#cost-gradient)"
          />

          {/* Line */}
          <LinePath
            data={data}
            x={(d) => xScale(new Date(d.time)) ?? 0}
            y={(d) => yScale(d.cumulativeCost) ?? 0}
            stroke={areaColor}
            strokeWidth={2}
          />

          {/* Budget line */}
          {budget != null && (
            <line
              x1={0}
              x2={innerW}
              y1={yScale(budget) ?? 0}
              y2={yScale(budget) ?? 0}
              stroke="rgb(var(--chart-danger))"
              strokeWidth={1}
              strokeDasharray="6 3"
              strokeOpacity={0.7}
            />
          )}

          <AxisBottom
            top={innerH}
            scale={xScale}
            numTicks={3}
            tickFormat={(d) => {
              const date = d instanceof Date ? d : new Date(d as number);
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }}
            stroke="var(--th-border, #374151)"
            tickStroke="var(--th-border, #374151)"
            tickLabelProps={() => ({
              fill: 'var(--th-text-muted, #6b7280)',
              fontSize: 9,
              textAnchor: 'middle' as const,
            })}
          />
          <AxisLeft
            scale={yScale}
            numTicks={3}
            tickFormat={(v) => `$${v}`}
            stroke="var(--th-border, #374151)"
            tickStroke="var(--th-border, #374151)"
            tickLabelProps={() => ({
              fill: 'var(--th-text-muted, #6b7280)',
              fontSize: 9,
              textAnchor: 'end' as const,
              dx: -4,
            })}
          />
        </Group>
      </svg>
    </div>
  );
}
