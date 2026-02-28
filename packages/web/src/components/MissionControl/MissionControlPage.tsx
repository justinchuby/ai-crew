import { Activity } from 'lucide-react';
import { useLeadStore } from '../../stores/leadStore';
import { HealthSummary } from './HealthSummary';
import { AgentFleet } from './AgentFleet';
import { DagMinimap } from './DagMinimap';
import { TokenEconomics } from '../TokenEconomics/TokenEconomics';

// ── MissionControlPage ───────────────────────────────────────────────

export function MissionControlPage() {
  const selectedLeadId = useLeadStore((s) => s.selectedLeadId);
  const projectKeys = useLeadStore((s) => Object.keys(s.projects));

  // Auto-select first lead if none selected
  const leadId = selectedLeadId ?? projectKeys[0] ?? null;

  if (!leadId) {
    return (
      <div className="h-full flex items-center justify-center text-th-text-muted">
        <div className="text-center space-y-2">
          <Activity size={48} className="mx-auto text-th-text-muted" />
          <p className="text-lg font-medium">Mission Control</p>
          <p className="text-sm">No active project. Start a project from the Lead page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <Activity size={20} className="text-th-text-muted" />
        <h1 className="text-lg font-semibold text-th-text-alt">Mission Control</h1>
        <span className="text-xs text-th-text-muted font-mono">Lead: {leadId.slice(0, 8)}</span>
      </div>

      {/* Top row: Health + Token Economics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
        <HealthSummary leadId={leadId} />
        <TokenEconomics />
      </div>

      {/* Middle row: Agent Fleet + DAG Minimap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0" style={{ minHeight: '280px' }}>
        <AgentFleet leadId={leadId} />
        <DagMinimap leadId={leadId} />
      </div>
    </div>
  );
}
