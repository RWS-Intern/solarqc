import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { BackendWorkDrawer }  from '@/components/pipeline/BackendWorkDrawer';
import { cn }                 from '@/lib/utils';
import { useStageTaskList }   from '@/hooks/useStageTaskList';
import { docToBackendTask }   from '@/hooks/useBackendTasks';
import type { Task }          from '@/types';

function BackendTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const steps      = task.applicationJourneySteps ?? [];
  const totalSteps = steps.length;
  const doneSteps  = steps.filter(s => s.status === 'done').length;
  const pct        = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const backendEntry = [...(task.stageHistory ?? [])].reverse().find(e => e.toStage === 'backend');
  let daysInStage: number | null = null;
  if (backendEntry?.timestamp) {
    const ts = backendEntry.timestamp;
    const d: Date = typeof (ts as unknown as { toDate(): Date }).toDate === 'function'
      ? (ts as unknown as { toDate(): Date }).toDate()
      : ts as unknown as Date;
    daysInStage = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3.5 hover:border-orange-300 hover:shadow-md transition-all flex flex-col gap-1"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-400">{task.taskNum}</span>
        {task.journeyCompleted && (
          <span className="rounded-full bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5">
            Ready
          </span>
        )}
        {task.backendAssignedToName && (
          <span className="rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold px-2 py-0.5">
            {task.backendAssignedToName}
          </span>
        )}
        {daysInStage !== null && (
          <span className="rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold px-2 py-0.5">
            {daysInStage}d in stage
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
      {task.district && (
        <p className="text-xs text-gray-400">{task.district}</p>
      )}
      {totalSteps > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">{doneSteps}/{totalSteps} steps</span>
            <span className="text-[10px] text-gray-400">{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', task.journeyCompleted ? 'bg-green-400' : 'bg-orange-400')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
}

export function BackendManagerPage() {
  const [search,     setSearch]     = useState('');
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const {
    tasks,
    isLoading,
    hasMore,
    loadingMore,
    loadMore,
    search:        firestoreSearch,
    searchResults,
    isSearching,
    clearSearch,
  } = useStageTaskList(
    'backend',
    null,        // unscoped — manager sees ALL backend-stage tasks org-wide
    undefined,
    docToBackendTask,
  );

  // Debounce: fire Firestore search 350 ms after the user stops typing;
  // clear immediately when the input is empty.
  useEffect(() => {
    if (!search.trim()) {
      clearSearch();
      return;
    }
    const id = setTimeout(() => firestoreSearch(search), 350);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const displayTasks = isSearching ? searchResults : tasks;
  const inProgress   = tasks.filter((t) => !t.journeyCompleted).length;
  const readyCount   = tasks.filter((t) => t.journeyCompleted).length;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Backend Overview</h1>
        <p className="text-xs text-gray-400 mt-0.5">Read-only view of all active backend tasks</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white border border-orange-100 shadow-sm px-3 py-3 text-center">
          <p className="text-2xl font-extrabold text-orange-500">{inProgress}</p>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">In Progress</p>
        </div>
        <div className="rounded-xl bg-white border border-green-100 shadow-sm px-3 py-3 text-center">
          <p className="text-2xl font-extrabold text-green-600">{readyCount}</p>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">Ready</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, task number, or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue bg-white"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-400 border-t-transparent" />
        </div>
      ) : displayTasks.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-16">
          {search ? 'No tasks match your search.' : 'No active backend tasks.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {displayTasks.map((task) => (
            <BackendTaskCard key={task.id} task={task} onClick={() => setActiveTask(task)} />
          ))}
        </div>
      )}

      {!isLoading && !isSearching && hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-medium py-3 text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loadingMore ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              Loading...
            </>
          ) : (
            'Load More ↓'
          )}
        </button>
      )}

      <BackendWorkDrawer
        task={activeTask}
        onClose={() => setActiveTask(null)}
        isReadOnly
      />
    </div>
  );
}
