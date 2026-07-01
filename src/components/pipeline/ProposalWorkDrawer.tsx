import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, X, Download } from 'lucide-react';
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
import type { Task, ProposalStageData, SurveyStageData } from '@/types';

interface ProposalWorkDrawerProps {
  task:    Task | null;
  onClose: () => void;
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
  const { submitProposal } = usePipelineActions();
  const { showToast }      = useToast();
  const fileInputRef       = useRef<HTMLInputElement>(null);

  const [selectedFile,    setSelectedFile]    = useState<File | null>(null);
  const [uploading,       setUploading]        = useState(false);
  const [uploadProgress,  setUploadProgress]  = useState(0);
  const [submitting,      setSubmitting]       = useState(false);
  const [existingData,    setExistingData]    = useState<ProposalStageData | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [surveyData,      setSurveyData]      = useState<SurveyStageData | null>(null);

  // Load existing proposal + survey stage data when drawer opens
  useEffect(() => {
    if (!task) {
      setSelectedFile(null);
      setUploadProgress(0);
      setExistingData(null);
      setSurveyData(null);
      return;
    }
    setLoadingExisting(true);
    getDoc(doc(db, 'tasks', task.id, 'stages', 'proposal'))
      .then((snap) => {
        if (snap.exists()) setExistingData(snap.data() as ProposalStageData);
        else setExistingData(null);
      })
      .catch(() => setExistingData(null))
      .finally(() => setLoadingExisting(false));
    getDoc(doc(db, 'tasks', task.id, 'stages', 'survey'))
      .then((snap) => {
        if (snap.exists()) setSurveyData(snap.data() as SurveyStageData);
        else setSurveyData(null);
      })
      .catch(() => setSurveyData(null));
  }, [task?.id]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are allowed for proposals.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('File size must be under 20MB.');
      return;
    }
    setSelectedFile(file);
  }

  async function handleSubmit() {
    if (!task || !selectedFile) return;
    setSubmitting(true);
    try {
      setUploading(true);
      const result = await uploadToCloudinary(selectedFile, {
        onProgress:  (p) => setUploadProgress(p),
        taskNum:     task.taskNum,
        uploadType:  'proposal',
      });
      setUploading(false);

      await submitProposal(task.id, result.url, selectedFile.name);
      setSelectedFile(null);
      onClose();
    } catch (err) {
      console.error('[ProposalWorkDrawer] submit failed:', err);
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  const isOpen = !!task;

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
          {existingData?.documentUrl && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                Previous Proposal
              </p>
              <a
                href={existingData.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"
              >
                <Download className="h-4 w-4" />
                {existingData.documentName}
              </a>
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
              Upload Proposal Document <span className="text-red-500">*</span>
            </p>

            {!selectedFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-colors px-6 py-8 flex flex-col items-center gap-2 text-center"
              >
                <Upload className="h-8 w-8 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">Click to select PDF</p>
                <p className="text-xs text-gray-400">PDF only · Max 20MB</p>
              </button>
            ) : (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
                <FileText className="h-8 w-8 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                  {uploading && (
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-green-200">
                      <div
                        className="h-1.5 rounded-full bg-green-500 transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                </div>
                {!uploading && !submitting && (
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            disabled={!selectedFile || submitting || uploading}
            className={cn(
              'w-full h-12 text-base font-semibold',
              selectedFile && !submitting
                ? 'bg-brand-blue hover:bg-brand-blue/90 text-white'
                : 'opacity-50 cursor-not-allowed',
            )}
          >
            {submitting
              ? uploading
                ? `Uploading... ${uploadProgress}%`
                : 'Submitting...'
              : 'Submit Proposal →'}
          </Button>
          <p className="text-xs text-gray-400 text-center -mt-3">
            This will move the task to Field Review stage.
          </p>

          {/* Submission history — shown after first proposal submitted */}
          {existingData?.documentUrl && (
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Proposal History
              </p>

              {/* All previous revisions */}
              {(existingData.revisions ?? []).map((rev, i) => {
                const revDate = (rev.uploadedAt as unknown as { toDate?: () => Date })?.toDate?.()
                  ?? (rev.uploadedAt instanceof Date ? rev.uploadedAt : new Date());
                return (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className="text-lg">📄</span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={rev.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="text-sm font-medium text-brand-blue hover:underline truncate block"
                      >
                        {rev.documentName}
                      </a>
                      <p className="text-xs text-gray-400">
                        Revision {i + 1} · {rev.uploadedByName} ·{' '}
                        {revDate.toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Current submitted proposal */}
              <div className="flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                <span className="text-lg">📄</span>
                <div className="flex-1 min-w-0">
                  <a
                    href={existingData.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="text-sm font-medium text-purple-700 hover:underline truncate block"
                  >
                    {existingData.documentName}
                  </a>
                  <p className="text-xs text-purple-500">
                    Latest · {existingData.uploadedByName} ·{' '}
                    {((existingData.uploadedAt as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date())
                      .toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
