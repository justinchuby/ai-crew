import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { apiFetch } from '../../hooks/useApi';
import type { Role } from '../../types';

interface Props {
  onCreateRole: () => void;
  onEditRole: (role: Role) => void;
}

export function RoleGallery({ onCreateRole, onEditRole }: Props) {
  const storeRoles = useAppStore((s) => s.roles);
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    if (storeRoles && storeRoles.length > 0) {
      setRoles(storeRoles);
    } else {
      apiFetch<Role[]>('/roles')
        .then((data) => {
          setRoles(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          /* fetch failed — keep empty */
        });
    }
  }, [storeRoles]);

  const builtIn = roles.filter((r) => r.builtIn);
  const custom = roles.filter((r) => !r.builtIn);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-th-text flex items-center gap-2">
          🎭 Roles
        </h3>
        <button
          onClick={onCreateRole}
          className="text-xs px-3 py-1.5 bg-accent text-white rounded-md hover:bg-accent/80 transition-colors"
        >
          + Create Role
        </button>
      </div>

      {/* Built-in section */}
      <div>
        <div className="text-[10px] text-th-text-muted uppercase mb-2">
          Built-in ({builtIn.length})
        </div>
        <div className="grid grid-cols-5 gap-2">
          {builtIn.map((role) => (
            <div
              key={role.id}
              className="flex flex-col items-center p-2 rounded-lg border border-th-border-muted hover:border-th-border transition-colors cursor-default"
              style={{ minWidth: 80 }}
            >
              <span className="text-2xl mb-1">{role.icon || '🤖'}</span>
              <span className="text-[11px] font-medium text-th-text text-center truncate w-full">
                {role.name}
              </span>
              <span className="text-[9px] text-th-text-muted">
                {role.model || 'default'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom section */}
      {custom.length > 0 && (
        <div>
          <div className="text-[10px] text-th-text-muted uppercase mb-2">
            Custom ({custom.length})
          </div>
          <div className="grid grid-cols-5 gap-2">
            {custom.map((role) => (
              <div
                key={role.id}
                className="group flex flex-col items-center p-2 rounded-lg border border-th-border-muted hover:border-accent/50 transition-colors cursor-pointer"
                onClick={() => onEditRole(role)}
              >
                <span className="text-2xl mb-1">{role.icon || '🤖'}</span>
                <span className="text-[11px] font-medium text-th-text text-center truncate w-full">
                  {role.name}
                </span>
                <span className="text-[9px] text-th-text-muted">
                  {role.model || 'default'}
                </span>
                <span className="text-[9px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Edit
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
