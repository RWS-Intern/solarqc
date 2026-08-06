import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useEngineerTaskStats } from '@/hooks/useEngineerTaskStats';
import { getProposalDoneCount } from '@/utils/engineerStats';
import { TaskDetailDrawer }    from '@/components/tasks/TaskDetailDrawer';
import { cn }                  from '@/lib/utils';
import type { User, Task, TaskStatus, PipelineStage } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  pending:     { label: 'Pending',     className: 'bg-gray-100 text-gray-600'   },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700' },
  completed:   { label: 'Completed',   className: 'bg-green-100 text-green-700' },
  blocked:     { label: 'Blocked',     className: 'bg-red-100 text-red-600'     },
};

const STAGE_META: Record<string, { label: string; className: string }> = {
  survey:       { label: 'Survey',       className: 'bg-blue-100 text-blue-700'     },
  proposal:     { label: 'Proposal',     className: 'bg-violet-100 text-violet-700' },
  field_review: { label: 'Field Review', className: 'bg-blue-100 text-blue-700'     },
  documents:    { label: 'Documents',    className: 'bg-teal-100 text-teal-700'     },
  backend:      { label: 'Backend',      className: 'bg-orange-100 text-orange-700' },
  completed:    { label: 'Converted',    className: 'bg-green-100 text-green-700'   },
  dropped:      { label: 'Dropped',      className: 'bg-red-100 text-red-600'       },
};

const ROLE_LABEL: Record<string, string> = {
  field:    'Field Engineer',
  proposal: 'Proposal Engineer',
  backend:  'Backend Engineer',
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, className } = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', className)}>
      {label}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] ?? { label: stage, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', meta.className)}>
      {meta.label}
    </span>
  );
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center py-3 px-2">
      <span className="text-2xl font-extrabold text-gray-900 tabular-nums">{value}</span>
      <span className="text-xs text-gray-500 mt-0.5 text-center">{label}</span>
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, role, onClick, disabled }: { task: Task; role: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs text-gray-400 shrink-0">{task.taskNum}</span>
        </div>
        <p className="text-sm font-medium text-gray-900 line-clamp-1">{task.title}</p>
        {task.dueDate && (
          <p className="text-xs text-gray-400 mt-0.5">Due {formatDate(task.dueDate)}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {(role === 'proposal' || role === 'backend')
          ? <StageBadge stage={task.pipelineStage ?? ''} />
          : <StatusBadge status={task.status} />
        }
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface EngineerDetailDrawerProps {
  engineer: User | null;
  onClose:  () => void;
}

export function EngineerDetailDrawer({ engineer, onClose }: EngineerDetailDrawerProps) {
  const { tasks: engineerTasks, loading: statsLoading } =
    useEngineerTaskStats(engineer?.id ?? '', engineer?.role ?? '');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskLoading,  setTaskLoading]  = useState(false);

  if (!engineer) return null;

  const sortedTasks = [...engineerTasks].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );

  const assignedCount = engineerTasks.length;
  const completedCount =
    engineer.role === 'backend'
      ? engineerTasks.filter((t) => t.pipelineStage === 'completed').length
      : engineer.role === 'proposal'
      ? getProposalDoneCount(engineerTasks)
      : engineerTasks.filter((t) => t.status === 'completed').length;

  const completionPct = assignedCount > 0
    ? Math.round((completedCount / assignedCount) * 100)
    : 0;

  const completedLabel =
    engineer.role === 'backend'  ? 'Converted'
    : engineer.role === 'proposal' ? 'Done'
    : 'Completed';

  const initial = engineer.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <>
      <Sheet open={!!engineer} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">

          {/* ── Header ── */}
          <div className="bg-gradient-to-r from-brand-navy to-brand-blue px-5 py-5 shrink-0 relative pr-14">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 rounded-full p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold text-lg leading-tight truncate">
                    {engineer.name}
                  </span>
                  {engineer.engineerCode && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono font-medium bg-white/20 text-white">
                      {engineer.engineerCode}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/70 mt-0.5">
                  {ROLE_LABEL[engineer.role] ?? engineer.role}
                </p>
                {engineer.mobileNumber && (
                  <a
                    href={`tel:${engineer.mobileNumber}`}
                    className="text-xs text-white/60 hover:text-white/90 mt-0.5 block"
                  >
                    {engineer.mobileNumber}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div className="flex border-b border-gray-100 bg-white shrink-0 divide-x divide-gray-100">
            {statsLoading ? (
              <div className="flex-1 flex items-center justify-center py-4 text-xs text-gray-400">Loading…</div>
            ) : (
              <>
                <StatBox value={assignedCount}       label="Assigned"       />
                <StatBox value={completedCount}      label={completedLabel} />
                <StatBox value={`${completionPct}%`} label="Completion"     />
              </>
            )}
          </div>

          {/* ── Task list ── */}
          <div className="px-4 py-3 border-b border-gray-100 shrink-0 flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">Assigned Tasks</p>
            {assignedCount > 0 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
                {assignedCount}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {sortedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
                {statsLoading ? 'Loading…' : 'No tasks assigned yet.'}
              </div>
            ) : (
              sortedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  role={engineer.role}
                  disabled={taskLoading}
                  onClick={async () => {
                    setTaskLoading(true);
                    try {
                      const snap = await getDoc(doc(db, 'tasks', task.id));
                      if (snap.exists()) {
                        const data = snap.data();
                        setSelectedTask({
                          id:               snap.id,
                          taskNum:          (data['taskNum']          as string)  ?? '',
                          title:            (data['title']            as string)  ?? '',
                          description:      (data['description']      as string)  ?? undefined,
                          district:                (data['district']                as string | undefined) ?? undefined,
                          state:                   (data['state']                   as string | undefined) ?? undefined,
                          leadSource:              (data['leadSource']              as string | undefined) ?? undefined,
                          leadSourceEmployeeName:  (data['leadSourceEmployeeName']  as string | undefined) ?? undefined,
                          leadGeneratedByUid:      (data['leadGeneratedByUid']      as string | null)      ?? null,
                          leadGeneratedByName:     (data['leadGeneratedByName']     as string | undefined) ?? undefined,
                          leadGeneratedByNote:     (data['leadGeneratedByNote']     as string | undefined) ?? undefined,
                          assignedTo:       (data['assignedTo']       as string | null) ?? null,
                          assignedToName:   (data['assignedToName']   as string)  ?? '',
                          assignedToCode:   (data['assignedToCode']   as string)  ?? '',
                          assignedToMobile: (data['assignedToMobile'] as string | undefined) ?? undefined,
                          consumerMobile:   (data['consumerMobile']  as string | undefined) ?? undefined,
                          status:           (data['status']           as Task['status']) ?? 'pending',
                          dueDate:          (data['dueDate'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
                          followUpDate:     (data['followUpDate'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
                          fields:           (data['fields']           as Task['fields'])  ?? [],
                          fieldAnswers:     (data['fieldAnswers']      as Task['fieldAnswers'])  ?? {},
                          fieldPhotos:      (data['fieldPhotos']       as Task['fieldPhotos'])   ?? {},
                          completionPhotos: (data['completionPhotos']  as string[]) ?? [],
                          blockedReason:    (data['blockedReason']     as string | null)  ?? null,
                          location:         (data['location']          as Task['location'])      ?? null,
                          submittedBy:      (data['submittedBy']       as string | null)  ?? null,
                          submittedAt:      (data['submittedAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
                          createdBy:        (data['createdBy']         as string)  ?? '',
                          createdAt:        (data['createdAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? new Date(),
                          updatedAt:        (data['updatedAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? new Date(),
                          archived:         (data['archived']          as boolean) ?? false,
                          archivedAt:       (data['archivedAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
                          pipelineStage:    (data['pipelineStage']     as Task['pipelineStage']) ?? 'survey',
                          stageHistory:     ((data['stageHistory'] as Task['stageHistory']) ?? []).map((e) => ({
                                              ...e,
                                              timestamp: (e.timestamp as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date(),
                                            })),
                          proposalAssignedTo:      (data['proposalAssignedTo']      as string | null) ?? null,
                          proposalAssignedToName:  (data['proposalAssignedToName']  as string) ?? '',
                          backendAssignedTo:       (data['backendAssignedTo']       as string | null) ?? null,
                          backendAssignedToName:   (data['backendAssignedToName']   as string) ?? '',
                          logisticsAssignedTo:     (data['logisticsAssignedTo']     as string | null) ?? null,
                          logisticsAssignedToName: (data['logisticsAssignedToName'] as string) ?? '',
                          installationAssignedTo:      (data['installationAssignedTo']      as string | null) ?? null,
                          installationAssignedToName:  (data['installationAssignedToName']  as string) ?? '',
                          proposalRevisionCount:   (data['proposalRevisionCount']   as number) ?? 0,
                          droppedReason:           (data['droppedReason']           as string | null) ?? null,
                          correctionReturnTo:             (data['correctionReturnTo']             as PipelineStage | null | undefined) ?? null,
                          saleClosed:                     (data['saleClosed']       as boolean | undefined) ?? false,
                          saleClosedSource:               (data['saleClosedSource'] as 'auto' | 'manual' | null | undefined) ?? null,
                          correctionReturnAssignedTo:     (data['correctionReturnAssignedTo']     as string | null | undefined)        ?? null,
                          correctionReturnAssignedToName: (data['correctionReturnAssignedToName'] as string | undefined)               ?? '',
                          correctionNote:                 (data['correctionNote']                 as string | undefined)               ?? undefined,
                          correctionSetAt:                (data['correctionSetAt'] as { toDate?: () => Date } | null)?.toDate?.()      ?? null,
                          backendRemark:           (data['backendRemark']           as string | undefined) ?? undefined,
                          backendRemarkUpdatedBy:  (data['backendRemarkUpdatedBy']  as string | undefined) ?? undefined,
                          backendRemarkUpdatedAt:  (data['backendRemarkUpdatedAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
                          proposalRemark:          (data['proposalRemark']          as string | undefined) ?? undefined,
                          proposalRemarkUpdatedBy: (data['proposalRemarkUpdatedBy'] as string | undefined) ?? undefined,
                          proposalRemarkUpdatedAt: (data['proposalRemarkUpdatedAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
                          documentAnswers:         (data['documentAnswers']         as Task['documentAnswers']) ?? {},
                          documentPhotos:          (data['documentPhotos']          as Task['documentPhotos'])  ?? {},
                          documentsCompleted:      (data['documentsCompleted']      as boolean) ?? false,
                          paymentType:             (data['paymentType']             as Task['paymentType']) ?? null,
                          applicationJourneySteps: ((data['applicationJourneySteps'] as Task['applicationJourneySteps']) ?? []).map((s) => ({
                                                     ...s,
                                                     recordedAt: (s.recordedAt as unknown as { toDate?: () => Date })?.toDate?.() ?? null,
                                                     inputValue: (s as unknown as { inputValue?: string }).inputValue,
                                                   })),
                          currentStepIndex: (data['currentStepIndex']  as number)  ?? 0,
                          journeyCompleted: (data['journeyCompleted']   as boolean) ?? false,
                          titleLower:       (data['titleLower']         as string)  ?? '',
                          priorityScore:    (data['priorityScore']       as number | undefined) ?? 6,
                          titleWords:       (data['titleWords']          as string[] | undefined) ?? [],
                        } as Task);
                      }
                    } catch (err) {
                      console.error('[EngineerDetailDrawer] fetch task failed:', err);
                    } finally {
                      setTaskLoading(false);
                    }
                  }}
                />
              ))
            )}
            {taskLoading && (
              <div className="flex items-center justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
              </div>
            )}
          </div>

        </SheetContent>
      </Sheet>

      {/* Task detail — opens on top of the engineer drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onAdminUpdate={undefined}
      />
    </>
  );
}
