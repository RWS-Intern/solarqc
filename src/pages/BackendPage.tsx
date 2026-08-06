import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db }                  from '@/firebase/config';
import { useAuthStore }        from '@/store/authStore';
import { useTaskStore }        from '@/store/taskStore';
import { useBackendTasks, useLoadMoreBackendHistory } from '@/hooks/useBackendTasks';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { BackendWorkDrawer }   from '@/components/pipeline/BackendWorkDrawer';
import { getProposalDocuments } from '@/utils/proposalDocuments';
import { logError } from '@/utils/logError';
import { ProposalDocumentList } from '@/components/pipeline/ProposalDocumentList';
import { cn }   from '@/lib/utils';
import type { Task, StageHistoryEntry, FieldDefinition, FieldType, ProposalStageData } from '@/types';

// ─── Active task card ─────────────────────────────────────────────────────────

function BackendTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border bg-white shadow-sm px-4 py-3.5 hover:shadow-md transition-all flex flex-col gap-1',
        task.correctionReturnTo
          ? 'border-amber-400 hover:border-amber-500'
          : 'border-gray-200 hover:border-orange-300',
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-400">{task.taskNum}</span>
        {task.correctionReturnTo ? (
          <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-semibold px-2 py-0.5">
            ↩ Sent back for correction — will return to {task.correctionReturnTo.replace('_', ' ')}
          </span>
        ) : (
          <span className="rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold px-2 py-0.5">
            Backend
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
      {task.backendAssignedToName ? (
        <p className="text-xs text-gray-500">Assigned: {task.backendAssignedToName}</p>
      ) : (
        <p className="text-xs text-gray-400 italic">Unassigned</p>
      )}
      {task.paymentType && task.applicationJourneySteps?.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-gray-100">
            <div
              className="h-1 rounded-full bg-orange-400"
              style={{
                width: `${(task.applicationJourneySteps.filter(
                  (s) => s.status === 'done').length /
                  task.applicationJourneySteps.length) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs text-gray-400 shrink-0">
            {(() => {
                const steps = task.applicationJourneySteps ?? [];
                const done  = steps.filter((s) => s.status === 'done').length;
                if (done === steps.length && steps.length > 0) return '✅ All Complete';
                return `Step ${(task.currentStepIndex ?? 0) + 1}/${steps.length}`;
              })()}
          </span>
        </div>
      )}
      {(() => {
        const backendEntry = [...(task.stageHistory ?? [])].reverse().find(e => e.toStage === 'backend');
        if (!backendEntry?.timestamp) return null;
        const ts = backendEntry.timestamp;
        const enteredAt: Date = ts instanceof Date
          ? ts
          : (ts as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date(ts as unknown as string);
        const days = Math.floor((Date.now() - enteredAt.getTime()) / (1000 * 60 * 60 * 24));
        const color = days > 45 ? 'text-red-400' : days > 30 ? 'text-orange-400' : 'text-gray-400';
        return (
          <p className={`text-xs mt-1 ${color}`}>
            🕐 {days} day{days !== 1 ? 's' : ''} in Backend
          </p>
        );
      })()}
    </button>
  );
}

// ─── History card ─────────────────────────────────────────────────────────────

const BACKEND_HISTORY_STAGE_LABELS: Partial<Record<string, {
  label: string; icon: string; color: string;
}>> = {
  documents:    { label: 'Documents',    icon: '📎', color: 'text-teal-600   bg-teal-50   border-teal-200'   },
  logistics:    { label: 'Logistics',    icon: '🚚', color: 'text-teal-600   bg-teal-50   border-teal-200'   },
  installation: { label: 'Installation', icon: '🔧', color: 'text-green-600  bg-green-50  border-green-200'  },
  completed:    { label: 'Converted',    icon: '✅', color: 'text-green-700  bg-green-100 border-green-200'  },
  dropped:      { label: 'Dropped',      icon: '❌', color: 'text-red-600    bg-red-50    border-red-200'    },
};

function BackendHistoryCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const stage = BACKEND_HISTORY_STAGE_LABELS[task.pipelineStage ?? ''];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm hover:shadow-md transition-all flex items-start gap-3 border-l-4 border-l-orange-300"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs text-gray-400">{task.taskNum}</span>
          {stage && (
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              stage.color,
            )}>
              {stage.icon} {stage.label}
            </span>
          )}
        </div>
        <p className="font-semibold text-base text-gray-900 line-clamp-2">
          {task.title}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Survey by: {task.assignedToName}
          {task.assignedToCode && (
            <span className="ml-1 font-mono text-gray-400">({task.assignedToCode})</span>
          )}
        </p>
        {task.backendAssignedToName && (
          <p className="text-xs text-gray-400 mt-0.5">
            Backend: {task.backendAssignedToName}
          </p>
        )}
      </div>
      <span className="shrink-0 text-gray-300 mt-1">›</span>
    </button>
  );
}

// ─── History detail content ───────────────────────────────────────────────────

const STAGE_LABELS: Record<string, { label: string; cls: string }> = {
  survey:       { label: 'Survey',        cls: 'bg-gray-100   text-gray-600'   },
  proposal:     { label: 'Proposal',      cls: 'bg-purple-100 text-purple-700' },
  field_review: { label: 'Field Review',  cls: 'bg-blue-100   text-blue-700'   },
  documents:    { label: 'Documents',     cls: 'bg-teal-100   text-teal-700'   },
  backend:      { label: 'Backend',       cls: 'bg-orange-100 text-orange-700' },
  logistics:    { label: 'Logistics',     cls: 'bg-teal-100   text-teal-700'   },
  installation: { label: 'Installation',  cls: 'bg-green-100  text-green-700'  },
  completed:    { label: 'Converted',     cls: 'bg-green-100  text-green-700'  },
  dropped:      { label: 'Dropped',       cls: 'bg-red-100    text-red-600'    },
};

const STAGE_NAME_MAP: Record<string, string> = {
  survey: 'Survey', proposal: 'Proposal', field_review: 'Field Review',
  documents: 'Documents', backend: 'Backend', logistics: 'Logistics', installation: 'Installation',
  completed: 'Converted', dropped: 'Dropped',
};

function BackendHistoryDetailContent({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [backendStageData, setBackendStageData] = useState<{
    checklistAnswers:  Record<string, string>;
    checklistPhotos:   Record<string, string[]>;
    checklistSnapshot: FieldDefinition[];
    submittedByName:   string;
  } | null>(null);
  const [proposalDoc, setProposalDoc] = useState<ProposalStageData | null>(null);

  useEffect(() => {
    if (!task) {
      setBackendStageData(null);
      setProposalDoc(null);
      return;
    }

    getDoc(doc(db, 'tasks', task.id, 'stages', 'backend'))
      .then((snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setBackendStageData({
          checklistAnswers:  (d['checklistAnswers']  ?? {}) as Record<string, string>,
          checklistPhotos:   (d['checklistPhotos']   ?? {}) as Record<string, string[]>,
          checklistSnapshot: (d['checklistSnapshot'] ?? []) as FieldDefinition[],
          submittedByName:   (d['submittedByName']   as string) ?? '',
        });
      })
      .catch((err) => void logError('backendPage.fetchStageData', err, { taskId: task.id }));

    getDoc(doc(db, 'tasks', task.id, 'stages', 'proposal'))
      .then((snap) => {
        if (snap.exists()) {
          setProposalDoc(snap.data() as ProposalStageData);
        }
      })
      .catch((err) => void logError('backendPage.fetchStageData', err, { taskId: task.id }));
  }, [task?.id]);

  if (!task) return null;

  const stageMeta = STAGE_LABELS[task.pipelineStage ?? ''] ??
    { label: task.pipelineStage ?? '', cls: 'bg-gray-100 text-gray-600' };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-mono text-gray-400">{task.taskNum}</p>
          <h2 className="text-lg font-bold text-gray-900 mt-0.5 line-clamp-2">{task.title}</h2>
          <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold mt-2',
            stageMeta.cls,
          )}>
            {stageMeta.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 mt-1 text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 px-5 py-5 overflow-y-auto">

        {/* Survey reference */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Survey Reference
          </p>
          <p className="text-sm text-gray-700">
            <span className="text-gray-400">Field Engineer: </span>
            {task.assignedToName}
            {task.assignedToCode && (
              <span className="ml-1 font-mono text-xs text-gray-400">
                ({task.assignedToCode})
              </span>
            )}
          </p>
          {task.assignedToMobile && (
            <p className="text-sm text-gray-700 mt-1">
              <span className="text-gray-400">Mobile: </span>
              <a href={`tel:${task.assignedToMobile}`} className="text-blue-600 hover:underline">
                {task.assignedToMobile}
              </a>
            </p>
          )}
          <p className="text-sm text-gray-700 mt-1">
            <span className="text-gray-400">Survey completed: </span>
            {task.submittedAt
              ? task.submittedAt.toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  timeZone: 'Asia/Kolkata',
                })
              : '—'}
          </p>
          {task.location && (
            <p className="text-sm text-gray-700 mt-1">
              <span className="text-gray-400">Location: </span>
              <a
                href={`https://maps.google.com/?q=${task.location.lat},${task.location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {task.location.lat.toFixed(5)}, {task.location.lng.toFixed(5)}
              </a>
              {task.location.accuracy !== undefined && (
                <span className="text-gray-400 text-xs ml-1">(±{Math.round(task.location.accuracy)}m)</span>
              )}
            </p>
          )}
        </div>

        {/* Survey answers */}
        {(task.fields ?? []).length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Survey Answers
            </p>
            <div className="flex flex-col gap-2">
              {(task.fields ?? [])
                .filter((f) => f.type !== 'section_header' && f.type !== 'photo_only')
                .sort((a: FieldDefinition, b: FieldDefinition) => a.sortOrder - b.sortOrder)
                .map((field: FieldDefinition) => {
                  const answer = task.fieldAnswers?.[field.fieldId];
                  if (!answer?.value) return null;
                  return (
                    <div key={field.fieldId} className="flex flex-col gap-0.5">
                      <p className="text-xs text-gray-400">{field.label}</p>
                      <p className="text-sm font-medium text-gray-800">
                        {(field.type as FieldType) === 'yesno'
                          ? answer.value === 'yes' ? '✅ Yes' : '❌ No'
                          : answer.value}
                      </p>
                    </div>
                  );
                })}
            </div>
            {Object.values(task.fieldPhotos ?? {}).flat().length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-2">Survey Photos</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(task.fieldPhotos ?? {}).flat().map((url: string, i: number) =>
                    url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/raw/upload/') ? (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" download
                        className="flex flex-col items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 p-2 min-h-[72px]">
                        <span className="text-2xl">📄</span>
                        <span className="text-[9px] text-red-700 font-medium text-center line-clamp-2">
                          Document {i + 1}
                        </span>
                      </a>
                    ) : (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Survey photo ${i + 1}`}
                          className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                        />
                      </a>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Proposal document */}
        {getProposalDocuments(proposalDoc).length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
              Proposal Document
            </p>
            <ProposalDocumentList documents={getProposalDocuments(proposalDoc)} />
          </div>
        )}

        {/* FIX 3: New system — Application Journey Steps */}
        {task.applicationJourneySteps && task.applicationJourneySteps.length > 0 && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">
              Application Journey
            </p>
            <div className="flex items-center justify-between mb-2">
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold',
                task.paymentType === 'cash'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700',
              )}>
                {task.paymentType === 'cash' ? '💵 Cash' : '🏦 Loan'} ·{' '}
                {task.applicationJourneySteps.filter((s) => s.status === 'done').length}/
                {task.applicationJourneySteps.length} steps done
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {task.applicationJourneySteps.map((step, idx) => (
                <div key={step.stepId}
                  className={cn(
                    'flex items-start gap-2 rounded-lg px-3 py-2 border',
                    step.status === 'done'
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-white opacity-60',
                  )}
                >
                  <span className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5',
                    step.status === 'done'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-400',
                  )}>
                    {step.status === 'done' ? '✓' : idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800">{step.label}</p>
                    {step.status === 'done' && step.realDate && (
                      <p className="text-[10px] text-green-600 mt-0.5">
                        {new Date(step.realDate).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                        {step.recordedBy && ` · ${step.recordedBy}`}
                      </p>
                    )}
                    {step.type === 'photo' && step.photoUrls?.length > 0 && (
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {step.photoUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank"
                             rel="noopener noreferrer" download>
                            <img src={url} alt={`Photo ${i+1}`}
                              className="w-full aspect-square object-cover rounded border border-green-200" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Converted banner */}
        {task.pipelineStage === 'completed' && (
          <div className="rounded-xl border-2 border-green-500 bg-green-50 px-4 py-4 text-center">
            <p className="text-xl font-bold text-green-700">✅ Lead Converted!</p>
            <p className="text-sm text-green-600 mt-1">
              This lead has been successfully converted.
            </p>
          </div>
        )}

        {/* FIX 3: Old system — stages/backend checklist (fallback for old tasks) */}
        {(!task.applicationJourneySteps || task.applicationJourneySteps.length === 0) && backendStageData && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">
              Backend Checklist Answers
            </p>
            {backendStageData.submittedByName && (
              <p className="text-xs text-orange-600 mb-2">
                Completed by: {backendStageData.submittedByName}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {backendStageData.checklistSnapshot
                .filter((f: FieldDefinition) => f.type !== 'section_header')
                .sort((a: FieldDefinition, b: FieldDefinition) => a.sortOrder - b.sortOrder)
                .map((field: FieldDefinition) => {
                  if (field.type === 'photo_only') {
                    const photos = backendStageData.checklistPhotos[field.fieldId] ?? [];
                    if (photos.length === 0) return null;
                    return (
                      <div key={field.fieldId}>
                        <p className="text-xs text-gray-400 mb-1">{field.label}</p>
                        <div className="grid grid-cols-3 gap-1">
                          {photos.map((url: string, i: number) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt={`Photo ${i + 1}`}
                                className="w-full aspect-square object-cover rounded-lg border border-orange-200" />
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const answer = backendStageData.checklistAnswers[field.fieldId];
                  if (!answer) return null;
                  return (
                    <div key={field.fieldId} className="flex flex-col gap-0.5">
                      <p className="text-xs text-gray-400">{field.label}</p>
                      <p className="text-sm font-medium text-gray-800">
                        {(field.type as FieldType) === 'yesno'
                          ? answer === 'yes' ? '✅ Yes' : '❌ No'
                          : answer}
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Pipeline history */}
        {task.stageHistory && task.stageHistory.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Pipeline History
            </p>
            {[...(task.stageHistory as StageHistoryEntry[])].reverse().map((entry, i) => {
              const ts = entry.timestamp instanceof Date
                ? entry.timestamp
                : new Date(
                    (entry.timestamp as unknown as { toDate?: () => Date })
                      ?.toDate?.() ?? entry.timestamp,
                  );
              return (
                <div key={i} className="flex flex-col gap-0.5 pl-2 border-l-2 border-gray-100">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400 tabular-nums">
                      {ts.toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'Asia/Kolkata',
                      })}
                    </span>
                    <span className="text-gray-400">·</span>
                    <span className="font-medium text-gray-700">{entry.actorName}</span>
                    <span className="text-gray-400 text-[10px]">({entry.actorRole})</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {entry.fromStage
                      ? `${STAGE_NAME_MAP[entry.fromStage] ?? entry.fromStage} → `
                      : ''}
                    {STAGE_NAME_MAP[entry.toStage] ?? entry.toStage}
                    {entry.note && (
                      <span className="italic text-gray-400 ml-1">· {entry.note}</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Dropped reason */}
        {task.pipelineStage === 'dropped' && task.droppedReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">
              Drop Reason
            </p>
            <p className="text-sm text-red-700">{task.droppedReason}</p>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Filter type ──────────────────────────────────────────────────────────────

type BackendHistoryFilter = 'all' | 'completed' | 'dropped';

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BackendPage() {
  const { currentUser } = useAuthStore();
  const {
    backendTasks, backendTasksLoading,
    backendHistoryTasks, backendHistoryLoading,
  } = useTaskStore();

  const {
    loadMore:      loadMoreActive,
    hasMore:       activeHasMore,
    loadingMore:   activeLoadingMore,
    search:        firestoreSearch,
    searchResults,
    isSearching,
    clearSearch,
  } = useBackendTasks();
  const { loadMore: loadMoreHistory, hasMore: historyHasMore } = useLoadMoreBackendHistory();

  const [activeTab,     setActiveTab]     = useState<'active' | 'history'>('active');
  const [search,        setSearch]        = useState('');
  const [activeTaskId,  setActiveTaskId]  = useState<string | null>(null);
  const activeTask = activeTaskId
    ? (backendTasks.find((t) => t.id === activeTaskId) ?? null)
    : null;
  const [historyFilter,  setHistoryFilter]  = useState<BackendHistoryFilter>('all');
  const [historySearch,  setHistorySearch]  = useState('');
  const [historyTaskId,  setHistoryTaskId]  = useState<string | null>(null);
  const [correctionOnly, setCorrectionOnly] = useState(false);

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

  const correctionCount = useMemo(
    () => backendTasks.filter((t) => !!t.correctionReturnTo).length,
    [backendTasks],
  );
  const historyTask = historyTaskId
    ? (backendHistoryTasks.find((t) => t.id === historyTaskId) ?? null)
    : null;

  const historyFilterCounts = useMemo(() => ({
    all:       backendHistoryTasks.length,
    completed: backendHistoryTasks.filter((t) => t.pipelineStage === 'completed').length,
    dropped:   backendHistoryTasks.filter((t) => t.pipelineStage === 'dropped').length,
  }), [backendHistoryTasks]);

  // When a Firestore search is active show its results; otherwise show the
  // live-paginated list. The correctionOnly and journey filters apply to both.
  const displayActive = isSearching ? searchResults : backendTasks;

  const inProgressTasks = useMemo(() =>
    displayActive.filter((t) =>
      !t.journeyCompleted && (!correctionOnly || !!t.correctionReturnTo)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayActive, correctionOnly],
  );

  const readyToConvertTasks = useMemo(() =>
    displayActive.filter((t) =>
      t.journeyCompleted === true && (!correctionOnly || !!t.correctionReturnTo)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayActive, correctionOnly],
  );

  const filteredHistory = useMemo(() => {
    let list = backendHistoryTasks;
    if (historyFilter === 'completed') {
      list = list.filter((t) => t.pipelineStage === 'completed');
    } else if (historyFilter === 'dropped') {
      list = list.filter((t) => t.pipelineStage === 'dropped');
    }
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.taskNum.toLowerCase().includes(q) ||
        (t.consumerMobile ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [backendHistoryTasks, historyFilter, historySearch]);

  if (currentUser?.role === 'admin') {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Backend Stage</h1>
        <p className="text-sm text-gray-500">
          Admin view — use the Tasks page to manage all pipeline stages.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      {/* Dashboard header */}
      <div className="mb-2">
        <h1 className="text-xl font-bold text-gray-900 mb-0.5">
          {currentUser
            ? `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${currentUser.name.split(' ')[0]}`
            : 'Welcome'}
        </h1>
        <p className="text-xs text-gray-400 mb-4">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </p>
        {(() => {
          const inProgress     = backendTasks.filter((t) => !t.journeyCompleted).length;
          const readyConvert   = backendTasks.filter((t) => t.journeyCompleted).length;
          const thisMonth      = backendHistoryTasks.filter((t) => {
            if (t.pipelineStage !== 'completed' || !t.updatedAt) return false;
            const now = new Date();
            return t.updatedAt.getMonth() === now.getMonth() &&
                   t.updatedAt.getFullYear() === now.getFullYear();
          }).length;
          const totalConverted = backendHistoryTasks.filter(
            (t) => t.pipelineStage === 'completed'
          ).length;
          return (
            <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
              <div className="rounded-xl bg-white border border-orange-100 shadow-sm px-3 py-3 text-center">
                <p className="text-2xl font-extrabold text-orange-500">{inProgress}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">In Progress</p>
              </div>
              <div className="rounded-xl bg-white border border-green-100 shadow-sm px-3 py-3 text-center">
                <p className="text-2xl font-extrabold text-green-600">{readyConvert}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">Ready</p>
              </div>
              <div className="rounded-xl bg-white border border-blue-100 shadow-sm px-3 py-3 text-center">
                <p className="text-2xl font-extrabold text-blue-600">{thisMonth}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">This Month</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
                <p className="text-2xl font-extrabold text-gray-700">{totalConverted}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">Total</p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backend Tasks</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage backend checklists and track submission history
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
            activeTab === 'active'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          Active
          {backendTasks.length > 0 && (
            <span className="ml-1 rounded-full bg-orange-100 text-orange-700 px-1.5 text-xs">
              {backendTasks.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
            activeTab === 'history'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          History
          {backendHistoryTasks.length > 0 && (
            <span className="ml-1 rounded-full bg-gray-200 text-gray-600 px-1.5 text-xs">
              {backendHistoryTasks.length}
            </span>
          )}
        </button>
      </div>

      {/* ACTIVE TAB */}
      {activeTab === 'active' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title or task number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          {correctionCount > 0 && (
            <button
              type="button"
              onClick={() => setCorrectionOnly((v) => !v)}
              className={cn(
                'self-start rounded-full px-3 py-1 text-xs font-semibold border transition-colors',
                correctionOnly
                  ? 'bg-amber-400 text-white border-amber-400'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100',
              )}
            >
              ↩ Needs Correction ({correctionCount})
            </button>
          )}

          {backendTasksLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-400 border-t-transparent" />
            </div>
          ) : inProgressTasks.length === 0 && readyToConvertTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">⚙️</span>
              <p className="text-gray-500 font-medium">No backend tasks</p>
              <p className="text-gray-400 text-sm mt-1">
                {search ? 'No tasks match your search.' : 'All caught up!'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Ready to Convert section */}
              {readyToConvertTasks.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-green-200" />
                    <span className="text-xs font-semibold text-green-600 uppercase tracking-wide whitespace-nowrap">
                      🎉 Ready to Convert ({readyToConvertTasks.length})
                    </span>
                    <div className="flex-1 h-px bg-green-200" />
                  </div>
                  {readyToConvertTasks.map((task) => (
                    <BackendTaskCard
                      key={task.id}
                      task={task}
                      onClick={() => setActiveTaskId(task.id)}
                    />
                  ))}
                </div>
              )}

              {/* In progress section */}
              {inProgressTasks.length > 0 && (
                <div className="flex flex-col gap-3">
                  {readyToConvertTasks.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                        In Progress ({inProgressTasks.length})
                      </span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}
                  {inProgressTasks.map((task) => (
                    <BackendTaskCard
                      key={task.id}
                      task={task}
                      onClick={() => setActiveTaskId(task.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {!backendTasksLoading && (inProgressTasks.length + readyToConvertTasks.length) > 0 && (
            <p className="text-xs text-gray-400 text-center">
              {inProgressTasks.length + readyToConvertTasks.length} task{(inProgressTasks.length + readyToConvertTasks.length) !== 1 ? 's' : ''}
            </p>
          )}
          {!backendTasksLoading && !isSearching && activeHasMore && (
            <button
              type="button"
              onClick={loadMoreActive}
              disabled={activeLoadingMore}
              className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-medium py-3 text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {activeLoadingMore ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                  Loading...
                </>
              ) : (
                'Load More ↓'
              )}
            </button>
          )}
        </>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search history..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'all',       label: 'All'       },
              { key: 'completed', label: 'Converted' },
              { key: 'dropped',   label: 'Dropped'   },
            ] as { key: BackendHistoryFilter; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setHistoryFilter(key)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium border transition-all',
                  historyFilter === key
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                )}
              >
                {label} ({historyFilterCounts[key] ?? 0})
              </button>
            ))}
          </div>

          {backendHistoryLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-transparent" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">📋</span>
              <p className="text-gray-500 font-medium">No history yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Completed backend tasks will appear here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredHistory.map((task) => (
                <BackendHistoryCard
                  key={task.id}
                  task={task}
                  onClick={() => setHistoryTaskId(task.id)}
                />
              ))}
            </div>
          )}

          {!backendHistoryLoading && filteredHistory.length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              {filteredHistory.length} task{filteredHistory.length !== 1 ? 's' : ''}
            </p>
          )}
          {historyHasMore && historyFilter === 'all' && (
            <button
              type="button"
              onClick={loadMoreHistory}
              disabled={backendHistoryLoading}
              className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-medium py-3 text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {backendHistoryLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                  Loading...
                </>
              ) : (
                'Load More History ↓'
              )}
            </button>
          )}
        </>
      )}

      {/* Active task drawer — manages its own Sheet */}
      <BackendWorkDrawer
        task={activeTask}
        onClose={() => setActiveTaskId(null)}
      />

      {/* History detail drawer */}
      <Sheet
        open={!!historyTask}
        onOpenChange={(open) => { if (!open) setHistoryTaskId(null); }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto p-0"
        >
          <BackendHistoryDetailContent
            task={historyTask}
            onClose={() => setHistoryTaskId(null)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
