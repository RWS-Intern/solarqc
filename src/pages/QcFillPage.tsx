import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useQcFill } from '@/hooks/useQcFill';
import { useQcJobActions } from '@/hooks/useQcJobActions';
import { QcSection } from '@/components/qc/QcSection';
import { QcTallyBar } from '@/components/qc/QcTallyBar';
import { SignOffBlock } from '@/components/qc/SignOffBlock';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { _emitToast } from '@/components/ui/toast';
import { validateQcJob } from '@/utils/qcValidation';
import { groupBySections } from '@/utils/qcSections';
import { QC_STATUS_LABELS, QC_STATUS_COLOR } from '@/config/qcStatus';
import { cn } from '@/lib/utils';

// A job that has left the inspector's editable states — post-submit this
// becomes 'pending_approval' immediately, and could later be
// 'approved'/'rework'/'cancelled'. Rules already reject any inspector write
// once status leaves this set; this just makes the UI honest about why.
const INSPECTOR_EDITABLE_STATUSES = ['assigned', 'in_progress', 'rework'];

export function QcFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { submitQcJob } = useQcJobActions();

  const {
    job, loading, error, hasPendingWrites,
    answers, answerField,
    location, locationCapturedAt, locationUnavailable, captureLocation,
    inspectorSignOff, customerSignOff, onInspectorSign, onCustomerSign,
    tally, dirty, saving,
    saveDraft, onSectionCollapse,
  } = useQcFill(id);

  const [criticalConfirmOpen, setCriticalConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sections = useMemo(() => groupBySections(job?.template ?? []), [job?.template]);

  // Signing implies the declaration was checked — SingleSignOff gates
  // Confirm on the checkbox internally, so a non-null signature is a
  // sufficient proxy; no separate declarationAccepted state to track.
  const allIssues = useMemo(
    () => validateQcJob(job?.template ?? [], answers, inspectorSignOff, !!inspectorSignOff),
    [job?.template, answers, inspectorSignOff],
  );

  const criticalFailFields = useMemo(() => {
    if (!job) return [];
    return job.template.filter(
      (f) => f.severity === 'critical' && answers[f.fieldId]?.status === 'fail',
    );
  }, [job, answers]);

  const noAccess = !loading && (!!error || !job || job.inspectorUid !== currentUser?.uid);

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (noAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-4xl">🔒</p>
        <h1 className="text-lg font-semibold text-gray-800">You don't have access to this job</h1>
        <p className="text-sm text-gray-500 max-w-xs">
          This job isn't assigned to you, or it no longer exists.
        </p>
        <Button variant="outline" onClick={() => navigate('/my-jobs')}>Back to My Jobs</Button>
      </div>
    );
  }

  // noAccess is false here, so job/currentUser are guaranteed non-null.
  const statusColor = QC_STATUS_COLOR[job!.status];
  const isLocked = !INSPECTOR_EDITABLE_STATUSES.includes(job!.status);

  async function performSubmit() {
    if (!job || !inspectorSignOff) return;
    setSubmitting(true);
    try {
      await submitQcJob(job.id, job.reworkRound, {
        answers, tally, location, inspectorSignOff, customerSignOff,
      });
      _emitToast('Submitted for approval.', 'success');
      setCriticalConfirmOpen(false);
    } catch (err) {
      console.error('[QcFillPage] submit failed:', err);
      _emitToast('Submit failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmitClick() {
    if (!job) return;
    // Re-run validation fresh rather than trusting the last render's
    // memoized allIssues — state may have shifted between render and click.
    const freshIssues = validateQcJob(job.template, answers, inspectorSignOff, !!inspectorSignOff);
    if (freshIssues.length > 0) {
      _emitToast(
        `Can't submit — ${freshIssues.length} outstanding issue${freshIssues.length !== 1 ? 's' : ''}.`,
        'error',
      );
      return;
    }
    if (tally.criticalFail > 0) {
      setCriticalConfirmOpen(true);
      return;
    }
    void performSubmit();
  }

  return (
    <div className="w-full max-w-2xl mx-auto -mt-5 md:-mt-5">
      <div className="sticky top-14 z-30 -mx-4 border-b border-gray-100 bg-white/95 backdrop-blur px-4 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <button type="button" onClick={() => navigate('/my-jobs')} aria-label="Back to My Jobs" className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400">{job!.qcNum}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusColor.bg, statusColor.text)}>
                {QC_STATUS_LABELS[job!.status]}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {job!.customer.name}{job!.system.sizeKw ? ` · ${job!.system.sizeKw} kW` : ''}
            </p>
            <p className="text-xs text-gray-400">Round {job!.reworkRound + 1} · {QC_STATUS_LABELS[job!.status]}</p>
          </div>
        </div>

        <div className="mt-2">
          <QcTallyBar
            tally={tally}
            location={location}
            locationCapturedAt={locationCapturedAt}
            locationUnavailable={locationUnavailable}
            onRedoLocation={captureLocation}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-3 pb-4">
        {sections.map((section) => (
          <QcSection
            key={section.key}
            title={section.title}
            fields={section.fields}
            answers={answers}
            onAnswerChange={answerField}
            allIssues={allIssues}
            onCollapse={onSectionCollapse}
            jobId={job!.id}
            qcNum={job!.qcNum}
            disabled={isLocked}
          />
        ))}

        <SignOffBlock
          jobId={job!.id}
          qcNum={job!.qcNum}
          currentUser={currentUser!}
          inspectorSignOff={inspectorSignOff}
          customerSignOff={customerSignOff}
          onInspectorSign={onInspectorSign}
          onCustomerSign={onCustomerSign}
          disabled={isLocked}
        />
      </div>

      {isLocked ? (
        <div className="sticky bottom-[4.5rem] md:bottom-0 z-30 -mx-4 border-t border-gray-100 bg-gray-50 px-4 py-3 text-center text-sm text-gray-600">
          {job!.status === 'pending_approval' ? 'Submitted — awaiting approver review.' : QC_STATUS_LABELS[job!.status]}
        </div>
      ) : (
        <div className="sticky bottom-[4.5rem] md:bottom-0 z-30 -mx-4 border-t border-gray-100 bg-white px-4 pt-2 pb-3 flex flex-col gap-2">
          {allIssues.length > 0 && (
            <p className="text-center text-xs text-amber-600">
              {allIssues.length} outstanding issue{allIssues.length !== 1 ? 's' : ''}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button variant="outline" className="flex-1" onClick={() => void saveDraft()} disabled={saving}>
              {saving ? 'Saving…' : dirty ? 'Save draft' : hasPendingWrites ? 'Saved locally — syncing…' : 'Saved'}
            </Button>
            <Button className="flex-1" onClick={handleSubmitClick} disabled={submitting || allIssues.length > 0}>
              {submitting ? 'Submitting…' : 'Submit for approval'}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={criticalConfirmOpen} onOpenChange={(o) => { if (!o && !submitting) setCriticalConfirmOpen(false); }}>
        <DialogContent className="max-w-sm" aria-describedby="critical-confirm-desc">
          <DialogHeader>
            <DialogTitle>
              Submit with {criticalFailFields.length} critical fail{criticalFailFields.length !== 1 ? 's' : ''}?
            </DialogTitle>
            <DialogDescription id="critical-confirm-desc">
              Critical fails don't block submission, but confirm this is deliberate:
              <ul className="list-disc pl-4 mt-2 space-y-0.5">
                {criticalFailFields.map((f) => (
                  <li key={f.fieldId}>{f.code ? `${f.code} — ` : ''}{f.label}</li>
                ))}
              </ul>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setCriticalConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => void performSubmit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit anyway'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
