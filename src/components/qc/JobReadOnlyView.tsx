import { useMemo } from 'react';
import { QcSection } from '@/components/qc/QcSection';
import { DcrPanelSection } from '@/components/qc/DcrPanelSection';
import { groupBySections, sortSectionForReview } from '@/utils/qcSections';
import { cn } from '@/lib/utils';
import type { QcJob, SignOff } from '@/types/qc';

const VERDICT_STYLE: Record<NonNullable<QcJob['verdict']>, { label: string; className: string }> = {
  pass:        { label: 'PASS',        className: 'text-green-600' },
  conditional: { label: 'CONDITIONAL', className: 'text-amber-600' },
  reject:      { label: 'REJECT',      className: 'text-brand-red' },
};

function formatSignedAt(d: Date): string {
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Deliberately not SignOffBlock/SingleSignOff reused here — those
// components hardcode "Inspector: {currentUser.name}", which assumes
// the viewer IS the inspector signing their own form. For a third-party
// viewer (approver, admin, viewer role) that would show the VIEWER's
// own name instead of whoever actually signed. Each SignOff already
// carries the real signer's name, so a plain display needs nothing else.
function SignOffRow({ label, signOff }: { label: string; signOff: SignOff | null }) {
  return (
    <div className="flex items-center gap-3">
      {signOff ? (
        <>
          <img
            src={signOff.signatureUrl}
            alt={`${label} signature`}
            className="h-14 w-24 rounded border border-gray-200 bg-white object-contain shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{label}: {signOff.name}</p>
            <p className="text-xs text-gray-500">Signed {formatSignedAt(signOff.signedAt)}</p>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400">{label}: not signed</p>
      )}
    </div>
  );
}

interface JobReadOnlyViewProps {
  job:           QcJob;
  onPhotoClick?: (url: string, allUrls: string[], index: number) => void;
  // Approver-review-mode extras only (ApprovalReviewPage.tsx). All
  // optional and no-ops when omitted — the plain admin/viewer route
  // (JobDetailPage.tsx) doesn't pass any of these, same "no-op in fill
  // mode when simply not passed" pattern QcSection/QcCheckItem already
  // use for review-mode extras.
  approverComments?:        Record<string, string>;
  onApproverCommentChange?: (fieldId: string, comment: string) => void;
  reworkPointIds?:          string[];
  onToggleRework?:          (fieldId: string) => void;
  // ApprovalReviewPage.tsx's existing review convenience — failed items
  // first within each section, so the approver sees what needs attention
  // without scrolling. Not applied for the plain admin/viewer route,
  // where browsing a completed record in its natural template order is
  // the more intuitive default.
  sortFailedFirst?:         boolean;
}

// The one place checklist answers (with their photos), DCR panel data,
// signatures, and verdict info get displayed with zero editing
// capability. Used by ApprovalReviewPage.tsx (the approver's own verdict
// form and rework-flagging render alongside it, via the optional props
// above) and JobDetailPage.tsx (admin/qc_manager/viewer, no actions at
// all — none of those props are passed). Genuinely read-only by
// construction: every handler below is a no-op, and firestore.rules
// independently denies these roles from writing answers/system.panels
// regardless of what this UI does or doesn't expose.
export function JobReadOnlyView({
  job, onPhotoClick, approverComments, onApproverCommentChange, reworkPointIds, onToggleRework, sortFailedFirst,
}: JobReadOnlyViewProps) {
  const sections = useMemo(() => {
    const grouped = groupBySections(job.template);
    if (!sortFailedFirst) return grouped;
    return grouped.map((s) => ({ ...s, fields: sortSectionForReview(s.fields, job.answers) }));
  }, [job.template, job.answers, sortFailedFirst]);
  const verdict = job.verdict ? VERDICT_STYLE[job.verdict] : null;

  return (
    <div className="flex flex-col gap-3">
      {job.system.moduleType === 'dcr' && (
        <DcrPanelSection
          panels={job.system.panels}
          onSetPanelCount={() => {}}
          onUpdateSerial={() => {}}
          onPanelPhotoChange={() => {}}
          jobId={job.id}
          qcNum={job.qcNum}
          disabled
          allIssues={[]}
          onPhotoClick={onPhotoClick}
        />
      )}

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
          onPhotoClick={onPhotoClick}
          approverComments={approverComments}
          onApproverCommentChange={onApproverCommentChange}
          reworkPointIds={reworkPointIds}
          onToggleRework={onToggleRework}
        />
      ))}

      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Sign-off</p>
        <SignOffRow label="Inspector" signOff={job.inspectorSignOff} />
        <SignOffRow label="Customer" signOff={job.customerSignOff} />
        <SignOffRow label="Approver" signOff={job.approverSignOff} />
      </div>

      {verdict && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Verdict</p>
          <p className={cn('text-sm font-bold', verdict.className)}>{verdict.label}</p>
          {job.verdictNote && <p className="text-sm text-gray-700">{job.verdictNote}</p>}
          {job.conditions && <p className="text-xs text-gray-500">Conditions: {job.conditions}</p>}
          {job.rejectionReason && <p className="text-xs text-gray-500">Rejection reason: {job.rejectionReason}</p>}
        </div>
      )}
    </div>
  );
}
