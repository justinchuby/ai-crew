import { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleLinear, scaleBand } from '@visx/scale';
import { Bar } from '@visx/shape';
import { useParentSize } from '@visx/responsive';
import type { AnalyticsOverview } from './types';

interface RoleContributionChartProps {
  overview: AnalyticsOverview;
}

export function RoleContributionChart({ overview }: RoleContributionChartProps) {
  const { parentRef, width } = useParentSize({ debounceTime: 100 });
  const height = 160;
  const margin = { top: 10, right: 50, bottom: 10, left: 80 };

  const { roleContributions } = overview;
  const totalTasks = roleContributions.reduce((s, r) => s + r.taskCount, 0);

  const data = useMemo(
    () =>
      roleContributions
        .filter((r) => r.taskCount > 0)
        .map((r) => ({
          role: r.role,
          pct: totalTasks > 0 ? (r.taskCount / totalTasks) * 100 : 0,
          count: r.taskCount,
        }))
        .sort((a, b) => b.pct - a.pct),
    [roleContributions, totalTasks],
  );

  const innerW = Math.max(width - margin.left - margin.right, 0);
  const innerH = Math.max(height - margin.top - margin.bottom, 0);

  const yScale = useMemo(
    () => scaleBand({ domain: data.map((d) => d.role), range: [0, innerH], padding: 0.3 }),
    [data, innerH],
  );
  const xScale = useMemo(
    () => scaleLinear({ domain: [0, 100], range: [0, innerW] }),
    [innerW],
  );

  if (data.length === 0) {
    return (
      <div className="bg-surface-raised border border-th-border rounded-lg p-4 h-[200px] flex items-center justify-center" data-testid="role-contribution-chart">
        <p className="text-xs text-th-text-muted">No role data yet</p>
      </div>
    );
  }

  const COLORS = [
    'rgb(var(--chart-1))', 'rgb(var(--chart-2))', 'rgb(var(--chart-3))',
    'rgb(var(--chart-4))', 'rgb(var(--chart-5))', 'rgb(var(--chart-6))',
    'rgb(var(--chart-7))',
  ];

  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4" data-testid="role-contribution-chart">
      <h3 className="text-xs font-semibold text-th-text-muted uppercase tracking-wide mb-2">Role Contribution</h3>
      <div ref={parentRef} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height}>
            <Group left={margin.left} top={margin.top}>
              {data.map((d, i) => {
                const barW = xScale(d.pct);
                const barY = yScale(d.role) ?? 0;
                const barH = yScale.bandwidth();
                return (
                  <g key={d.role}>
                    <text
                      x={-4}
                      y={barY + barH / 2}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={10}
                      fill="var(--th-text-muted)"
                    >
                      {d.role}
                    </text>
                    <Bar
                      x={0}
                      y={barY}
                      width={barW}
                      height={barH}
                      fill={COLORS[i % COLORS.length]}
                      rx={3}
                    >
                      <title>{`${d.role}: ${d.count} tasks (${d.pct.toFixed(0)}%)`}</title>
                    </Bar>
                    <text
                      x={barW + 4}
                      y={barY + barH / 2}
                      dominantBaseline="middle"
                      fontSize={9}
                      fill="var(--th-text-muted)"
                    >
                      {d.pct.toFixed(0)}%
                    </text>
                  </g>
                );
              })}
            </Group>
          </svg>
        )}
      </div>
      <p className="text-[10px] text-th-text-muted mt-1">
        % of total tasks completed
      </p>
    </div>
  );
}
