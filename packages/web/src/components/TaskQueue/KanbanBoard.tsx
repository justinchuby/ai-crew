import { useMemo, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Pause,
  SkipForward,
  Play,
  Lock,
  ChevronDown,
  ChevronRight,
  User,
  GitBranch,
  FileText,
  Plus,
  X,
} from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { DagStatus, DagTask, DagTaskStatus } from '../../types';

// ── Column Definitions ──────────────────────────────────────────────

interface ColumnDef {
  status: DagTaskStatus;
  label: string;
  icon: React.ReactNode;
  accentClass: string;
  borderClass: string;
}

const COLUMNS: ColumnDef[] = [
  { status: 'pending',  label: 'Pending',  icon: <Clock size={14} />,        accentClass: 'text-th-text-muted',  borderClass: 'border-th-border' },
  { status: 'ready',    label: 'Ready',    icon: <Play size={14} />,         accentClass: 'text-green-400',      borderClass: 'border-green-500/30' },
  { status: 'running',  label: 'Running',  icon: <AlertCircle size={14} />,  accentClass: 'text-blue-400',       borderClass: 'border-blue-500/30' },
  { status: 'blocked',  label: 'Blocked',  icon: <Lock size={14} />,         accentClass: 'text-orange-400',     borderClass: 'border-orange-500/30' },
  { status: 'done',     label: 'Done',     icon: <CheckCircle2 size={14} />, accentClass: 'text-purple-400',     borderClass: 'border-purple-500/30' },
  { status: 'failed',   label: 'Failed',   icon: <XCircle size={14} />,      accentClass: 'text-red-400',        borderClass: 'border-red-500/30' },
  { status: 'paused',   label: 'Paused',   icon: <Pause size={14} />,        accentClass: 'text-yellow-400',     borderClass: 'border-yellow-500/30' },
  { status: 'skipped',  label: 'Skipped',  icon: <SkipForward size={14} />,  accentClass: 'text-th-text-muted',  borderClass: 'border-th-border' },
];

const COLUMN_STATUSES = new Set<string>(COLUMNS.map(c => c.status));

// Statuses that cannot be set via drag – they are auto-managed
const UNDROP_TARGETS = new Set<DagTaskStatus>(['running', 'blocked']);

// ── Status background styles (matches DagGraph conventions) ─────────

const STATUS_BG: Record<DagTaskStatus, string> = {
  pending:  'bg-th-bg-muted/50',
  ready:    'bg-green-500/5',
  running:  'bg-blue-500/5',
  blocked:  'bg-orange-500/5',
  done:     'bg-purple-500/5',
  failed:   'bg-red-500/5',
  paused:   'bg-yellow-500/5',
  skipped:  'bg-th-bg-muted/30',
};

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp.endsWith('Z') ? timestamp : timestamp.replace(' ', 'T') + 'Z').getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

function priorityBadge(priority: number): React.ReactNode {
  if (priority <= 0) return null;
  const colors = priority >= 3 ? 'bg-red-500/20 text-red-400' :
                 priority === 2 ? 'bg-orange-500/20 text-orange-400' :
                 'bg-blue-500/20 text-blue-400';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors}`}>
      P{priority}
    </span>
  );
}

/** Resolve which column (status) a droppable id belongs to */
function resolveColumnStatus(id: string | number, taskLookup: Map<string, DagTask>): DagTaskStatus | null {
  const strId = String(id);
  // Direct column id (e.g. "column-done")
  if (strId.startsWith('column-')) {
    const status = strId.slice(7) as DagTaskStatus;
    return COLUMN_STATUSES.has(status) ? status : null;
  }
  // Task id – look up the task's current column
  const task = taskLookup.get(strId);
  return task ? task.dagStatus : null;
}

// ── Add Task Form ───────────────────────────────────────────────────

interface AddTaskFormProps {
  projectId: string;
  onCreated: () => void;
  onClose: () => void;
}

function AddTaskForm({ projectId, onCreated, onClose }: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !role.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          role: role.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create task');
      console.warn('Failed to create task', err);
    } finally {
      setSubmitting(false);
    }
  }, [title, role, description, projectId, onCreated, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="bg-th-bg border border-th-border rounded-lg p-3 space-y-2"
      data-testid="add-task-form"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-th-text">New Task</span>
        <button type="button" onClick={onClose} className="text-th-text-muted hover:text-th-text">
          <X size={14} />
        </button>
      </div>
      <input
        autoFocus
        required
        placeholder="Title *"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full text-xs bg-th-bg-muted border border-th-border rounded px-2 py-1.5 text-th-text placeholder:text-th-text-muted focus:outline-none focus:border-blue-500/50"
      />
      <input
        required
        placeholder="Role *"
        value={role}
        onChange={e => setRole(e.target.value)}
        className="w-full text-xs bg-th-bg-muted border border-th-border rounded px-2 py-1.5 text-th-text placeholder:text-th-text-muted focus:outline-none focus:border-blue-500/50"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={2}
        className="w-full text-xs bg-th-bg-muted border border-th-border rounded px-2 py-1.5 text-th-text placeholder:text-th-text-muted focus:outline-none focus:border-blue-500/50 resize-none"
      />
      {error && <div className="text-[10px] text-red-400">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] px-2 py-1 rounded text-th-text-muted hover:text-th-text"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !title.trim() || !role.trim()}
          className="text-[11px] px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {submitting ? 'Adding…' : 'Add Task'}
        </button>
      </div>
    </form>
  );
}

// ── Task Card Component ─────────────────────────────────────────────

interface TaskCardProps {
  task: DagTask;
  allTasks: DagTask[];
  isDragOverlay?: boolean;
}

function TaskCard({ task, allTasks, isDragOverlay }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const title = task.title || task.description || task.id;
  const hasDetails = task.dependsOn.length > 0 || task.files.length > 0 || task.assignedAgentId;

  const dependencyNames = useMemo(() => {
    if (task.dependsOn.length === 0) return [];
    return task.dependsOn.map(depId => {
      const dep = allTasks.find(t => t.id === depId);
      return { id: depId, label: dep?.title || dep?.id || depId, status: dep?.dagStatus };
    });
  }, [task.dependsOn, allTasks]);

  return (
    <div
      className={`bg-th-bg rounded-md border border-th-border p-2.5 shadow-sm transition-colors ${
        isDragOverlay ? 'opacity-80 shadow-lg ring-2 ring-blue-500/30' : 'hover:border-th-text-muted/30 cursor-pointer'
      }`}
      onClick={() => !isDragOverlay && hasDetails && setExpanded(!expanded)}
      data-testid={`kanban-card-${task.id}`}
    >
      {/* Header row: title + priority */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-start gap-1 min-w-0 flex-1">
          {hasDetails && (
            <span className="mt-0.5 text-th-text-muted flex-shrink-0">
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          )}
          <span className="text-xs font-medium text-th-text leading-tight break-words">
            {truncate(title, 80)}
          </span>
        </div>
        {priorityBadge(task.priority)}
      </div>

      {/* Meta row: role + timestamp */}
      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-th-text-muted">
        <span className="bg-th-bg-muted px-1.5 py-0.5 rounded text-th-text-alt">{task.role}</span>
        {task.createdAt && (
          <span title={task.createdAt}>{formatRelativeTime(task.createdAt)}</span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-th-border space-y-1.5">
          {/* Assigned agent */}
          {task.assignedAgentId && (
            <div className="flex items-center gap-1 text-[10px] text-th-text-muted">
              <User size={10} />
              <span>Agent: {truncate(task.assignedAgentId, 12)}</span>
            </div>
          )}

          {/* Dependencies */}
          {dependencyNames.length > 0 && (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-th-text-muted">
                <GitBranch size={10} />
                <span>Dependencies:</span>
              </div>
              {dependencyNames.map(dep => (
                <div key={dep.id} className="ml-3 text-[10px] text-th-text-alt flex items-center gap-1">
                  <span className={dep.status === 'done' ? 'text-purple-400' : dep.status === 'running' ? 'text-blue-400' : 'text-th-text-muted'}>
                    {dep.status === 'done' ? '✓' : dep.status === 'running' ? '●' : '○'}
                  </span>
                  {truncate(dep.label, 40)}
                </div>
              ))}
            </div>
          )}

          {/* Files */}
          {task.files.length > 0 && (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-th-text-muted">
                <FileText size={10} />
                <span>Files ({task.files.length}):</span>
              </div>
              {task.files.slice(0, 3).map(file => (
                <div key={file} className="ml-3 text-[10px] text-th-text-alt font-mono">
                  {truncate(file, 40)}
                </div>
              ))}
              {task.files.length > 3 && (
                <div className="ml-3 text-[10px] text-th-text-muted">
                  +{task.files.length - 3} more
                </div>
              )}
            </div>
          )}

          {/* Full description if different from title */}
          {task.description && task.description !== title && (
            <div className="text-[10px] text-th-text-alt mt-1">
              {truncate(task.description, 200)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sortable Task Card Wrapper ──────────────────────────────────────

interface SortableTaskCardProps {
  task: DagTask;
  allTasks: DagTask[];
}

function SortableTaskCard({ task, allTasks }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} allTasks={allTasks} />
    </div>
  );
}

// ── Kanban Column Component ─────────────────────────────────────────

interface KanbanColumnProps {
  column: ColumnDef;
  tasks: DagTask[];
  allTasks: DagTask[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  isDropTarget: boolean;
  isInvalidTarget: boolean;
}

function KanbanColumn({ column, tasks, allTasks, collapsed, onToggleCollapse, isDropTarget, isInvalidTarget }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: `column-${column.status}` });

  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);

  const highlightClass = isInvalidTarget
    ? 'ring-2 ring-red-500/40'
    : isDropTarget
    ? 'ring-2 ring-blue-500/40'
    : '';

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border ${column.borderClass} ${STATUS_BG[column.status]} min-w-[220px] max-w-[300px] flex-1 ${highlightClass}`}
      data-testid={`kanban-column-${column.status}`}
    >
      {/* Column header */}
      <button
        className="flex items-center gap-2 px-3 py-2.5 border-b border-th-border/50 w-full text-left"
        onClick={onToggleCollapse}
      >
        <span className={column.accentClass}>{column.icon}</span>
        <span className="text-xs font-medium text-th-text">{column.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tasks.length > 0 ? column.accentClass + ' bg-th-bg-muted' : 'text-th-text-muted'}`}>
          {tasks.length}
        </span>
        <span className="ml-auto text-th-text-muted">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {/* Task cards */}
      {!collapsed && (
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="p-2 space-y-2 overflow-y-auto flex-1" style={{ maxHeight: 480 }}>
            {tasks.length === 0 ? (
              <div className="text-[10px] text-th-text-muted text-center py-4 italic">
                No tasks
              </div>
            ) : (
              tasks.map(task => (
                <SortableTaskCard key={task.id} task={task} allTasks={allTasks} />
              ))
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// ── Inline Error Toast ──────────────────────────────────────────────

function InlineToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-[11px] text-red-400">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="hover:text-red-300"><X size={12} /></button>
    </div>
  );
}

// ── Main KanbanBoard Component ──────────────────────────────────────

interface KanbanBoardProps {
  dagStatus: DagStatus | null;
  projectId?: string;
  onTaskUpdated?: () => void;
}

function KanbanBoard({ dagStatus, projectId, onTaskUpdated }: KanbanBoardProps) {
  const [collapsedColumns, setCollapsedColumns] = useState<Set<DagTaskStatus>>(new Set());
  const [hideEmpty, setHideEmpty] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [overColumnStatus, setOverColumnStatus] = useState<DagTaskStatus | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const tasksByStatus = useMemo(() => {
    const map = new Map<DagTaskStatus, DagTask[]>();
    for (const col of COLUMNS) {
      map.set(col.status, []);
    }
    if (dagStatus?.tasks) {
      for (const task of dagStatus.tasks) {
        const list = map.get(task.dagStatus);
        if (list) {
          list.push(task);
        }
      }
    }
    // Sort tasks within each column: by priority (desc), then createdAt (asc)
    for (const [, tasks] of map) {
      tasks.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt.localeCompare(b.createdAt);
      });
    }
    return map;
  }, [dagStatus?.tasks]);

  const allTasks = dagStatus?.tasks ?? [];

  const taskLookup = useMemo(() => {
    const m = new Map<string, DagTask>();
    for (const t of allTasks) m.set(t.id, t);
    return m;
  }, [allTasks]);

  const visibleColumns = useMemo(() => {
    if (!hideEmpty) return COLUMNS;
    return COLUMNS.filter(col => (tasksByStatus.get(col.status)?.length ?? 0) > 0);
  }, [hideEmpty, tasksByStatus]);

  const toggleCollapse = useCallback((status: DagTaskStatus) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  // ── Drag-and-drop handlers ────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
    setToastMessage(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setOverColumnStatus(null);
      return;
    }
    const status = resolveColumnStatus(over.id, taskLookup);
    setOverColumnStatus(status);
  }, [taskLookup]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);
    setOverColumnStatus(null);

    if (!over || !projectId) return;

    const draggedTask = taskLookup.get(String(active.id));
    if (!draggedTask) return;

    const targetStatus = resolveColumnStatus(over.id, taskLookup);
    if (!targetStatus) return;

    const sourceStatus = draggedTask.dagStatus;

    // Cross-column drag → status change
    if (targetStatus !== sourceStatus) {
      if (UNDROP_TARGETS.has(targetStatus)) {
        setToastMessage(`Cannot manually move tasks to "${targetStatus}" – it is auto-managed`);
        return;
      }

      apiFetch(`/projects/${projectId}/tasks/${draggedTask.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus }),
      })
        .then(() => onTaskUpdated?.())
        .catch((err: any) => {
          const msg = err.message?.includes('409')
            ? `Invalid transition: ${sourceStatus} → ${targetStatus}`
            : err.message ?? 'Failed to update task status';
          setToastMessage(msg);
          console.warn('Status update failed', err);
        });
      return;
    }

    // Same-column drag → reorder (priority change)
    if (String(active.id) !== String(over.id)) {
      const columnTasks = tasksByStatus.get(sourceStatus);
      if (!columnTasks) return;

      const oldIndex = columnTasks.findIndex(t => t.id === String(active.id));
      const newIndex = columnTasks.findIndex(t => t.id === String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(columnTasks, oldIndex, newIndex);
      // Calculate new priority: higher index in the reordered array = lower priority.
      // The top card gets the highest priority number.
      const totalItems = reordered.length;
      const newPriority = totalItems - reordered.findIndex(t => t.id === String(active.id));

      apiFetch(`/projects/${projectId}/tasks/${draggedTask.id}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: newPriority }),
      })
        .then(() => onTaskUpdated?.())
        .catch((err: any) => {
          console.warn('Priority update failed', err);
        });
    }
  }, [projectId, taskLookup, tasksByStatus, onTaskUpdated]);

  const handleDragCancel = useCallback(() => {
    setActiveTaskId(null);
    setOverColumnStatus(null);
  }, []);

  const activeTask = activeTaskId ? taskLookup.get(activeTaskId) ?? null : null;

  // ── Render ────────────────────────────────────────────────────────

  if (!dagStatus || dagStatus.tasks.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {projectId && showAddForm && (
          <div className="px-3 pt-3">
            <AddTaskForm
              projectId={projectId}
              onCreated={() => onTaskUpdated?.()}
              onClose={() => setShowAddForm(false)}
            />
          </div>
        )}
        <div className="flex items-center justify-center h-64 text-th-text-muted text-sm">
          {projectId && !showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 text-th-text-muted hover:text-th-text text-xs"
            >
              <Plus size={14} /> Add first task
            </button>
          ) : (
            'No tasks to display'
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-th-border/50">
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-th-text-muted">
            {dagStatus.tasks.length} tasks across {visibleColumns.length} columns
          </div>
          {projectId && (
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
              data-testid="add-task-button"
            >
              <Plus size={12} /> Add
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-th-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            className="rounded border-th-border"
          />
          Hide empty columns
        </label>
      </div>

      {/* Add task form */}
      {showAddForm && projectId && (
        <div className="px-3 pt-3">
          <AddTaskForm
            projectId={projectId}
            onCreated={() => onTaskUpdated?.()}
            onClose={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="px-3 pt-2">
          <InlineToast message={toastMessage} onDismiss={() => setToastMessage(null)} />
        </div>
      )}

      {/* Column grid with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-3 p-3 overflow-x-auto flex-1 items-start">
          {visibleColumns.map(col => (
            <KanbanColumn
              key={col.status}
              column={col}
              tasks={tasksByStatus.get(col.status) ?? []}
              allTasks={allTasks}
              collapsed={collapsedColumns.has(col.status)}
              onToggleCollapse={() => toggleCollapse(col.status)}
              isDropTarget={overColumnStatus === col.status && !UNDROP_TARGETS.has(col.status)}
              isInvalidTarget={overColumnStatus === col.status && UNDROP_TARGETS.has(col.status)}
            />
          ))}
        </div>

        {/* Drag overlay – renders the dragged card above everything */}
        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} allTasks={allTasks} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export { KanbanBoard };
