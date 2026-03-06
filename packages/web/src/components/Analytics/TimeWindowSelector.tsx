import type { TimeWindow } from './types';

const LABELS: Record<TimeWindow, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

interface TimeWindowSelectorProps {
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
}

export function TimeWindowSelector({ value, onChange }: TimeWindowSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TimeWindow)}
      className="text-xs bg-th-bg-alt border border-th-border rounded-md px-2 py-1 text-th-text-alt focus:ring-1 focus:ring-accent outline-none"
      data-testid="time-window-selector"
    >
      {(Object.entries(LABELS) as [TimeWindow, string][]).map(([k, label]) => (
        <option key={k} value={k}>{label}</option>
      ))}
    </select>
  );
}
