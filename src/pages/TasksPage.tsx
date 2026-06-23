import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Search, ClipboardList, ChevronRight, Download, Upload, X } from 'lucide-react';
import { useTaskStore }       from '@/store/taskStore';
import { useAuthStore }       from '@/store/authStore';
import { Button }             from '@/components/ui/button';
import { CreateTaskModal }    from '@/components/tasks/CreateTaskModal';
import { BulkTaskModal }      from '@/components/tasks/BulkTaskModal';
import { TaskDetailDrawer }   from '@/components/tasks/TaskDetailDrawer';
import { UpdateTaskDrawer }   from '@/components/tasks/UpdateTaskDrawer';
import { exportTasksToExcel } from '@/utils/exportTasksToExcel';
import { cn }                 from '@/lib/utils';
import { useArchivedTasks } from '@/hooks/useTasks';
import type { Task, TaskStatus } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<TaskStatus, { label: string; badge: string; border: string }> = {
  pending:     { label: 'Pending',     badge: 'bg-gray-100 text-gray-600',   border: 'border-l-gray-300'   },
  in_progress: { label: 'In Progress', badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400'  },
  completed:   { label: 'Completed',   badge: 'bg-green-100 text-green-700', border: 'border-l-green-500'  },
  blocked:     { label: 'Blocked',     badge: 'bg-red-100 text-brand-red',   border: 'border-l-red-500'    },
};

type Filter = 'all' | TaskStatus | 'follow_up' | 'overdue' | 'archived';

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all',         label: 'All'         },
  { key: 'pending',     label: 'Pending'     },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed'   },
  { key: 'blocked',     label: 'Blocked'     },
  { key: 'follow_up',   label: 'Follow Up'   },
  { key: 'overdue',     label: 'Overdue'     },
  { key: 'archived',    label: 'Archived'    },
];

function formatDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isToday(d: Date): boolean {
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth()    === today.getMonth()    &&
         d.getDate()     === today.getDate();
}

function isTomorrow(d: Date): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.getFullYear() === tomorrow.getFullYear() &&
         d.getMonth()    === tomorrow.getMonth()    &&
         d.getDate()     === tomorrow.getDate();
}

function isPast(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function isOverdue(task: Task): boolean {
  if (task.status === 'completed') return false;
  return !!(task.dueDate && isPast(task.dueDate));
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { label, badge, border } = STATUS_META[task.status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm',
        'hover:shadow-md transition-all flex items-start gap-3 border-l-4',
        border,
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs text-gray-400">{task.taskNum}</span>
        </div>
        <p className="font-semibold text-base text-gray-900 line-clamp-2 leading-snug">
          {task.title}
        </p>
        <p className="text-xs text-gray-500 mt-1.5 truncate">
          {task.assignedTo
            ? <>{task.assignedToName}{task.assignedToCode && <span className="ml-1 font-mono text-gray-400">({task.assignedToCode})</span>}</>
            : <span className="italic text-gray-400">Unassigned</span>
          }
        </p>
        {task.dueDate && (
          <p className="text-xs text-gray-400 mt-0.5">Due {formatDate(task.dueDate)}</p>
        )}
        {task.followUpDate && (
          <div className={cn(
            'mt-1 flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 w-fit',
            isToday(task.followUpDate)
              ? 'bg-orange-100 text-orange-700'
              : isPast(task.followUpDate)
              ? 'bg-red-100 text-red-600'
              : 'bg-blue-50 text-brand-blue',
          )}>
            📅 Follow-up:{' '}
            {isToday(task.followUpDate) ? 'TODAY' : isPast(task.followUpDate) ? 'Overdue' : formatDate(task.followUpDate)}
          </div>
        )}
        {isOverdue(task) && (
          <div className="mt-1 flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 w-fit bg-red-100 text-red-600">
            ⚠ Overdue
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0 pt-0.5">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', badge)}>
          {label}
        </span>
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TasksPage() {
  const {
    tasks, hasMore, loadingMore, loadMore,
    searchTasks, searchTasksLoaded,
  } = useTaskStore();

  const { currentUser } = useAuthStore();
  const { archivedTasks, loading: archivedLoading, loadArchivedTasks } = useArchivedTasks();

  const isAdmin    = currentUser?.role === 'admin';
  const location   = useLocation();

  const [filter,           setFilter]           = useState<Filter>('all');
  const [search,           setSearch]           = useState('');

  const isSearching = search.trim().length > 0;
  const [engineerFilter,   setEngineerFilter]   = useState<string>('');
  const [showCreate,       setShowCreate]       = useState(false);
  const [showBulk,         setShowBulk]         = useState(false);
  const [detailTask,       setDetailTask]       = useState<Task | null>(null);
  const [updateTask,       setUpdateTask]       = useState<Task | null>(null);
  const [adminUpdateTask,  setAdminUpdateTask]  = useState<Task | null>(null);

  useEffect(() => {
    const state = location.state as { openTaskId?: string; filter?: string } | null;
    if (!state) return;

    if (state.filter) {
      setFilter(state.filter as Filter);
      window.history.replaceState({}, '');
      return;
    }

    if (!state.openTaskId) return;
    const task = tasks.find((t) => t.id === state.openTaskId);
    if (!task) return;
    window.history.replaceState({}, '');
    if (isAdmin) {
      setDetailTask(task);
    } else {
      setUpdateTask(task);
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (filter === 'archived') {
      loadArchivedTasks();
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0, follow_up: 0, overdue: 0,
    };
    tasks.forEach((t) => {
      c['all']++;
      c[t.status]++;
      if (t.followUpDate) c['follow_up']++;
      if (isOverdue(t))   c['overdue']++;
    });
    return c;
  }, [tasks]);

  const engineerOptions = useMemo(() => {
    const seen = new Map<string, { uid: string; name: string; code: string }>();
    const source = searchTasksLoaded && searchTasks.length > 0
      ? searchTasks
      : tasks;
    source.forEach((t) => {
      if (t.assignedTo && t.assignedToName && !seen.has(t.assignedTo)) {
        seen.set(t.assignedTo, {
          uid:  t.assignedTo,
          name: t.assignedToName,
          code: t.assignedToCode,
        });
      }
    });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, searchTasks, searchTasksLoaded]);

  const visible = useMemo(() => {
    if (filter === 'archived') return archivedTasks;

    // When searching — use full searchTasks for complete coverage across all tasks
    const source = isSearching ? searchTasks : tasks;

    return source.filter((t) => {
      // Status / special filter
      if (filter === 'follow_up' && !t.followUpDate) return false;
      if (filter === 'overdue'   && !isOverdue(t))   return false;
      if (
        filter !== 'all' &&
        filter !== 'follow_up' &&
        filter !== 'overdue' &&
        t.status !== filter
      ) return false;

      // Engineer filter
      if (engineerFilter && t.assignedTo !== engineerFilter) return false;

      // Search
      if (isSearching) {
        const q = search.toLowerCase().trim();
        return (
          t.title.toLowerCase().includes(q) ||
          t.assignedToName.toLowerCase().includes(q) ||
          t.taskNum.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tasks, searchTasks, archivedTasks, filter, search, engineerFilter, isSearching]);

  const sorted = useMemo(() => {
    if (isAdmin) return visible;
    return [...visible].sort((a, b) => {
      function score(t: Task): number {
        if (t.followUpDate && isToday(t.followUpDate))    return 0;
        if (t.followUpDate && isTomorrow(t.followUpDate)) return 1;
        if (isOverdue(t))                                 return 2;
        return 3;
      }
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [visible, isAdmin]);

  function handleCardClick(task: Task) {
    if (isAdmin) {
      setDetailTask(task);
    } else {
      setUpdateTask(task);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex-1">
          {isAdmin ? 'Tasks' : 'My Tasks'}
        </h1>

        {isAdmin && tasks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportTasksToExcel(visible)}
            className="flex items-center gap-1.5 text-xs h-9"
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </Button>
        )}

        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-1.5 sm:shrink-0 h-11"
          >
            <Upload className="h-4 w-4" />
            Bulk Upload
          </Button>
        )}

        {isAdmin && (
          <Button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 sm:shrink-0 h-11"
          >
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search by title or engineer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue shadow-sm"
        />
      </div>
      {isAdmin && isSearching && (
        <p className="text-xs text-gray-400 mb-2 px-1">
          {searchTasksLoaded
            ? `Searching all ${searchTasks.length} tasks`
            : 'Loading all tasks for search…'
          }
        </p>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'h-9 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors shrink-0',
              filter === key
                ? 'bg-brand-blue text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {label}
            <span className={cn(
              'ml-1.5 rounded-full px-1.5 py-px text-[10px]',
              filter === key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500',
            )}>
              {key === 'archived'
                ? archivedTasks.length
                : counts[key as string] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Engineer filter */}
      {isAdmin && engineerOptions.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <select
            value={engineerFilter}
            onChange={(e) => setEngineerFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue text-gray-700 min-w-[200px]"
          >
            <option value="">All Engineers</option>
            {engineerOptions.map((eng) => (
              <option key={eng.uid} value={eng.uid}>
                {eng.name} ({eng.code})
              </option>
            ))}
          </select>
          {engineerFilter && (
            <button
              type="button"
              onClick={() => setEngineerFilter('')}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Task list */}
      {filter === 'archived' && archivedLoading ? (
        <div className="flex justify-center py-8">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
        </div>
      ) : filter === 'archived' && !archivedLoading && archivedTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No archived tasks
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-14 text-center">
          <ClipboardList className="h-10 w-10 text-gray-200 mb-3" />
          {tasks.length === 0 ? (
            <>
              <p className="text-sm font-medium text-gray-500 mb-1">No tasks yet</p>
              {isAdmin && (
                <>
                  <p className="text-xs text-gray-400 mb-4">Create your first task to get started.</p>
                  <Button size="sm" onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    New Task
                  </Button>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No tasks match your filter.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => handleCardClick(task)}
            />
          ))}
          {isAdmin && hasMore && !isSearching && (
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-xs text-gray-400">
                Showing {tasks.length} tasks
              </p>
              <Button
                variant="outline"
                onClick={() => loadMore?.()}
                disabled={loadingMore}
                className="flex items-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
                    Loading...
                  </>
                ) : (
                  'Load More Tasks'
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modals / Drawers */}
      {isAdmin && (
        <CreateTaskModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {isAdmin && (
        <BulkTaskModal
          open={showBulk}
          onClose={() => setShowBulk(false)}
        />
      )}

      <TaskDetailDrawer
        task={detailTask}
        onClose={() => setDetailTask(null)}
        onUpdate={!isAdmin ? (t) => { setDetailTask(null); setUpdateTask(t); } : undefined}
        onAdminUpdate={isAdmin ? (t) => { setDetailTask(null); setAdminUpdateTask(t); } : undefined}
      />

      {/* Field engineer update drawer */}
      <UpdateTaskDrawer
        task={updateTask}
        onClose={() => setUpdateTask(null)}
      />

      {/* Admin edit drawer */}
      <UpdateTaskDrawer
        task={adminUpdateTask}
        onClose={() => setAdminUpdateTask(null)}
      />
    </div>
  );
}
