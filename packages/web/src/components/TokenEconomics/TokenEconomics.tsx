import { useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { AgentInfo } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatBurnRate(tokensPerSecond: number): string {
  const perMin = tokensPerSecond * 60;
  if (perMin >= 1_000) return `~${(perMin / 1_000).toFixed(1)}k/min`;
  return `~${Math.round(perMin)}/min`;
}

function formatTimeRemaining(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return '';
  if (minutes < 1) return '<1 min left';
  if (minutes < 60) return `~${Math.round(minutes)} min left`;
  return `~${(minutes / 60).toFixed(1)} hr left`;
}

function exhaustionUrgency(minutes: number | null | undefined): 'normal' | 'warning' | 'critical' {
  if (minutes == null || minutes <= 0) return 'normal';
  if (minutes <= 5) return 'critical';
  if (minutes <= 10) return 'warning';
  return 'normal';
}

function exhaustionColor(urgency: 'normal' | 'warning' | 'critical'): string {
  if (urgency === 'critical') return 'text-red-400';
  if (urgency === 'warning') return 'text-yellow-600 dark:text-yellow-400';
  return 'text-th-text-muted';
}

function contextPercent(agent: AgentInfo): number {
  if (!agent.contextWindowSize || !agent.contextWindowUsed) return 0;
  return Math.min(100, (agent.contextWindowUsed / agent.contextWindowSize) * 100);
}

function pressureColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 80) return 'bg-yellow-500';
  return 'bg-blue-500';
}

function pressureTextColor(pct: number): string {
  if (pct >= 90) return 'text-red-400';
  if (pct >= 80) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-th-text-muted';
}

// ── Component ────────────────────────────────────────────────────────

interface TokenEconomicsProps {
  agents?: AgentInfo[];
}

export function TokenEconomics({ agents: agentsProp }: TokenEconomicsProps = {}) {
  const storeAgents = useAppStore((s) => s.agents);
  const agents = agentsProp && agentsProp.length > 0 ? agentsProp : storeAgents;

  const { sorted, totalIn, totalOut } = useMemo(() => {
    const withTokens = agents.filter(
      (a) => (a.inputTokens ?? 0) > 0 || (a.outputTokens ?? 0) > 0,
    );
    const s = [...withTokens].sort(
      (a, b) =>
        ((b.inputTokens ?? 0) + (b.outputTokens ?? 0)) -
        ((a.inputTokens ?? 0) + (a.outputTokens ?? 0)),
    );
    const tIn = agents.reduce((sum, a) => sum + (a.inputTokens ?? 0), 0);
    const tOut = agents.reduce((sum, a) => sum + (a.outputTokens ?? 0), 0);
    return { sorted: s, totalIn: tIn, totalOut: tOut };
  }, [agents]);

  const total = totalIn + totalOut;

  if (sorted.length === 0) {
    return (
      <div className="p-4 text-sm text-th-text-muted">
        Token data not available — Copilot CLI does not expose token counts.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg bg-th-bg-alt/60 px-4 py-2.5 border border-th-border/50">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="font-medium text-th-text-alt">Token Usage</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className="text-blue-600 dark:text-blue-300">↑ {formatTokens(totalIn)} in</span>
          <span className="text-emerald-600 dark:text-emerald-300">↓ {formatTokens(totalOut)} out</span>
          <span className="text-th-text-alt font-semibold">{formatTokens(total)} total</span>
        </div>
      </div>

      {/* Per-agent table */}
      <div className="overflow-x-auto rounded-lg border border-th-border/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-th-bg-alt/40 text-th-text-muted">
              <th className="px-3 py-2 text-left font-medium">Agent</th>
              <th className="px-3 py-2 text-left font-medium">Model</th>
              <th className="px-3 py-2 text-right font-medium">Input</th>
              <th className="px-3 py-2 text-right font-medium">Output</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-left font-medium w-36">Context</th>
              <th className="px-3 py-2 text-left font-medium">Burn Rate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((agent) => {
              const inT = agent.inputTokens ?? 0;
              const outT = agent.outputTokens ?? 0;
              const pct = contextPercent(agent);
              const totalAgent = inT + outT;
              const shareOfTotal = total > 0 ? ((totalAgent / total) * 100).toFixed(0) : '0';

              return (
                <tr
                  key={agent.id}
                  className="border-t border-th-border/30 hover:bg-th-bg-alt/30"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span>{agent.role.icon}</span>
                      <span className="text-th-text-alt font-medium">{agent.role.name}</span>
                      <span className="text-th-text-muted font-mono">({agent.id.slice(0, 8)})</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-th-text-muted font-mono">
                    {agent.model || agent.role.model || '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-blue-600 dark:text-blue-300">
                    {formatTokens(inT)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-300">
                    {formatTokens(outT)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-th-text-alt">
                    {formatTokens(totalAgent)}
                    <span className="ml-1 text-th-text-muted">({shareOfTotal}%)</span>
                  </td>
                  <td className="px-3 py-2">
                    {agent.contextWindowSize ? (
                      <div className="flex items-center gap-2">
                        {/* Pressure bar with projection */}
                        <div className="flex-1 h-1.5 rounded-full bg-th-bg-muted overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all ${pressureColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                          {/* Projected usage (dashed extension) */}
                          {agent.contextBurnRate && agent.contextBurnRate > 0 && pct < 100 && (
                            <div
                              className="absolute top-0 h-full rounded-full opacity-40 border-t border-dashed border-current"
                              style={{
                                left: `${pct}%`,
                                width: `${Math.min(100 - pct, 20)}%`,
                                backgroundColor: pct >= 70 ? 'rgb(239 68 68 / 0.3)' : 'rgb(234 179 8 / 0.3)',
                              }}
                            />
                          )}
                        </div>
                        <span className={`font-mono w-10 text-right ${pressureTextColor(pct)}`}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-th-text-muted">—</span>
                    )}
                  </td>
                  {/* Burn Rate + Time Remaining */}
                  <td className="px-3 py-2">
                    {agent.contextBurnRate && agent.contextBurnRate > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-th-text-muted">
                          {formatBurnRate(agent.contextBurnRate)}
                        </span>
                        {agent.estimatedExhaustionMinutes != null && agent.estimatedExhaustionMinutes > 0 && (
                          <span className={`text-[10px] font-medium ${exhaustionColor(exhaustionUrgency(agent.estimatedExhaustionMinutes))}`}>
                            {formatTimeRemaining(agent.estimatedExhaustionMinutes)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-th-text-muted text-[10px]">Calculating…</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pressure warnings — enhanced with burn rate + time remaining */}
      {sorted.some((a) => contextPercent(a) >= 70 || exhaustionUrgency(a.estimatedExhaustionMinutes) !== 'normal') && (
        <div className="flex flex-col gap-1.5 text-xs">
          {sorted
            .filter((a) => contextPercent(a) >= 70 || exhaustionUrgency(a.estimatedExhaustionMinutes) !== 'normal')
            .map((a) => {
              const pct = contextPercent(a);
              const urgency = exhaustionUrgency(a.estimatedExhaustionMinutes);
              const isCritical = pct >= 90 || urgency === 'critical';
              const isWarning = pct >= 70 || urgency === 'warning';
              const timeLabel = formatTimeRemaining(a.estimatedExhaustionMinutes);
              const burnLabel = a.contextBurnRate && a.contextBurnRate > 0
                ? formatBurnRate(a.contextBurnRate)
                : null;

              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded ${
                    isCritical ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                  }`}
                >
                  <span>{isCritical ? '🔴' : '🟡'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">
                      {a.role.name} ({a.id.slice(0, 8)}) — {pct.toFixed(0)}% context
                    </span>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] opacity-80">
                      {burnLabel && <span>🔥 {burnLabel}</span>}
                      {timeLabel && <span>⏱ {timeLabel}</span>}
                      {isCritical && <span className="font-medium">Nearing limit — may lose context</span>}
                      {!isCritical && isWarning && <span>Consider wrapping up</span>}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
