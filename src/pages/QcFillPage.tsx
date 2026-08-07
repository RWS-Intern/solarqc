import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useQcFill } from '@/hooks/useQcFill';
import { QcSection } from '@/components/qc/QcSection';
import { QcTallyBar } from '@/components/qc/QcTallyBar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { validateQcJob } from '@/utils/qcValidation';
import { QC_STATUS_LABELS, QC_STATUS_COLOR } from '@/config/qcStatus';
import { cn } from '@/lib/utils';
import type { QcFieldDefinition } from '@/types/qc';

interface SectionGroup {
  key:    string;
  title:  string;
  fields: QcFieldDefinition[];
}

function groupBySections(template: QcFieldDefinition[]): SectionGroup[] {
  const sorted = [...template].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: SectionGroup[] = [];
  let current: SectionGroup | null = null;
  for (const field of sorted) {
    if (field.type === 'section_header') {
      current = { key: field.fieldId, title: field.label, fields: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { key: '__ungrouped', title: 'Checklist', fields: [] };
        groups.push(current);
      }
      current.fields.push(field);
    }
  }
  return groups;
}

// Codes Phase 5's SignaturePad/declaration checkbox resolve — nothing in
// THIS phase's UI can act on either one, so counting them in the footer
// would show the inspector a permanently stuck number for two problems
// they have no way to fix yet.
const UNRESOLVABLE_THIS_PHASE = new Set(['signature_missing', 'declaration_unchecked']);

export function QcFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();

  const {
    job, loading, error,
    answers, answerField,
    location, locationCapturedAt, locationUnavailable, captureLocation,
    tally, dirty, saving,
    saveDraft, onSectionCollapse,
  } = useQcFill(id);

  const sections = useMemo(() => groupBySections(job?.template ?? []), [job?.template]);

  const allIssues = useMemo(
    () => validateQcJob(job?.template ?? [], answers, job?.inspectorSignOff ?? null, false),
    [job?.template, answers, job?.inspectorSignOff],
  );
  const actionableCount = allIssues.filter((i) => !UNRESOLVABLE_THIS_PHASE.has(i.code)).length;

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

  // noAccess is false here, so job is guaranteed non-null.
  const statusColor = QC_STATUS_COLOR[job!.status];

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
            qcNum={job!.qcNum}
          />
        ))}
      </div>

      <div className="sticky bottom-[4.5rem] md:bottom-0 z-30 -mx-4 border-t border-gray-100 bg-white px-4 pt-2 pb-3 flex flex-col gap-2">
        {actionableCount > 0 && (
          <p className="text-center text-xs text-amber-600">
            {actionableCount} outstanding issue{actionableCount !== 1 ? 's' : ''}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={() => void saveDraft()} disabled={saving}>
            {saving ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
          </Button>
          <span className="flex-1" title="Coming in the next update">
            <Button className="w-full" disabled>Submit for approval</Button>
          </span>
        </div>
      </div>
    </div>
  );
}
