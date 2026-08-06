import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button }             from '@/components/ui/button';
import { cn }                 from '@/lib/utils';
import { uploadToCloudinary } from '@/utils/uploadToCloudinary';
import { usePipelineActions } from '@/hooks/usePipelineActions';
import { useToast }           from '@/components/ui/toast';
import { doc, getDoc }        from 'firebase/firestore';
import { db }                 from '@/firebase/config';
import { getProposalDocuments } from '@/utils/proposalDocuments';
import { ProposalDocumentList } from '@/components/pipeline/ProposalDocumentList';
import { logError } from '@/utils/logError';
import type { Task, ProposalStageData, SurveyStageData } from '@/types';

interface ProposalWorkDrawerProps {
  task:    Task | null;
  onClose: () => void;
}

// The stages/field_review doc's real written shape (see submitFieldReviewDecision in
// usePipelineActions.ts) doesn't match the FieldReviewStageData type in @/types, so it's
// declared locally here rather than reusing that mismatched shared type.
interface FieldReviewDecisionData {
  decision?:     'accepted' | 'rejected' | 'revision';
  revisionNote?: string;
  decidedAt?:    { toDate?: () => Date } | Date;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProposalWorkDrawer({ task, onClose }: ProposalWorkDrawerProps) {
  const { submitProposal, updateProposalRemark } = usePipelineActions();
  const { showToast }      = useToast();
  const fileInputRef       = useRef<HTMLInputElement>(null);

  const [selectedFiles,   setSelectedFiles]    = useState<File[]>([]);
  const [fileProgress,    setFileProgress]    = useState<number[]>([]);
  const [uploading,       setUploading]        = useState(false);
  const [submitting,      setSubmitting]       = useState(false);
  const [existingData,    setExistingData]    = useState<ProposalStageData | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [surveyData,      setSurveyData]      = useState<SurveyStageData | null>(null);
  const [fieldReviewData, setFieldReviewData] = useState<FieldReviewDecisionData | null>(null);
  const fetchIdRef = useRef(0);

  // Per-upload note
  const [uploadNote, setUploadNote] = useState('');

  // Universal proposal remark
  const [proposalRemark,        setProposalRemark]        = useState('');
  const [editingProposalRemark, setEditingProposalRemark] = useState(false);
  const [proposalRemarkSaving,  setProposalRemarkSaving]  = useState(false);

  // Load existing proposal + survey + field_review stage data when drawer opens
  useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    if (!task) {
      setSelectedFiles([]);
      setFileProgress([]);
      setUploadNote('');
      setExistingData(null);
      setSurveyData(null);
      setFieldReviewData(null);
      setProposalRemark('');
      setEditingProposalRemark(false);
      return;
    }
    setProposalRemark(task.proposalRemark ?? '');
    setEditingProposalRemark(false);
    setLoadingExisting(true);
    getDoc(doc(db, 'tasks', task.id, 'stages', 'proposal'))
      .then((snap) => {
        if (fetchId !== fetchIdRef.current) return;
        if (snap.exists()) setExistingData(snap.data() as ProposalStageData);
        else setExistingData(null);
      })
      .catch((err) => { if (fetchId !== fetchIdRef.current) return; void logError('proposalWorkDrawer.fetchExistingData', err, { taskId: task?.id }); setExistingData(null); })
      .finally(() => { if (fetchId !== fetchIdRef.current) return; setLoadingExisting(false); });
    getDoc(doc(db, 'tasks', task.id, 'stages', 'survey'))
      .then((snap) => {
        if (fetchId !== fetchIdRef.current) return;
        if (snap.exists()) setSurveyData(snap.data() as SurveyStageData);
        else setSurveyData(null);
      })
      .catch((err) => { if (fetchId !== fetchIdRef.current) return; void logError('proposalWorkDrawer.fetchSurveyData', err, { taskId: task?.id }); setSurveyData(null); });
    getDoc(doc(db, 'tasks', task.id, 'stages', 'field_review'))
      .then((snap) => {
        if (fetchId !== fetchIdRef.current) return;
        if (snap.exists()) setFieldReviewData(snap.data() as FieldReviewDecisionData);
        else setFieldReviewData(null);
      })
      .catch((err) => { if (fetchId !== fetchIdRef.current) return; void logError('proposalWorkDrawer.fetchFieldReviewData', err, { taskId: task?.id }); setFieldReviewData(null); });
  }, [task?.id]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (file.type !== 'application/pdf') {
        showToast(`"${file.name}" is not a PDF. Only PDF files are allowed for proposals.`, 'error');
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        showToast(`"${file.name}" exceeds the 20MB limit.`, 'error');
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    }
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!task || selectedFiles.length === 0) return;
    setSubmitting(true);
    setUploading(true);
    setFileProgress(selectedFiles.map(() => 0));
    try {
      // Upload every file in parallel. If any single one fails, Promise.all
      // rejects with that specific file's error (via the .catch below), and
      // nothing is submitted — no partial set ever reaches submitProposal.
      const results = await Promise.all(
        selectedFiles.map((file, i) =>
          uploadToCloudinary(file, {
            onProgress: (p) => setFileProgress((prev) => {
              const next = [...prev];
              next[i] = p;
              return next;
            }),
            taskNum:    task.taskNum,
            uploadType: 'proposal',
          })
            .then((result) => ({ url: result.url, name: file.name }))
            .catch((err) => {
              void logError('proposalWorkDrawer.fileUpload', err, { taskId: task?.id });
              throw new Error(`Failed to upload "${file.name}": ${err instanceof Error ? err.message : 'unknown error'}`);
            })
        ),
      );
      setUploading(false);

      await submitProposal(task.id, results, uploadNote.trim() || undefined);
      setSelectedFiles([]);
      setFileProgress([]);
      setUploadNote('');
      onClose();
    } catch (err) {
      console.error('[ProposalWorkDrawer] submit failed:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to upload files. Try again.',
        'error',
      );
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  const avgProgress = fileProgress.length > 0
    ? Math.round(fileProgress.reduce((a, b) => a + b, 0) / fileProgress.length)
    : 0;

  const isOpen = !!task;

  const latestEntry = task?.stageHistory?.length
    ? task.stageHistory[task.stageHistory.length - 1]
    : null;
  const showReturnBanner = !!(
    latestEntry &&
    latestEntry.note &&
    latestEntry.toStage === 'proposal' &&
    latestEntry.actorRole === 'admin_override'
  );

  function toJsDate(v: unknown): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    const maybeTimestamp = v as { toDate?: () => Date };
    return maybeTimestamp.toDate?.() ?? null;
  }

  const overrideTime = showReturnBanner ? toJsDate(latestEntry?.timestamp) : null;
  const revisionTime = (task?.proposalRevisionCount ?? 0) > 0 && fieldReviewData?.revisionNote?.trim()
    ? toJsDate(fieldReviewData.decidedAt)
    : null;

  const showBothBanners = !!(overrideTime && revisionTime);
  const overrideIsNewer = !!(overrideTime && revisionTime && overrideTime.getTime() > revisionTime.getTime());

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
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
          </div>
          {(task?.proposalRevisionCount ?? 0) > 0 && (
            <span className="inline-flex w-fit items-center rounded-full bg-orange-100 text-orange-700 px-2.5 py-0.5 text-xs font-semibold">
              Revision {task?.proposalRevisionCount}
            </span>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 py-5">

          {/* Override banner — full, shown first when override is newer or is the only one */}
          {overrideTime && (!showBothBanners || overrideIsNewer) && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">
                ⚠️ Sent Back By Admin{showBothBanners && <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px]">Latest</span>}
              </p>
              <p className="text-sm font-semibold text-amber-900">{latestEntry?.note}</p>
            </div>
          )}

          {/* Revision banner — full, shown first when revision is newer or is the only one */}
          {revisionTime && (!showBothBanners || !overrideIsNewer) && (
            <div className="rounded-lg border-2 border-orange-300 bg-orange-50 px-4 py-3">
              <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-1">
                🔄 Revision Requested{showBothBanners && <span className="ml-1 rounded-full bg-orange-200 px-2 py-0.5 text-[10px]">Latest</span>}
              </p>
              <p className="text-sm text-orange-800 whitespace-pre-wrap">{fieldReviewData?.revisionNote}</p>
            </div>
          )}

          {/* Override banner — faded, shown second when revision is newer */}
          {overrideTime && showBothBanners && !overrideIsNewer && (
            <div className="rounded-lg border-2 border-amber-200 bg-amber-50/50 px-4 py-3 opacity-70">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">⚠️ Sent Back By Admin (earlier)</p>
              <p className="text-sm text-amber-800">{latestEntry?.note}</p>
            </div>
          )}

          {/* Revision banner — faded, shown second when override is newer */}
          {revisionTime && showBothBanners && overrideIsNewer && (
            <div className="rounded-lg border-2 border-orange-200 bg-orange-50/50 px-4 py-3 opacity-70">
              <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-1">🔄 Revision Requested (earlier)</p>
              <p className="text-sm text-orange-700 whitespace-pre-wrap">{fieldReviewData?.revisionNote}</p>
            </div>
          )}

          {/* ── Proposal Remark (universal / lead-level, internal only) ── */}
          <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                Proposal Remark
              </p>
              {!editingProposalRemark && (
                <button
                  type="button"
                  onClick={() => { setProposalRemark(task?.proposalRemark ?? ''); setEditingProposalRemark(true); }}
                  className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 transition-colors"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>
            {editingProposalRemark ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={proposalRemark}
                  onChange={(e) => setProposalRemark(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Add an internal note about this lead..."
                  className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 placeholder:text-gray-300"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={proposalRemarkSaving}
                    onClick={async () => {
                      if (!task) return;
                      setProposalRemarkSaving(true);
                      try {
                        await updateProposalRemark(task.id, proposalRemark);
                        setEditingProposalRemark(false);
                      } catch {
                        // error toast in hook
                      } finally {
                        setProposalRemarkSaving(false);
                      }
                    }}
                    className="rounded-lg bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 transition-all"
                  >
                    {proposalRemarkSaving ? 'Saving...' : 'Save Remark'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingProposalRemark(false); setProposalRemark(task?.proposalRemark ?? ''); }}
                    className="rounded-lg border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : task?.proposalRemark ? (
              <>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.proposalRemark}</p>
                {task.proposalRemarkUpdatedBy && (
                  <p className="text-[10px] text-purple-600 mt-1">
                    Last updated by {task.proposalRemarkUpdatedBy}
                    {task.proposalRemarkUpdatedAt && ` on ${task.proposalRemarkUpdatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">No internal remark yet.</p>
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

          {/* Survey reference data */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Survey Reference
            </p>
            <div className="flex flex-col gap-1 text-sm text-gray-700">
              <p>
                <span className="text-gray-400">Field Engineer:</span>{' '}
                {task?.assignedToName}
                {task?.assignedToCode && (
                  <span className="ml-1 font-mono text-xs text-gray-400">({task.assignedToCode})</span>
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
              <p>
                <span className="text-gray-400">Survey completed:</span>{' '}
                {formatDate(task?.submittedAt)}
              </p>
              {task?.location && (
                <p>
                  <span className="text-gray-400">Location:</span>{' '}
                  <a
                    href={`https://maps.google.com/?q=${task.location.lat},${task.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue underline text-xs"
                  >
                    Open in Maps
                  </a>
                </p>
              )}
            </div>
          </div>

          {/* Survey answers */}
          {surveyData && Object.keys(surveyData.fieldAnswers ?? {}).length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Survey Answers
              </p>
              <div className="flex flex-col gap-2">
                {(surveyData.surveyFormSnapshot ?? [])
                  .filter((f) => f.type !== 'section_header' && f.type !== 'photo_only')
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((field) => {
                    const answer = surveyData.fieldAnswers?.[field.fieldId];
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

              {/* Survey photos */}
              {Object.values(surveyData.fieldPhotos ?? {}).flat().length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-2">Survey Photos</p>
                  {(() => {
                    const photos    = surveyData.fieldPhotos ?? {};
                    const allPhotos = Object.values(photos).flat().filter((url) =>
                      !url.toLowerCase().includes('.pdf') && !url.toLowerCase().includes('/raw/upload/')
                    );
                    const allDocs   = Object.values(photos).flat().filter((url) =>
                      url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/raw/upload/')
                    );
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
                    {Object.values(surveyData.fieldPhotos ?? {}).flat().map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Survey photo ${i + 1}`}
                          className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Previous proposal (revision case) */}
          {existingData && getProposalDocuments(existingData).length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                Previous Proposal
              </p>
              <ProposalDocumentList documents={getProposalDocuments(existingData)} />
              {existingData.proposalNote && (
                <p className="text-xs text-blue-700 mt-2 italic">
                  💬 Your note from last upload: {existingData.proposalNote}
                </p>
              )}
              {(existingData.revisions?.length ?? 0) > 0 && (
                <p className="text-xs text-blue-500 mt-1">
                  + {existingData.revisions.length} earlier version{existingData.revisions.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {loadingExisting && (
            <div className="h-6 animate-pulse rounded bg-gray-100" />
          )}

          {/* Upload section */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">
              Upload Proposal Document{selectedFiles.length > 1 ? 's' : ''} <span className="text-red-500">*</span>
            </p>

            {selectedFiles.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-colors px-6 py-8 flex flex-col items-center gap-2 text-center"
              >
                <Upload className="h-8 w-8 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">Click to select PDF files</p>
                <p className="text-xs text-gray-400">PDF only · Max 20MB each</p>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedFiles.map((file, i) => (
                  <div key={i} className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
                    <FileText className="h-8 w-8 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      {uploading && (
                        <div className="mt-1.5 h-1.5 w-full rounded-full bg-green-200">
                          <div
                            className="h-1.5 rounded-full bg-green-500 transition-all"
                            style={{ width: `${fileProgress[i] ?? 0}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {!uploading && !submitting && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(i)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {!uploading && !submitting && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-colors py-3 text-sm font-medium text-gray-500"
                  >
                    + Add more files
                  </button>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Per-upload note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">
              Note for Field Engineer{' '}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={uploadNote}
              onChange={(e) => setUploadNote(e.target.value)}
              rows={2}
              placeholder="Any context the field engineer should know..."
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 placeholder:text-gray-300"
            />
          </div>

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            disabled={selectedFiles.length === 0 || submitting || uploading}
            className={cn(
              'w-full h-12 text-base font-semibold',
              selectedFiles.length > 0 && !submitting
                ? 'bg-brand-blue hover:bg-brand-blue/90 text-white'
                : 'opacity-50 cursor-not-allowed',
            )}
          >
            {submitting
              ? uploading
                ? `Uploading... ${avgProgress}%`
                : 'Submitting...'
              : 'Submit Proposal →'}
          </Button>
          <p className="text-xs text-gray-400 text-center -mt-3">
            This will move the task to Field Review stage.
          </p>

          {/* Submission history — shown after first proposal submitted */}
          {existingData && getProposalDocuments(existingData).length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Proposal History
              </p>

              {/* Current submitted proposal — always at the top (newest of all) */}
              <div className="flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                <span className="text-lg">📄</span>
                <div className="flex-1 min-w-0">
                  <ProposalDocumentList documents={getProposalDocuments(existingData)} />
                  <p className="text-xs text-purple-500">
                    Latest · {existingData.uploadedByName} ·{' '}
                    {((existingData.uploadedAt as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date())
                      .toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                  </p>
                </div>
              </div>

              {/* Past revisions — newest first, but chronological label (Revision 1 = first ever) */}
              {[...(existingData.revisions ?? [])].reverse().map((rev, revIdx) => {
                const totalRevisions = existingData.revisions?.length ?? 0;
                const revDate = (rev.uploadedAt as unknown as { toDate?: () => Date })?.toDate?.()
                  ?? (rev.uploadedAt instanceof Date ? rev.uploadedAt : new Date());
                // Original chronological label: newest item displayed (revIdx=0) gets the highest number
                const revisionLabel = totalRevisions - revIdx;
                return (
                  <div key={revIdx} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className="text-lg">📄</span>
                    <div className="flex-1 min-w-0">
                      <ProposalDocumentList documents={getProposalDocuments(rev)} />
                      <p className="text-xs text-gray-400">
                        Revision {revisionLabel} · {rev.uploadedByName} ·{' '}
                        {revDate.toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </p>
                      {rev.revisionNote && (
                        <p className="text-xs text-gray-500 italic mt-0.5">💬 {rev.revisionNote}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
