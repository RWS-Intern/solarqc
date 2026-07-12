import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db }                  from '@/firebase/config';
import { BackendWorkDrawer }   from '@/components/pipeline/BackendWorkDrawer';
import { cn }                  from '@/lib/utils';
import type { Task }           from '@/types';

function fromFirestore(id: string, data: Record<string, unknown>): Task {
  function toDate(v: unknown): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object' && 'toDate' in (v as object)) return (v as { toDate(): Date }).toDate();
    return null;
  }
  return {
    ...data,
    id,
    createdAt:  toDate(data.createdAt)  ?? new Date(),
    updatedAt:  toDate(data.updatedAt)  ?? null,
    dueDate:    toDate(data.dueDate)    ?? null,
    surveyDate: toDate(data.surveyDate) ?? null,
  } as unknown as Task;
}

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
  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [activeTask,  setActiveTask]  = useState<Task | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'tasks'),
      where('pipelineStage', '==', 'backend'),
      where('archived', '==', false),
      orderBy('updatedAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => fromFirestore(d.id, d.data() as Record<string, unknown>)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const filtered = tasks.filter((t) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.taskNum.toLowerCase().includes(q)) return false;
    }
    return true;
  });

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
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue bg-white"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-400 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-16">
          {search ? 'No tasks match your search.' : 'No active backend tasks.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((task) => (
            <BackendTaskCard key={task.id} task={task} onClick={() => setActiveTask(task)} />
          ))}
        </div>
      )}

      <BackendWorkDrawer
        task={activeTask}
        onClose={() => setActiveTask(null)}
        isReadOnly
      />
    </div>
  );
}
