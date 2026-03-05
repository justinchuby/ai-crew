import { useMemo } from 'react';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { scaleLinear, scaleTime } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';

export interface BurndownPoint {
  time: number;
  remaining: number;
}

interface TaskBurndownProps {
  data: BurndownPoint[];
  totalTasks: number;
  width?: number;
  height?: number;
}

const MARGIN = { top: 12, right: 12, bottom: 28, left: 36 };

export function TaskBurndown({ data, totalTasks, width = 260, height = 180 }: TaskBurndownProps) {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const { xScale, yScale, idealLine } = useMemo(() => {
    if (data.length === 0) {
      return {
        xScale: scaleTime({ domain: [new Date(), new Date()], range: [0, innerW] }),
        yScale: scaleLinear({ domain: [0, 1], range: [innerH, 0] }),
        idealLine: [],
      };
    }
    const times = data.map((d) => d.time);
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);

    const xs = scaleTime({ domain: [new Date(tMin), new Date(tMax)], range: [0, innerW] });
    const ys = scaleLinear({ domain: [0, totalTasks || 1], range: [innerH, 0], nice: true });

    // Ideal burndown: straight line from totalTasks to 0
    const ideal = [
      { time: tMin, remaining: totalTasks },
      { time: tMax, remaining: 0 },
    ];

    return { xScale: xs, yScale: ys, idealLine: ideal };
  }, [data, totalTasks, innerW, innerH]);

  if (data.length === 0) {
    return (
      <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[180px] flex items-center justify-center" data-testid="task-burndown">
        <p className="text-xs text-th-text-muted opacity-60">No task data</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[180px]" data-testid="task-burndown">
      <h3 className="text-[11px] font-medium text-th-text-muted uppercase tracking-wider mb-1">
        Task Burndown
      </h3>
      <svg width={width} height={height - 32}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          {/* Ideal line (dashed) */}
          <LinePath
            data={idealLine}
            x={(d) => xScale(new Date(d.time)) ?? 0}
            y={(d) => yScale(d.remaining) ?? 0}
            stroke="rgb(var(--chart-neutral))"
            strokeWidth={1}
            strokeDasharray="4 3"
            strokeOpacity={0.5}
          />

          {/* Actual line */}
          <LinePath
            data={data}
            x={(d) => xScale(new Date(d.time)) ?? 0}
            y={(d) => yScale(d.remaining) ?? 0}
            stroke="rgb(var(--chart-success))"
            strokeWidth={2}
          />

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
