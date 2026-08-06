import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useProposalTasks } from '@/hooks/useProposalTasks';
import { useBackendTasks }  from '@/hooks/useBackendTasks';
import { useOnlineUsers }   from '@/hooks/useOnlineUsers';
import { initAppConfig, ensureSuperAdmin, syncUserTaskCodes, migratePipelineStages, backfillPipelineAssignments, initBackendJourneySteps, backfillJourneyCompleted, migrateLogisticsToBackend, reconcilePipelineCounts, backfillMemberCounts, backfillCreatedBy } from '@/firebase/initAppConfig';
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
  label, value, borderColour, loading, onClick,
}: { label: string; value: number; borderColour: string; loading?: boolean; onClick?: () => void }) {
  return (
    <div
      className={cn(
        'rounded-xl p-4 bg-white border border-gray-100 shadow-sm border-l-4',
        borderColour,
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
      )}
      onClick={onClick}
    >
      {loading ? (
        <div className="h-8 w-16 bg-gray-200 animate-pulse rounded mb-1" />
      ) : (
        <p className="text-3xl font-extrabold tabular-nums text-gray-900">{value}</p>
      )}
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
  const {
    tasks,
    proposalTasks, backendTasks,
    proposalTasksLoading, backendTasksLoading,
    proposalActiveCount, backendActiveCount,
  } = useTaskStore();
  const navigate        = useNavigate();
  const { config }      = useAppConfig();

  useProposalTasks();
  useBackendTasks();
  const pc              = config.pipelineCounts;

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      initAppConfig();
      ensureSuperAdmin(currentUser.uid);
      if (!localStorage.getItem('so_task_code_sync_v1')) {
        syncUserTaskCodes().then(() => {
          localStorage.setItem('so_task_code_sync_v1', '1');
        }).catch(console.error);
      }
      if (!localStorage.getItem('so_pipeline_migrate_v1')) {
        migratePipelineStages().then(() => {
          localStorage.setItem('so_pipeline_migrate_v1', '1');
        }).catch(console.error);
      }
      if (!localStorage.getItem('so_backfill_assign_v1')) {
        backfillPipelineAssignments().then(() => {
          localStorage.setItem('so_backfill_assign_v1', '1');
        }).catch(console.error);
      }
      if (!localStorage.getItem('so_backend_journey_v1')) {
        initBackendJourneySteps().then(() => {
          localStorage.setItem('so_backend_journey_v1', '1');
        }).catch(console.error);
      }
      if (!localStorage.getItem('so_journey_complete_v1')) {
        backfillJourneyCompleted().then(() => {
          localStorage.setItem('so_journey_complete_v1', '1');
        }).catch(console.error);
      }
      if (!localStorage.getItem('so_migrate_logistics_v1')) {
        migrateLogisticsToBackend().then(() => {
          localStorage.setItem('so_migrate_logistics_v1', '1');
        }).catch(console.error);
      }
      // Reconcile on every admin login (lightweight check)
      reconcilePipelineCounts().catch(console.error);
      if (!localStorage.getItem('so_member_counts_v1')) {
        backfillMemberCounts().then(() => {
          localStorage.setItem('so_member_counts_v1', '1');
        }).catch(console.error);
      }
      if (!localStorage.getItem('so_created_by_v1') && currentUser?.role === 'admin') {
        backfillCreatedBy(currentUser.uid).then(() => {
          localStorage.setItem('so_created_by_v1', '1');
        }).catch(console.error);
      }
    }
  }, [currentUser?.role]);

  const isAdmin      = currentUser?.role === 'admin';
  const isViewOnly   = currentUser?.role === 'view_only';
  const showAdminView = isAdmin || isViewOnly;
  const { onlineUsers, onlineCount } = useOnlineUsers();

  // ── Status counts for admin (full Firestore query, not 50-task store) ────────
  const [statusCounts, setStatusCounts] = useState<{
    pending: number; in_progress: number; completed: number; blocked: number; total: number;
  }>({ pending: 0, in_progress: 0, completed: 0, blocked: 0, total: 0 });
  const [statusCountsLoading, setStatusCountsLoading] = useState(true);

  useEffect(() => {
    if (!showAdminView) return;
    setStatusCountsLoading(true);
    async function loadStatusCounts() {
      try {
        const [p, ip, c, b, t] = await Promise.all([
          getDocs(query(collection(db, 'tasks'), where('archived', '==', false), where('status', '==', 'pending'),     where('pipelineStage', 'not-in', ['dropped', 'completed']), limit(1000))),
          getDocs(query(collection(db, 'tasks'), where('archived', '==', false), where('status', '==', 'in_progress'), where('pipelineStage', 'not-in', ['dropped', 'completed']), limit(1000))),
          getDocs(query(collection(db, 'tasks'), where('archived', '==', false), where('status', '==', 'completed'),   limit(1000))),
          getDocs(query(collection(db, 'tasks'), where('archived', '==', false), where('status', '==', 'blocked'),     where('pipelineStage', 'not-in', ['dropped', 'completed']), limit(1000))),
          getCountFromServer(query(collection(db, 'tasks'), where('archived', '==', false))),
        ]);
        setStatusCounts({
          pending:     p.size,
          in_progress: ip.size,
          completed:   c.size,
          blocked:     b.size,
          total:       t.data().count,
        });
      } catch (err) {
        console.error('[Dashboard] loadStatusCounts failed:', err);
      } finally {
        setStatusCountsLoading(false);
      }
    }
    loadStatusCounts();
  }, [showAdminView]);

  // ── Sales Closed count (admin/view_only — excludes dropped, mirrors the
  // Tasks-page "Sales Closed" tab badge count) ────────────────────────────────
  const [saleClosedCount, setSaleClosedCount] = useState(0);
  const [saleClosedCountLoading, setSaleClosedCountLoading] = useState(true);

  useEffect(() => {
    if (!showAdminView) return;
    setSaleClosedCountLoading(true);
    getCountFromServer(query(
      collection(db, 'tasks'),
      where('archived',      '==', false),
      where('saleClosed',    '==', true),
      where('pipelineStage', '!=', 'dropped'),
    )).then((snap) => {
      setSaleClosedCount(snap.data().count);
    }).catch((err) => {
      console.error('[Dashboard] saleClosedCount fetch failed:', err);
    }).finally(() => {
      setSaleClosedCountLoading(false);
    });
  }, [showAdminView]);

  // ── Counts (admin uses pipelineCounts from appConfig; field uses tasks) ────
  const counts = useMemo(() => {
    if (showAdminView) {
      return {
        total:       statusCounts.total,
        pending:     statusCounts.pending,
        in_progress: statusCounts.in_progress,
        completed:   statusCounts.completed,
        blocked:     statusCounts.blocked,
      };
    }
    return {
      total:       tasks.length,
      pending:     tasks.filter((t) => t.status === 'pending').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      completed:   tasks.filter((t) => t.status === 'completed').length,
      blocked:     tasks.filter((t) => t.status === 'blocked').length,
    };
  }, [tasks, showAdminView, pc, statusCounts]);

  // ── Recent activity (field engineer — from own tasks in store) ─────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const submitted = tasks.filter((t) => t.submittedAt && !t.archived);
  const todaySubmitted = submitted
    .filter((t) => t.submittedAt! >= todayStart)
    .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime());

  const recentActivity = todaySubmitted.length > 0
    ? todaySubmitted.slice(0, 10)
    : submitted
        .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime())
        .slice(0, 10);

  const activityLabel = todaySubmitted.length > 0
    ? `Today's Activity (${todaySubmitted.length})`
    : 'Recent Activity';

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
        (!t.pipelineStage || t.pipelineStage === 'survey') &&
        t.status !== 'completed',
      )
      .sort((a, b) => a.assignedToName.localeCompare(b.assignedToName));
  }, [tasks]);

  // ── Pipeline counts (admin — from appConfig denormalized counters) ─────────
  // Raw counters — correction-return tasks are no longer subtracted here,
  // matching the Tasks-page pipeline-stage tabs which also stopped excluding them.
  const pipelineCounts: Record<string, number> | null = showAdminView ? {
    survey:       pc?.survey       ?? 0,
    proposal:     pc?.proposal     ?? 0,
    field_review: pc?.field_review ?? 0,
    documents:    pc?.documents    ?? 0,
    backend:      pc?.backend      ?? 0,
    completed:    pc?.completed    ?? 0,
    dropped:      pc?.dropped      ?? 0,
  } : null;

  // ── Pipeline Activity Today (admin — direct Firestore query) ────────────────
  type ActivityEntry = {
    taskId: string; taskNum: string; taskTitle: string;
    actorName: string; fromStage: string; toStage: string; timestamp: Date;
  };
  const [todayActivity, setTodayActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    if (!showAdminView) return;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    getDocs(query(
      collection(db, 'tasks'),
      where('archived',   '==', false),
      where('updatedAt',  '>=', Timestamp.fromDate(dayStart)),
      orderBy('updatedAt', 'desc'),
      limit(50),
    )).then((snap) => {
      const activity: ActivityEntry[] = [];
      snap.docs.forEach((d) => {
        const data    = d.data();
        const history = (data['stageHistory'] ?? []) as Array<{
          fromStage?: string; toStage: string;
          actorName: string; timestamp: unknown;
        }>;
        history.forEach((entry) => {
          const ts = (entry.timestamp as { toDate?: () => Date })?.toDate?.() ?? new Date();
          if (ts >= dayStart) {
            activity.push({
              taskId:    d.id,
              taskNum:   data['taskNum']  as string,
              taskTitle: data['title']    as string,
              actorName: entry.actorName,
              fromStage: entry.fromStage ?? '',
              toStage:   entry.toStage,
              timestamp: ts,
            });
          }
        });
      });
      activity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setTodayActivity(activity.slice(0, 20));
    }).catch(console.error);
  }, [showAdminView]);

  // ── Next due task (field) ───────────────────────────────────────────────────
  const nextDueTask = useMemo(() => {
    const now = Date.now();
    return [...tasks]
      .filter((t) =>
        t.dueDate !== null &&
        t.status !== 'completed' &&
        (!t.pipelineStage || t.pipelineStage === 'survey'),
      )
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

  // ── Proposal view ───────────────────────────────────────────────────────────
  if (currentUser?.role === 'proposal') {
    const activeProposal   = proposalActiveCount;
    const revisionsCount   = proposalTasks.filter((t) => (t.proposalRevisionCount ?? 0) > 0).length;
    return (
      <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting(currentUser.name)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatFullDate(new Date())}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Active"    value={activeProposal} borderColour="border-l-violet-400" loading={proposalTasksLoading} />
          <StatCard label="Revisions" value={revisionsCount}  borderColour="border-l-amber-400"  loading={proposalTasksLoading} />
        </div>
        <div
          className="rounded-xl border border-purple-200 bg-purple-50 p-5 cursor-pointer hover:bg-purple-100 transition-colors"
          onClick={() => navigate('/proposal')}
        >
          <p className="text-lg font-semibold text-purple-800">📄 Proposal Tasks</p>
          <p className="text-sm text-purple-600 mt-1">
            View and upload proposal documents
          </p>
        </div>
      </div>
    );
  }

  // ── Backend view ────────────────────────────────────────────────────────────
  if (currentUser?.role === 'backend') {
    const activeBackend = backendActiveCount;
    const readyCount    = backendTasks.filter((t) => t.journeyCompleted).length;
    return (
      <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting(currentUser.name)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatFullDate(new Date())}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Active" value={activeBackend} borderColour="border-l-orange-400" loading={backendTasksLoading} />
          <StatCard label="Ready"  value={readyCount}    borderColour="border-l-green-400"  loading={backendTasksLoading} />
        </div>
        <div
          className="rounded-xl border border-orange-200 bg-orange-50 p-5 cursor-pointer hover:bg-orange-100 transition-colors"
          onClick={() => navigate('/backend')}
        >
          <p className="text-lg font-semibold text-orange-800">⚙️ Backend Tasks</p>
          <p className="text-sm text-orange-600 mt-1">
            View and complete backend checklist
          </p>
        </div>
      </div>
    );
  }

  // ── Backend Manager view ────────────────────────────────────────────────────
  if (currentUser?.role === 'backend_manager') {
    return (
      <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting(currentUser.name)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatFullDate(new Date())}
          </p>
        </div>
        <div
          className="rounded-xl border border-orange-200 bg-orange-50 p-5 cursor-pointer hover:bg-orange-100 transition-colors"
          onClick={() => navigate('/backend-manager')}
        >
          <p className="text-lg font-semibold text-orange-800">⚙️ Backend Overview</p>
          <p className="text-sm text-orange-600 mt-1">
            View and manage all backend tasks
          </p>
        </div>
      </div>
    );
  }

  // ── Admin / View-Only view ──────────────────────────────────────────────────
  if (showAdminView) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <p className="text-xs font-medium text-gray-400 mb-0.5">
          {greeting(currentUser?.name ?? 'Admin')}
        </p>
        <h1 className="text-xl font-bold text-gray-900 mb-0.5">Dashboard</h1>
        <p className="text-sm text-gray-400 mb-5">{today}</p>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total"       value={counts.total}       borderColour="border-l-brand-blue"  loading={statusCountsLoading} onClick={() => navigate('/tasks', { state: { filter: 'all' } })} />
          <StatCard label="Pending"     value={counts.pending}     borderColour="border-l-gray-300"    loading={statusCountsLoading} onClick={() => navigate('/tasks', { state: { filter: 'pending' } })} />
          <StatCard label="In Progress" value={counts.in_progress} borderColour="border-l-amber-400"   loading={statusCountsLoading} onClick={() => navigate('/tasks', { state: { filter: 'in_progress' } })} />
          <StatCard label="Completed"   value={counts.completed}   borderColour="border-l-brand-green" loading={statusCountsLoading} onClick={() => navigate('/tasks', { state: { filter: 'completed' } })} />
          <StatCard label="Blocked"     value={counts.blocked}     borderColour="border-l-brand-red"   loading={statusCountsLoading} onClick={() => navigate('/tasks', { state: { filter: 'blocked' } })} />
          <StatCard
            label="Sales Closed"
            value={saleClosedCount}
            borderColour="border-l-emerald-500"
            loading={saleClosedCountLoading}
            onClick={() => navigate('/tasks', { state: { filter: 'sales_closed' } })}
          />
        </div>

        {/* Online users */}
        {showAdminView && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-green-800">
                {onlineCount} {onlineCount === 1 ? 'user' : 'users'} online now
              </span>
            </div>
            {onlineUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {onlineUsers.map(u => (
                  <span key={u.uid}
                    className="text-xs bg-white border border-green-200 text-green-700 rounded-full px-2 py-0.5">
                    {u.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pipeline Overview */}
        {showAdminView && pipelineCounts && (
          <div className="flex flex-col gap-3 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Pipeline Overview
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { stage: 'survey',       label: 'Survey',        icon: '📋', color: 'border-l-gray-400'   },
                { stage: 'proposal',     label: 'Proposal',      icon: '📄', color: 'border-l-purple-400', filter: 'pipeline_proposal'     },
                { stage: 'field_review', label: 'Field Review',  icon: '👁️', color: 'border-l-blue-400',   filter: 'pipeline_field_review' },
                { stage: 'documents',    label: 'Documents',     icon: '📎', color: 'border-l-teal-400',   filter: 'pipeline_documents'    },
                { stage: 'backend',      label: 'Backend',       icon: '⚙️', color: 'border-l-orange-400', filter: 'pipeline_backend'      },
                { stage: 'completed',    label: 'Converted',     icon: '✅', color: 'border-l-green-600',  filter: 'converted'             },
                { stage: 'dropped',      label: 'Dropped',       icon: '❌', color: 'border-l-red-400',    filter: 'dropped'               },
              ].map(({ stage, label, icon, color, filter }) => (
                <div
                  key={stage}
                  className={cn(
                    `rounded-xl p-3 bg-white border border-gray-100 shadow-sm border-l-4 ${color}`,
                    filter && 'cursor-pointer hover:shadow-md transition-shadow',
                  )}
                  onClick={filter ? () => navigate('/tasks', { state: { filter } }) : undefined}
                >
                  <p className="text-2xl font-extrabold tabular-nums text-gray-900">
                    {pipelineCounts[stage] ?? 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{icon} {label}</p>
                </div>
              ))}
            </div>
            {pipelineCounts && (() => {
              const totalActive = pc?.total_active ?? 0;
              const converted   = pc?.completed    ?? 0;
              const dropped     = pc?.dropped      ?? 0;
              const total       = totalActive + converted + dropped;
              const rate        = total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0';
              return (
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-600 font-medium">Conversion Rate</p>
                    <p className="text-2xl font-extrabold text-green-700">{rate}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-green-600 font-medium">Leads Converted</p>
                    <p className="text-2xl font-extrabold text-green-700">{converted}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Unassigned leads alert */}
        {(() => {
          const unassignedCount = (pc?.unassigned_proposal ?? 0) + (pc?.unassigned_backend ?? 0);
          if (unassignedCount === 0) return null;
          return (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-red-500">⚠️</span>
                <p className="text-sm font-semibold text-red-700">
                  {unassignedCount} lead{unassignedCount !== 1 ? 's' : ''} need assignment
                </p>
                <p className="text-xs text-red-500 hidden sm:block">
                  Tasks waiting for team member assignment
                </p>
              </div>
              <Link
                to="/tasks"
                state={{ filter: 'unassigned' }}
                className="shrink-0 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1.5 transition-all"
              >
                View Unassigned →
              </Link>
            </div>
          );
        })()}

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
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">{activityLabel}</p>
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

        {/* Pipeline Activity Today */}
        {todayActivity.length > 0 && (() => {
          const STAGE_LABEL: Record<string, string> = {
            survey: 'Survey', proposal: 'Proposal', field_review: 'Field Review',
            documents: 'Documents', backend: 'Backend', completed: 'Converted', dropped: 'Dropped',
          };
          return (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden mb-6">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500">📋</span>
                  <p className="text-sm font-semibold text-gray-800">Pipeline Activity Today</p>
                </div>
                <span className="rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5">
                  {todayActivity.length} event{todayActivity.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {todayActivity.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {entry.taskTitle}
                        <span className="ml-1 font-mono text-gray-400 text-[10px]">{entry.taskNum}</span>
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {entry.fromStage ? `${STAGE_LABEL[entry.fromStage] ?? entry.fromStage} → ` : ''}
                        <span className="font-medium text-gray-700">
                          {STAGE_LABEL[entry.toStage] ?? entry.toStage}
                        </span>
                        <span className="text-gray-400 ml-1">· {entry.actorName}</span>
                      </p>
                    </div>
                    <p className="shrink-0 text-[10px] text-gray-400 tabular-nums mt-0.5">
                      {entry.timestamp.toLocaleTimeString('en-IN', {
                        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── Field engineer view ─────────────────────────────────────────────────────
  const myTasks       = tasks.filter((t) => t.assignedTo === currentUser?.uid && !t.archived);
  const myPending     = myTasks.filter((t) => t.status === 'pending').length;
  const myInProgress  = myTasks.filter((t) => t.status === 'in_progress').length;
  const myReview      = myTasks.filter((t) => t.pipelineStage === 'field_review').length;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-0.5">
        {currentUser ? greeting(currentUser.name) : 'Welcome'}
      </h1>
      <p className="text-sm text-gray-400 mb-5">{today}</p>

      {/* My Tasks heading */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">My Tasks</p>

      {/* Personal stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Total Tasks"     value={myTasks.length} borderColour="border-l-brand-blue"  />
        <StatCard label="Pending"         value={myPending}      borderColour="border-l-gray-300"    />
        <StatCard label="In Progress"     value={myInProgress}   borderColour="border-l-amber-400"   />
        <StatCard label="Awaiting Review" value={myReview}       borderColour="border-l-brand-blue"  />
      </div>

      {/* My Active Tasks */}
      {(() => {
        const activeTasks = myTasks
          .filter((t) =>
            t.status === 'pending' || t.status === 'in_progress'
          )
          .sort((a, b) => {
            if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
            if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
            return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
          })
          .slice(0, 5);

        if (activeTasks.length === 0) return null;

        return (
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden mb-6">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">
                Active Tasks
              </p>
              <Link
                to="/tasks"
                className="text-xs font-medium text-brand-blue hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {activeTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {t.title}
                    </p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                      {t.taskNum}
                    </p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    t.status === 'in_progress'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600',
                  )}>
                    {t.status === 'in_progress' ? 'In Progress' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
