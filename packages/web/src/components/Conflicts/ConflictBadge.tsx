import { SEVERITY_COLORS, type ConflictAlert } from './types';

interface Props {
  conflict: ConflictAlert;
  agentId: string;
  onClick?: () => void;
}

export function ConflictBadge({ conflict, agentId, onClick }: Props) {
  const otherAgent = conflict.agents.find(a => a.agentId !== agentId);
  if (!otherAgent) return null;

  const overlapDir = conflict.files[0]?.path?.split('/').slice(0, -1).join('/') || 'files';

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[10px] ${SEVERITY_COLORS[conflict.severity]} hover:opacity-80 transition-opacity`}
      aria-label={`File conflict with ${otherAgent.role} in ${overlapDir}, ${conflict.severity} severity`}
    >
      <span>⚠</span>
      <span>
        Conflict with {otherAgent.role} ({overlapDir})
      </span>
    </button>
  );
}
