import { NavLink } from 'react-router-dom';
import { Users, Settings, Crown, ListChecks, LayoutDashboard, GanttChart, Activity } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

const links = [
  { to: '/', icon: Crown, label: 'Lead' },
  { to: '/overview', icon: LayoutDashboard, label: 'Overview' },
  { to: '/agents', icon: Users, label: 'Agents' },
  { to: '/tasks', icon: ListChecks, label: 'Tasks' },
  { to: '/timeline', icon: GanttChart, label: 'Timeline' },
  { to: '/mission-control', icon: Activity, label: 'Mission' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const agents = useAppStore((s) => s.agents);
  const runningCount = agents.filter((a) => a.status === 'running').length;
  const pendingCount = useAppStore((s) => s.pendingDecisions.length);

  return (
    <nav className="w-16 border-r border-th-border flex flex-col items-center py-3 gap-0.5 shrink-0">
      {links.map(({ to, icon: Icon, label }) => {
        // Context-aware badges
        const badge =
          to === '/agents' && runningCount > 0 ? runningCount :
          to === '/tasks' && pendingCount > 0 ? pendingCount :
          null;

        return (
          <NavLink
            key={to}
            to={to}
            end={to === '/' || to === '/agents'}
            className={({ isActive }: { isActive: boolean }) =>
              `relative flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-colors w-[52px] ${
                isActive
                  ? 'bg-accent/20 text-accent'
                  : 'text-th-text-muted hover:text-th-text hover:bg-th-bg-muted/50'
              }`
            }
          >
            <div className="relative">
              <Icon size={18} />
              {badge != null && (
                <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-accent text-[8px] font-bold text-white px-0.5">
                  {badge}
                </span>
              )}
            </div>
            <span className="text-[9px] leading-tight font-medium truncate w-full text-center">
              {label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
