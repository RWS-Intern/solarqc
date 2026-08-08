import { useMemo, useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useQcJob } from '@/hooks/useQcJob';
import { useQcJobActions } from '@/hooks/useQcJobActions';
import { QcSection } from '@/components/qc/QcSection';
import { VerdictForm } from '@/components/qc/VerdictForm';
import { EvidenceGallery } from '@/components/qc/EvidenceGallery';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { _emitToast } from '@/components/ui/toast';
import { groupBySections, sortSectionForReview } from '@/utils/qcSections';
import { QC_STATUS_LABELS, QC_STATUS_COLOR } from '@/config/qcStatus';
import { cn } from '@/lib/utils';
import type { VerdictOutcome } from '@/components/qc/VerdictForm';

export function ApprovalReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { job, loading, error } = useQcJob(id);
  const { submitVerdict } = useQcJobActions();

  const [approverComments, setApproverComments] = useState<Record<string, string>>({});
  const [reworkPointIds,   setReworkPointIds]   = useState<string[]>([]);
  const [gallery, setGallery] = useState<{ photos: string[]; index: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Seed local review state once per job, same initializedForJobId guard
  // pattern as useQcFill — comments/flags accumulate during this review
  // session, not persisted until the verdict is actually submitted.
  const initializedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    if (initializedForId.current === job.id) return;
    initializedForId.current = job.id;
    setApproverComments(job.approverComments ?? {});
    setReworkPointIds(job.reworkPointIds ?? []);
  }, [job]);

  const sections = useMemo(() => {
    if (!job) return [];
    return groupBySections(job.template).map((s) => ({
      ...s,
      fields: sortSectionForReview(s.fields, job.answers),
    }));
  }, [job]);

  const criticalFailFields = useMemo(() => {
    if (!job) return [];
    return job.template.filter(
      (f) => f.severity === 'critical' && job.answers[f.fieldId]?.status === 'fail',
    );
  }, [job]);

  function toggleRework(fieldId: string) {
    setReworkPointIds((prev) => (
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    ));
  }

  function updateComment(fieldId: string, comment: string) {
    setApproverComments((prev) => ({ ...prev, [fieldId]: comment }));
  }

  async function handleVerdictSubmit(outcome: VerdictOutcome) {
    if (!job) return;
    setSubmitting(true);
    try {
      await submitVerdict(job, outcome, approverComments);
      _emitToast(
        outcome.kind === 'reject' ? 'Sent back for rework.' : 'Approved.',
        'success',
      );
    } catch (err) {
      console.error('[ApprovalReviewPage] submitVerdict failed:', err);
      _emitToast('Submit failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-4xl">🔒</p>
        <h1 className="text-lg font-semibold text-gray-800">This job isn't available</h1>
        <p className="text-sm text-gray-500 max-w-xs">It may not exist, or you don't have access to it.</p>
        <Button variant="outline" onClick={() => navigate('/approvals')}>Back to Approvals</Button>
      </div>
    );
  }

  const statusColor = QC_STATUS_COLOR[job.status];
  const canReview = job.status === 'pending_approval';

  const suggestedText = job.tally.suggestedVerdict === 'reject'
    ? `REJECT (${job.tally.criticalFail} critical fail${job.tally.criticalFail !== 1 ? 's' : ''})`
    : job.tally.suggestedVerdict === 'conditional' ? 'CONDITIONAL' : 'PASS';

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-start gap-2 mb-4">
        <button type="button" onClick={() => navigate('/approvals')} aria-label="Back to Approvals" className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">{job.qcNum}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusColor.bg, statusColor.text)}>
              {QC_STATUS_LABELS[job.status]}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {job.customer.name}{job.system.sizeKw ? ` · ${job.system.sizeKw} kW` : ''}
          </p>
          <p className="text-xs text-gray-400">Round {job.reworkRound + 1}</p>
        </div>
      </div>

      {!canReview && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-4 text-center text-sm text-gray-600">
          {job.status === 'approved'
            ? 'This job has already been reviewed and approved.'
            : job.status === 'rework'
            ? 'This job was sent back for rework and is back with the inspector.'
            : `This job is not awaiting approval (status: ${QC_STATUS_LABELS[job.status]}).`}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4 flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Advisory</p>
        <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
          <span>{job.tally.answered}/{job.tally.total} answered</span>
          <span className="text-green-600">✓ {job.tally.pass} Pass</span>
          <span className="text-red-600">✗ {job.tally.fail} Fail</span>
          <span className="text-gray-500">⊘ {job.tally.na} N/A</span>
          {job.tally.criticalFail > 0 && (
            <span className="text-red-700 font-bold">⚠ {job.tally.criticalFail} CRITICAL</span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          <span className="font-semibold uppercase text-gray-400">Suggested</span> (advisory only — not a real verdict): {suggestedText}
        </p>
        {criticalFailFields.length > 0 && (
          <div className="flex flex-col gap-1 pt-1">
            <p className="text-xs font-medium text-gray-500">Jump to critical fails:</p>
            <div className="flex flex-wrap gap-1.5">
              {criticalFailFields.map((f) => (
                <a
                  key={f.fieldId}
                  href={`#${f.fieldId}`}
                  className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
                >
                  {f.code ?? f.fieldId}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 pb-4">
        {sections.map((section) => (
          <QcSection
            key={section.key}
            title={section.title}
            fields={section.fields}
            answers={job.answers}
            onAnswerChange={() => {}}
            allIssues={[]}
            onCollapse={() => {}}
            jobId={job.id}
            qcNum={job.qcNum}
            disabled
            onPhotoClick={(_url, allUrls, index) => setGallery({ photos: allUrls, index })}
            approverComments={approverComments}
            onApproverCommentChange={canReview ? updateComment : undefined}
            reworkPointIds={reworkPointIds}
            onToggleRework={canReview ? toggleRework : undefined}
          />
        ))}

        {canReview && currentUser && (
          <VerdictForm
            job={job}
            currentUser={currentUser}
            reworkPointIds={reworkPointIds}
            onSubmit={handleVerdictSubmit}
            submitting={submitting}
          />
        )}
      </div>

      {gallery && (
        <EvidenceGallery
          photos={gallery.photos}
          startIndex={gallery.index}
          onClose={() => setGallery(null)}
          location={job.location}
        />
      )}
    </div>
  );
}
