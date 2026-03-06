import { useState, useMemo } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { IconPicker } from './IconPicker';
import type { Playbook, PlaybookAgent } from './types';
import { apiFetch } from '../../hooks/useApi';
import { useToastStore } from '../Toast';
import type { AgentInfo } from '../../types';

interface SavePlaybookDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current session agents to pre-fill */
  agents: AgentInfo[];
  /** Current intent rules count */
  intentRuleCount?: number;
  /** Current budget */
  budget?: number;
  onSaved?: (playbook: Playbook) => void;
}

interface AgentCheck {
  agent: AgentInfo;
  checked: boolean;
  idlePercent: number;
}

export function SavePlaybookDialog({
  open,
  onClose,
  agents,
  intentRuleCount = 0,
  budget,
  onSaved,
}: SavePlaybookDialogProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📋');
  const [description, setDescription] = useState('');
  const [includeIntentRules, setIncludeIntentRules] = useState(true);
  const [includeBudget, setIncludeBudget] = useState(true);
  const [saving, setSaving] = useState(false);
  const add = useToastStore((s) => s.add);

  // Agent checklist with idle detection
  const initialChecks = useMemo((): AgentCheck[] => {
    return agents.map((a) => {
      // Estimate idle % from status (heuristic — real idle tracking would come from server)
      const idlePercent = a.status === 'idle' ? 80 : a.status === 'completed' ? 100 : 0;
      return {
        agent: a,
        checked: idlePercent < 70,
        idlePercent,
      };
    });
  }, [agents]);

  const [agentChecks, setAgentChecks] = useState<AgentCheck[]>(initialChecks);

  const toggleAgent = (idx: number) => {
    setAgentChecks((prev) =>
      prev.map((ac, i) => (i === idx ? { ...ac, checked: !ac.checked } : ac)),
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const selectedAgents: PlaybookAgent[] = agentChecks
        .filter((ac) => ac.checked)
        .map((ac) => ({
          role: ac.agent.role?.name ?? ac.agent.role?.id ?? 'Agent',
          model: ac.agent.model,
        }));

      const body = {
        name: name.trim(),
        description: description.trim(),
        icon,
        agents: selectedAgents,
        intentRules: includeIntentRules ? [] : [], // Server fills from active rules
        settings: {
          budget: includeBudget ? budget : undefined,
          maxAgents: selectedAgents.length,
        },
      };

      const resp = await apiFetch('/api/playbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        const saved = await resp.json();
        add('success', `Playbook "${name}" saved`);
        onSaved?.(saved);
        onClose();
      } else {
        add('error', 'Failed to save playbook');
      }
    } catch {
      add('error', 'Failed to save playbook');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-th-bg-alt border border-th-border rounded-xl shadow-2xl w-full max-w-md mx-4 animate-slide-in"
        data-testid="save-playbook-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-th-border">
          <h2 className="text-sm font-semibold text-th-text-alt">Save as Playbook</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-th-bg-hover transition-colors">
            <X size={16} className="text-th-text-muted" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name + Icon */}
          <div className="flex items-end gap-3">
            <IconPicker value={icon} onChange={setIcon} />
            <div className="flex-1">
              <label className="block text-[11px] text-th-text-muted mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 50))}
                placeholder="My Crew Config"
                className="w-full px-3 py-1.5 text-sm bg-th-bg border border-th-border rounded-md text-th-text-alt focus:border-accent focus:outline-none"
                maxLength={50}
                data-testid="playbook-name-input"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] text-th-text-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
              placeholder="What is this crew optimized for?"
              className="w-full px-3 py-1.5 text-sm bg-th-bg border border-th-border rounded-md text-th-text-alt focus:border-accent focus:outline-none resize-none h-16"
              maxLength={200}
            />
          </div>

          {/* Agent checklist */}
          <div>
            <label className="block text-[11px] text-th-text-muted mb-2">
              Agents to Include ({agentChecks.filter((a) => a.checked).length}/{agentChecks.length})
            </label>
            <div className="space-y-1">
              {agentChecks.map((ac, idx) => (
                <label
                  key={ac.agent.id}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-th-bg-hover cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={ac.checked}
                    onChange={() => toggleAgent(idx)}
                    className="accent-accent"
                  />
                  <span className="text-xs text-th-text-alt flex-1">
                    {ac.agent.role?.name ?? 'Agent'} ({ac.agent.model ?? 'default'})
                  </span>
                  {ac.idlePercent >= 70 && (
                    <span className="flex items-center gap-1 text-[10px] text-yellow-500">
                      <AlertTriangle size={10} />
                      idle {ac.idlePercent}%
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Intent rules toggle */}
          {intentRuleCount > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeIntentRules}
                onChange={(e) => setIncludeIntentRules(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-th-text-alt">
                Include {intentRuleCount} intent rule{intentRuleCount !== 1 ? 's' : ''}
              </span>
            </label>
          )}

          {/* Budget toggle */}
          {budget != null && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBudget}
                onChange={(e) => setIncludeBudget(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-th-text-alt">
                Include budget setting (${budget})
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-th-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-th-text-muted hover:text-th-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="playbook-save-btn"
          >
            {saving ? 'Saving...' : 'Save Playbook'}
          </button>
        </div>
      </div>
    </div>
  );
}
