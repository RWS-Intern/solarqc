import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Search, ClipboardList, ChevronRight, Download, Upload, X } from 'lucide-react';
import {
  getDocs, collection, query, where, orderBy, startAfter, limit, Timestamp,
  type Query, type DocumentData, type DocumentSnapshot,
} from 'firebase/firestore';
import { db }                 from '@/firebase/config';
import { useTaskStore }       from '@/store/taskStore';
import { useAuthStore }       from '@/store/authStore';
import { Button }             from '@/components/ui/button';
import { CreateTaskModal }    from '@/components/tasks/CreateTaskModal';
import { BulkTaskModal }      from '@/components/tasks/BulkTaskModal';
import { TaskDetailDrawer }   from '@/components/tasks/TaskDetailDrawer';
import { UpdateTaskDrawer }     from '@/components/tasks/UpdateTaskDrawer';
import { FieldReviewDrawer }   from '@/components/pipeline/FieldReviewDrawer';
import { DocumentsWorkDrawer } from '@/components/pipeline/DocumentsWorkDrawer';
import { exportTasksToExcel } from '@/utils/exportTasksToExcel';
import { cn }                 from '@/lib/utils';
import { useArchivedTasks, useTasks, useTabCounts, docToTask, type AdminFilter } from '@/hooks/useTasks';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useFieldEngineers } from '@/hooks/useFieldEngineers';
import { useToast } from '@/components/ui/toast';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import type { Task, TaskStatus, PipelineStage } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<TaskStatus, { label: string; badge: string; border: string }> = {
  pending:     { label: 'Pending',     badge: 'bg-gray-100 text-gray-600',   border: 'border-l-gray-300'   },
  in_progress: { label: 'In Progress', badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400'  },
  completed:   { label: 'Completed',   badge: 'bg-green-100 text-green-700', border: 'border-l-green-500'  },
  blocked:     { label: 'Blocked',     badge: 'bg-red-100 text-brand-red',   border: 'border-l-red-500'    },
};

const PIPELINE_BADGE: Partial<Record<PipelineStage, { label: string; cls: string }>> = {
  proposal:     { label: '📄 With Proposal Team',     cls: 'bg-purple-100 text-purple-700' },
  field_review: { label: '👁️ Awaiting Your Review',   cls: 'bg-blue-100 text-blue-700'    },
  documents:    { label: '📎 Upload Documents',       cls: 'bg-teal-100 text-teal-700'    },
  backend:      { label: '⚙️ With Backend Team',      cls: 'bg-orange-100 text-orange-700' },
  completed:    { label: '✅ Converted',               cls: 'bg-green-100 text-green-700'  },
  dropped:      { label: '❌ Dropped',                cls: 'bg-red-100 text-red-600'      },
};

type Filter = 'all' | TaskStatus | 'follow_up' | 'overdue' | 'archived' | 'dropped' | 'converted' |
  'pipeline_proposal' | 'pipeline_field_review' | 'pipeline_documents' | 'pipeline_backend' | 'unassigned' | 'my_tasks' |
  'fe_review' | 'fe_documents' | 'fe_pipeline' | 'fe_converted' | 'fe_dropped' | 'fe_survey_done' | 'needs_correction' |
  'sales_closed';

const FILTER_TABS: { key: Filter; label: string; adminOnly?: boolean; fieldOnly?: boolean }[] = [
  { key: 'all',              label: 'All'              },
  { key: 'needs_correction', label: '↩ Needs Correction' },
  { key: 'sales_closed',     label: '💰 Sales Closed', adminOnly: true },
  { key: 'my_tasks',         label: '👤 My Leads', adminOnly: true },
  { key: 'pending',     label: 'Pending'     },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',      label: 'Survey Done', adminOnly: true },
  { key: 'blocked',        label: 'Blocked'     },
  { key: 'follow_up',      label: 'Follow Up'   },
  { key: 'overdue',        label: 'Overdue'     },
  { key: 'archived',       label: 'Archived'    },
  { key: 'fe_survey_done', label: '📋 Survey Submitted', fieldOnly: true },
  { key: 'fe_review',      label: '👁️ Review',           fieldOnly: true },
  { key: 'fe_documents',   label: '📎 Documents',        fieldOnly: true },
  { key: 'fe_pipeline',    label: '⚙️ Pipeline',          fieldOnly: true },
  { key: 'fe_converted',   label: '✅ Converted',         fieldOnly: true },
  { key: 'fe_dropped',     label: '❌ Dropped',           fieldOnly: true },
  { key: 'dropped',              label: 'Dropped',      adminOnly: true },
  { key: 'converted',            label: 'Converted',    adminOnly: true },
  { key: 'pipeline_proposal',     label: '📄 Proposal',     adminOnly: true },
  { key: 'pipeline_field_review', label: '👁️ Field Review', adminOnly: true },
  { key: 'pipeline_documents',    label: '📎 Documents',    adminOnly: true },
  { key: 'pipeline_backend',      label: '⚙️ Backend',      adminOnly: true },
  { key: 'unassigned',            label: '⚠️ Unassigned',   adminOnly: true },
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
  if (task.pipelineStage && task.pipelineStage !== 'survey') return false;
  return !!(task.dueDate && isPast(task.dueDate));
}

function isActiveFollowUp(task: Task): boolean {
  if (!task.followUpDate) return false;
  const stillInSurvey = !task.pipelineStage || task.pipelineStage === 'survey';
  return stillInSurvey && task.status !== 'completed';
}

// ─── Shared filter predicate ──────────────────────────────────────────────────
// Single source of truth for "does task T match the current active filters?"
// Used by both the live `visible` display and the export fetch path.

interface FilterCtx {
  filter:          string;
  stateFilter:     string;
  engineerFilter:  string;
  districtFilter:  string;
  leadSourceFilter: string;
  search:          string;
  isAdmin:         boolean;
  isViewOnly:      boolean;
  currentUserUid?: string;
}

function taskMatchesActiveFilters(t: Task, ctx: FilterCtx): boolean {
  const { filter, stateFilter, engineerFilter, districtFilter, leadSourceFilter, search, isAdmin, isViewOnly, currentUserUid } = ctx;

  if (filter === 'archived') return !!t.archived;
  if (t.archived) return false;

  // State / Engineer / District / Lead Source — independent AND conditions.
  if ((isAdmin || isViewOnly) && stateFilter      && t.state      !== stateFilter)      return false;
  if ((isAdmin || isViewOnly) && engineerFilter   && t.assignedTo !== engineerFilter)   return false;
  if ((isAdmin || isViewOnly) && districtFilter   && t.district   !== districtFilter)   return false;
  if ((isAdmin || isViewOnly) && leadSourceFilter && t.leadSource !== leadSourceFilter) return false;

  if (filter === 'needs_correction')      return !!t.correctionReturnTo;
  // Sales Closed intentionally includes dropped leads — a lead that closed
  // then got dropped is exactly the anomaly this tab exists to surface.
  if (filter === 'sales_closed')          return !!t.saleClosed;
  if (filter === 'dropped')               return t.pipelineStage === 'dropped';
  if (filter === 'converted')             return t.pipelineStage === 'completed';
  if (filter === 'pipeline_proposal')     return t.pipelineStage === 'proposal';
  if (filter === 'pipeline_field_review') return t.pipelineStage === 'field_review';
  if (filter === 'pipeline_documents')    return t.pipelineStage === 'documents';
  if (filter === 'pipeline_backend')      return t.pipelineStage === 'backend';
  if (filter === 'unassigned') return (
    (t.pipelineStage === 'proposal' && !t.proposalAssignedTo) ||
    (t.pipelineStage === 'backend'  && !t.backendAssignedTo)
  );
  if (filter === 'pending')     return t.status === 'pending'     && t.pipelineStage !== 'dropped' && t.pipelineStage !== 'completed';
  if (filter === 'in_progress') return t.status === 'in_progress' && t.pipelineStage !== 'dropped' && t.pipelineStage !== 'completed';
  if (filter === 'blocked')     return t.status === 'blocked'     && t.pipelineStage !== 'dropped' && t.pipelineStage !== 'completed';
  if (filter === 'fe_survey_done') return t.status === 'completed' && t.assignedTo === currentUserUid;
  if (filter === 'fe_review')    return t.pipelineStage === 'field_review' && t.assignedTo === currentUserUid;
  if (filter === 'fe_documents') return t.pipelineStage === 'documents'    && t.assignedTo === currentUserUid;
  if (filter === 'fe_pipeline')  return !!(t.pipelineStage && t.pipelineStage !== 'survey' && t.pipelineStage !== 'field_review' && t.pipelineStage !== 'documents' && t.pipelineStage !== 'completed' && t.pipelineStage !== 'dropped' && t.assignedTo === currentUserUid);
  if (filter === 'fe_converted') return t.pipelineStage === 'completed' && t.assignedTo === currentUserUid;
  if (filter === 'fe_dropped')   return t.pipelineStage === 'dropped'   && t.assignedTo === currentUserUid;
  if (filter === 'my_tasks')     return true;
  if (filter === 'completed')    return t.status === 'completed' && t.pipelineStage !== 'completed';
  if (filter === 'follow_up' && !isActiveFollowUp(t)) return false;
  if (filter === 'overdue'   && !isOverdue(t))        return false;
  if (filter !== 'all' && filter !== 'follow_up' && filter !== 'overdue' && t.status !== filter) return false;

  // Text search — now applies for ALL roles, not just non-admin. Server-side
  // admin search already narrows candidates before this runs, so this is a
  // safe, idempotent re-check in the normal case — and it's what correctly
  // fixes Engineer+Search / District+Search combos, where the export (and
  // live page) took a broad engineer/district-only fetch that never applied
  // any search-specific query.
  if (search.trim().length > 0) {
    const term = search.trim().toLowerCase();
    const matchesTitle  = t.title.toLowerCase().includes(term);
    const matchesNum    = t.taskNum.toLowerCase().includes(term);
    const matchesMobile = /^\d{10}$/.test(search.trim()) && t.consumerMobile === search.trim();
    if (!matchesTitle && !matchesNum && !matchesMobile) return false;
  }

  return true;
}

// ─── Export fetch ─────────────────────────────────────────────────────────────
// Runs a complete (no-limit, cursor-paginated) Firestore query for whatever
// filters are active, then applies taskMatchesActiveFilters as a final pass.

const EXPORT_BATCH = 500;
const EXPORT_MAX   = 20000;

async function drainQuery(
  baseQ: Query<DocumentData>,
): Promise<{ docs: Task[]; truncated: boolean }> {
  const docs: Task[] = [];
  let lastSnap: DocumentSnapshot | null = null;
  let truncated = false;
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = lastSnap
      ? query(baseQ, startAfter(lastSnap), limit(EXPORT_BATCH))
      : query(baseQ, limit(EXPORT_BATCH));
    const snap = await getDocs(q as Query<DocumentData>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snap.docs.forEach((d: any) => docs.push(docToTask(d)));
    lastSnap = snap.docs[snap.docs.length - 1] ?? null;
    if (docs.length >= EXPORT_MAX) { truncated = true; break; }
    if (snap.docs.length < EXPORT_BATCH) break;
  }
  return { docs, truncated };
}

function mergeDedup(...arrays: Task[][]): Task[] {
  const seen = new Set<string>();
  return arrays.flat().filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

async function fetchAllTasksForExport(
  ctx: FilterCtx & { dateFilter: string; dueDateFilter: string },
): Promise<{ tasks: Task[]; truncated: boolean }> {
  const { filter, engineerFilter, districtFilter, dateFilter, dueDateFilter, search } = ctx;
  const col = collection(db, 'tasks');

  // ── Archived tab ──────────────────────────────────────────────────────────
  if (filter === 'archived') {
    const { docs, truncated } = await drainQuery(
      query(col, where('archived', '==', true), orderBy('archivedAt', 'desc')),
    );
    return { tasks: docs, truncated };
  }

  // ── Engineer filter (highest priority) ────────────────────────────────────
  if (engineerFilter) {
    const { docs, truncated } = await drainQuery(
      query(col, where('assignedTo', '==', engineerFilter), where('archived', '==', false), orderBy('createdAt', 'desc')),
    );
    return { tasks: docs.filter((t) => taskMatchesActiveFilters(t, ctx)), truncated };
  }

  // ── District filter ───────────────────────────────────────────────────────
  if (districtFilter) {
    const { docs, truncated } = await drainQuery(
      query(col, where('district', '==', districtFilter), where('archived', '==', false), orderBy('updatedAt', 'desc')),
    );
    return { tasks: docs.filter((t) => taskMatchesActiveFilters(t, ctx)), truncated };
  }

  // ── Date (createdAt) filter ───────────────────────────────────────────────
  if (dateFilter) {
    const start = new Date(dateFilter + 'T00:00:00');
    const end   = new Date(dateFilter + 'T23:59:59.999');
    const { docs, truncated } = await drainQuery(
      query(col, where('archived', '==', false), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<=', Timestamp.fromDate(end)), orderBy('createdAt', 'desc')),
    );
    return { tasks: docs.filter((t) => taskMatchesActiveFilters(t, ctx)), truncated };
  }

  // ── Due date filter ───────────────────────────────────────────────────────
  if (dueDateFilter) {
    const start = new Date(dueDateFilter + 'T00:00:00');
    const end   = new Date(dueDateFilter + 'T23:59:59.999');
    const { docs, truncated } = await drainQuery(
      query(col, where('archived', '==', false), where('dueDate', '>=', Timestamp.fromDate(start)), where('dueDate', '<=', Timestamp.fromDate(end)), orderBy('dueDate', 'asc')),
    );
    return { tasks: docs.filter((t) => taskMatchesActiveFilters(t, ctx)), truncated };
  }

  // ── Search (multi-query, merged) ──────────────────────────────────────────
  if (search.trim().length > 0) {
    const term     = search.trim().toLowerCase();
    const isMobile = /^\d{10}$/.test(search.trim());
    const [numResult, titleResult] = await Promise.all([
      drainQuery(query(col, where('archived', '==', false), where('taskNum', '>=', search.trim().toUpperCase()), where('taskNum', '<=', search.trim().toUpperCase() + ''))),
      drainQuery(query(col, where('archived', '==', false), where('titleWords', 'array-contains', term), orderBy('createdAt', 'desc'))),
    ]);
    const mobileResult = isMobile
      ? await drainQuery(query(col, where('archived', '==', false), where('consumerMobile', '==', search.trim())))
      : { docs: [] as Task[], truncated: false };
    const truncated = numResult.truncated || titleResult.truncated || mobileResult.truncated;
    const merged    = mergeDedup(numResult.docs, titleResult.docs, mobileResult.docs);
    return { tasks: merged.filter((t) => taskMatchesActiveFilters(t, ctx)), truncated };
  }

  // ── Status / pipeline switch ──────────────────────────────────────────────
  if (filter === 'unassigned') {
    const [propResult, backResult] = await Promise.all([
      drainQuery(query(col, where('archived', '==', false), where('pipelineStage', '==', 'proposal'), orderBy('createdAt', 'desc'))),
      drainQuery(query(col, where('archived', '==', false), where('pipelineStage', '==', 'backend'),  orderBy('createdAt', 'desc'))),
    ]);
    const truncated = propResult.truncated || backResult.truncated;
    const merged    = mergeDedup(propResult.docs, backResult.docs);
    return { tasks: merged.filter((t) => taskMatchesActiveFilters(t, ctx)), truncated };
  }

  const baseQMap: Record<string, Query<DocumentData>> = {
    pending:               query(col, where('archived','==',false), where('status','==','pending'),           orderBy('createdAt','desc')),
    in_progress:           query(col, where('archived','==',false), where('status','==','in_progress'),       orderBy('createdAt','desc')),
    completed:             query(col, where('archived','==',false), where('status','==','completed'),         orderBy('createdAt','desc')),
    blocked:               query(col, where('archived','==',false), where('status','==','blocked'),           orderBy('createdAt','desc')),
    pipeline_proposal:     query(col, where('archived','==',false), where('pipelineStage','==','proposal'),   orderBy('createdAt','desc')),
    pipeline_field_review: query(col, where('archived','==',false), where('pipelineStage','==','field_review'), orderBy('createdAt','desc')),
    pipeline_documents:    query(col, where('archived','==',false), where('pipelineStage','==','documents'),  orderBy('createdAt','desc')),
    pipeline_backend:      query(col, where('archived','==',false), where('pipelineStage','==','backend'),    orderBy('createdAt','desc')),
    converted:             query(col, where('archived','==',false), where('pipelineStage','==','completed'),  orderBy('createdAt','desc')),
    dropped:               query(col, where('archived','==',false), where('pipelineStage','==','dropped'),    orderBy('createdAt','desc')),
    unassigned_backend:    query(col, where('archived','==',false), where('pipelineStage','==','backend'),    orderBy('createdAt','desc')),
    follow_up:             query(col, where('archived','==',false), where('followUpDate','!=',null),          orderBy('followUpDate','asc')),
    my_tasks:              ctx.currentUserUid
                             ? query(col, where('archived','==',false), where('createdBy','==',ctx.currentUserUid), orderBy('createdAt','desc'))
                             : query(col, where('archived','==',false), orderBy('createdAt','desc')),
  };

  if (filter === 'overdue') {
    const now = new Date();
    const { docs, truncated } = await drainQuery(
      query(col, where('archived','==',false), where('status','in',['pending','in_progress','blocked']), where('dueDate','<',Timestamp.fromDate(now)), orderBy('dueDate','asc')),
    );
    return { tasks: docs.filter((t) => taskMatchesActiveFilters(t, ctx)), truncated };
  }

  const baseQ = baseQMap[filter] ?? query(col, where('archived','==',false), orderBy('priorityScore','asc'), orderBy('updatedAt','desc'));
  const { docs, truncated } = await drainQuery(baseQ);
  return { tasks: docs.filter((t) => taskMatchesActiveFilters(t, ctx)), truncated };
}

function daysInStage(task: Task): number | null {
  if (!task.pipelineStage || task.pipelineStage === 'survey') return null;
  if (task.pipelineStage === 'completed' || task.pipelineStage === 'dropped') return null;
  if (!task.stageHistory || task.stageHistory.length === 0) return null;
  const lastEntry = [...task.stageHistory]
    .reverse()
    .find((e) => e.toStage === task.pipelineStage);
  if (!lastEntry?.timestamp) return null;
  const enteredAt = lastEntry.timestamp instanceof Date
    ? lastEntry.timestamp
    : new Date((lastEntry.timestamp as unknown as { toDate?: () => Date })?.toDate?.() ?? lastEntry.timestamp);
  const diffMs = Date.now() - enteredAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { label, badge, border } = STATUS_META[task.status];
  const { currentUser } = useAuthStore();
  const isAdminCard = currentUser?.role === 'admin' || currentUser?.role === 'view_only';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm',
        'hover:shadow-md transition-all flex items-start gap-3 border-l-4',
        task.correctionReturnTo ? 'border-l-amber-500'
          : (!task.pipelineStage || task.pipelineStage === 'survey')
          ? border
          : task.pipelineStage === 'completed'   ? 'border-l-green-500'
          : task.pipelineStage === 'dropped'     ? 'border-l-red-400'
          : task.pipelineStage === 'backend'     ? 'border-l-orange-400'
          : task.pipelineStage === 'proposal'    ? 'border-l-purple-400'
          : task.pipelineStage === 'field_review'  ? 'border-l-blue-400'
          : task.pipelineStage === 'documents'    ? 'border-l-teal-400'
          : border,
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-mono text-xs text-gray-400">{task.taskNum}</span>
          {task.district && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
              {task.district}
            </span>
          )}
        </div>
        <p className="font-semibold text-base text-gray-900 line-clamp-2 leading-snug">
          {task.title}
        </p>
        <p className="text-xs text-gray-500 mt-1.5 truncate">
          {task.assignedToName || 'Unassigned'}
          {task.assignedToCode && (
            <span className="ml-1 font-mono text-gray-400">({task.assignedToCode})</span>
          )}
        </p>
        {task.pipelineStage === 'proposal' && task.proposalAssignedToName && (
          <p className="text-xs text-gray-400 mt-0.5">📄 {task.proposalAssignedToName}</p>
        )}
        {task.pipelineStage === 'backend' && task.backendAssignedToName && (
          <p className="text-xs text-gray-400 mt-0.5">⚙️ {task.backendAssignedToName}</p>
        )}
        {isAdminCard && task.createdAt && (
          <p className="text-xs text-gray-400 mt-0.5">
            📅 {task.createdAt.toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
              timeZone: 'Asia/Kolkata',
            })}
          </p>
        )}
        {!isAdminCard && task.createdAt && (() => {
          const days = Math.floor((Date.now() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          if (days < 1) return null;
          const color = days > 30 ? 'text-red-400' : days > 14 ? 'text-orange-400' : 'text-gray-400';
          return (
            <p className={`text-xs mt-0.5 ${color}`}>
              🕐 {days} day{days !== 1 ? 's' : ''} old
            </p>
          );
        })()}
        {isAdminCard && (() => {
          const days = daysInStage(task);
          if (days === null) return null;
          const color = days > 14 ? 'text-red-500' :
                        days > 7  ? 'text-orange-500' :
                        'text-gray-400';
          return (
            <p className={`text-xs mt-0.5 ${color}`}>
              ⏱ {days} day{days !== 1 ? 's' : ''} in{' '}
              {task.pipelineStage === 'proposal'     ? 'Proposal' :
               task.pipelineStage === 'field_review' ? 'Field Review' :
               task.pipelineStage === 'documents'    ? 'Documents' :
               task.pipelineStage === 'backend'      ? 'Backend' :
               task.pipelineStage}
            </p>
          );
        })()}
        {task.dueDate && (!task.pipelineStage || task.pipelineStage === 'survey') && task.status !== 'completed' && (
          <p className="text-xs text-gray-400 mt-0.5">Due {formatDate(task.dueDate)}</p>
        )}
        {task.followUpDate &&
         (!task.pipelineStage || task.pipelineStage === 'survey') && (
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
        {task.correctionReturnTo ? (
          <div className="mt-1 flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 w-fit bg-amber-100 text-amber-800 border border-amber-300">
            ↩ Sent back for correction — will return to {task.correctionReturnTo.replace('_', ' ')}
          </div>
        ) : task.pipelineStage && task.pipelineStage !== 'survey' && (() => {
          const pb = PIPELINE_BADGE[task.pipelineStage!];
          return pb ? (
            <div className={cn('mt-1 flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 w-fit', pb.cls)}>
              {pb.label}
            </div>
          ) : null;
        })()}
        {task.saleClosed === true && task.pipelineStage === 'dropped' && (
          <div className="mt-1 flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 w-fit bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300">
            ⚠ Dropped after being closed
          </div>
        )}
        {task.pipelineStage === 'proposal' && !task.proposalAssignedTo && (
          <span className="mt-1 inline-flex rounded-full bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 text-[10px] font-semibold w-fit">
            ⚠️ Unassigned
          </span>
        )}
        {task.pipelineStage === 'backend' && !task.backendAssignedTo && (
          <span className="mt-1 inline-flex rounded-full bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 text-[10px] font-semibold w-fit">
            ⚠️ Unassigned
          </span>
        )}
        {/* backend step progress badge */}
        {task.pipelineStage === 'backend' &&
         task.paymentType &&
         task.applicationJourneySteps?.length > 0 && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-200 w-fit">
            {(() => {
              const steps = task.applicationJourneySteps ?? [];
              const done  = steps.filter((s) => s.status === 'done').length;
              if (done === steps.length && steps.length > 0) return '⚙️ ✅ All Steps Done';
              return `⚙️ Step ${(task.currentStepIndex ?? 0) + 1}/${steps.length}`;
            })()}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0 pt-0.5">
        {(!task.pipelineStage || task.pipelineStage === 'survey') && !task.correctionReturnTo && (
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', badge)}>
            {label}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TasksPage() {
  const {
    tasks, hasMore, loadingMore, loadMore,
    isLoadingTasks,
  } = useTaskStore();

  const { currentUser } = useAuthStore();
  const { subscribeToFilter } = useTasks();
  const { tabCounts, refreshTabCounts } = useTabCounts();
  const { config } = useAppConfig();
  const pc = config.pipelineCounts;
  const { archivedTasks, loading: archivedLoading, loadArchivedTasks } = useArchivedTasks();
  const { showToast } = useToast();

  const isAdmin    = currentUser?.role === 'admin';
  const isViewOnly = currentUser?.role === 'view_only';
  const location   = useLocation();
  const pendingOpenTaskId = useRef<string | null>(null);

  const [filter,           setFilter]           = useState<Filter>('all');
  const [search,           setSearch]           = useState('');

  const isSearching = search.trim().length > 0;
  const [stateFilter,      setStateFilter]      = useState<string>('');
  const [engineerFilter,   setEngineerFilter]   = useState<string>('');
  const [districtFilter,   setDistrictFilter]   = useState<string>('');
  const [leadSourceFilter, setLeadSourceFilter] = useState<string>('');
  const [dateFilter,       setDateFilter]       = useState<string>('');
  const [dueDateFilter,    setDueDateFilter]    = useState<string>('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function tomorrowISO() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function yesterdayISO() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Admin: re-subscribe when filter, search, engineerFilter, districtFilter, dateFilter, or dueDateFilter changes.
  // Search is debounced 350ms so Firestore is not queried on every keystroke.
  useEffect(() => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'view_only') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.trim().length > 0) {
      debounceRef.current = setTimeout(() => {
        subscribeToFilter(
          filter as AdminFilter,
          search.trim(),
          engineerFilter  || undefined,
          districtFilter  || undefined,
          dateFilter      || undefined,
          dueDateFilter   || undefined,
        );
      }, 350);
    } else {
      subscribeToFilter(
        filter as AdminFilter,
        undefined,
        engineerFilter  || undefined,
        districtFilter  || undefined,
        dateFilter      || undefined,
        dueDateFilter   || undefined,
      );
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, currentUser?.uid, engineerFilter, districtFilter, dateFilter, dueDateFilter]);
  const [exporting,        setExporting]        = useState(false);

  const [showCreate,       setShowCreate]       = useState(false);
  const [showBulk,         setShowBulk]         = useState(false);
  const [detailTask,       setDetailTask]       = useState<Task | null>(null);

  useEffect(() => {
    if (!detailTask) return;
    const fresh = tasks.find((t) => t.id === detailTask.id);
    if (fresh && fresh !== detailTask) {
      setDetailTask(fresh);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, detailTask]);

  const [updateTask,       setUpdateTask]       = useState<Task | null>(null);
  const [adminUpdateTask,  setAdminUpdateTask]  = useState<Task | null>(null);
  const [fieldReviewTask,  setFieldReviewTask]  = useState<Task | null>(null);
  const [documentsTask,    setDocumentsTask]    = useState<Task | null>(null);

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
    if (!task) {
      // Tasks not loaded yet — save for retry once loading completes
      pendingOpenTaskId.current = state.openTaskId;
      window.history.replaceState({}, '');
      return;
    }
    // Task found immediately — open it
    pendingOpenTaskId.current = null;
    window.history.replaceState({}, '');
    if (task.archived || isAdmin || isViewOnly) { setDetailTask(task); }
    else                                        { setUpdateTask(task); }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isLoadingTasks) return;
    if (!pendingOpenTaskId.current) return;
    const task = tasks.find((t) => t.id === pendingOpenTaskId.current);
    if (!task) {
      // Task not found even after loading — may be archived or in a different filter
      showToast('Task not found. It may have been archived.', 'error');
      pendingOpenTaskId.current = null;
      return;
    }
    pendingOpenTaskId.current = null;
    if (task.archived || isAdmin || isViewOnly) { setDetailTask(task); }
    else                                        { setUpdateTask(task); }
  }, [isLoadingTasks, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (filter === 'archived') {
      loadArchivedTasks();
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0, follow_up: 0, overdue: 0,
    };
    if (isAdmin || isViewOnly) {
      // Use server-fetched counts (getCountFromServer) for accuracy — not capped by page size.
      c['all']              = tabCounts['all']              ?? 0;
      c['pending']          = tabCounts['pending']          ?? 0;
      c['in_progress']      = tabCounts['in_progress']      ?? 0;
      c['completed']        = tabCounts['completed']        ?? 0;
      c['blocked']          = tabCounts['blocked']          ?? 0;
      c['follow_up']        = tabCounts['follow_up']        ?? 0;
      c['overdue']          = tabCounts['overdue']          ?? 0;
      c['needs_correction'] = tabCounts['needs_correction'] ?? 0;
      c['sales_closed']     = tabCounts['sales_closed']     ?? 0;
    } else {
      tasks.forEach((t) => {
        c['all']++;
        const isTerminal  = t.pipelineStage === 'dropped' || t.pipelineStage === 'completed';
        const isStatusTab = t.status === 'blocked' || t.status === 'pending' || t.status === 'in_progress';
        if (isStatusTab && isTerminal) {
          // terminal-stage tasks excluded from status-tab counts
        } else {
          c[t.status]++;
        }
        if (isActiveFollowUp(t)) c['follow_up']++;
        if (isOverdue(t))   c['overdue']++;
      });
      c['needs_correction'] = tasks.filter((t) => !!t.correctionReturnTo && !t.archived).length;
    }
    // Pipeline counts come from appConfig denormalized counters — may include correction-return tasks (known cosmetic gap; list body already excludes them via taskMatchesActiveFilters).
    c['pipeline_proposal']     = pc?.proposal     ?? 0;
    c['pipeline_field_review'] = pc?.field_review  ?? 0;
    c['pipeline_documents']    = pc?.documents     ?? 0;
    c['pipeline_backend']      = pc?.backend       ?? 0;
    c['converted']             = pc?.completed     ?? 0;
    c['dropped']               = pc?.dropped       ?? 0;
    c['unassigned']            = (pc?.unassigned_proposal ?? 0) + (pc?.unassigned_backend ?? 0);
    // FE-specific counts from live tasks array
    c['fe_survey_done'] = tasks.filter((t) =>
      t.status === 'completed' &&
      t.assignedTo === currentUser?.uid && !t.archived
    ).length;
    c['fe_review']    = tasks.filter((t) => t.pipelineStage === 'field_review' && t.assignedTo === currentUser?.uid && !t.archived).length;
    c['fe_documents'] = tasks.filter((t) => t.pipelineStage === 'documents' && t.assignedTo === currentUser?.uid && !t.archived).length;
    c['fe_pipeline']  = tasks.filter((t) =>
      t.pipelineStage &&
      t.pipelineStage !== 'survey' &&
      t.pipelineStage !== 'field_review' &&
      t.pipelineStage !== 'documents' &&
      t.pipelineStage !== 'completed' &&
      t.pipelineStage !== 'dropped' &&
      t.assignedTo === currentUser?.uid && !t.archived
    ).length;
    c['fe_converted'] = tasks.filter((t) => t.pipelineStage === 'completed' && t.assignedTo === currentUser?.uid && !t.archived).length;
    c['fe_dropped']   = tasks.filter((t) => t.pipelineStage === 'dropped'   && t.assignedTo === currentUser?.uid && !t.archived).length;
    return c;
  }, [tasks, pc, isAdmin, isViewOnly, tabCounts]);

  const { engineers: allEngineers } = useFieldEngineers();
  const engineerOptions = useMemo(() =>
    allEngineers
      .map((e) => ({
        uid:  e.uid,
        name: e.displayName,
        code: e.engineerCode ?? '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [allEngineers],
  );

  const visible = useMemo(() => {
    if (filter === 'archived') return archivedTasks;
    const ctx: FilterCtx = { filter, stateFilter, engineerFilter, districtFilter, leadSourceFilter, search, isAdmin, isViewOnly, currentUserUid: currentUser?.uid };
    return tasks.filter((t) => taskMatchesActiveFilters(t, ctx));
  }, [tasks, archivedTasks, filter, stateFilter, engineerFilter, districtFilter, leadSourceFilter, search, isAdmin, isViewOnly, currentUser?.uid]);

  const sorted = useMemo(() => {
    if (isAdmin || isViewOnly) {
      // Only apply priority sort on 'all' filter and engineer filter
      // (specific pipeline filters already show one stage — no need to sort)
      const singleStageFilters = [
        'pipeline_proposal', 'pipeline_field_review', 'pipeline_documents', 'pipeline_backend',
        'converted', 'dropped', 'archived', 'pending', 'in_progress',
        'completed', 'blocked', 'follow_up', 'overdue',
      ];
      if (singleStageFilters.includes(filter)) return visible;

      // 'all', 'unassigned', 'my_tasks', engineer filter —
      // sort active pipeline tasks above passive ones
      return [...visible].sort((a, b) => {
        function adminScore(t: Task): number {
          const stage  = t.pipelineStage ?? 'survey';
          const status = t.status;
          if (stage === 'backend')                             return 0;
          if (stage === 'field_review')                        return 1;
          // 'documents' sits between field_review and backend in the pipeline —
          // use a fractional score so it slots in without renumbering any
          // other stage's existing priority value.
          if (stage === 'documents')                           return 1.5;
          if (stage === 'proposal')                            return 2;
          if (stage === 'survey' && status === 'in_progress')  return 3;
          if (stage === 'survey' && status === 'blocked')      return 4;
          if (stage === 'survey' && status === 'pending')      return 5;
          if (stage === 'survey' && status === 'completed')    return 6;
          if (stage === 'dropped')                             return 8;
          if (stage === 'completed')                           return 9;
          return 7;
        }
        const diff = adminScore(a) - adminScore(b);
        if (diff !== 0) return diff;
        return (b.updatedAt?.getTime() ?? 0) -
               (a.updatedAt?.getTime() ?? 0);
      });
    }

    // Field engineer sort
    return [...visible].sort((a, b) => {
      // Tier 0: correction-return tasks bubble to top
      function correctionScore(t: Task): number { return t.correctionReturnTo ? 0 : 1; }
      const correctionDiff = correctionScore(a) - correctionScore(b);
      if (correctionDiff !== 0) return correctionDiff;

      // Tier 1: follow-up urgency — floats to top
      function followUpScore(t: Task): number {
        if (isActiveFollowUp(t) && isToday(t.followUpDate!))    return 0;
        if (isActiveFollowUp(t) && isTomorrow(t.followUpDate!)) return 1;
        return 2;
      }
      const followUpDiff = followUpScore(a) - followUpScore(b);
      if (followUpDiff !== 0) return followUpDiff;

      // Tier 2: status priority — In Progress > Pending > Blocked > anything else
      function statusScore(t: Task): number {
        if (t.status === 'in_progress') return 0;
        if (t.status === 'pending')     return 1;
        if (t.status === 'blocked')     return 2;
        return 3;
      }
      const statusDiff = statusScore(a) - statusScore(b);
      if (statusDiff !== 0) return statusDiff;

      // Tier 3: within the same status, newest created first.
      // Overdue is intentionally NOT a sort factor here — it remains only
      // a visual badge on the card. This is a deliberate decision: forcing
      // overdue items to the top was burying newer, more relevant tasks
      // under an ever-growing backlog. The dedicated "Overdue" filter tab
      // is the reliable way to review all overdue tasks regardless of status.
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [visible, isAdmin, filter]);

  function handleCardClick(task: Task) {
    if (task.archived) {
      setDetailTask(task);
      return;
    }
    if (isAdmin || isViewOnly) {
      setDetailTask(task);
    } else if (task.pipelineStage === 'field_review' && currentUser?.role === 'field') {
      setFieldReviewTask(task);
    } else if (task.pipelineStage === 'documents' && currentUser?.role === 'field') {
      setDocumentsTask(task);
    } else {
      setUpdateTask(task);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex-1">
          {isAdmin || isViewOnly ? 'Tasks' : 'My Tasks'}
        </h1>

        {(isAdmin || isViewOnly) && tasks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const { tasks: allMatching, truncated } = await fetchAllTasksForExport({
                  filter, stateFilter, engineerFilter, districtFilter, leadSourceFilter, dateFilter, dueDateFilter,
                  search, isAdmin, isViewOnly, currentUserUid: currentUser?.uid,
                });
                if (truncated) {
                  showToast('Export may be incomplete — over 20,000 matching records found. Narrow your filters.', 'error');
                }
                if (allMatching.length === 0) {
                  showToast('No tasks match the current filters to export.', 'error');
                  return;
                }
                exportTasksToExcel(allMatching);
                showToast(`Exported ${allMatching.length} tasks.`, 'success');
              } catch (err) {
                console.error('[Export] failed:', err);
                showToast('Failed to export. Try again.', 'error');
              } finally {
                setExporting(false);
              }
            }}
            className="flex items-center gap-1.5 text-xs h-9"
          >
            {exporting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                Preparing export...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </>
            )}
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
          placeholder="Search by title or task number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue shadow-sm"
        />
      </div>
      {(isAdmin || isViewOnly) && isSearching && (
        <p className="text-xs text-gray-400 mb-2 px-1">
          {isLoadingTasks ? 'Searching…' : `${tasks.length} result${tasks.length !== 1 ? 's' : ''} found`}
        </p>
      )}

      {/* Filter tabs — Row 1: Status filters (all users) */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none mb-1">
        {FILTER_TABS.filter(({ adminOnly, fieldOnly, key }) => {
          if (adminOnly && !isAdmin && !isViewOnly) return false;
          if (fieldOnly && (isAdmin || isViewOnly)) return false;
          const statusTabs = ['all','needs_correction','sales_closed','my_tasks','pending','in_progress','completed','blocked','follow_up','overdue','archived','fe_review','fe_documents','fe_pipeline','fe_converted','fe_dropped','fe_survey_done'];
          return statusTabs.includes(key);
        }).map(({ key, label }) => {
          const count = counts[key as string] ?? 0;
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setFilter(key); setDateFilter(''); setDueDateFilter(''); }}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                isActive
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              )}
            >
              {label}
              {count > 0 && (
                <span className={cn(
                  'ml-1.5 rounded-full px-1.5 text-[10px] font-bold',
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter tabs — Row 2: Pipeline filters (admin only) */}
      {(isAdmin || isViewOnly) && (
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none mb-3">
          {FILTER_TABS.filter(({ key }) => {
            const pipelineTabs = ['pipeline_proposal','pipeline_field_review','pipeline_documents','pipeline_backend','unassigned','converted','dropped'];
            return pipelineTabs.includes(key);
          }).map(({ key, label }) => {
            const count = counts[key as string] ?? 0;
            const isActive = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setFilter(key); setDateFilter(''); setDueDateFilter(''); }}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                  isActive
                    ? 'bg-brand-blue text-white border-brand-blue'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                )}
              >
                {label}
                {count > 0 && (
                  <span className={cn(
                    'ml-1.5 rounded-full px-1.5 text-[10px] font-bold',
                    isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Engineer / District / Created Date / Due Date filters — mutually exclusive */}
      {(isAdmin || isViewOnly) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {Object.keys(config.districtsByState ?? {}).length > 0 && (
            <div className="flex items-center gap-1.5">
              <SearchableSelect
                value={stateFilter}
                onChange={(v) => {
                  setStateFilter(v);
                  if (v && districtFilter && !(config.districtsByState?.[v] ?? []).includes(districtFilter)) {
                    setDistrictFilter('');
                  }
                }}
                options={Object.keys(config.districtsByState ?? {}).map((s) => ({
                  value: s,
                  label: s,
                }))}
                placeholder="All States"
                className="min-w-[160px]"
              />
              {stateFilter && (
                <button
                  type="button"
                  onClick={() => setStateFilter('')}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          )}
          {engineerOptions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <SearchableSelect
                value={engineerFilter}
                onChange={(v) => { setEngineerFilter(v); if (v) { setDateFilter(''); setDueDateFilter(''); } }}
                options={engineerOptions.map((eng) => ({
                  value: eng.uid,
                  label: `${eng.name} (${eng.code})`,
                }))}
                placeholder="All Engineers"
                className="min-w-[200px]"
                disabled={!!(dateFilter || dueDateFilter)}
              />
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
          {(stateFilter ? (config.districtsByState?.[stateFilter] ?? []) : (config.districts ?? [])).length > 0 && (
            <div className="flex items-center gap-1.5">
              <SearchableSelect
                value={districtFilter}
                onChange={(v) => { setDistrictFilter(v); if (v) { setDateFilter(''); setDueDateFilter(''); } }}
                options={(stateFilter ? (config.districtsByState?.[stateFilter] ?? []) : (config.districts ?? [])).map((d) => ({
                  value: d,
                  label: d,
                }))}
                placeholder="All Districts"
                className="min-w-[160px]"
                disabled={!!(dateFilter || dueDateFilter)}
              />
              {districtFilter && (
                <button
                  type="button"
                  onClick={() => setDistrictFilter('')}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          )}
          {(config.leadSources ?? []).length > 0 && (
            <div className="flex items-center gap-1.5">
              <SearchableSelect
                value={leadSourceFilter}
                onChange={(v) => setLeadSourceFilter(v)}
                options={(config.leadSources ?? []).map((s) => ({
                  value: s,
                  label: s,
                }))}
                placeholder="All Lead Sources"
                className="min-w-[160px]"
              />
              {leadSourceFilter && (
                <button
                  type="button"
                  onClick={() => setLeadSourceFilter('')}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          )}
          {!!(dateFilter || dueDateFilter) && (engineerOptions.length > 0 || (config.districts ?? []).length > 0) && (
            <p className="text-xs text-gray-400 italic w-full">
              Clear date filter to use Engineer/District filters
            </p>
          )}
          {/* Created Date filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {!!(engineerFilter || districtFilter || dueDateFilter) && (
              <p className="text-xs text-gray-400 italic w-full">
                Clear other filters to use Created Date filter
              </p>
            )}
            <span className="text-xs text-gray-400 font-medium shrink-0">Created:</span>
            <button
              type="button"
              disabled={!!(engineerFilter || districtFilter || dueDateFilter)}
              onClick={() => {
                const next = dateFilter === todayISO() ? '' : todayISO();
                setDateFilter(next);
                if (next) { setEngineerFilter(''); setDistrictFilter(''); setDueDateFilter(''); setFilter('all'); }
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium border transition-all',
                dateFilter === todayISO()
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : (engineerFilter || districtFilter || dueDateFilter)
                  ? 'bg-white text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              )}
            >
              Today
            </button>
            <button
              type="button"
              disabled={!!(engineerFilter || districtFilter || dueDateFilter)}
              onClick={() => {
                const next = dateFilter === yesterdayISO() ? '' : yesterdayISO();
                setDateFilter(next);
                if (next) { setEngineerFilter(''); setDistrictFilter(''); setDueDateFilter(''); setFilter('all'); }
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium border transition-all',
                dateFilter === yesterdayISO()
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : (engineerFilter || districtFilter || dueDateFilter)
                  ? 'bg-white text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              )}
            >
              Yesterday
            </button>
            <input
              type="date"
              value={dateFilter}
              disabled={!!(engineerFilter || districtFilter || dueDateFilter)}
              onChange={(e) => {
                setDateFilter(e.target.value);
                if (e.target.value) { setEngineerFilter(''); setDistrictFilter(''); setDueDateFilter(''); setFilter('all'); }
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue',
                (engineerFilter || districtFilter || dueDateFilter)
                  ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'bg-white border-gray-200 text-gray-600',
              )}
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
          {/* Due Date filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {!!(engineerFilter || districtFilter || dateFilter) && (
              <p className="text-xs text-gray-400 italic w-full">
                Clear other filters to use Due Date filter
              </p>
            )}
            <span className="text-xs text-gray-400 font-medium shrink-0">Due:</span>
            <button
              type="button"
              disabled={!!(engineerFilter || districtFilter || dateFilter)}
              onClick={() => {
                const next = dueDateFilter === todayISO() ? '' : todayISO();
                setDueDateFilter(next);
                if (next) { setEngineerFilter(''); setDistrictFilter(''); setDateFilter(''); setFilter('all'); }
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium border transition-all',
                dueDateFilter === todayISO()
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : (engineerFilter || districtFilter || dateFilter)
                  ? 'bg-white text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              )}
            >
              Due Today
            </button>
            <button
              type="button"
              disabled={!!(engineerFilter || districtFilter || dateFilter)}
              onClick={() => {
                const next = dueDateFilter === tomorrowISO() ? '' : tomorrowISO();
                setDueDateFilter(next);
                if (next) { setEngineerFilter(''); setDistrictFilter(''); setDateFilter(''); setFilter('all'); }
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium border transition-all',
                dueDateFilter === tomorrowISO()
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : (engineerFilter || districtFilter || dateFilter)
                  ? 'bg-white text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              )}
            >
              Due Tomorrow
            </button>
            <input
              type="date"
              value={dueDateFilter}
              disabled={!!(engineerFilter || districtFilter || dateFilter)}
              onChange={(e) => {
                setDueDateFilter(e.target.value);
                if (e.target.value) { setEngineerFilter(''); setDistrictFilter(''); setDateFilter(''); setFilter('all'); }
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue',
                (engineerFilter || districtFilter || dateFilter)
                  ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'bg-white border-gray-200 text-gray-600',
              )}
            />
            {dueDateFilter && (
              <button
                type="button"
                onClick={() => setDueDateFilter('')}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
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
      ) : (isAdmin || isViewOnly) && isLoadingTasks ? (
        <div className="flex justify-center py-8">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
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
          {currentUser?.role === 'field' &&
           !['fe_review','fe_documents','fe_pipeline','fe_converted','fe_dropped','fe_survey_done'].includes(filter) ? (
            <>
              {(() => {
                const reviewTasks       = sorted.filter((t) => t.pipelineStage === 'field_review');
                const activeSurveyTasks = sorted.filter((t) =>
                  (!t.pipelineStage || t.pipelineStage === 'survey') && t.status !== 'completed'
                );
                const documentsTasks    = sorted.filter((t) => t.pipelineStage === 'documents');
                const inPipelineTasks   = sorted.filter((t) =>
                  t.pipelineStage &&
                  t.pipelineStage !== 'survey' &&
                  t.pipelineStage !== 'field_review' &&
                  t.pipelineStage !== 'documents' &&
                  t.pipelineStage !== 'completed' &&
                  t.pipelineStage !== 'dropped'
                );
                const completedTasks    = sorted.filter((t) =>
                  t.pipelineStage === 'completed'
                );
                const droppedTasks      = sorted.filter((t) => t.pipelineStage === 'dropped');
                return (
                  <>
                    {reviewTasks.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-blue-200" />
                          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide whitespace-nowrap px-2">
                            👁️ Awaiting Your Review ({reviewTasks.length})
                          </span>
                          <div className="flex-1 h-px bg-blue-200" />
                        </div>
                        {reviewTasks.map((task) => (
                          <TaskCard key={task.id} task={task} onClick={() => handleCardClick(task)} />
                        ))}
                      </div>
                    )}
                    {documentsTasks.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-teal-200" />
                          <span className="text-xs font-semibold text-teal-600 uppercase tracking-wide whitespace-nowrap px-2">
                            📎 Upload Documents ({documentsTasks.length})
                          </span>
                          <div className="flex-1 h-px bg-teal-200" />
                        </div>
                        {documentsTasks.map((task) => (
                          <TaskCard key={task.id} task={task} onClick={() => handleCardClick(task)} />
                        ))}
                      </div>
                    )}
                    {activeSurveyTasks.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap px-2">
                            📋 Active Survey Tasks ({activeSurveyTasks.length})
                          </span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                        {activeSurveyTasks.map((task) => (
                          <TaskCard key={task.id} task={task} onClick={() => handleCardClick(task)} />
                        ))}
                      </div>
                    )}
                    {inPipelineTasks.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-orange-200" />
                          <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide whitespace-nowrap px-2">
                            ⚙️ In Pipeline ({inPipelineTasks.length})
                          </span>
                          <div className="flex-1 h-px bg-orange-200" />
                        </div>
                        {inPipelineTasks.map((task) => (
                          <TaskCard key={task.id} task={task} onClick={() => handleCardClick(task)} />
                        ))}
                      </div>
                    )}
                    {completedTasks.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-green-200" />
                          <span className="text-xs font-semibold text-green-600 uppercase tracking-wide whitespace-nowrap px-2">
                            ✅ Completed &amp; Converted ({completedTasks.length})
                          </span>
                          <div className="flex-1 h-px bg-green-200" />
                        </div>
                        {completedTasks.map((task) => (
                          <TaskCard key={task.id} task={task} onClick={() => handleCardClick(task)} />
                        ))}
                      </div>
                    )}
                    {droppedTasks.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-red-200" />
                          <span className="text-xs font-semibold text-red-500 uppercase tracking-wide whitespace-nowrap px-2">
                            ❌ Dropped ({droppedTasks.length})
                          </span>
                          <div className="flex-1 h-px bg-red-200" />
                        </div>
                        {droppedTasks.map((task) => (
                          <TaskCard key={task.id} task={task} onClick={() => handleCardClick(task)} />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            sorted.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => handleCardClick(task)} />
            ))
          )}
          {hasMore && !isLoadingTasks && (
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-xs text-gray-400">
                Showing {tasks.length} tasks
              </p>
              <button
                type="button"
                onClick={() => loadMore?.()}
                disabled={loadingMore}
                className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-medium py-3 text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                    Loading...
                  </>
                ) : (
                  'Load More Tasks ↓'
                )}
              </button>
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
        onSaleClosedChange={refreshTabCounts}
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

      {/* Field review decision drawer */}
      <FieldReviewDrawer
        task={fieldReviewTask}
        onClose={() => setFieldReviewTask(null)}
        onAcceptedToDocuments={(task) => { setFieldReviewTask(null); setDocumentsTask(task); }}
      />

      {/* Documents upload drawer */}
      <DocumentsWorkDrawer
        task={documentsTask}
        onClose={() => setDocumentsTask(null)}
      />
    </div>
  );
}
