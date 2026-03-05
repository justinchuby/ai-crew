import { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleLinear, scalePoint } from '@visx/scale';
import { LinePath, AreaClosed } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { useParentSize } from '@visx/responsive';
import type { AnalyticsOverview } from './types';

interface CostTrendChartProps {
  overview: AnalyticsOverview;
}

export function CostTrendChart({ overview }: CostTrendChartProps) {
  const { parentRef, width } = useParentSize({ debounceTime: 100 });
  const height = 160;
  const margin = { top: 10, right: 16, bottom: 28, left: 48 };

  const { costTrend, avgCostPerSession } = overview;

  const innerW = Math.max(width - margin.left - margin.right, 0);
  const innerH = Math.max(height - margin.top - margin.bottom, 0);

  const xScale = useMemo(
    () => scalePoint({ domain: costTrend.map((d) => d.date), range: [0, innerW] }),
    [costTrend, innerW],
  );

  const yMax = Math.max(...costTrend.map((d) => d.costUsd), avgCostPerSession, 1);
  const yScale = useMemo(
    () => scaleLinear({ domain: [0, yMax * 1.15], range: [innerH, 0] }),
    [yMax, innerH],
  );

  if (costTrend.length === 0) {
    return (
      <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[200px] flex items-center justify-center" data-testid="cost-trend-chart">
        <p className="text-xs text-th-text-muted">No cost data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4" data-testid="cost-trend-chart">
      <h3 className="text-xs font-semibold text-th-text-muted uppercase tracking-wide mb-2">Cost Trend</h3>
      <div ref={parentRef} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height}>
            <Group left={margin.left} top={margin.top}>
              {/* Grid lines (manual) */}
              {yScale.ticks(4).map((tick) => (
                <line
                  key={tick}
                  x1={0}
                  x2={innerW}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke="var(--th-border)"
                  strokeOpacity={0.3}
                />
              ))}

              {/* Area fill */}
              <AreaClosed
                data={costTrend}
                x={(d) => xScale(d.date) ?? 0}
                y={(d) => yScale(d.costUsd)}
                yScale={yScale}
                fill="rgb(var(--chart-1))"
                fillOpacity={0.1}
              />

              {/* Line */}
              <LinePath
                data={costTrend}
                x={(d) => xScale(d.date) ?? 0}
                y={(d) => yScale(d.costUsd)}
                stroke="rgb(var(--chart-1))"
                strokeWidth={2}
              />

              {/* Average dashed line */}
              <line
                x1={0}
                x2={innerW}
                y1={yScale(avgCostPerSession)}
                y2={yScale(avgCostPerSession)}
                stroke="var(--th-border)"
                strokeDasharray="4 3"
                strokeWidth={1}
              />

              {/* Data points */}
              {costTrend.map((d) => (
                <circle
                  key={d.date}
                  cx={xScale(d.date) ?? 0}
                  cy={yScale(d.costUsd)}
                  r={3}
                  fill="rgb(var(--chart-1))"
                >
                  <title>{`${d.date}: $${d.costUsd.toFixed(2)}`}</title>
                </circle>
              ))}

              <AxisBottom
                scale={xScale}
                top={innerH}
                stroke="var(--th-border)"
                tickStroke="var(--th-border)"
                tickLabelProps={{ fill: 'var(--th-text-muted)', fontSize: 9, textAnchor: 'middle' }}
                numTicks={Math.min(costTrend.length, 6)}
              />
              <AxisLeft
                scale={yScale}
                stroke="var(--th-border)"
                tickStroke="var(--th-border)"
                tickLabelProps={{ fill: 'var(--th-text-muted)', fontSize: 9, textAnchor: 'end' }}
                tickFormat={(v) => `$${Number(v).toFixed(0)}`}
                numTicks={4}
              />
            </Group>
          </svg>
        )}
      </div>
      <p className="text-[10px] text-th-text-muted mt-1">
        Avg: ${avgCostPerSession.toFixed(2)} per session
      </p>
    </div>
  );
}
