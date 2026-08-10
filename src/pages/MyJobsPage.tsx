import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MapPin } from 'lucide-react';
import { useQcJobs } from '@/hooks/useQcJobs';
import { QC_STATUS_LABELS, QC_STATUS_COLOR } from '@/config/qcStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { directionsUrl } from '@/utils/directionsUrl';
import type { QcJob, QcStatus } from '@/types/qc';

// Group order — active work first, terminal states last. Purely a display
// grouping over the single list useQcJobs already fetched; no per-status
// queries, per the phase's own instruction not to build new query
// infrastructure just for this.
const GROUP_ORDER: QcStatus[] = [
  'assigned', 'in_progress', 'rework', 'pending_approval', 'approved', 'unassigned', 'cancelled',
];

function JobCard({ job }: { job: QcJob }) {
  const navigate = useNavigate();
  const color = QC_STATUS_COLOR[job.status];
  return (
    <div
      className="rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-pointer hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors"
      onClick={() => navigate(`/jobs/${job.id}/fill`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/jobs/${job.id}/fill`); }}
      aria-label={`Open ${job.qcNum} — ${job.customer.name}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-400">{job.qcNum}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', color.bg, color.text)}>
          {QC_STATUS_LABELS[job.status]}
        </span>
      </div>
      <p className="text-sm font-medium text-gray-900 mt-1">{job.customer.name}</p>
      {job.customer.address && (
        <p className="text-xs text-gray-500 mt-0.5">{job.customer.address}</p>
      )}
      <p className="text-xs text-gray-400 mt-0.5">
        {job.customer.district}{job.customer.district && job.customer.state ? ', ' : ''}{job.customer.state}
      </p>
      <div className="flex items-center gap-3 mt-1.5">
        {job.customer.mobile && (
          <a
            href={`tel:${job.customer.mobile}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
          >
            <Phone className="h-3.5 w-3.5" />{job.customer.mobile}
          </a>
        )}
        <a
          href={directionsUrl(job.customer)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" />Directions
        </a>
      </div>
      {job.scheduledDate && (
        <p className="text-xs text-gray-400 mt-1">
          Scheduled {job.scheduledDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

export function MyJobsPage() {
  const { jobs, loading, hasMore, loadingMore, loadMore } = useQcJobs();

  const grouped = useMemo(() => {
    const map = new Map<QcStatus, QcJob[]>();
    for (const status of GROUP_ORDER) map.set(status, []);
    for (const job of jobs) {
      if (!map.has(job.status)) map.set(job.status, []);
      map.get(job.status)!.push(job);
    }
    return GROUP_ORDER
      .map((status) => ({ status, jobs: map.get(status) ?? [] }))
      .filter((g) => g.jobs.length > 0);
  }, [jobs]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">My Jobs</h1>
      <p className="text-sm text-gray-500 mb-5">
        {loading ? 'Loading…' : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} assigned to you`}
      </p>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No jobs assigned to you yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(({ status, jobs: groupJobs }) => (
            <div key={status}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {QC_STATUS_LABELS[status]} ({groupJobs.length})
              </p>
              <div className="flex flex-col gap-2">
                {groupJobs.map((job) => <JobCard key={job.id} job={job} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="w-full mt-4">
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
