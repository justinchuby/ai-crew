/**
 * useEffectiveProjectId — derives the active project ID from stores.
 *
 * Priority: selected lead > any running lead > first project in registry.
 * Uses lead.projectId (project registry UUID) when available so fetches
 * match the projectId stored in activity events.
 */
import { useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import { useLeadStore } from '../stores/leadStore';
import { useProjects } from './useProjects';

export function useEffectiveProjectId(): string | null {
  const agents = useAppStore((s) => s.agents);
  const selectedLeadId = useLeadStore((s) => s.selectedLeadId);
  const { projects } = useProjects();

  return useMemo(() => {
    if (selectedLeadId) {
      const lead = agents.find((a) => a.id === selectedLeadId);
      return lead?.projectId || selectedLeadId;
    }
    const lead = agents.find((a) => a.role?.id === 'lead' && !a.parentId);
    if (lead) return lead.projectId || lead.id;
    return projects.length > 0 ? projects[0].id : null;
  }, [selectedLeadId, agents, projects]);
}
