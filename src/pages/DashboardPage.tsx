import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';
import { initAppConfig, ensureSuperAdmin, syncUserTaskCodes } from '@/firebase/initAppConfig';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFullDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  });
}

function timeAgo(d: Date): string {
  const diffMs  = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `Good ${part}, ${name.split(' ')[0]}`;
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending:     'bg-gray-100 text-gray-600',
  in_progress: 'bg-amber-100 text-amber-700',
  completed:   'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-brand-red',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending:     'Pending',
  in_progress: 'In Progress',
  completed:   'Completed',
  blocked:     'Blocked',
};

const STATUS_ROW_BORDER: Record<TaskStatus, string> = {
  pending:     'border-l-gray-300',
  in_progress: 'border-l-amber-400',
  completed:   'border-l-brand-green',
  blocked:     'border-l-brand-red',
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, borderColour,
}: { label: string; value: number; borderColour: string }) {
  return (
    <div className={cn(
      'rounded-xl p-4 bg-white border border-gray-100 shadow-sm border-l-4',
      borderColour,
    )}>
      <p className="text-3xl font-extrabold tabular-nums text-gray-900">{value}</p>
      <p className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}

// ─── Recent activity row ──────────────────────────────────────────────────────

function FollowUpRow({ task, showEngineer, onClick }: {
  task:         Task;
  showEngineer: boolean;
  onClick:      () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0 hover:bg-orange-50/50 transition-colors -mx-4 px-4"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-gray-400 shrink-0">{task.taskNum}</span>
          <span className={cn('rounded-full px-2 py-px text-[10px] font-semibold', STATUS_BADGE[task.status])}>
            {STATUS_LABEL[task.status]}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-800 truncate mt-0.5">{task.title}</p>
        {showEngineer && task.assignedToName && (
          <p className="text-xs text-gray-500 mt-0.5">
            {task.assignedToName}
            {task.assignedToCode && (
              <span className="ml-1 font-mono text-gray-400">({task.assignedToCode})</span>
            )}
          </p>
        )}
      </div>
      <span className="text-xs font-medium text-orange-600 shrink-0 bg-orange-50 rounded-full px-2 py-0.5 border border-orange-200">
        Follow up today
      </span>
    </button>
  );
}

function RecentRow({ task }: { task: Task }) {
  return (
    <div className={cn(
      'flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0 border-l-4 pl-3',
      STATUS_ROW_BORDER[task.status],
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-gray-400 shrink-0">{task.taskNum}</span>
          <span className={cn('rounded-full px-2 py-px text-[10px] font-semibold', STATUS_BADGE[task.status])}>
            {STATUS_LABEL[task.status]}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-800 truncate mt-0.5">{task.title}</p>
      </div>
      <span className="text-xs text-gray-400 shrink-0 pt-0.5">
        {task.submittedAt ? timeAgo(task.submittedAt) : ''}
      </span>
    </div>
  );
}

// ─── Next due card ────────────────────────────────────────────────────────────

function NextDueCard({ task }: { task: Task }) {
  return (
    <div className="rounded-xl border border-brand-blue/20 bg-blue-50 px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-brand-blue font-semibold uppercase tracking-wide mb-0.5">Next Due</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
        <p className="text-xs text-gray-500 mt-0.5 font-mono">{task.taskNum}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold text-brand-blue">
          {task.dueDate!.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </p>
        <p className="text-[10px] text-gray-400">
          {task.dueDate!.getFullYear()}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { currentUser } = useAuthStore();
  const { tasks }       = useTaskStore();
  const navigate        = useNavigate();

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      initAppConfig();
      ensureSuperAdmin(currentUser.uid);
      if (!localStorage.getItem('so_task_code_sync_v1')) {
        syncUserTaskCodes().then(() => {
          localStorage.setItem('so_task_code_sync_v1', '1');
        }).catch(console.error);
      }
    }
  }, [currentUser?.role]);

  const isAdmin = currentUser?.role === 'admin';

  // ── Counts ──────────────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    total:       tasks.length,
    pending:     tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    completed:   tasks.filter((t) => t.status === 'completed').length,
    blocked:     tasks.filter((t) => t.status === 'blocked').length,
  }), [tasks]);

  // ── Recent activity (admin) ─────────────────────────────────────────────────
  const recentActivity = useMemo(() =>
    [...tasks]
      .filter((t) => t.submittedAt !== null)
      .sort((a, b) => (b.submittedAt!.getTime()) - (a.submittedAt!.getTime()))
      .slice(0, 5),
    [tasks],
  );

  // ── Today's follow-ups ─────────────────────────────────────────────────────
  const todayFollowUps = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    return tasks
      .filter((t) =>
        t.followUpDate !== null &&
        t.followUpDate !== undefined &&
        t.followUpDate >= startOfDay &&
        t.followUpDate <= endOfDay &&
        t.status !== 'completed',
      )
      .sort((a, b) => a.assignedToName.localeCompare(b.assignedToName));
  }, [tasks]);

  // ── Next due task (field) ───────────────────────────────────────────────────
  const nextDueTask = useMemo(() => {
    const now = Date.now();
    return [...tasks]
      .filter((t) => t.dueDate !== null && t.status !== 'completed')
      .sort((a, b) => {
        const at = a.dueDate!.getTime();
        const bt = b.dueDate!.getTime();
        if (at >= now && bt >= now) return at - bt;
        if (at >= now) return -1;
        if (bt >= now) return 1;
        return bt - at;
      })[0] ?? null;
  }, [tasks]);

  const today = formatFullDate(new Date());

  // ── Admin view ──────────────────────────────────────────────────────────────
  if (isAdmin) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <p className="text-xs font-medium text-gray-400 mb-0.5">
          {greeting(currentUser?.name ?? 'Admin')}
        </p>
        <h1 className="text-xl font-bold text-gray-900 mb-0.5">Dashboard</h1>
        <p className="text-sm text-gray-400 mb-5">{today}</p>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total"       value={counts.total}       borderColour="border-l-brand-blue"  />
          <StatCard label="Pending"     value={counts.pending}     borderColour="border-l-gray-300"    />
          <StatCard label="In Progress" value={counts.in_progress} borderColour="border-l-amber-400"   />
          <StatCard label="Completed"   value={counts.completed}   borderColour="border-l-brand-green" />
          <StatCard label="Blocked"     value={counts.blocked}     borderColour="border-l-brand-red"   />
        </div>

        {/* Today's Follow-ups */}
        {todayFollowUps.length > 0 && (
          <div className="rounded-xl border border-orange-200 bg-white overflow-hidden mb-6">
            <div className="flex items-center justify-between px-4 py-3 border-b border-orange-100 bg-orange-50">
              <div className="flex items-center gap-2">
                <span className="text-orange-500">📅</span>
                <p className="text-sm font-semibold text-orange-800">Today's Follow-ups</p>
                <span className="rounded-full bg-orange-200 text-orange-800 text-xs font-bold px-2 py-px">
                  {todayFollowUps.length}
                </span>
              </div>
              <Link
                to="/tasks"
                state={{ filter: 'follow_up' }}
                className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="px-4">
              {todayFollowUps.map((t) => (
                <FollowUpRow
                  key={t.id}
                  task={t}
                  showEngineer={true}
                  onClick={() => navigate('/tasks', { state: { openTaskId: t.id } })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Recent Activity</p>
            <Link
              to="/tasks"
              className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="px-4">
            {recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No submissions yet.</p>
            ) : (
              recentActivity.map((t) => <RecentRow key={t.id} task={t} />)
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Field engineer view ─────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-0.5">
        {currentUser ? greeting(currentUser.name) : 'Welcome'}
      </h1>
      <p className="text-sm text-gray-400 mb-5">{today}</p>

      {/* Personal stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Assigned"    value={counts.total}       borderColour="border-l-brand-blue"  />
        <StatCard label="Pending"     value={counts.pending}     borderColour="border-l-gray-300"    />
        <StatCard label="In Progress" value={counts.in_progress} borderColour="border-l-amber-400"   />
        <StatCard label="Completed"   value={counts.completed}   borderColour="border-l-brand-green" />
      </div>

      {/* Today's follow-ups */}
      {todayFollowUps.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-white overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-orange-100 bg-orange-50">
            <div className="flex items-center gap-2">
              <span className="text-orange-500">📅</span>
              <p className="text-sm font-semibold text-orange-800">Today&apos;s Follow-ups</p>
              <span className="rounded-full bg-orange-200 text-orange-800 text-xs font-bold px-2 py-px">
                {todayFollowUps.length}
              </span>
            </div>
          </div>
          <div className="px-4">
            {todayFollowUps.map((t) => (
              <FollowUpRow
                key={t.id}
                task={t}
                showEngineer={false}
                onClick={() => navigate('/tasks', { state: { openTaskId: t.id } })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Next due */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upcoming</p>
      {nextDueTask ? (
        <NextDueCard task={nextDueTask} />
      ) : (
        <p className="text-sm text-gray-400">No upcoming due dates.</p>
      )}
    </div>
  );
}
