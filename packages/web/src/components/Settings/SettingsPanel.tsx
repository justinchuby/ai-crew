import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Trash2, Plus } from 'lucide-react';

interface Props {
  api: any;
}

export function SettingsPanel({ api }: Props) {
  const { config, roles } = useAppStore();
  const [maxAgents, setMaxAgents] = useState(config?.maxConcurrentAgents || 5);

  // New role form
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [rolePrompt, setRolePrompt] = useState('');
  const [roleColor, setRoleColor] = useState('#888888');
  const [roleIcon, setRoleIcon] = useState('🤖');

  const handleMaxAgentsChange = async (value: number) => {
    setMaxAgents(value);
    await api.updateConfig({ maxConcurrentAgents: value });
  };

  const handleCreateRole = async () => {
    if (!roleId || !roleName) return;
    await api.createRole({
      id: roleId,
      name: roleName,
      description: roleDesc,
      systemPrompt: rolePrompt,
      color: roleColor,
      icon: roleIcon,
    });
    setShowRoleForm(false);
    setRoleName('');
    setRoleId('');
    setRoleDesc('');
    setRolePrompt('');
    setRoleColor('#888888');
    setRoleIcon('🤖');
  };

  return (
    <div className="flex-1 overflow-auto p-4 max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Settings</h2>

      {/* Concurrency */}
      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
          Concurrency
        </h3>
        <div className="bg-surface-raised border border-gray-700 rounded-lg p-4">
          <label className="flex items-center justify-between mb-2">
            <span className="text-sm">Max concurrent agents</span>
            <span className="text-sm font-mono text-accent">{maxAgents}</span>
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={maxAgents}
            onChange={(e) => handleMaxAgentsChange(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-gray-600 mt-1">
            <span>1</span>
            <span>20</span>
          </div>
        </div>
      </section>

      {/* CLI Config */}
      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
          CLI Configuration
        </h3>
        <div className="bg-surface-raised border border-gray-700 rounded-lg p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">CLI Command</label>
            <code className="text-sm text-gray-300 bg-surface px-2 py-1 rounded">
              {config?.cliCommand || 'copilot'}
            </code>
          </div>
          <p className="text-xs text-gray-500">
            Set via COPILOT_CLI_PATH environment variable
          </p>
        </div>
      </section>

      {/* Roles */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Roles</h3>
          <button
            onClick={() => setShowRoleForm(!showRoleForm)}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-muted"
          >
            <Plus size={12} />
            Custom Role
          </button>
        </div>

        {showRoleForm && (
          <div className="bg-surface-raised border border-gray-700 rounded-lg p-4 mb-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Role ID (e.g. designer)"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="flex-1 bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
              />
              <input
                type="text"
                placeholder="Icon emoji"
                value={roleIcon}
                onChange={(e) => setRoleIcon(e.target.value)}
                className="w-16 bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:border-accent"
              />
              <input
                type="color"
                value={roleColor}
                onChange={(e) => setRoleColor(e.target.value)}
                className="w-10 h-8 bg-surface border border-gray-700 rounded cursor-pointer"
              />
            </div>
            <input
              type="text"
              placeholder="Role name"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="Description"
              value={roleDesc}
              onChange={(e) => setRoleDesc(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
            <textarea
              placeholder="System prompt"
              value={rolePrompt}
              onChange={(e) => setRolePrompt(e.target.value)}
              rows={3}
              className="w-full bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRoleForm(false)}
                className="px-3 py-1 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={!roleId || !roleName}
                className="px-3 py-1 text-xs bg-accent text-black rounded font-medium disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {roles.map((role) => (
            <div
              key={role.id}
              className="flex items-center gap-3 bg-surface-raised border border-gray-700 rounded-lg p-3"
            >
              <span className="text-lg">{role.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{role.name}</div>
                <div className="text-xs text-gray-500">{role.description}</div>
              </div>
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: role.color }}
              />
              {role.builtIn ? (
                <span className="text-[10px] text-gray-600">built-in</span>
              ) : (
                <button
                  onClick={() => api.deleteRole(role.id)}
                  className="p-1 text-gray-500 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
