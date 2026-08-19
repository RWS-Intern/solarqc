import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, UserPlus, Search, Phone, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { can } from '@/config/roles';
import { useQcJobs } from '@/hooks/useQcJobs';
import { useQcStatusCounts, useQcCriticalFailCount } from '@/hooks/useQcStatusCounts';
import { useJobSearch, type JobListItem } from '@/hooks/useJobSearch';
import { CountCard } from '@/components/qc/CountCard';
import { QC_STATUS_LABELS, QC_STATUS_COLOR, ALL_STATUSES } from '@/config/qcStatus';
import { CustomerImportModal } from '@/components/customers/CustomerImportModal';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Same tel:-link-inside-a-clickable-card pattern as MyJobsPage's JobCard —
// the link stops propagation so tapping the number doesn't also navigate.
function DirectoryRow({ job }: { job: JobListItem }) {
  const navigate = useNavigate();
  const color = QC_STATUS_COLOR[job.status];
  return (
    <div
      className="rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-pointer hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors"
      onClick={() => navigate(`/jobs/${job.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/jobs/${job.id}`); }}
      aria-label={`Open ${job.qcNum} — ${job.customer.name}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-400">{job.qcNum}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', color.bg, color.text)}>
          {QC_STATUS_LABELS[job.status]}
        </span>
      </div>
      <p className="text-sm font-medium text-gray-900 mt-1">{job.customer.name}</p>
      <p className="text-xs text-gray-400 mt-0.5">
        {job.customer.district}{job.customer.district && job.customer.state ? ', ' : ''}{job.customer.state}
      </p>
      {job.customer.mobile && (
        <a
          href={`tel:${job.customer.mobile}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline mt-1.5"
        >
          <Phone className="h-3.5 w-3.5" />{job.customer.mobile}
        </a>
      )}
    </div>
  );
}

export function CustomersPage() {
  const { currentUser } = useAuthStore();
  // Same capability manageCustomers already gates elsewhere (roles.ts) —
  // admin/qc_manager only, matching who can actually create a job here.
  // The directory below is read-only and gated at the route level
  // instead (App.tsx), so viewer reaches this page but never these cards.
  const canManage = can(currentUser?.role, 'manageCustomers');

  const [showImport, setShowImport] = useState(false);
  const [showForm,   setShowForm]   = useState(false);

  // "Has a critical fail" isn't a status a job sits in — it's an
  // independent axis that composes with either browsing mode below,
  // seeded from the Dashboard tile's ?criticalFail=1 link (or set
  // directly here) and never touching `search`'s own state.
  const [searchParams] = useSearchParams();
  const [criticalFailOnly, setCriticalFailOnly] = useState(searchParams.get('criticalFail') === '1');
  const criticalFailTotal = useQcCriticalFailCount();

  // One shared count fetch for both the per-status chips and "Total
  // customers" — the total is just their sum, not a second query.
  const { counts, loading: countsLoading } = useQcStatusCounts(ALL_STATUSES);
  const totalCustomers = ALL_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  // No status filter -- every job, every status, most recent first,
  // paginated via useQcJobs' own hasMore/loadMore (same mechanism
  // ReportsPage uses, just without the {status:'approved'} constraint).
  // criticalFailOnly reuses the exact tally.criticalFail > 0 condition
  // useQcCriticalFailCount() already counts with — same query shape,
  // now fetching real documents instead of just a count.
  const { jobs, loading, hasMore, loadingMore, loadMore } = useQcJobs({ criticalFailOnly });
  const { search, setSearch, results: searchResults, searching, isSearchMode } = useJobSearch();
  // Search already reads the whole document (tally included) off
  // Firestore — composing the critical-fail filter with a search hit is
  // a client-side filter over data already fetched, not a second query.
  const filteredSearchResults = criticalFailOnly
    ? searchResults.filter((r) => r.tally.criticalFail > 0)
    : searchResults;
  const displayedJobs = isSearchMode ? filteredSearchResults : jobs;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Customers</h1>
      <p className="text-sm text-gray-500 mb-5">
        Upload a closed sale to create a QC job. Uploading here doesn't create a separate
        customer record — the customer's details live directly on the QC job.
      </p>

      {canManage && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
              <Upload className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-gray-900">Import CSV</span>
            <span className="text-xs text-gray-500">Bulk-upload closed sales — up to 500 rows per file.</span>
          </button>

          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-brand-green">
              <UserPlus className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-gray-900">Add single customer</span>
            <span className="text-xs text-gray-500">Enter one closed sale and create its QC job directly.</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-5">
        <CountCard label="Total customers" count={totalCustomers} loading={countsLoading} />
        {ALL_STATUSES.map((s) => (
          <CountCard
            key={s}
            label={QC_STATUS_LABELS[s]}
            count={counts[s]}
            loading={countsLoading}
            color={QC_STATUS_COLOR[s]}
          />
        ))}
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search by QC number, customer name, or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
        />
      </div>

      {/* A different axis from the status chips above, not an eighth
          status — a critical fail can sit in any status tab at once, so
          this is its own toggle rather than a row in that grid, and it
          composes with search instead of being overridden by it. */}
      <button
        type="button"
        onClick={() => setCriticalFailOnly((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors mb-4',
          criticalFailOnly
            ? 'bg-brand-red border-brand-red text-white'
            : 'bg-white border-red-200 text-brand-red hover:bg-red-50',
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Critical fails only
        {criticalFailTotal !== null && (
          <span className={cn('rounded-full px-1.5 text-[10px]', criticalFailOnly ? 'bg-white/20' : 'bg-red-100')}>
            {criticalFailTotal}
          </span>
        )}
      </button>

      {(isSearchMode ? searching : loading) ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : displayedJobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {isSearchMode && criticalFailOnly
            ? 'No critical-fail jobs match your search.'
            : isSearchMode
            ? 'No customers match your search.'
            : criticalFailOnly
            ? 'No jobs with a critical fail on record.'
            : 'No customers yet.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedJobs.map((job) => <DirectoryRow key={job.id} job={job} />)}
        </div>
      )}

      {!isSearchMode && hasMore && (
        <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore} className="w-full mt-4">
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}

      <CustomerImportModal open={showImport} onClose={() => setShowImport(false)} />
      <CustomerForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
}
