import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button }             from '@/components/ui/button';
import { Textarea }           from '@/components/ui/textarea';
import { cn }                 from '@/lib/utils';
import { usePipelineActions }  from '@/hooks/usePipelineActions';
import { useAppConfig }        from '@/hooks/useAppConfig';
import { useDrawerBackButton } from '@/hooks/useDrawerBackButton';
import { doc, getDoc }        from 'firebase/firestore';
import { db }                 from '@/firebase/config';
import { getProposalDocuments } from '@/utils/proposalDocuments';
import { ProposalDocumentList } from '@/components/pipeline/ProposalDocumentList';
import { logError } from '@/utils/logError';
import type { Task, ProposalStageData } from '@/types';

interface FieldReviewDrawerProps {
  task:    Task | null;
  onClose: () => void;
  onAcceptedToDocuments?: (task: Task) => void;
}

type DecisionType = 'accepted' | 'rejected' | 'revision' | null;

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function FieldReviewDrawer({ task, onClose, onAcceptedToDocuments }: FieldReviewDrawerProps) {
  const { submitFieldReviewDecision } = usePipelineActions();
  const { config }                    = useAppConfig();
  const hasDocumentFields = (config.documentTemplate?.length ?? 0) > 0;

  const [proposalData,    setProposalData]    = useState<ProposalStageData | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [decision,        setDecision]        = useState<DecisionType>(null);
  const [revisionNote,    setRevisionNote]    = useState('');
  const [confirming,      setConfirming]      = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const fetchIdRef = useRef(0);

  // Load proposal stage data when drawer opens; reset decision state on every task change
  useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    setDecision(null);
    setRevisionNote('');
    setConfirming(false);
    if (!task) {
      setProposalData(null);
      return;
    }
    setLoadingProposal(true);
    getDoc(doc(db, 'tasks', task.id, 'stages', 'proposal'))
      .then((snap) => {
        if (fetchId !== fetchIdRef.current) return;
        if (snap.exists()) setProposalData(snap.data() as ProposalStageData);
        else setProposalData(null);
      })
      .catch((err) => { if (fetchId !== fetchIdRef.current) return; void logError('fieldReviewDrawer.fetchProposalData', err, { taskId: task?.id }); setProposalData(null); })
      .finally(() => { if (fetchId !== fetchIdRef.current) return; setLoadingProposal(false); });
  }, [task?.id]);

  async function handleConfirm() {
    if (!task || !decision) return;
    if (decision === 'revision' && !revisionNote.trim()) return;
    setSubmitting(true);
    try {
      const targetStage = await submitFieldReviewDecision(
        task.id,
        decision,
        revisionNote.trim(),
        {
          fieldAnswers: task.fieldAnswers,
          fieldPhotos:  task.fieldPhotos,
          location:     task.location,
          fields:       task.fields,
          submittedAt:  task.submittedAt,
        },
      );
      if (decision === 'accepted' && targetStage === 'documents' && onAcceptedToDocuments) {
        onAcceptedToDocuments(task);
      } else {
        onClose();
      }
    } catch {
      // error toast handled in usePipelineActions
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  const isOpen = !!task;
  const proposalAvailable = getProposalDocuments(proposalData).length > 0;

  const latestEntry = task?.stageHistory?.length
    ? task.stageHistory[task.stageHistory.length - 1]
    : null;
  const showReturnBanner = !!(
    latestEntry &&
    latestEntry.note &&
    latestEntry.toStage === 'field_review' &&
    latestEntry.actorRole === 'admin_override'
  );

  function guardedClose() {
    if (!submitting) onClose();
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
          <span className="inline-flex w-fit items-center rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-semibold">
            👁️ Awaiting Your Review
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

          {/* Proposal document */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Proposal Document
            </p>
            {loadingProposal ? (
              <div className="h-8 animate-pulse rounded bg-gray-200" />
            ) : proposalAvailable ? (
              <div className="flex flex-col gap-2">
                <ProposalDocumentList documents={getProposalDocuments(proposalData)} />
                {proposalData?.proposalNote && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                    <p className="text-xs text-blue-700">
                      📝 Note from Proposal Team: {proposalData.proposalNote}
                    </p>
                  </div>
                )}
                {(task?.proposalRevisionCount ?? 0) > 0 && (
                  <p className="text-xs text-orange-600">
                    Revision {task?.proposalRevisionCount} — updated proposal
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                No proposal document available yet.
              </p>
            )}
          </div>

          {/* Decision buttons — only show if proposal is available */}
          {proposalAvailable && !confirming && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-700">
                Consumer's Decision:
              </p>

              <button
                type="button"
                onClick={() => { setDecision('accepted'); setConfirming(true); }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
                  decision === 'accepted'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50',
                )}
              >
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-800">Accept Proposal</p>
                  <p className="text-xs text-gray-500">
                    Consumer agreed — move to {hasDocumentFields ? 'Documents' : 'Backend'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setDecision('revision'); setConfirming(true); }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
                  decision === 'revision'
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50',
                )}
              >
                <RefreshCw className="h-5 w-5 text-orange-500 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-800">Request Revision</p>
                  <p className="text-xs text-gray-500">Consumer wants changes</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setDecision('rejected'); setConfirming(true); }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
                  decision === 'rejected'
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 bg-white hover:border-red-300 hover:bg-red-50',
                )}
              >
                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-800">Reject Proposal</p>
                  <p className="text-xs text-gray-500">Consumer declined — drop this lead</p>
                </div>
              </button>
            </div>
          )}

          {/* Confirmation step */}
          {confirming && decision && (
            <div className={cn(
              'flex flex-col gap-3 rounded-xl border-2 p-4',
              decision === 'accepted' ? 'border-green-400 bg-green-50'  :
              decision === 'rejected' ? 'border-red-400   bg-red-50'    :
                                        'border-orange-400 bg-orange-50',
            )}>
              <p className="font-semibold text-gray-800">
                {decision === 'accepted' ? '✅ Confirm: Accept Proposal'   :
                 decision === 'rejected' ? '❌ Confirm: Reject Proposal'   :
                                           '🔄 Confirm: Request Revision'}
              </p>

              {(decision === 'revision' || decision === 'rejected') && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {decision === 'revision' ? 'What needs to change? *' : 'Reason for rejection (optional)'}
                  </label>
                  <Textarea
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder={
                      decision === 'revision'
                        ? 'e.g. Consumer wants 10kW system instead of 5kW...'
                        : 'e.g. Consumer went with another vendor...'
                    }
                    className="text-sm min-h-[80px]"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleConfirm}
                  disabled={submitting || (decision === 'revision' && !revisionNote.trim())}
                  className={cn(
                    'flex-1',
                    decision === 'accepted' ? 'bg-green-600 hover:bg-green-700 text-white' :
                    decision === 'rejected' ? 'bg-red-600   hover:bg-red-700   text-white' :
                                              'bg-orange-500 hover:bg-orange-600 text-white',
                  )}
                >
                  {submitting ? 'Submitting...' : 'Confirm'}
                </Button>
                <Button
                  onClick={() => { setConfirming(false); setDecision(null); setRevisionNote(''); }}
                  disabled={submitting}
                  variant="outline"
                  className="flex-1"
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Survey reference */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Survey Reference
            </p>
            <div className="flex flex-col gap-1 text-xs text-gray-500">
              {task?.assignedToName && (
                <p>
                  <span className="text-gray-400">Field Engineer: </span>
                  {task.assignedToName}
                  {task.assignedToCode && (
                    <span className="ml-1 font-mono text-gray-400">({task.assignedToCode})</span>
                  )}
                </p>
              )}
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
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
