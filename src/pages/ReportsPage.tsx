import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useQcJobs } from '@/hooks/useQcJobs';
import { useQcJobActions } from '@/hooks/useQcJobActions';
import { exportQcJobsToExcel } from '@/utils/qcJobsExcel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { _emitToast } from '@/components/ui/toast';
import type { QcJob } from '@/types/qc';

// roles.ts grants 'viewer' the viewReports capability too (checked, not
// assumed — see App.tsx's /reports route guard), but certificate
// generation and export stay narrower: viewer is read-only everywhere
// else in this app, and firestore.rules' reportFields() gate is
// admin/qc_manager only (§2) — a viewer clicking "Generate Certificate"
// would just get permission-denied. Keeping the export action behind the
// same gate matches that same "viewer never gets an action button that
// would fail" reasoning, even though export itself is a pure client-side
// read with no rules to fail against.
const CAN_MANAGE_ROLES = ['admin', 'qc_manager'];

function formatDate(d: Date | null): string {
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}

function ReportRow({
  job, canManage, generating, onGenerate,
}: {
  job:        QcJob;
  canManage:  boolean;
  generating: boolean;
  onGenerate: (job: QcJob) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-400">{job.qcNum}</span>
        <span className="text-xs text-gray-400">Round {job.reworkRound + 1}</span>
      </div>
      <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{job.customer.name}</p>
      <p className="text-xs text-gray-400 mt-0.5">
        {job.customer.district}{job.customer.district && job.customer.state ? ', ' : ''}{job.customer.state}
      </p>

      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
        {job.reportUrl ? (
          <a
            href={job.reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-brand-blue hover:underline"
          >
            Certificate generated {formatDate(job.reportedAt)} — view
          </a>
        ) : (
          <span className="text-xs text-gray-400">Certificate not yet generated</span>
        )}

        {canManage && (
          <Button
            size="sm"
            variant={job.reportUrl ? 'outline' : 'default'}
            onClick={() => onGenerate(job)}
            disabled={generating}
          >
            {generating ? 'Generating…' : job.reportUrl ? 'Regenerate' : 'Generate Certificate'}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { currentUser } = useAuthStore();
  const { jobs, loading, hasMore, loadMore, loadingMore } = useQcJobs({ status: 'approved' });
  const { generateCertificate } = useQcJobActions();
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const canManage = !!currentUser && CAN_MANAGE_ROLES.includes(currentUser.role);

  async function handleGenerate(job: QcJob) {
    setGeneratingId(job.id);
    try {
      await generateCertificate(job);
      _emitToast('Certificate generated.', 'success');
    } catch (err) {
      console.error('[ReportsPage] generateCertificate failed:', err);
      _emitToast('Could not generate certificate. Please try again.', 'error');
    } finally {
      setGeneratingId(null);
    }
  }

  function handleExport() {
    exportQcJobsToExcel(jobs);
    _emitToast(`Exported ${jobs.length} job${jobs.length !== 1 ? 's' : ''} to Excel.`, 'success');
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-xs text-gray-400 mt-0.5">Approved jobs — certificates and export</p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={handleExport} disabled={jobs.length === 0}>
            Export to Excel
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No approved jobs yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((job) => (
            <ReportRow
              key={job.id}
              job={job}
              canManage={canManage}
              generating={generatingId === job.id}
              onGenerate={handleGenerate}
            />
          ))}
          {hasMore && (
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
