import { useConflicts } from '../../hooks/useConflicts';
import { SEVERITY_COLORS } from './types';

export function PulseConflictIndicator() {
  const { activeConflicts } = useConflicts();

  if (activeConflicts.length === 0) return null;

  const highestSeverity = activeConflicts.some(c => c.severity === 'high')
    ? 'high'
    : activeConflicts.some(c => c.severity === 'medium')
      ? 'medium'
      : 'low';

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${SEVERITY_COLORS[highestSeverity]}`}
      title={`${activeConflicts.length} active conflict${activeConflicts.length > 1 ? 's' : ''}`}
    >
      <span>⚠</span>
      <span>
        {activeConflicts.length} conflict{activeConflicts.length > 1 ? 's' : ''}
      </span>
    </span>
  );
}
