import { useState, useEffect, useRef } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button }             from '@/components/ui/button';
import { cn }                 from '@/lib/utils';
import { useAppConfig }        from '@/hooks/useAppConfig';
import { useAuthStore }        from '@/store/authStore';
import { usePipelineActions }  from '@/hooks/usePipelineActions';
import { useDrawerBackButton } from '@/hooks/useDrawerBackButton';
import { useToast }           from '@/components/ui/toast';
import { ChecklistItem }      from '@/components/tasks/checklist/ChecklistItem';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db }                 from '@/firebase/config';
import { getProposalDocuments } from '@/utils/proposalDocuments';
import { ProposalDocumentList } from '@/components/pipeline/ProposalDocumentList';
import { logError } from '@/utils/logError';
import { computeSaleClosedEvidence } from '@/utils/computeSaleClosed';
import type { Task, SurveyStageData, ProposalStageData } from '@/types';

interface DocumentsWorkDrawerProps {
  task:    Task | null;
  onClose: () => void;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DocumentsWorkDrawer({ task, onClose }: DocumentsWorkDrawerProps) {
  const { config }          = useAppConfig();
  const { currentUser }     = useAuthStore();
  const { submitDocuments } = usePipelineActions();
  const { showToast }       = useToast();

  const [docAnswers,  setDocAnswers]  = useState<Record<string, string>>({});
  const [docPhotos,   setDocPhotos]   = useState<Record<string, string[]>>({});
  const [surveyData,  setSurveyData]  = useState<SurveyStageData | null>(null);
  const [proposalDoc, setProposalDoc] = useState<ProposalStageData | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const fetchIdRef = useRef(0);

  // Load the task's existing document progress + survey/proposal reference data when the drawer opens
  useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    if (!task) {
      setDocAnswers({});
      setDocPhotos({});
      setSurveyData(null);
      setProposalDoc(null);
      return;
    }
    setDocAnswers(task.documentAnswers ?? {});
    setDocPhotos(task.documentPhotos ?? {});
    Promise.all([
      getDoc(doc(db, 'tasks', task.id, 'stages', 'survey')),
      getDoc(doc(db, 'tasks', task.id, 'stages', 'proposal')),
    ]).then(([surveySnap, proposalSnap]) => {
      if (fetchId !== fetchIdRef.current) return;
      setSurveyData(surveySnap.exists() ? (surveySnap.data() as SurveyStageData) : null);
      if (proposalSnap.exists()) {
        setProposalDoc(proposalSnap.data() as ProposalStageData);
      } else {
        setProposalDoc(null);
      }
    }).catch((err) => {
      if (fetchId !== fetchIdRef.current) return;
      void logError('documentsWorkDrawer.fetchData', err, { taskId: task?.id });
      setSurveyData(null);
      setProposalDoc(null);
    });
  }, [task?.id]);

  // Live template — always the current admin-configured fields, not a frozen snapshot
  const sortedFields = [...(config.documentTemplate ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const missingRequired = sortedFields.some((f) => {
    if (!f.isRequired) return false;
    if (f.type === 'section_header') return false;
    if (f.type === 'photo_only') return (docPhotos[f.fieldId] ?? []).length === 0;
    return !docAnswers[f.fieldId];
  });

  function handleAnswerChange(fieldId: string, value: string) {
    setDocAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  function handlePhotosChange(fieldId: string, urls: string[]) {
    // PhotoZone falls back to base64 data: URLs when its own upload attempt fails
    // (its offline-resilience behavior, not something we can disable via props).
    // This drawer is online-only, so treat any data: URL as a hard failure —
    // drop it and keep only the successfully-uploaded (non-data:) URLs.
    const rejected = urls.filter((u) => u.startsWith('data:'));
    if (rejected.length > 0) {
      const accepted = urls.filter((u) => !u.startsWith('data:'));
      setDocPhotos((prev) => ({ ...prev, [fieldId]: accepted }));
      showToast(
        rejected.length === 1
          ? 'Upload failed — check your connection and try again. This document was not saved.'
          : `Upload failed — check your connection and try again. ${rejected.length} documents were not saved.`,
        'error',
      );
      return;
    }
    setDocPhotos((prev) => ({ ...prev, [fieldId]: urls }));
  }

  async function persistProgress(taskId: string) {
    const cfgSnap = await getDoc(doc(db, 'appConfig', 'global'));
    const saleClosedConfig = cfgSnap.data()?.['saleClosedConfig'] as
      import('@/types').SaleClosedConfig | undefined;
    const curTaskSnap = await getDoc(doc(db, 'tasks', taskId));
    const curTask = curTaskSnap.data() ?? {};
    const existingSource = curTask['saleClosedSource'] as
      'auto' | 'manual' | null | undefined;
    const newSaleClosed = computeSaleClosedEvidence(
      {
        fieldAnswers:    curTask['fieldAnswers'],
        fieldPhotos:     curTask['fieldPhotos'],
        documentAnswers: docAnswers,
        documentPhotos:  docPhotos,
      },
      saleClosedConfig,
    );
    const saleClosedUpdate = existingSource === 'manual'
      ? {}
      : { saleClosed: newSaleClosed, saleClosedSource: 'auto' as const };

    await updateDoc(doc(db, 'tasks', taskId), {
      documentAnswers: docAnswers,
      documentPhotos:  docPhotos,
      updatedAt:       serverTimestamp(),
      ...saleClosedUpdate,
    });
  }

  async function handleSaveProgress() {
    if (!task) return;
    setSaving(true);
    try {
      await persistProgress(task.id);
      showToast('Progress saved', 'success');
    } catch (err) {
      console.error('[DocumentsWorkDrawer] save progress failed:', err);
      showToast('Failed to save progress. Check your connection and try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!task || missingRequired) return;
    setSubmitting(true);
    try {
      await persistProgress(task.id);
      await submitDocuments(task.id);
      onClose();
    } catch (err) {
      console.error('[DocumentsWorkDrawer] submit failed:', err);
      showToast('Failed to submit documents. Check your connection and try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const isOpen = !!task;

  const latestEntry = task?.stageHistory?.length
    ? task.stageHistory[task.stageHistory.length - 1]
    : null;
  const showReturnBanner = !!(
    latestEntry &&
    latestEntry.note &&
    latestEntry.toStage === 'documents' &&
    latestEntry.actorRole === 'admin_override'
  );

  function guardedClose() {
    if (!submitting && !saving) onClose();
  }

  useDrawerBackButton(isOpen, guardedClose);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) guardedClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div>
            <p className="text-xs font-mono text-gray-400">{task?.taskNum}</p>
            <SheetTitle className="text-lg font-bold text-gray-900 mt-0.5">
              {task?.title}
            </SheetTitle>
          </div>
          <span className="inline-flex w-fit items-center rounded-full bg-teal-100 text-teal-700 px-2.5 py-0.5 text-xs font-semibold">
            📎 Upload Documents
          </span>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 py-5">

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

          {/* Proposal Document */}
          {getProposalDocuments(proposalDoc).length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                Proposal Document
              </p>
              <ProposalDocumentList documents={getProposalDocuments(proposalDoc)} />
            </div>
          )}

          {/* Survey reference */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Survey Reference
            </p>
            <div className="flex flex-col gap-1 text-xs text-gray-500">
              <p>
                Field Engineer: {task?.assignedToName}
                {task?.assignedToCode && (
                  <span className="ml-1 font-mono text-gray-400">({task.assignedToCode})</span>
                )}
              </p>
              {task?.assignedToMobile && (
                <p>
                  <span className="text-gray-400">Mobile: </span>
                  <a href={`tel:${task.assignedToMobile}`} className="text-blue-600 hover:underline">
                    {task.assignedToMobile}
                  </a>
                </p>
              )}
              <p>Survey completed: {formatDate(task?.submittedAt)}</p>
              {task?.location && (
                <a
                  href={`https://maps.google.com/?q=${task.location.lat},${task.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-blue underline"
                >
                  Open survey location in Maps
                </a>
              )}
            </div>
            {surveyData && Object.keys(surveyData.fieldAnswers ?? {}).length > 0 && (
              <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-gray-200">
                {(surveyData.surveyFormSnapshot ?? [])
                  .filter((f) => f.type !== 'section_header' && f.type !== 'photo_only')
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((field) => {
                    const answer = surveyData.fieldAnswers?.[field.fieldId];
                    if (!answer?.value) return null;
                    return (
                      <p key={field.fieldId} className="text-xs text-gray-600">
                        <span className="text-gray-400">{field.label}:</span>{' '}
                        {field.type === 'yesno'
                          ? answer.value === 'yes' ? '✅ Yes' : '❌ No'
                          : answer.value}
                      </p>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Document fields */}
          {sortedFields.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-6">
              No document fields configured yet. Check back later or contact your admin.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                Required Documents
              </p>
              {sortedFields.map((field) => (
                <ChecklistItem
                  key={field.fieldId}
                  field={field}
                  answer={docAnswers[field.fieldId] ?? null}
                  photos={docPhotos[field.fieldId] ?? []}
                  onAnswerChange={handleAnswerChange}
                  onPhotosChange={handlePhotosChange}
                  showError={missingRequired}
                  taskNum={task?.taskNum}
                  disabled={submitting}
                  engineerCode={currentUser?.engineerCode ?? ''}
                  engineerName={currentUser?.name ?? ''}
                  uploadType="documents"
                />
              ))}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="border-t border-gray-100 px-5 py-4 shrink-0 flex flex-col gap-2">
          <Button
            onClick={handleSubmit}
            disabled={submitting || saving || missingRequired}
            className={cn(
              'w-full h-12 text-base font-semibold',
              !missingRequired && !submitting
                ? 'bg-brand-blue hover:bg-brand-blue/90 text-white'
                : 'opacity-50 cursor-not-allowed',
            )}
          >
            {submitting ? 'Submitting...' : 'Submit Documents →'}
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveProgress}
            disabled={submitting || saving}
            className="w-full"
          >
            {saving ? 'Saving...' : 'Save Progress'}
          </Button>
          <p className="text-xs text-gray-400 text-center">
            Submitting will move the task to Backend.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
