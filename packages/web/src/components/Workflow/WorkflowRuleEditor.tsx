import { useState } from 'react';
import {
  EVENT_LABELS,
  ACTION_LABELS,
  OPERATOR_LABELS,
  type WorkflowRule,
  type WorkflowEvent,
  type WorkflowActionType,
  type WorkflowCondition,
  type WorkflowNotification,
} from './types';

interface Props {
  rule?: Partial<WorkflowRule>;
  onSave: (rule: Partial<WorkflowRule>) => void;
  onCancel: () => void;
}

const ALL_EVENTS = Object.keys(EVENT_LABELS) as WorkflowEvent[];
const ALL_ACTIONS = Object.keys(ACTION_LABELS) as WorkflowActionType[];
const CONDITION_FIELDS = ['contextUsage', 'burnRate', 'taskStatus', 'agentStatus', 'costEstimate'];
const CHANNELS = ['pulse', 'desktop', 'slack', 'email'] as const;

export function WorkflowRuleEditor({ rule, onSave, onCancel }: Props) {
  const [name, setName] = useState(rule?.name ?? '');
  const [event, setEvent] = useState<WorkflowEvent>(
    rule?.trigger?.event ?? 'context_above_threshold',
  );
  const [scopeRole, setScopeRole] = useState(rule?.trigger?.scope?.role ?? '');
  const [conditions, setConditions] = useState<WorkflowCondition[]>(rule?.conditions ?? []);
  const [actions, setActions] = useState<
    { type: WorkflowActionType; params: Record<string, unknown> }[]
  >(rule?.actions ?? [{ type: 'compact_agent', params: {} }]);
  const [notifications, setNotifications] = useState<WorkflowNotification[]>(
    rule?.notifications ?? [],
  );
  const [cooldownMs, setCooldownMs] = useState(rule?.cooldownMs ?? 60000);
  const [maxFires, setMaxFires] = useState(rule?.maxFiresPerSession ?? 10);

  const handleSave = () => {
    onSave({
      name: name || `Rule: ${EVENT_LABELS[event]}`,
      enabled: rule?.enabled ?? true,
      priority: rule?.priority ?? 0,
      trigger: { event, scope: scopeRole ? { role: scopeRole } : undefined },
      conditions,
      actions,
      notifications,
      cooldownMs,
      maxFiresPerSession: maxFires,
    });
  };

  // Build natural language summary
  const summary = `When ${EVENT_LABELS[event].toLowerCase()}${scopeRole ? ` for ${scopeRole}` : ''}${conditions.length > 0 ? ` and ${conditions.length} condition${conditions.length > 1 ? 's' : ''}` : ''}, ${actions.map((a) => ACTION_LABELS[a.type].toLowerCase()).join(' and ')}${notifications.length > 0 ? `, notify via ${notifications.map((n) => n.channel).join(', ')}` : ''}.`;

  return (
    <div className="space-y-4 motion-slide-in">
      <h3 className="text-sm font-semibold text-th-text">
        ⚡ {rule?.id ? 'Edit' : 'New'} Workflow Rule
      </h3>

      {/* Name */}
      <div>
        <label className="text-xs text-th-text-muted block mb-1">Rule name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Auto-generated if empty"
          className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text placeholder-th-text-muted outline-none"
        />
      </div>

      {/* Trigger */}
      <div>
        <label className="text-xs text-th-text-muted block mb-1">When</label>
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value as WorkflowEvent)}
          className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text"
        >
          {ALL_EVENTS.map((ev) => (
            <option key={ev} value={ev}>
              {EVENT_LABELS[ev]}
            </option>
          ))}
        </select>
      </div>

      {/* Scope */}
      <div>
        <label className="text-xs text-th-text-muted block mb-1">For (scope)</label>
        <input
          value={scopeRole}
          onChange={(e) => setScopeRole(e.target.value)}
          placeholder="Any agent (leave empty)"
          className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text placeholder-th-text-muted outline-none"
        />
      </div>

      {/* Conditions */}
      <div>
        <label className="text-xs text-th-text-muted block mb-1">Conditions</label>
        {conditions.map((c, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <select
              value={c.field}
              onChange={(e) => {
                const next = [...conditions];
                next[i] = { ...c, field: e.target.value };
                setConditions(next);
              }}
              className="text-xs bg-th-bg-alt border border-th-border rounded px-2 py-1 text-th-text"
            >
              {CONDITION_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              value={c.operator}
              onChange={(e) => {
                const next = [...conditions];
                next[i] = { ...c, operator: e.target.value as WorkflowCondition['operator'] };
                setConditions(next);
              }}
              className="text-xs bg-th-bg-alt border border-th-border rounded px-2 py-1 text-th-text"
            >
              {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              value={String(c.value)}
              onChange={(e) => {
                const next = [...conditions];
                next[i] = { ...c, value: e.target.value };
                setConditions(next);
              }}
              className="w-20 text-xs bg-th-bg-alt border border-th-border rounded px-2 py-1 text-th-text"
            />
            <button
              onClick={() => setConditions(conditions.filter((_, j) => j !== i))}
              className="text-xs text-red-400"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            setConditions([...conditions, { field: 'contextUsage', operator: 'gt', value: 90 }])
          }
          className="text-[11px] text-accent hover:text-accent/80"
        >
          + Add condition
        </button>
      </div>

      {/* Actions */}
      <div>
        <label className="text-xs text-th-text-muted block mb-1">Then</label>
        {actions.map((a, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <select
              value={a.type}
              onChange={(e) => {
                const next = [...actions];
                next[i] = { type: e.target.value as WorkflowActionType, params: {} };
                setActions(next);
              }}
              className="flex-1 text-xs bg-th-bg-alt border border-th-border rounded px-2 py-1 text-th-text"
            >
              {ALL_ACTIONS.map((act) => (
                <option key={act} value={act}>
                  {ACTION_LABELS[act]}
                </option>
              ))}
            </select>
            <button
              onClick={() => setActions(actions.filter((_, j) => j !== i))}
              className="text-xs text-red-400"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setActions([...actions, { type: 'compact_agent', params: {} }])}
          className="text-[11px] text-accent hover:text-accent/80"
        >
          + Add action
        </button>
      </div>

      {/* Notifications */}
      <div>
        <label className="text-xs text-th-text-muted block mb-1">Notify</label>
        {notifications.map((n, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <select
              value={n.channel}
              onChange={(e) => {
                const next = [...notifications];
                next[i] = { ...n, channel: e.target.value as WorkflowNotification['channel'] };
                setNotifications(next);
              }}
              className="text-xs bg-th-bg-alt border border-th-border rounded px-2 py-1 text-th-text"
            >
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
            <input
              value={n.message}
              onChange={(e) => {
                const next = [...notifications];
                next[i] = { ...n, message: e.target.value };
                setNotifications(next);
              }}
              placeholder="Message template"
              className="flex-1 text-xs bg-th-bg-alt border border-th-border rounded px-2 py-1 text-th-text placeholder-th-text-muted outline-none"
            />
            <button
              onClick={() => setNotifications(notifications.filter((_, j) => j !== i))}
              className="text-xs text-red-400"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setNotifications([...notifications, { channel: 'pulse', message: '' }])}
          className="text-[11px] text-accent hover:text-accent/80"
        >
          + Add notification
        </button>
      </div>

      {/* Safety */}
      <div className="border-t border-th-border-muted pt-3">
        <div className="text-xs font-medium text-th-text mb-2">Safety</div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs text-th-text-muted">
            Cooldown:
            <input
              type="number"
              value={cooldownMs / 1000}
              onChange={(e) => setCooldownMs(parseInt(e.target.value) * 1000)}
              className="w-16 text-xs bg-th-bg-alt border border-th-border rounded px-2 py-1 text-th-text"
            />
            seconds
          </label>
          <label className="flex items-center gap-2 text-xs text-th-text-muted">
            Max fires:
            <input
              type="number"
              value={maxFires ?? 0}
              onChange={(e) => setMaxFires(parseInt(e.target.value))}
              className="w-16 text-xs bg-th-bg-alt border border-th-border rounded px-2 py-1 text-th-text"
            />
            per session
          </label>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-th-bg-muted rounded-lg p-3">
        <div className="text-xs font-medium text-th-text mb-1">📋 Rule Preview</div>
        <div className="text-[11px] text-th-text-muted">{summary}</div>
        <div className="text-[10px] text-th-text-muted mt-1">
          Cooldown: {cooldownMs / 1000}s • Max: {maxFires} fires/session
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-xs px-4 py-2 rounded-md bg-th-bg-muted text-th-text-muted hover:bg-th-bg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="text-xs px-4 py-2 rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors font-medium"
        >
          Save Rule
        </button>
      </div>
    </div>
  );
}
