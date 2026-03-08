import { useMemo } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { Home, FolderOpen, Users, Settings, ArrowLeft } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useProjects } from '../hooks/useProjects';

function NavItem({ to, icon: Icon, label, badge, end }: {
  to: string; icon: any; label: string; badge?: number | null; end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }: { isActive: boolean }) =>
        `relative flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-colors w-[58px] ${
          isActive
            ? 'bg-accent/20 text-accent'
            : 'text-th-text-muted hover:text-th-text hover:bg-th-bg-muted/50'
        }`
      }
    >
      <div className="relative">
        <Icon size={18} />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white px-0.5">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[11px] leading-tight font-medium truncate w-full text-center" title={label}>
        {label}
      </span>
    </NavLink>
  );
}

export function Sidebar() {
  const agents = useAppStore((s) => s.agents);
  const { projects } = useProjects();

  // Detect project context from URL
  const projectMatch = useMatch('/projects/:id/*');
  const activeProjectId = projectMatch?.params.id ?? null;

  const projectName = useMemo(() => {
    if (!activeProjectId) return null;
    const lead = agents.find(
      (a) => a.role?.id === 'lead' && !a.parentId && (a.projectId === activeProjectId || a.id === activeProjectId),
    );
    if (lead?.projectName) return lead.projectName;
    const proj = projects.find((p) => p.id === activeProjectId);
    if (proj?.name) return proj.name;
    return activeProjectId.slice(0, 12);
  }, [activeProjectId, agents, projects]);

  return (
    <nav data-tour="sidebar" className="w-[66px] border-r border-th-border flex flex-col items-center py-3 gap-1 shrink-0">
      {/* 1. Home */}
      <NavItem to="/" icon={Home} label="Home" end />

      {/* 2. Active Project or Projects list */}
      {activeProjectId && projectName ? (
        <NavLink
          to={`/projects/${activeProjectId}`}
          className={({ isActive }: { isActive: boolean }) =>
            `flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg w-[58px] transition-colors ${
              isActive
                ? 'bg-accent/20 text-accent'
                : 'text-accent/80 bg-accent/10 hover:bg-accent/20'
            }`
          }
          title={`Project: ${projectName}`}
          data-testid="sidebar-project-indicator"
        >
          <FolderOpen size={18} />
          <span className="text-[10px] leading-tight font-semibold truncate w-full text-center">
            {projectName}
          </span>
        </NavLink>
      ) : (
        <NavItem to="/projects" icon={FolderOpen} label="Projects" />
      )}

      {/* 3. Teams — cross-project team management */}
      <NavItem to="/team" icon={Users} label="Teams" />

      {/* Spacer */}
      <div className="flex-1" />

      {/* 4. Settings — pinned to bottom */}
      <NavItem to="/settings" icon={Settings} label="Settings" />
    </nav>
  );
}
