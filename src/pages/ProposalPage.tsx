import { useState, useEffect, useMemo } from 'react';
import { Search }    from 'lucide-react';
import { Navigate }  from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useTaskStore }       from '@/store/taskStore';
import { useProposalTasks, useLoadMoreProposalHistory } from '@/hooks/useProposalTasks';
import { useAuthStore }       from '@/store/authStore';
import { ProposalWorkDrawer } from '@/components/pipeline/ProposalWorkDrawer';
import { getProposalDocuments } from '@/utils/proposalDocuments';
import { ProposalDocumentList } from '@/components/pipeline/ProposalDocumentList';
import { getProposalNoteRecipientLabel } from '@/utils/proposalNoteLabel';
import { logError } from '@/utils/logError';
import type { Task, PipelineStage, StageHistoryEntry, ProposalStageData } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { db }          from '@/firebase/config';

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function formatDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProposalTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm hover:shadow-md transition-all flex items-start gap-3 border-l-4',
        task.correctionReturnTo ? 'border-l-amber-500' : 'border-l-purple-400',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-mono text-xs text-gray-400">{task.taskNum}</span>
          {task.correctionReturnTo ? (
            <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold">
              ↩ Sent back for correction — will return to {task.correctionReturnTo.replace('_', ' ')}
            </span>
          ) : (task.proposalRevisionCount ?? 0) > 0 && (
            <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-semibold">
              Revision {task.proposalRevisionCount}
            </span>
          )}
        </div>
        <p className="font-semibold text-base text-gray-900 line-clamp-2 leading-snug">
          {task.title}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Survey by: {task.assignedToName}
          {task.assignedToCode && (
            <span className="ml-1 font-mono text-gray-400">({task.assignedToCode})</span>
          )}
        </p>
        {task.submittedAt && (
          <p className="text-xs text-gray-400 mt-0.5">
            Survey completed: {formatDate(task.submittedAt)}
          </p>
        )}
        {task.submittedAt && (() => {
          const days = Math.floor(
            (Date.now() - task.submittedAt!.getTime()) / (1000 * 60 * 60 * 24)
          );
          const color = days > 7  ? 'text-red-500' :
                        days > 3  ? 'text-orange-500' :
                        'text-gray-400';
          return (
            <p className={`text-xs mt-0.5 font-medium ${color}`}>
              ⏱ {days} day{days !== 1 ? 's' : ''} since survey
            </p>
          );
        })()}
        {task.createdAt && (() => {
          const days = Math.floor((Date.now() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          if (days < 1) return null;
          const color = days > 30 ? 'text-red-400' : days > 14 ? 'text-orange-400' : 'text-gray-400';
          return (
            <p className={`text-xs mt-0.5 ${color}`}>
              🕐 Lead age: {days} day{days !== 1 ? 's' : ''}
            </p>
          );
        })()}
      </div>
      <span className="shrink-0 text-gray-300 mt-1">›</span>
    </button>
  );
}

const HISTORY_STAGE_LABELS: Partial<Record<PipelineStage, { label: string; icon: string; color: string }>> = {
  field_review: { label: 'In Review',    icon: '👁️', color: 'text-blue-600   bg-blue-50   border-blue-200'   },
  documents:    { label: 'Documents',    icon: '📎', color: 'text-teal-600   bg-teal-50   border-teal-200'   },
  backend:      { label: 'Backend',      icon: '⚙️', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  completed:    { label: 'Converted',    icon: '✅', color: 'text-green-700  bg-green-100 border-green-200'  },
  dropped:      { label: 'Dropped',      icon: '❌', color: 'text-red-600    bg-red-50    border-red-200'    },
};

function HistoryTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const stage = task.pipelineStage ? HISTORY_STAGE_LABELS[task.pipelineStage] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm hover:shadow-md transition-all flex items-start gap-3 border-l-4 border-l-gray-300"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs text-gray-400">{task.taskNum}</span>
          {stage && (
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', stage.color)}>
              {stage.icon} {stage.label}
            </span>
          )}
          {(task.proposalRevisionCount ?? 0) > 0 && (
            <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-semibold">
              {task.proposalRevisionCount} revision{task.proposalRevisionCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="font-semibold text-base text-gray-900 line-clamp-2 leading-snug">
          {task.title}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Survey by: {task.assignedToName}
          {task.assignedToCode && (
            <span className="ml-1 font-mono text-gray-400">({task.assignedToCode})</span>
          )}
        </p>
        {task.proposalAssignedToName && (
          <p className="text-xs text-gray-400 mt-0.5">
            Proposal by: {task.proposalAssignedToName}
          </p>
        )}
      </div>
      <span className="shrink-0 text-gray-300 mt-1">›</span>
    </button>
  );
}

// ─── History Detail Content ───────────────────────────────────────────────────

const DETAIL_STAGE_LABELS: Partial<Record<string, { label: string; cls: string }>> = {
  survey:       { label: 'Survey',        cls: 'bg-gray-100    text-gray-600'   },
  proposal:     { label: 'Proposal',      cls: 'bg-purple-100  text-purple-700' },
  field_review: { label: 'Field Review',  cls: 'bg-blue-100    text-blue-700'   },
  documents:    { label: 'Documents',     cls: 'bg-teal-100    text-teal-700'   },
  backend:      { label: 'Backend',       cls: 'bg-orange-100  text-orange-700' },
  logistics:    { label: 'Logistics',     cls: 'bg-teal-100    text-teal-700'   },
  installation: { label: 'Installation',  cls: 'bg-green-100   text-green-700'  },
  completed:    { label: 'Completed',     cls: 'bg-green-100   text-green-700'  },
  dropped:      { label: 'Dropped',       cls: 'bg-red-100     text-red-600'    },
};

const STAGE_NAME_MAP: Record<string, string> = {
  survey: 'Survey', proposal: 'Proposal', field_review: 'Field Review',
  documents: 'Documents', backend: 'Backend', logistics: 'Logistics', installation: 'Installation',
  completed: 'Completed', dropped: 'Dropped',
};

interface FieldReviewStageSnap {
  decision?:      string;
  revisionNote?:  string;
  decidedByName?: string;
  decidedAt?:     { toDate?: () => Date } | Date | null;
}

function HistoryDetailContent({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [proposalDoc,    setProposalDoc]    = useState<ProposalStageData | null>(null);
  const [fieldReviewData, setFieldReviewData] = useState<FieldReviewStageSnap | null>(null);

  useEffect(() => {
    if (!task) {
      setProposalDoc(null);
      setFieldReviewData(null);
      return;
    }
    Promise.all([
      getDoc(doc(db, 'tasks', task.id, 'stages', 'proposal')),
      getDoc(doc(db, 'tasks', task.id, 'stages', 'field_review')),
    ]).then(([proposalSnap, frSnap]) => {
      setProposalDoc(proposalSnap.exists() ? (proposalSnap.data() as ProposalStageData) : null);
      setFieldReviewData(frSnap.exists() ? (frSnap.data() as FieldReviewStageSnap) : null);
    }).catch((err) => {
      void logError('proposalPage.fetchStageData', err, { taskId: task?.id });
      setProposalDoc(null);
      setFieldReviewData(null);
    });
  }, [task?.id]);

  if (!task) return null;

  const stageMeta = DETAIL_STAGE_LABELS[task.pipelineStage ?? ''] ?? {
    label: task.pipelineStage ?? '',
    cls: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-mono text-gray-400">{task.taskNum}</p>
          <h2 className="text-lg font-bold text-gray-900 mt-0.5 line-clamp-2">{task.title}</h2>
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold mt-2', stageMeta.cls)}>
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Survey Reference</p>
          <p className="text-sm text-gray-700">
            <span className="text-gray-400">Field Engineer: </span>
            {task.assignedToName}
            {task.assignedToCode && (
              <span className="ml-1 font-mono text-xs text-gray-400">({task.assignedToCode})</span>
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
            {task.submittedAt ? formatDate(task.submittedAt) : '—'}
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
          {task.proposalAssignedToName && (
            <p className="text-sm text-gray-700 mt-1">
              <span className="text-gray-400">Proposal by: </span>
              {task.proposalAssignedToName}
            </p>
          )}
          {(task.proposalRevisionCount ?? 0) > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              Revision cycles: {task.proposalRevisionCount}
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
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((field) => {
                  const answer = task.fieldAnswers?.[field.fieldId];
                  if (!answer?.value) return null;
                  return (
                    <div key={field.fieldId} className="flex flex-col gap-0.5">
                      <p className="text-xs text-gray-400">{field.label}</p>
                      <p className="text-sm font-medium text-gray-800">
                        {field.type === 'yesno'
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
                  {Object.values(task.fieldPhotos ?? {}).flat().map((url, i) =>
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

        {/* Proposal Remark (internal) — read-only historical view */}
        {task.proposalRemark && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
              Proposal Remark (internal)
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.proposalRemark}</p>
            {task.proposalRemarkUpdatedBy && (
              <p className="text-[10px] text-purple-600 mt-1">
                Last updated by {task.proposalRemarkUpdatedBy}
                {task.proposalRemarkUpdatedAt && ` on ${task.proposalRemarkUpdatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
              </p>
            )}
          </div>
        )}

        {/* Current proposal document + note */}
        {getProposalDocuments(proposalDoc).length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Proposal Document</p>
              {proposalDoc?.uploadedByName && (
                <p className="text-[10px] text-blue-500">
                  {proposalDoc.uploadedByName}
                  {proposalDoc.uploadedAt && (() => {
                    const d = typeof (proposalDoc.uploadedAt as any).toDate === 'function'
                      ? (proposalDoc.uploadedAt as any).toDate()
                      : proposalDoc.uploadedAt as Date;
                    return ` · ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
                  })()}
                </p>
              )}
            </div>
            <ProposalDocumentList documents={getProposalDocuments(proposalDoc)} />
            {proposalDoc?.proposalNote && (
              <div className="rounded-lg border border-blue-100 bg-white px-3 py-2 mt-2">
                <p className="text-xs text-blue-700">
                  📝 {getProposalNoteRecipientLabel(proposalDoc.submittedToStage)}: {proposalDoc.proposalNote}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Proposal Revision History — newest first, stable chronological labels */}
        {(proposalDoc?.revisions?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Proposal Revision History
              <span className="ml-1 text-gray-400">({proposalDoc!.revisions.length})</span>
            </p>
            <div className="flex flex-col gap-2">
              {[...proposalDoc!.revisions].reverse().map((rev, revIdx) => {
                const docs = rev.documents?.length
                  ? rev.documents
                  : rev.documentUrl
                  ? [{ url: rev.documentUrl, name: rev.documentName ?? 'Document' }]
                  : [];
                const uploadedAt = rev.uploadedAt as unknown as { toDate?: () => Date } | Date | null;
                const uploadDate = uploadedAt
                  ? (typeof (uploadedAt as any).toDate === 'function'
                      ? (uploadedAt as any).toDate()
                      : uploadedAt as Date)
                  : null;
                const revisionLabel = proposalDoc!.revisions.length - revIdx;
                return (
                  <div key={revIdx} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700">Revision {revisionLabel}</p>
                      <p className="text-[10px] text-gray-400">
                        {rev.uploadedByName ?? ''}
                        {uploadDate ? ` · ${uploadDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                      </p>
                    </div>
                    {docs.length > 0 && <ProposalDocumentList documents={docs} />}
                    {rev.revisionNote && (
                      <p className="text-xs text-gray-500 italic mt-1">
                        📝 {getProposalNoteRecipientLabel(rev.submittedToStage)}: {rev.revisionNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Field Review Decision */}
        {fieldReviewData && (
          <div className={cn(
            'rounded-lg border px-4 py-3',
            fieldReviewData.decision === 'accepted'
              ? 'border-green-200 bg-green-50'
              : fieldReviewData.decision === 'rejected'
              ? 'border-red-200 bg-red-50'
              : 'border-orange-200 bg-orange-50',
          )}>
            <div className="flex items-center justify-between mb-1">
              <p className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                fieldReviewData.decision === 'accepted' ? 'text-green-700'
                : fieldReviewData.decision === 'rejected' ? 'text-red-700'
                : 'text-orange-700',
              )}>
                Field Review Decision
              </p>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold',
                fieldReviewData.decision === 'accepted'
                  ? 'bg-green-100 text-green-700'
                  : fieldReviewData.decision === 'rejected'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-orange-100 text-orange-700',
              )}>
                {fieldReviewData.decision === 'accepted'
                  ? '✅ Accepted'
                  : fieldReviewData.decision === 'rejected'
                  ? '❌ Rejected'
                  : '🔄 Revision Requested'}
              </span>
            </div>
            {fieldReviewData.revisionNote && (
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                {fieldReviewData.revisionNote}
              </p>
            )}
            {fieldReviewData.decidedByName && (
              <p className="text-[10px] text-gray-400 mt-1">
                {fieldReviewData.decidedByName}
                {fieldReviewData.decidedAt && (() => {
                  const d = typeof (fieldReviewData.decidedAt as any).toDate === 'function'
                    ? (fieldReviewData.decidedAt as any).toDate()
                    : fieldReviewData.decidedAt as Date;
                  return ` · ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
                })()}
              </p>
            )}
          </div>
        )}

        {/* Dropped reason */}
        {task.pipelineStage === 'dropped' && task.droppedReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Drop Reason</p>
            <p className="text-sm text-red-700">{task.droppedReason}</p>
          </div>
        )}

        {/* Pipeline history */}
        {task.stageHistory && task.stageHistory.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline History</p>
            {[...(task.stageHistory as StageHistoryEntry[])].reverse().map((entry, i) => {
              const ts = entry.timestamp instanceof Date
                ? entry.timestamp
                : new Date(
                    (entry.timestamp as unknown as { toDate?: () => Date })?.toDate?.() ?? entry.timestamp,
                  );
              return (
                <div key={i} className="flex flex-col gap-0.5 pl-3 border-l-2 border-gray-100">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400 tabular-nums">
                      {ts.toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'Asia/Kolkata',
                      })}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="font-medium text-gray-700">{entry.actorName}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {entry.fromStage ? `${STAGE_NAME_MAP[entry.fromStage] ?? entry.fromStage} → ` : ''}
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

      </div>
    </div>
  );
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type HistoryFilter = 'all' | 'in_review' | 'completed' | 'dropped' | 'had_revision';

const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'in_review',    label: 'In Pipeline' },
  { key: 'completed',    label: 'Converted' },
  { key: 'dropped',      label: 'Dropped' },
  { key: 'had_revision', label: 'Had Revision' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProposalPage() {
  const {
    loadMore:      loadMoreActive,
    hasMore:       activeHasMore,
    loadingMore:   activeLoadingMore,
    search:        firestoreSearch,
    searchResults,
    isSearching,
    clearSearch,
  } = useProposalTasks();
  const { proposalTasks, proposalTasksLoading, proposalHistoryTasks, proposalHistoryLoading } = useTaskStore();
  const { loadMore: loadMoreHistory, hasMore: historyHasMore } = useLoadMoreProposalHistory();
  const { currentUser } = useAuthStore();
  const [search,          setSearch]          = useState('');
  const [correctionOnly,  setCorrectionOnly]  = useState(false);
  const [activeTask,      setActiveTask]      = useState<Task | null>(null);
  const [activeTab,       setActiveTab]       = useState<'active' | 'history'>('active');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const historyTask = historyTaskId
    ? (proposalHistoryTasks.find((t) => t.id === historyTaskId) ?? null)
    : null;

  const historyFilterCounts = useMemo(() => ({
    all:          proposalHistoryTasks.length,
    in_review:    proposalHistoryTasks.filter((t) =>
                    ['field_review', 'documents', 'backend'].includes(t.pipelineStage ?? '')
                  ).length,
    completed:    proposalHistoryTasks.filter((t) => t.pipelineStage === 'completed').length,
    dropped:      proposalHistoryTasks.filter((t) => t.pipelineStage === 'dropped').length,
    had_revision: proposalHistoryTasks.filter((t) => (t.proposalRevisionCount ?? 0) > 0).length,
  }), [proposalHistoryTasks]);

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

  if (currentUser?.role === 'admin') {
    return <Navigate to="/tasks" replace />;
  }

  // When a Firestore search is active show its results; otherwise show the
  // live-paginated list. The correctionOnly chip applies to both sources.
  const displayActive = isSearching ? searchResults : proposalTasks;
  const filteredActive = displayActive.filter((t) => {
    if (correctionOnly && !t.correctionReturnTo) return false;
    return true;
  });
  const correctionCount = proposalTasks.filter((t) => !!t.correctionReturnTo).length;

  const filteredHistory = proposalHistoryTasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(historySearch.toLowerCase()) ||
      t.taskNum.toLowerCase().includes(historySearch.toLowerCase()) ||
      (t.consumerMobile ?? '').toLowerCase().includes(historySearch.toLowerCase());
    if (!matchesSearch) return false;
    if (historyFilter === 'in_review')    return ['field_review', 'documents', 'backend'].includes(t.pipelineStage ?? '');
    if (historyFilter === 'completed')    return t.pipelineStage === 'completed';
    if (historyFilter === 'dropped')      return t.pipelineStage === 'dropped';
    if (historyFilter === 'had_revision') return (t.proposalRevisionCount ?? 0) > 0;
    return true;
  });

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const myActiveCount    = proposalTasks.length;
  const myRevisionCount  = proposalTasks.filter((t) => (t.proposalRevisionCount ?? 0) > 0).length;
  const myConvertedCount = proposalHistoryTasks.filter((t) => t.pipelineStage === 'completed').length;
  const myDroppedCount   = proposalHistoryTasks.filter((t) => t.pipelineStage === 'dropped').length;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      {/* Dashboard header */}
      <div className="mb-1">
        <h1 className="text-xl font-bold text-gray-900 mb-0.5">
          {currentUser
            ? `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${currentUser.name.split(' ')[0]}`
            : 'Welcome'}
        </h1>
        <p className="text-sm text-gray-400 mb-4">{today}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white border border-purple-100 shadow-sm px-3 py-3 text-center">
            <p className="text-2xl font-extrabold text-purple-600">{myActiveCount}</p>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">Active</p>
          </div>
          <div className="rounded-xl bg-white border border-orange-100 shadow-sm px-3 py-3 text-center">
            <p className="text-2xl font-extrabold text-orange-500">{myRevisionCount}</p>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">Revisions</p>
          </div>
          <div className="rounded-xl bg-white border border-green-100 shadow-sm px-3 py-3 text-center">
            <p className="text-2xl font-extrabold text-green-600">{myConvertedCount}</p>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">Converted</p>
          </div>
          <div className="rounded-xl bg-white border border-red-100 shadow-sm px-3 py-3 text-center">
            <p className="text-2xl font-extrabold text-red-500">{myDroppedCount}</p>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">Dropped</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium transition-all',
            activeTab === 'active'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          Active
          {proposalTasks.length > 0 && (
            <span className="ml-1.5 rounded-full bg-purple-100 text-purple-700 px-1.5 py-0.5 text-[10px] font-bold">
              {proposalTasks.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium transition-all',
            activeTab === 'history'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          History
          {proposalHistoryTasks.length > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-200 text-gray-600 px-1.5 py-0.5 text-[10px] font-bold">
              {proposalHistoryTasks.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'active' ? (
        <>
          {/* Search */}
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

          {/* Needs Correction filter */}
          {correctionCount > 0 && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setCorrectionOnly(!correctionOnly)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                  correctionOnly
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100',
                )}
              >
                ↩ Needs Correction
                <span className={cn(
                  'ml-1.5 rounded-full px-1.5 text-[10px] font-bold',
                  correctionOnly ? 'bg-white/30 text-white' : 'bg-amber-200 text-amber-800',
                )}>
                  {correctionCount}
                </span>
              </button>
            </div>
          )}

          {/* Task list */}
          {proposalTasksLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
            </div>
          ) : filteredActive.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">📄</span>
              <p className="text-gray-500 font-medium">No proposal tasks</p>
              <p className="text-gray-400 text-sm mt-1">
                {search ? 'No tasks match your search.' : 'All caught up!'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredActive.map((task) => (
                <ProposalTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => setActiveTask(task)}
                />
              ))}
            </div>
          )}

          {!proposalTasksLoading && filteredActive.length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              {filteredActive.length} task{filteredActive.length !== 1 ? 's' : ''}
            </p>
          )}
          {!proposalTasksLoading && !isSearching && activeHasMore && (
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
      ) : (
        <>
          {/* History search */}
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

          {/* History filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {HISTORY_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setHistoryFilter(key)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-all',
                  historyFilter === key
                    ? 'bg-brand-blue text-white border-brand-blue'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                )}
              >
                {label} ({historyFilterCounts[key] ?? 0})
              </button>
            ))}
          </div>

          {/* History list */}
          {proposalHistoryLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">🗂️</span>
              <p className="text-gray-500 font-medium">No history yet</p>
              <p className="text-gray-400 text-sm mt-1">
                {historySearch || historyFilter !== 'all'
                  ? 'No tasks match your filter.'
                  : 'Submitted proposals will appear here.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredHistory.map((task) => (
                <HistoryTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => setHistoryTaskId(task.id)}
                />
              ))}
            </div>
          )}

          {!proposalHistoryLoading && filteredHistory.length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              {filteredHistory.length} task{filteredHistory.length !== 1 ? 's' : ''}
            </p>
          )}
          {historyHasMore && (
            <button
              type="button"
              onClick={loadMoreHistory}
              disabled={proposalHistoryLoading}
              className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-medium py-3 text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {proposalHistoryLoading ? (
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

      {/* Proposal Work Drawer */}
      <ProposalWorkDrawer
        task={activeTask}
        onClose={() => setActiveTask(null)}
      />

      {/* History Detail Sheet */}
      <Sheet
        open={!!historyTask}
        onOpenChange={(open) => { if (!open) setHistoryTaskId(null); }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
          <HistoryDetailContent
            task={historyTask}
            onClose={() => setHistoryTaskId(null)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
