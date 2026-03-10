import { useState, useEffect, useCallback } from 'react';
import { Plus, Target, BarChart3, Info, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import { TrustPresetBar } from './TrustPresetBar';
import { RuleRow } from './RuleRow';
import { RuleEditor } from './RuleEditor';
import { type IntentRule, type TrustPreset } from './types';
import type { OversightLevel } from '../../stores/settingsStore';

interface IntentRulesDashboardProps {
  oversightLevel?: OversightLevel;
}

export function IntentRulesDashboard({ oversightLevel }: IntentRulesDashboardProps) {
  const [rules, setRules] = useState<IntentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<TrustPreset | null>('autonomous');
  const [creating, setCreating] = useState(false);

  // Fetch rules directly — backend returns the same shape
  const fetchRules = useCallback(async () => {
    try {
      const data = await apiFetch<IntentRule[]>('/intents');
      setRules(Array.isArray(data) ? data : []);
    } catch { /* rules stay empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Toggle rule enabled/disabled
  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    try {
      await apiFetch(`/intents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    } catch { fetchRules(); }
  }, [fetchRules]);

  // Delete rule
  const handleDelete = useCallback(async (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    try {
      await apiFetch(`/intents/${id}`, { method: 'DELETE' });
    } catch { fetchRules(); }
  }, [fetchRules]);

  // Save rule (create or update)
  const handleSave = useCallback(async (rule: IntentRule) => {
    const isNew = !rules.find((r) => r.id === rule.id);
    if (isNew) {
      try {
        await apiFetch('/intents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: rule.match.categories[0] ?? 'general',
            name: rule.name,
            action: rule.action,
            roles: rule.match.roles,
            conditions: rule.conditions,
            priority: rule.priority,
          }),
        });
        setCreating(false);
        fetchRules();
      } catch { /* keep editor open */ }
    } else {
      try {
        await apiFetch(`/intents/${rule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: rule.name,
            action: rule.action,
            roles: rule.match.roles,
            conditions: rule.conditions,
            priority: rule.priority,
            enabled: rule.enabled,
          }),
        });
        fetchRules();
      } catch { /* optimistic update stays */ }
    }
  }, [rules, fetchRules]);

  // Apply preset
  const handlePreset = useCallback(async (preset: TrustPreset) => {
    setActivePreset(preset);
    try {
      await apiFetch(`/intents/presets/${preset}`, { method: 'POST' });
      fetchRules();
    } catch { /* preset failed */ }
  }, [fetchRules]);

  // Summary stats
  const enabledCount = rules.filter((r) => r.enabled).length;
  const totalMatches = rules.reduce((s, r) => s + r.metadata.matchCount, 0);
  const avgEffectiveness = (() => {
    const scored = rules.filter((r) => r.metadata.effectivenessScore != null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((s, r) => s + (r.metadata.effectivenessScore ?? 0), 0) / scored.length);
  })();

  if (loading) {
    return <div className="text-xs text-th-text-muted p-4">Loading intent rules...</div>;
  }

  const isMinimalMode = oversightLevel === 'minimal';

  return (
    <div className="space-y-3 relative" data-testid="intent-rules-dashboard">
      {/* Minimal mode overlay */}
      {isMinimalMode && (
        <div className="absolute inset-0 bg-th-bg/80 backdrop-blur-sm z-10 rounded-lg flex items-center justify-center">
          <div className="bg-surface-raised border border-yellow-500/30 rounded-lg p-4 max-w-md text-center">
            <AlertCircle className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-th-text mb-1">Intent Rules Bypassed</p>
            <p className="text-xs text-th-text-muted">
              Oversight Level is set to <strong>Minimal</strong>. All agent decisions are auto-approved, and Intent Rules are not evaluated.
            </p>
            <p className="text-xs text-blue-400 mt-2">
              Change Oversight Level to Standard or Detailed to enable Intent Rules.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider flex items-center gap-2">
          <Target className="w-3.5 h-3.5" />
          Intent Rules
          <span 
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20"
            title="Note: Intent rules are bypassed when Oversight Level is set to Minimal"
          >
            <Info className="w-3 h-3" />
            Requires Standard/Detailed Oversight
          </span>
        </h3>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          <Plus size={12} /> New Rule
        </button>
      </div>

      {/* Trust presets */}
      <TrustPresetBar active={activePreset} onSelect={handlePreset} />

      {/* Create new rule */}
      {creating && (
        <div className="border border-accent/30 rounded-lg p-3 bg-accent/5">
          <p className="text-xs font-medium text-th-text-alt mb-1">New Intent Rule</p>
          <RuleEditor onSave={handleSave} onCancel={() => setCreating(false)} />
        </div>
      )}

      {/* Rules table */}
      {rules.length > 0 ? (
        <div className="border border-th-border rounded-lg overflow-hidden">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onSave={handleSave}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-xs text-th-text-muted">
            No intent rules yet. Create one or apply a trust preset to get started.
          </p>
        </div>
      )}

      {/* Summary */}
      {rules.length > 0 && (
        <p className="text-[10px] text-th-text-muted">
          <BarChart3 className="w-3 h-3 inline-block mr-1" />
          {enabledCount} rules active • {totalMatches} total matches
          {avgEffectiveness != null && ` • ${avgEffectiveness}% effective`}
        </p>
      )}
    </div>
  );
}
