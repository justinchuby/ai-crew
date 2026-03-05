import { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleLinear, scaleBand } from '@visx/scale';
import { Bar } from '@visx/shape';
import { AxisBottom } from '@visx/axis';
import { useParentSize } from '@visx/responsive';
import type { AnalyticsOverview } from './types';

interface ModelEffectivenessChartProps {
  overview: AnalyticsOverview;
}

// Derive per-model stats from sessions (backend doesn't break down by model yet)
// For now show role contributions as a proxy; will enhance when model data is available
function deriveModelStats(overview: AnalyticsOverview) {
  const { roleContributions } = overview;
  if (roleContributions.length === 0) return [];

  return roleContributions
    .filter((r) => r.taskCount > 0)
    .map((r) => ({
      label: r.role,
      value: r.tokenUsage > 0 ? (r.taskCount / (r.tokenUsage / 1_000_000)) : 0,
      tasks: r.taskCount,
      tokens: r.tokenUsage,
    }))
    .sort((a, b) => b.value - a.value);
}

export function ModelEffectivenessChart({ overview }: ModelEffectivenessChartProps) {
  const { parentRef, width } = useParentSize({ debounceTime: 100 });
  const height = 160;
  const margin = { top: 10, right: 16, bottom: 28, left: 80 };

  const data = useMemo(() => deriveModelStats(overview), [overview]);

  const innerW = Math.max(width - margin.left - margin.right, 0);
  const innerH = Math.max(height - margin.top - margin.bottom, 0);

  const yScale = useMemo(
    () => scaleBand({ domain: data.map((d) => d.label), range: [0, innerH], padding: 0.3 }),
    [data, innerH],
  );

  const xMax = Math.max(...data.map((d) => d.value), 1);
  const xScale = useMemo(
    () => scaleLinear({ domain: [0, xMax * 1.1], range: [0, innerW] }),
    [xMax, innerW],
  );

  if (data.length === 0) {
    return (
      <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[200px] flex items-center justify-center" data-testid="model-effectiveness-chart">
        <p className="text-xs text-th-text-muted">No model data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4" data-testid="model-effectiveness-chart">
      <h3 className="text-xs font-semibold text-th-text-muted uppercase tracking-wide mb-2">Model Effectiveness</h3>
      <div ref={parentRef} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height}>
            <Group left={margin.left} top={margin.top}>
              {data.map((d) => {
                const barWidth = xScale(d.value);
                const barY = yScale(d.label) ?? 0;
                const barH = yScale.bandwidth();
                return (
                  <g key={d.label}>
                    {/* Label */}
                    <text
                      x={-4}
                      y={barY + barH / 2}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={10}
                      fill="var(--th-text-muted)"
                    >
                      {d.label}
                    </text>
                    {/* Bar */}
                    <Bar
                      x={0}
                      y={barY}
                      width={barWidth}
                      height={barH}
                      fill="rgb(var(--chart-1))"
                      rx={3}
                    >
                      <title>{`${d.label}: ${d.value.toFixed(1)} tasks/M tokens`}</title>
                    </Bar>
                    {/* Value label */}
                    <text
                      x={barWidth + 4}
                      y={barY + barH / 2}
                      dominantBaseline="middle"
                      fontSize={9}
                      fill="var(--th-text-muted)"
                    >
                      {d.value.toFixed(1)} t/M
                    </text>
                  </g>
                );
              })}
            </Group>
          </svg>
        )}
      </div>
      <p className="text-[10px] text-th-text-muted mt-1">
        t/M = tasks per million tokens
      </p>
    </div>
  );
}
