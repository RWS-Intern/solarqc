import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useQcJobs } from '@/hooks/useQcJobs';
import { Skeleton } from '@/components/ui/skeleton';
import { QC_STATUS_LABELS, QC_STATUS_COLOR } from '@/config/qcStatus';
import { cn } from '@/lib/utils';
import type { QcJob, QcStatus } from '@/types/qc';

type PendingRow = Pick<QcJob, 'id' | 'qcNum' | 'customer' | 'tally' | 'submittedAt'>;

function toDate(v: unknown): Date | null {
  return (v as { toDate?: () => Date } | null)?.toDate?.() ?? null;
}

function docToPendingRow(id: string, data: Record<string, unknown>): PendingRow {
  return {
    id,
    qcNum: (data['qcNum'] as string) ?? '',
    customer: (data['customer'] as QcJob['customer']) ?? {
      name: '', nameLower: '', nameWords: [], mobile: '', address: '', district: '', state: '',
    },
    tally: (data['tally'] as QcJob['tally']) ?? {
      total: 0, answered: 0, pass: 0, fail: 0, na: 0,
      criticalFail: 0, majorFail: 0, minorFail: 0, suggestedVerdict: 'pass',
    },
    submittedAt: toDate(data['submittedAt']),
  };
}

// Oldest-first via a client-side reverse of an already-indexed descending
// query, rather than a new composite index for a single screen. Neither
// `orderBy('submittedAt','asc')` nor `orderBy('updatedAt','asc')` is
// actually servable by any index declared so far (both confirmed live —
// FAILED_PRECONDITION either way); only `status + updatedAt DESC` is.
// The pending queue is small enough that fetching newest-first and
// reversing client-side costs nothing and needs no new index.
function usePendingApprovalQueue() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'qcJobs'),
      where('status', '==', 'pending_approval'),
      orderBy('updatedAt', 'desc'),
      limit(50),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => docToPendingRow(d.id, d.data()));
        setRows(docs.reverse()); // oldest first
        setLoading(false);
      },
      (err) => {
        console.error('[ApprovalsPage] pending queue snapshot error:', err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  return { rows, loading };
}

function PendingRowCard({ row, onOpen }: { row: PendingRow; onOpen: (id: string) => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-pointer hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors"
      onClick={() => onOpen(row.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(row.id); }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-gray-400">{row.qcNum}</span>
          {row.tally.criticalFail > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              ⚠ {row.tally.criticalFail} CRITICAL
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{row.customer.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {row.customer.district}{row.customer.district && row.customer.state ? ', ' : ''}{row.customer.state}
          {row.submittedAt && <span className="ml-2">· submitted {row.submittedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
        </p>
      </div>
    </div>
  );
}

function ReviewedRowCard({ job, onOpen }: { job: QcJob; onOpen: (id: string) => void }) {
  const color = QC_STATUS_COLOR[job.status];
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-pointer hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors"
      onClick={() => onOpen(job.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(job.id); }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-gray-400">{job.qcNum}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', color.bg, color.text)}>
            {QC_STATUS_LABELS[job.status]}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{job.customer.name}</p>
      </div>
    </div>
  );
}

const REVIEWED_TABS: QcStatus[] = ['approved', 'rework'];

export function ApprovalsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'pending' | QcStatus>('pending');
  const { rows: pendingRows, loading: pendingLoading } = usePendingApprovalQueue();
  // Reviewed-tab query only actually matters when tab isn't 'pending' (that
  // tab renders pendingRows instead) — default to 'approved' rather than no
  // status filter at all, which would otherwise fetch every job unfiltered
  // in the background while the pending tab is open.
  const { jobs: reviewedJobs, loading: reviewedLoading } = useQcJobs({
    status: tab === 'pending' ? 'approved' : tab,
  });

  function openJob(id: string) {
    navigate(`/approvals/${id}`);
  }

  const isPending = tab === 'pending';
  const loading = isPending ? pendingLoading : reviewedLoading;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Approvals</h1>

      <div className="flex gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            isPending ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          )}
        >
          Pending ({pendingRows.length})
        </button>
        {REVIEWED_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              tab === s ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {QC_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
        </div>
      ) : isPending ? (
        pendingRows.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No jobs awaiting approval.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingRows.map((row) => <PendingRowCard key={row.id} row={row} onOpen={openJob} />)}
          </div>
        )
      ) : reviewedJobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No jobs in {QC_STATUS_LABELS[tab as QcStatus]}.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {reviewedJobs.map((job) => <ReviewedRowCard key={job.id} job={job} onOpen={openJob} />)}
        </div>
      )}
    </div>
  );
}
