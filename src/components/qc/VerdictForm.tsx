import { useState } from 'react';
import { SingleSignOff } from '@/components/qc/SingleSignOff';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAppConfig } from '@/hooks/useAppConfig';
import { cn } from '@/lib/utils';
import type { AppUser } from '@/types';
import type { QcJob, SignOff } from '@/types/qc';

export type VerdictOutcome =
  | { kind: 'approve';     verdictNote: string; approverSignOff: SignOff }
  | { kind: 'conditional'; verdictNote: string; conditions: string; approverSignOff: SignOff }
  | { kind: 'reject';      verdictNote: string; rejectionReason: string; reworkPointIds: string[]; approverSignOff: SignOff };

interface VerdictFormProps {
  job:             QcJob;
  currentUser:     AppUser;
  reworkPointIds:  string[];
  onSubmit:        (outcome: VerdictOutcome) => void | Promise<void>;
  submitting:      boolean;
}

// The verdict note textarea is always visible and required for any
// outcome. conditions/rejectionReason are also both visible
// unconditionally rather than progressively revealed — simpler to
// implement correctly than a dynamic show/hide wizard — and each is
// only actually enforced when its matching button is the one clicked.
export function VerdictForm({ job, currentUser, reworkPointIds, onSubmit, submitting }: VerdictFormProps) {
  const { config } = useAppConfig();
  const [verdictNote, setVerdictNote] = useState('');
  const [conditions, setConditions] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  // Local only — the approver's signature has no draft concept; it's
  // uploaded immediately on confirm (same as inspector/customer) but only
  // ever persisted as part of the final submitVerdict batch write.
  const [approverSignOff, setApproverSignOff] = useState<SignOff | null>(null);

  const approverDeclaration = config.declarationTexts?.approver
    ?? 'I certify that I have reviewed the above QC record and the verdict recorded is my own.';

  const flaggedFields = job.template.filter((f) => reworkPointIds.includes(f.fieldId));

  const hasNoteAndSignature = verdictNote.trim().length > 0 && !!approverSignOff;
  const canApprove            = hasNoteAndSignature;
  const canApproveConditional = hasNoteAndSignature && conditions.trim().length > 0;
  const canReject              = hasNoteAndSignature && rejectionReason.trim().length > 0 && reworkPointIds.length > 0;

  function handleApprove() {
    if (!approverSignOff || !canApprove) return;
    void onSubmit({ kind: 'approve', verdictNote, approverSignOff });
  }
  function handleApproveConditional() {
    if (!approverSignOff || !canApproveConditional) return;
    void onSubmit({ kind: 'conditional', verdictNote, conditions, approverSignOff });
  }
  function handleReject() {
    if (!approverSignOff || !canReject) return;
    void onSubmit({ kind: 'reject', verdictNote, rejectionReason, reworkPointIds, approverSignOff });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-4">
      <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Verdict</p>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">
          Verdict note <span className="text-brand-red">(required)</span>
        </label>
        <Textarea
          value={verdictNote}
          onChange={(e) => setVerdictNote(e.target.value)}
          placeholder="Your assessment, in your own words."
          disabled={submitting}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">
          Conditions <span className="text-gray-400">(required only for Approve with conditions)</span>
        </label>
        <Textarea
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          placeholder="e.g. Re-torque mounting bolts within 30 days."
          disabled={submitting}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">
          Rejection reason <span className="text-gray-400">(required only for Reject)</span>
        </label>
        <Textarea
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Why this job is being sent back."
          disabled={submitting}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-gray-500">
          Flagged for rework {reworkPointIds.length > 0 && `(${reworkPointIds.length})`}
        </p>
        {flaggedFields.length === 0 ? (
          <p className="text-xs text-gray-400">No points flagged yet — check "Flag for rework" on a point above.</p>
        ) : (
          <ul className="list-disc pl-4 text-xs text-gray-600 space-y-0.5">
            {flaggedFields.map((f) => (
              <li key={f.fieldId}>{f.code ? `${f.code} — ` : ''}{f.label}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
        <p className="text-sm font-medium text-gray-900">
          Approver: {currentUser.name} ({currentUser.engineerCode ?? currentUser.uid})
        </p>
        <SingleSignOff
          role="approver"
          name={currentUser.name}
          uid={currentUser.uid}
          designation={currentUser.role}
          declaration={approverDeclaration}
          existing={approverSignOff}
          onSign={(signOff) => setApproverSignOff({ ...signOff, signedAt: new Date() })}
          qcNum={job.qcNum}
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <Button
          className="w-full"
          onClick={handleApprove}
          disabled={!canApprove || submitting}
        >
          {submitting ? 'Submitting…' : 'Approve'}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleApproveConditional}
          disabled={!canApproveConditional || submitting}
        >
          Approve with conditions
        </Button>
        <Button
          variant="outline"
          className={cn('w-full border-brand-red text-brand-red hover:bg-red-50')}
          onClick={handleReject}
          disabled={!canReject || submitting}
        >
          Reject &amp; send for rework
        </Button>
      </div>
    </div>
  );
}
