import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { Task } from '../../types';

interface Props {
  api: any;
}

const STATUS_BADGES: Record<string, { color: string; label: string }> = {
  queued: { color: 'bg-gray-500', label: 'Queued' },
  assigned: { color: 'bg-blue-500', label: 'Assigned' },
  in_progress: { color: 'bg-yellow-500', label: 'In Progress' },
  review: { color: 'bg-purple-500', label: 'Review' },
  done: { color: 'bg-green-500', label: 'Done' },
  failed: { color: 'bg-red-500', label: 'Failed' },
};

export function TaskQueuePanel({ api }: Props) {
  const { tasks, roles } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState(0);
  const [newRole, setNewRole] = useState('');

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await api.createTask(newTitle, newDescription, newPriority, newRole || undefined);
    setNewTitle('');
    setNewDescription('');
    setNewPriority(0);
    setNewRole('');
    setShowCreate(false);
  };

  const grouped = {
    active: tasks.filter((t) => ['assigned', 'in_progress', 'review'].includes(t.status)),
    queued: tasks.filter((t) => t.status === 'queued'),
    completed: tasks.filter((t) => ['done', 'failed'].includes(t.status)),
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Task Queue</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black rounded-lg text-sm font-medium hover:bg-accent-muted transition-colors"
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface-raised border border-gray-700 rounded-lg p-4 mb-4">
          <input
            type="text"
            placeholder="Task title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full bg-surface border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-accent"
          />
          <textarea
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={3}
            className="w-full bg-surface border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex gap-2 mb-3">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
              className="bg-surface border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            >
              <option value={0}>Normal Priority</option>
              <option value={1}>High Priority</option>
              <option value={2}>Urgent</option>
            </select>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="bg-surface border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Any role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.icon} {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim()}
              className="px-3 py-1.5 text-sm bg-accent text-black rounded-lg font-medium disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {(['active', 'queued', 'completed'] as const).map((section) => (
        <div key={section} className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
            {section} ({grouped[section].length})
          </h3>
          {grouped[section].length === 0 ? (
            <p className="text-sm text-gray-600">No tasks</p>
          ) : (
            <div className="space-y-2">
              {grouped[section].map((task) => (
                <TaskRow key={task.id} task={task} api={api} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TaskRow({ task, api }: { task: Task; api: any }) {
  const badge = STATUS_BADGES[task.status] || STATUS_BADGES.queued;
  return (
    <div className="flex items-center gap-3 bg-surface-raised border border-gray-700 rounded-lg p-3">
      <GripVertical size={14} className="text-gray-600 cursor-grab" />
      <span className={`w-2 h-2 rounded-full shrink-0 ${badge.color}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{task.title}</div>
        {task.description && (
          <div className="text-xs text-gray-500 truncate">{task.description}</div>
        )}
      </div>
      <span className="text-[10px] text-gray-500 font-mono shrink-0">{badge.label}</span>
      <button
        onClick={() => api.deleteTask(task.id)}
        className="p-1 text-gray-500 hover:text-red-400 shrink-0"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
