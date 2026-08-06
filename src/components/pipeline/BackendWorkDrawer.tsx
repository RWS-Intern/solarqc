import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Camera, Pencil } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button }             from '@/components/ui/button';
import { cn }                 from '@/lib/utils';
import { uploadToCloudinary } from '@/utils/uploadToCloudinary';
import { usePipelineActions } from '@/hooks/usePipelineActions';
import { useAppConfig }       from '@/hooks/useAppConfig';
import { useAuthStore }       from '@/store/authStore';
import { useToast }           from '@/components/ui/toast';
import { doc, getDoc }        from 'firebase/firestore';
import { db }                 from '@/firebase/config';
import { getProposalDocuments } from '@/utils/proposalDocuments';
import { ProposalDocumentList } from '@/components/pipeline/ProposalDocumentList';
import { getProposalNoteRecipientLabel } from '@/utils/proposalNoteLabel';
import { logError } from '@/utils/logError';
import type {
  Task, JourneyStepAnswer, SurveyStageData, DocumentsStageData, ProposalStageData,
} from '@/types';

interface BackendWorkDrawerProps {
  task:        Task | null;
  onClose:     () => void;
  isReadOnly?: boolean;
}

function formatDate(d: Date | { toDate: () => Date } | null | undefined): string {
  if (!d) return '—';
  const date = typeof (d as any).toDate === 'function'
    ? (d as any).toDate()
    : d as Date;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().includes('.pdf') ||
         url.toLowerCase().includes('/raw/upload/');
}

export function BackendWorkDrawer({ task, onClose, isReadOnly = false }: BackendWorkDrawerProps) {
  const { currentUser }                                  = useAuthStore();
  const { showToast }                                    = useToast();
  const { config }                                       = useAppConfig();
  const { initializeJourneySteps, completeJourneyStep, markLeadConverted, saveJourneyStepDraft, saveJourneyStepRemark, updateBackendRemark } = usePipelineActions();
  const initialisedForTaskId                             = useRef<string | null>(null);

  // Survey data
  const [surveyData,      setSurveyData]      = useState<SurveyStageData | null>(null);
  const [proposalDoc,     setProposalDoc]     = useState<ProposalStageData | null>(null);
  const [documentsData,   setDocumentsData]   = useState<DocumentsStageData | null>(null);
  const [showSurvey,      setShowSurvey]      = useState(false);

  // Step state
  const [stepDoneValue,   setStepDoneValue]   = useState<'yes' | 'no' | null>(null);
  const [stepDate,        setStepDate]        = useState('');
  const [stepPhotos,      setStepPhotos]      = useState<string[]>([]);
  const stepPhotosRef = useRef<string[]>([]);
  const [photoFiles,      setPhotoFiles]      = useState<File[]>([]);
  const [submittingStep,  setSubmittingStep]  = useState(false);
  const [converting,      setConverting]      = useState(false);
  const [showErrors,      setShowErrors]      = useState(false);

  const [loadingStageData,    setLoadingStageData]    = useState(false);

  // Payment type selection
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [pendingPaymentType,  setPendingPaymentType]  = useState<'cash' | 'loan' | null>(null);

  // Universal backend remark
  const [backendRemark,         setBackendRemark]         = useState('');
  const [backendRemarkSaving,   setBackendRemarkSaving]   = useState(false);
  const [editingBackendRemark,  setEditingBackendRemark]  = useState(false);

  // Per-step remark
  const [stepRemark,          setStepRemark]          = useState('');
  const [stepRemarkSaving,    setStepRemarkSaving]    = useState(false);

  useEffect(() => {
    if (!task) {
      initialisedForTaskId.current = null;
      setSurveyData(null);
      setProposalDoc(null);
      setDocumentsData(null);
      setLoadingStageData(false);
      setStepDoneValue(null);
      setStepDate('');
      stepPhotos.forEach((url) => URL.revokeObjectURL(url));
      setStepPhotos([]);
      setPhotoFiles([]);
      setShowErrors(false);
      setPendingPaymentType(null);
      setBackendRemark('');
      setEditingBackendRemark(false);
      setStepRemark('');
      return;
    }
    setBackendRemark(task.backendRemark ?? '');
    setEditingBackendRemark(false);
    if (initialisedForTaskId.current === task.id) return;
    initialisedForTaskId.current = task.id;

    // Load survey + proposal + documents data in parallel
    setLoadingStageData(true);
    Promise.all([
      getDoc(doc(db, 'tasks', task.id, 'stages', 'survey')),
      getDoc(doc(db, 'tasks', task.id, 'stages', 'proposal')),
      getDoc(doc(db, 'tasks', task.id, 'stages', 'documents')),
    ]).then(([surveySnap, proposalSnap, documentsSnap]) => {
      if (surveySnap.exists()) {
        setSurveyData(surveySnap.data() as SurveyStageData);
      }
      if (proposalSnap.exists()) {
        setProposalDoc(proposalSnap.data() as ProposalStageData);
      }
      if (documentsSnap.exists()) {
        setDocumentsData(documentsSnap.data() as DocumentsStageData);
      }
    }).catch((err) => void logError('backendWorkDrawer.fetchData', err, { taskId: task?.id })).finally(() => {
      setLoadingStageData(false);
    });
  }, [task?.id]);

  // Keep ref in sync so the unmount cleanup sees the latest URLs
  useEffect(() => { stepPhotosRef.current = stepPhotos; }, [stepPhotos]);

  // Revoke any remaining blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => { stepPhotosRef.current.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  // Reset step inputs when currentStepIndex changes
  useEffect(() => {
    setStepDoneValue(null);
    const d = new Date();
    setStepDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); // auto-fill today local
    setStepPhotos([]);
    setPhotoFiles([]);
    setShowErrors(false);
    setStepRemark('');
  }, [task?.id, task?.currentStepIndex]);

  const steps: JourneyStepAnswer[] = task?.applicationJourneySteps ?? [];
  const currentIdx  = task?.currentStepIndex ?? 0;
  const currentStep = steps[currentIdx] ?? null;
  const allStepsDone = steps.length > 0 && steps.every((s) => s.status === 'done');

  function handlePaymentSelect(type: 'cash' | 'loan') {
    setPendingPaymentType(type);
  }

  async function handlePaymentConfirm() {
    if (!task || !currentUser || !pendingPaymentType) return;
    const stepDefs = pendingPaymentType === 'cash'
      ? (config.backendCashSteps ?? []).sort((a, b) => a.sortOrder - b.sortOrder)
      : (config.backendLoanSteps ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

    if (stepDefs.length === 0) {
      alert('No steps configured. Ask admin to set up Application Journey steps.');
      return;
    }
    setInitializingPayment(true);
    try {
      await initializeJourneySteps(task.id, pendingPaymentType, stepDefs);
      setPendingPaymentType(null);
      initialisedForTaskId.current = null;
    } catch {
      // error handled in hook
    } finally {
      setInitializingPayment(false);
    }
  }

  function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotoFiles((prev) => [...prev, ...files]);
    const urls = files.map((f) => URL.createObjectURL(f));
    setStepPhotos((prev) => [...prev, ...urls]);
  }

  function handlePhotoRemove(idx: number) {
    URL.revokeObjectURL(stepPhotos[idx]);
    setStepPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCloseWithDraft() {
    if (submittingStep) {
      showToast('Please wait for the upload to complete.', 'error');
      return;
    }
    if (
      stepDoneValue === 'no' &&
      task?.id &&
      task?.applicationJourneySteps &&
      currentStep
    ) {
      try {
        await saveJourneyStepDraft(
          task.id,
          currentIdx,
          'no',
          stepDate,
          task.applicationJourneySteps,
        );
      } catch {
        // silent fail — don't block close
      }
    }
    onClose();
  }

  async function handleStepSubmit() {
    if (!task || !currentStep || !currentUser) return;
    setShowErrors(true);

    if (currentStep.type === 'yesno') {
      if (stepDoneValue !== 'yes') return;
      if (!stepDate) return;
    } else if (currentStep.type === 'photo') {
      if (stepPhotos.length === 0) return;
      if (!stepDate) return;
    }

    if (!stepDate) {
      setShowErrors(true);
      return;
    }
    setSubmittingStep(true);
    try {
      let finalPhotoUrls: string[] = [];

      if (currentStep.type === 'photo') {
        for (let i = 0; i < photoFiles.length; i++) {
          const result = await uploadToCloudinary(photoFiles[i], {
            taskNum:      task.taskNum,
            engineerCode: currentUser.engineerCode,
            engineerName: currentUser.name,
          });
          finalPhotoUrls.push(result.url);
        }
      }

      await completeJourneyStep(
        task.id,
        currentIdx,
        stepDate,
        finalPhotoUrls,
        steps,
      );

      const d = new Date();
      const todayLocal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      stepPhotos.forEach((url) => URL.revokeObjectURL(url));
      setStepDoneValue(null);
      setStepDate(todayLocal);
      setStepPhotos([]);
      setPhotoFiles([]);
      setShowErrors(false);
      initialisedForTaskId.current = null; // force re-read on next render
    } catch {
      // error toast handled in hook
    } finally {
      setSubmittingStep(false);
    }
  }

  async function handleConvert() {
    if (!task || !currentUser) return;
    if (!window.confirm(
      'Mark this lead as Converted? This action cannot be undone.'
    )) return;
    setConverting(true);
    try {
      await markLeadConverted(
        task.id,
        task.applicationJourneySteps ?? [],
        task.paymentType ?? 'cash',
      );
    } catch {
      // error handled in hook
    } finally {
      setConverting(false);
    }
  }

  const latestEntry = task?.stageHistory?.length
    ? task.stageHistory[task.stageHistory.length - 1]
    : null;
  const showReturnBanner = !!(
    latestEntry &&
    latestEntry.note &&
    latestEntry.toStage === 'backend' &&
    latestEntry.actorRole === 'admin_override'
  );

  return (
    <Sheet open={!!task} onOpenChange={(open) => {
      if (!open) {
        handleCloseWithDraft();
      }
    }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0"
        onInteractOutside={() => {
          handleCloseWithDraft();
        }}
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (!task?.taskNum) return;
                  navigator.clipboard.writeText(task.taskNum);
                  showToast(`Copied ${task.taskNum}`, 'success');
                }}
                className="text-xs font-mono text-gray-400 hover:text-gray-600 flex items-center gap-1 group transition-colors"
                title="Copy task number"
              >
                {task?.taskNum}
                <svg className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <SheetTitle className="text-lg font-bold text-gray-900 mt-0.5">
                {task?.title}
              </SheetTitle>
            </div>
            <button
              type="button"
              onClick={handleCloseWithDraft}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all mt-0.5"
              title="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <span className="inline-flex w-fit items-center rounded-full bg-orange-100 text-orange-700 px-2.5 py-0.5 text-xs font-semibold mt-1">
            ⚙️ Backend Processing
          </span>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 py-5">

          {/* Admin override banner */}
          {showReturnBanner && latestEntry && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">
                ⚠️ Sent Back By Admin
              </p>
              <p className="text-sm font-semibold text-amber-900">
                {latestEntry.note}
              </p>
            </div>
          )}

          {/* Survey Reference */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Survey Reference
            </p>
            <p className="text-gray-700">
              <span className="text-gray-400">Field Engineer: </span>
              {task?.assignedToName}
              {task?.assignedToCode && (
                <span className="text-gray-400 ml-1">({task.assignedToCode})</span>
              )}
            </p>
            {task?.assignedToMobile && (
              <p className="text-gray-700">
                <span className="text-gray-400">Mobile: </span>
                <a href={`tel:${task.assignedToMobile}`} className="text-blue-600 hover:underline">
                  {task.assignedToMobile}
                </a>
              </p>
            )}
            {task?.submittedAt && (
              <p className="text-gray-700">
                <span className="text-gray-400">Survey completed: </span>
                {formatDate(task.submittedAt)}
              </p>
            )}
            {task?.location && (
              <p className="text-gray-700">
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
                  <span className="text-gray-400 text-xs ml-1">
                    (±{Math.round(task.location.accuracy)}m)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* ── Backend Remark (universal / lead-level) ── */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Backend Remark
              </p>
              {!isReadOnly && !editingBackendRemark && (
                <button
                  type="button"
                  onClick={() => { setBackendRemark(task?.backendRemark ?? ''); setEditingBackendRemark(true); }}
                  className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800 transition-colors"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>
            {isReadOnly ? (
              task?.backendRemark ? (
                <>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.backendRemark}</p>
                  {task.backendRemarkUpdatedBy && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      Last updated by {task.backendRemarkUpdatedBy}
                      {task.backendRemarkUpdatedAt && ` on ${task.backendRemarkUpdatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">No remark yet.</p>
              )
            ) : editingBackendRemark ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={backendRemark}
                  onChange={(e) => setBackendRemark(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Add a remark about this lead..."
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 placeholder:text-gray-300"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={backendRemarkSaving}
                    onClick={async () => {
                      if (!task) return;
                      setBackendRemarkSaving(true);
                      try {
                        await updateBackendRemark(task.id, backendRemark);
                        setEditingBackendRemark(false);
                      } catch {
                        // error toast in hook
                      } finally {
                        setBackendRemarkSaving(false);
                      }
                    }}
                    className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 transition-all"
                  >
                    {backendRemarkSaving ? 'Saving...' : 'Save Remark'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingBackendRemark(false); setBackendRemark(task?.backendRemark ?? ''); }}
                    className="rounded-lg border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : task?.backendRemark ? (
              <>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.backendRemark}</p>
                {task.backendRemarkUpdatedBy && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    Last updated by {task.backendRemarkUpdatedBy}
                    {task.backendRemarkUpdatedAt && ` on ${task.backendRemarkUpdatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">No remark yet.</p>
            )}
          </div>

          {/* Description */}
          {task?.description && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Consumer Mobile */}
          {task?.consumerMobile && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Consumer Mobile</p>
              <p className="text-sm text-gray-700 font-mono">{task.consumerMobile}</p>
            </div>
          )}

          {/* State */}
          {task?.state && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">State:</span>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                {task.state}
              </span>
            </div>
          )}

          {/* District */}
          {task?.district && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">District:</span>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                {task.district}
              </span>
            </div>
          )}

          {/* Lead Source */}
          {task?.leadSource && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Lead Source:</span>
              <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                {task.leadSource}
              </span>
              {task.leadSource === 'Employee' && task.leadSourceEmployeeName && (
                <span className="text-gray-400">({task.leadSourceEmployeeName})</span>
              )}
              {task.leadSource === 'Field Engineer' && task.leadGeneratedByName && (
                <span className="text-gray-400">— {task.leadGeneratedByName}</span>
              )}
            </div>
          )}

          {/* ── Proposal Document + Survey Data ── */}
          {loadingStageData ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-orange-300 border-t-transparent" />
              <span className="ml-3 text-sm text-gray-400">Loading survey &amp; proposal data...</span>
            </div>
          ) : (
            <>
          {/* Proposal Remark (internal) — read-only for backend team */}
          {task?.proposalRemark && (
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

          {getProposalDocuments(proposalDoc).length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                Proposal Document
              </p>
              <ProposalDocumentList documents={getProposalDocuments(proposalDoc)} />
              {proposalDoc?.proposalNote && (
                <div className="rounded-lg border border-blue-100 bg-white px-3 py-2 mt-2">
                  <p className="text-xs text-blue-700">
                    📝 {getProposalNoteRecipientLabel(proposalDoc?.submittedToStage)}: {proposalDoc.proposalNote}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Submitted Documents ── */}
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
            <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">
              Submitted Documents
            </p>
            {(() => {
              const answers    = documentsData?.documentAnswers ?? {};
              const photos     = documentsData?.documentPhotos  ?? {};
              const template   = config.documentTemplate ?? [];
              const hasAnswers = Object.keys(answers).length > 0;
              const hasPhotos  = Object.values(photos).flat().length > 0;
              if (!hasAnswers && !hasPhotos) {
                return <p className="text-sm text-gray-400 italic">No documents were collected for this lead.</p>;
              }
              return (
                <>
                  {hasAnswers && (
                    <div className="flex flex-col gap-2 mb-3">
                      {template
                        .filter((f) => f.type !== 'section_header' && f.type !== 'photo_only')
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((field) => {
                          const val = answers[field.fieldId];
                          if (!val) return null;
                          return (
                            <div key={field.fieldId}>
                              <p className="text-xs text-gray-500">{field.label}</p>
                              <p className="text-sm font-medium text-gray-800">
                                {field.type === 'yesno'
                                  ? val === 'yes' ? '✅ Yes' : '❌ No'
                                  : val}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  {hasPhotos && (
                    <div className="grid grid-cols-3 gap-2">
                      {Object.values(photos).flat().map((url, i) =>
                        isPdfUrl(url) ? (
                          <a key={i} href={url} target="_blank"
                             rel="noopener noreferrer" download
                             className="flex flex-col items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 p-2 min-h-[72px]">
                            <span className="text-2xl">📄</span>
                            <span className="text-[9px] text-red-700 font-medium text-center line-clamp-2">
                              Document {i + 1}
                            </span>
                          </a>
                        ) : (
                          <a key={i} href={url} target="_blank"
                             rel="noopener noreferrer" download>
                            <img src={url} alt={`Document ${i + 1}`}
                              className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                          </a>
                        )
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* ── Survey Data (collapsible) ── */}
          <div className="rounded-lg border border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={() => setShowSurvey((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
            >
              Survey Data
              {showSurvey
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />}
            </button>
            {showSurvey && (
              <div className="border-t border-gray-100 px-4 pb-4">
                {task?.location && (
                  <p className="text-sm text-gray-600 pt-3">
                    Location:{' '}
                    <a
                      href={`https://maps.google.com/?q=${task.location.lat},${task.location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {task.location.lat.toFixed(5)}, {task.location.lng.toFixed(5)}
                    </a>
                    {task.location.accuracy !== undefined && (
                      <span className="text-gray-400 text-xs ml-1">
                        (±{Math.round(task.location.accuracy)}m)
                      </span>
                    )}
                  </p>
                )}
                {/* FIX 2: fallback to task.fieldAnswers/fieldPhotos when stages/survey missing */}
                {(() => {
                  const answers    = surveyData?.fieldAnswers ?? task?.fieldAnswers ?? {};
                  const photos     = surveyData?.fieldPhotos  ?? task?.fieldPhotos  ?? {};
                  const fields     = surveyData?.surveyFormSnapshot ?? task?.fields ?? [];
                  const hasAnswers = Object.keys(answers).length > 0;
                  const hasPhotos  = Object.values(photos).flat().length > 0;
                  if (!hasAnswers && !hasPhotos) {
                    return <p className="text-sm text-gray-400 italic pt-3">No survey data available.</p>;
                  }
                  return (
                    <>
                      {hasAnswers && (
                        <div className="flex flex-col gap-2 pt-3">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                            Field Answers
                          </p>
                          {fields
                            .filter((f) => f.type !== 'section_header' && f.type !== 'photo_only')
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((field) => {
                              const ans = answers[field.fieldId];
                              if (!ans?.value) return null;
                              return (
                                <div key={field.fieldId}>
                                  <p className="text-xs text-gray-400">{field.label}</p>
                                  <p className="text-sm font-medium text-gray-800">
                                    {field.type === 'yesno'
                                      ? ans.value === 'yes' ? '✅ Yes' : '❌ No'
                                      : ans.value}
                                  </p>
                                </div>
                              );
                            })}
                        </div>
                      )}
                      {hasPhotos && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                            Photos & Documents
                          </p>
                          {(() => {
                            const allPhotos = Object.values(photos).flat().filter((url) => !isPdfUrl(url));
                            const allDocs   = Object.values(photos).flat().filter((url) => isPdfUrl(url));
                            if (allPhotos.length === 0 && allDocs.length === 0) return null;
                            return (
                              <div className="flex gap-2 mb-2 flex-wrap">
                                {allPhotos.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => { allPhotos.forEach((url) => window.open(url, '_blank')); }}
                                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all"
                                  >
                                    🖼️ Open All ({allPhotos.length})
                                  </button>
                                )}
                                {allDocs.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => { allDocs.forEach((url) => window.open(url, '_blank')); }}
                                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all"
                                  >
                                    📄 Open All Docs ({allDocs.length})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const allUrls = Object.values(photos).flat();
                                    navigator.clipboard.writeText(allUrls.join('\n'));
                                    showToast(`Copied ${allUrls.length} links`, 'success');
                                  }}
                                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all"
                                >
                                  🔗 Copy Links
                                </button>
                              </div>
                            );
                          })()}
                          <div className="grid grid-cols-3 gap-2">
                            {Object.values(photos).flat().map((url, i) =>
                              isPdfUrl(url) ? (
                                <a key={i} href={url} target="_blank"
                                   rel="noopener noreferrer" download
                                   className="flex flex-col items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 p-2 min-h-[72px]">
                                  <span className="text-2xl">📄</span>
                                  <span className="text-[9px] text-red-700 font-medium text-center line-clamp-2">
                                    Document {i + 1}
                                  </span>
                                </a>
                              ) : (
                                <a key={i} href={url} target="_blank"
                                   rel="noopener noreferrer" download>
                                  <img src={url} alt={`Photo ${i + 1}`}
                                    className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                                </a>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
            </>
          )}

          {/* ── Cash / Loan Selection ── */}
          {!task?.paymentType && isReadOnly && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-center">
              <p className="text-sm text-gray-500">Payment type not yet selected by the backend team.</p>
            </div>
          )}
          {!task?.paymentType && !isReadOnly && (
            <div className="flex flex-col gap-3">
              {!pendingPaymentType ? (
                <>
                  <p className="text-sm font-semibold text-gray-700">
                    Select Payment Type to begin Application Journey:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handlePaymentSelect('cash')}
                      className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 bg-white hover:border-green-400 hover:bg-green-50 px-4 py-5 transition-all"
                    >
                      <span className="text-3xl">💵</span>
                      <span className="font-semibold text-gray-800">Cash</span>
                      <span className="text-xs text-gray-400">
                        {(config.backendCashSteps ?? []).length} steps
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePaymentSelect('loan')}
                      className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 px-4 py-5 transition-all"
                    >
                      <span className="text-3xl">🏦</span>
                      <span className="font-semibold text-gray-800">Loan</span>
                      <span className="text-xs text-gray-400">
                        {(config.backendLoanSteps ?? []).length} steps
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={cn(
                    'rounded-xl border-2 px-5 py-4 flex flex-col gap-3',
                    pendingPaymentType === 'cash'
                      ? 'border-green-400 bg-green-50'
                      : 'border-blue-400 bg-blue-50',
                  )}>
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">
                        {pendingPaymentType === 'cash' ? '💵' : '🏦'}
                      </span>
                      <div>
                        <p className="text-base font-bold text-gray-900">
                          {pendingPaymentType === 'cash' ? 'Cash' : 'Loan'} Selected
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {pendingPaymentType === 'cash'
                            ? (config.backendCashSteps ?? []).length
                            : (config.backendLoanSteps ?? []).length} steps will be initialized
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 bg-white rounded-lg px-3 py-2 border border-gray-200">
                      ⚠️ Once confirmed, payment type cannot be changed without admin access.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={handlePaymentConfirm}
                        disabled={initializingPayment}
                        className={cn(
                          'flex-1 font-semibold',
                          pendingPaymentType === 'cash'
                            ? 'bg-green-500 hover:bg-green-600 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white',
                        )}
                      >
                        {initializingPayment
                          ? 'Initializing...'
                          : `Confirm ${pendingPaymentType === 'cash' ? 'Cash' : 'Loan'}`}
                      </Button>
                      <Button
                        onClick={() => setPendingPaymentType(null)}
                        disabled={initializingPayment}
                        variant="outline"
                        className="flex-1"
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Application Journey Steps ── */}
          {task?.paymentType && steps.length > 0 && (
            <div className="flex flex-col gap-3">

              {/* Payment type badge */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Application Journey
                </p>
                <span className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  task.paymentType === 'cash'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700',
                )}>
                  {task.paymentType === 'cash' ? '💵 Cash' : '🏦 Loan'} ·{' '}
                  {steps.filter((s) => s.status === 'done').length}/{steps.length} done
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-1.5 rounded-full bg-orange-400 transition-all"
                  style={{
                    width: `${steps.length > 0
                      ? (steps.filter((s) => s.status === 'done').length / steps.length) * 100
                      : 0}%`,
                  }}
                />
              </div>

              {/* Completed steps */}
              {steps.slice(0, currentIdx).map((step, idx) => (
                <div
                  key={step.stepId}
                  className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold mt-0.5">
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      Step {idx + 1}: {step.label}
                    </p>
                    <p className="text-xs text-green-600 mt-0.5">
                      Done on: {step.realDate
                        ? new Date(step.realDate).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })
                        : '—'}
                      {step.recordedBy && ` · by ${step.recordedBy}`}
                    </p>
                    {step.type === 'photo' && step.photoUrls.length > 0 && (
                      <div className="grid grid-cols-4 gap-1 mt-2">
                        {step.photoUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" download>
                            <img
                              src={url}
                              alt={`Step photo ${i + 1}`}
                              className="w-full aspect-square object-cover rounded border border-green-200"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {(step.remarks ?? []).length > 0 && (
                      <div className="mt-2 flex flex-col gap-1 border-t border-green-100 pt-2">
                        {[...(step.remarks ?? [])].reverse().map((r, i) => {
                          const ts = r.createdAt as unknown as { toDate?: () => Date };
                          const d = r.createdAt instanceof Date ? r.createdAt : ts?.toDate?.() ?? null;
                          return (
                            <p key={i} className="text-[10px] text-gray-500">
                              💬 {r.text}
                              <span className="text-gray-400 ml-1">
                                — {r.authorName}{d ? `, ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                              </span>
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Current active step */}
              {currentStep && !allStepsDone && (
                <div className={cn(
                  'flex flex-col gap-3 rounded-xl border-2 px-4 py-4',
                  isReadOnly
                    ? 'border-gray-200 bg-gray-50'
                    : 'border-orange-300 bg-orange-50',
                )}>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold',
                      isReadOnly ? 'bg-gray-400' : 'bg-orange-400',
                    )}>
                      {currentIdx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {currentStep.label}
                      </p>
                      {isReadOnly ? (
                        <span className="inline-block mt-0.5 rounded-full bg-gray-200 text-gray-500 text-[10px] font-semibold px-2 py-0.5">
                          In Progress
                        </span>
                      ) : (
                        (currentStep as JourneyStepAnswer & { inputValue?: string }).inputValue === 'no' && (
                          <span className="inline-block mt-0.5 rounded-full bg-orange-200 text-orange-700 text-[10px] font-semibold px-2 py-0.5">
                            Previously marked No
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Step input */}
                  {currentStep.type === 'yesno' && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-gray-600">Status:</p>
                      {isReadOnly ? (
                        <div className="text-sm text-gray-600 py-2">
                          {stepDoneValue === 'yes' ? '✅ Yes' :
                           stepDoneValue === 'no'  ? '❌ No'  :
                           <span className="text-gray-400 italic">Not yet answered</span>}
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setStepDoneValue('yes')}
                              className={cn(
                                'flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-all',
                                stepDoneValue === 'yes'
                                  ? 'border-green-500 bg-green-500 text-white'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-green-300',
                              )}
                            >
                              ✅ Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setStepDoneValue('no')}
                              className={cn(
                                'flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-all',
                                stepDoneValue === 'no'
                                  ? 'border-red-400 bg-red-400 text-white'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-red-200',
                              )}
                            >
                              ❌ No
                            </button>
                          </div>
                          {showErrors && stepDoneValue !== 'yes' && (
                            <p className="text-xs text-red-500">
                              Must be marked Yes to proceed to next step.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {currentStep.type === 'photo' && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-gray-600">
                        {isReadOnly ? 'Photos:' : 'Upload Photos:'}
                      </p>
                      {!isReadOnly && (
                        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-orange-300 bg-white px-4 py-4 hover:bg-orange-50 transition-colors">
                          <Camera className="h-6 w-6 text-orange-400" />
                          <span className="text-sm text-gray-500">Tap to add photos</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handlePhotoAdd}
                          />
                        </label>
                      )}
                      {stepPhotos.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {stepPhotos.map((url, i) => (
                            <div key={i} className="relative">
                              <img
                                src={url}
                                alt={`Photo ${i + 1}`}
                                className="w-full aspect-square object-cover rounded-lg border border-orange-200"
                              />
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => handlePhotoRemove(i)}
                                  className="absolute top-1 right-1 rounded-full bg-red-500 text-white h-5 w-5 flex items-center justify-center text-xs"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : isReadOnly ? (
                        <p className="text-xs text-gray-400 italic">No photos uploaded yet.</p>
                      ) : null}
                      {!isReadOnly && showErrors && stepPhotos.length === 0 && (
                        <p className="text-xs text-red-500">
                          At least one photo is required.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Date input */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">
                      Date completed:{!isReadOnly && <span className="text-red-500"> *</span>}
                    </label>
                    {isReadOnly ? (
                      <p className="text-sm text-gray-700 py-1">
                        {stepDate
                          ? new Date(stepDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : <span className="text-gray-400 italic">Not set</span>}
                      </p>
                    ) : (
                      <>
                        <input
                          type="date"
                          value={stepDate}
                          onChange={(e) => setStepDate(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Tab' && e.key !== 'Escape') {
                              e.preventDefault();
                            }
                          }}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300',
                            showErrors && !stepDate
                              ? 'border-red-400 bg-red-50'
                              : 'border-gray-200 bg-white',
                          )}
                        />
                        {showErrors && !stepDate && (
                          <p className="text-xs text-red-500">Date is required.</p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Per-step remark input (write path only) */}
                  {!isReadOnly && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        Remark <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        value={stepRemark}
                        onChange={(e) => setStepRemark(e.target.value)}
                        rows={2}
                        placeholder="Add a note about this step..."
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 placeholder:text-gray-300"
                      />
                      <button
                        type="button"
                        disabled={stepRemarkSaving || !stepRemark.trim()}
                        onClick={async () => {
                          if (!task || !stepRemark.trim()) return;
                          setStepRemarkSaving(true);
                          try {
                            await saveJourneyStepRemark(task.id, currentIdx, stepRemark, steps);
                            setStepRemark('');
                          } catch {
                            // error toast in hook
                          } finally {
                            setStepRemarkSaving(false);
                          }
                        }}
                        className="self-end rounded-lg border border-orange-300 bg-white hover:bg-orange-50 text-orange-700 text-xs font-semibold px-3 py-1.5 transition-all disabled:opacity-40"
                      >
                        {stepRemarkSaving ? 'Saving...' : 'Save Remark'}
                      </button>
                    </div>
                  )}

                  {/* Existing remarks on current step */}
                  {(currentStep.remarks ?? []).length > 0 && (
                    <div className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Remarks</p>
                      {[...(currentStep.remarks ?? [])].reverse().map((r, i) => {
                        const ts = r.createdAt as unknown as { toDate?: () => Date };
                        const d = r.createdAt instanceof Date ? r.createdAt : ts?.toDate?.() ?? null;
                        return (
                          <p key={i} className="text-xs text-gray-600">
                            💬 {r.text}
                            <span className="text-gray-400 ml-1 text-[10px]">
                              — {r.authorName}{d ? `, ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  )}

                  {/* Submit button */}
                  {!isReadOnly && <Button
                    onClick={handleStepSubmit}
                    disabled={submittingStep}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold h-10"
                  >
                    {submittingStep
                      ? 'Saving...'
                      : currentIdx === steps.length - 1
                      ? 'Complete Final Step ✓'
                      : `Mark Step ${currentIdx + 1} Complete →`}
                  </Button>}
                </div>
              )}

              {/* Future steps — greyed out */}
              {steps.slice(currentIdx + (allStepsDone ? 0 : 1)).map((step, idx) => (
                <div
                  key={step.stepId}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 opacity-50"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-400 text-xs font-bold">
                    {currentIdx + (allStepsDone ? idx + 1 : idx + 2)}
                  </div>
                  <p className="text-sm text-gray-400">{step.label}</p>
                </div>
              ))}

              {/* All done banner — show Convert button if not yet converted */}
              {allStepsDone && task?.pipelineStage !== 'completed' && !isReadOnly && (
                <div className="rounded-xl border-2 border-green-400 bg-green-50 px-4 py-4 flex flex-col gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-700">
                      🎉 All Steps Completed!
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      All journey steps are done. Mark this lead as converted to finalise.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={converting}
                    className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold py-3 text-base transition-all disabled:opacity-50"
                  >
                    {converting ? 'Converting...' : '✅ Mark as Converted'}
                  </button>
                </div>
              )}

              {task?.pipelineStage === 'completed' && (
                <div className="rounded-xl border-2 border-green-500 bg-green-50 px-4 py-4 text-center">
                  <p className="text-xl font-bold text-green-700">✅ Lead Converted!</p>
                  <p className="text-sm text-green-600 mt-1">
                    This lead has been successfully converted.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </SheetContent>
    </Sheet>
  );
}
