import { useState, useEffect, useMemo } from 'react';
import { Search, UserCog } from 'lucide-react';
import {
  collection, query, where, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { useQcJobs } from '@/hooks/useQcJobs';
import { useQcJobActions } from '@/hooks/useQcJobActions';
import { can } from '@/config/roles';
import { QC_STATUS_LABELS, QC_STATUS_COLOR } from '@/config/qcStatus';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button }   from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { QcJob, QcStatus } from '@/types/qc';

const TAB_ORDER: QcStatus[] = [
  'unassigned', 'assigned', 'in_progress', 'pending_approval', 'rework', 'approved', 'cancelled',
];

// What JobRow/AssignDialog actually render — a search hit only fetches
// these fields, so it's typed narrower rather than cast up to the full
// QcJob shape. A real QcJob (from tab browsing) satisfies this structurally
// with no cast needed either way.
type JobListItem = Pick<QcJob, 'id' | 'qcNum' | 'status' | 'customer' | 'inspectorUid' | 'inspectorName' | 'updatedAt'>;

function docToJobListItem(id: string, data: Record<string, unknown>): JobListItem {
  const toDate = (v: unknown) => (v as { toDate?: () => Date } | null)?.toDate?.() ?? null;
  return {
    id,
    qcNum: (data['qcNum'] as string) ?? '',
    status: (data['status'] as QcStatus) ?? 'unassigned',
    customer: (data['customer'] as QcJob['customer']) ?? {
      name: '', nameLower: '', nameWords: [], mobile: '', address: '', district: '', state: '',
    },
    inspectorUid:  (data['inspectorUid']  as string | null) ?? null,
    inspectorName: (data['inspectorName'] as string) ?? '',
    updatedAt: toDate(data['updatedAt']) ?? new Date(0),
  };
}

// Search switches the query mode away from tab-filtering entirely — same
// pattern the old sales app used, since Firestore can't combine an
// arbitrary search term with a status filter without more indexes than
// exist. Auto-detects mobile (10 digits) vs a QC number vs a name.
async function searchJobs(term: string): Promise<JobListItem[]> {
  const trimmed = term.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10 && digits === trimmed.replace(/[\s-]/g, '')) {
    const snap = await getDocs(query(
      collection(db, 'qcJobs'),
      where('archived', '==', false),
      where('customer.mobile', '==', digits),
    ));
    return snap.docs.map((d) => docToJobListItem(d.id, d.data()));
  }

  if (/^qc-?\d+/i.test(trimmed) || /^\d+$/.test(trimmed)) {
    const prefix = trimmed.toUpperCase().startsWith('QC') ? trimmed.toUpperCase() : `QC-${trimmed.padStart(6, '0')}`;
    // NB: the "+ ''" suffix is what makes this a prefix range instead
    // of collapsing to an exact match ('' sorts after every normal
    // character) — see plan §11.4, the bug being deliberately NOT repeated.
    const snap = await getDocs(query(
      collection(db, 'qcJobs'),
      where('archived', '==', false),
      where('qcNum', '>=', prefix),
      where('qcNum', '<=', prefix + ''),
      orderBy('qcNum'),
      limit(50),
    ));
    return snap.docs.map((d) => docToJobListItem(d.id, d.data()));
  }

  const firstWord = trimmed.toLowerCase().split(/\s+/)[0];
  if (!firstWord) return [];
  const snap = await getDocs(query(
    collection(db, 'qcJobs'),
    where('archived', '==', false),
    where('customer.nameWords', 'array-contains', firstWord),
    limit(50),
  ));
  return snap.docs.map((d) => docToJobListItem(d.id, d.data()));
}

function AssignDialog({ job, onClose }: { job: JobListItem | null; onClose: () => void }) {
  const { users } = useUserStore();
  const { assignQcJob } = useQcJobActions();
  const [inspectorUid, setInspectorUid] = useState('');
  const [saving, setSaving] = useState(false);
  const activeInspectors = users.filter((u) => u.role === 'qc_inspector' && u.active);

  useEffect(() => { setInspectorUid(job?.inspectorUid ?? ''); }, [job]);

  async function handleAssign() {
    if (!job || !inspectorUid) return;
    const u = activeInspectors.find((i) => i.id === inspectorUid);
    if (!u) return;
    setSaving(true);
    try {
      await assignQcJob(job.id, { uid: u.id, name: u.name, code: u.engineerCode ?? '', mobile: u.mobileNumber ?? '' });
      onClose();
    } catch (err) {
      console.error('[AssignDialog] assign failed:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!job} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" aria-describedby="assign-desc">
        <DialogHeader>
          <DialogTitle>Assign {job?.qcNum}</DialogTitle>
          <DialogDescription id="assign-desc">
            {job?.customer.name} — pick a QC inspector.
          </DialogDescription>
        </DialogHeader>
        <Select value={inspectorUid} onValueChange={setInspectorUid}>
          <SelectTrigger><SelectValue placeholder="Select inspector" /></SelectTrigger>
          <SelectContent>
            {activeInspectors.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No active inspectors.</div>
            ) : activeInspectors.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name} ({u.engineerCode ?? '—'})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1" onClick={handleAssign} disabled={!inspectorUid || saving}>
            {saving ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JobRow({ job, canAssign, onAssign }: { job: JobListItem; canAssign: boolean; onAssign: (job: JobListItem) => void }) {
  const color = QC_STATUS_COLOR[job.status];
  const showAssign = canAssign && (job.status === 'unassigned' || job.status === 'assigned');
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-gray-400">{job.qcNum}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', color.bg, color.text)}>
            {QC_STATUS_LABELS[job.status]}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{job.customer.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {job.customer.district}{job.customer.district && job.customer.state ? ', ' : ''}{job.customer.state}
          {job.inspectorName && <span className="ml-2 text-gray-500">→ {job.inspectorName}</span>}
        </p>
      </div>
      {showAssign && (
        <Button size="sm" variant="outline" onClick={() => onAssign(job)} className="shrink-0 flex items-center gap-1.5">
          <UserCog className="h-3.5 w-3.5" />{job.status === 'assigned' ? 'Reassign' : 'Assign'}
        </Button>
      )}
    </div>
  );
}

export function JobsPage() {
  const { currentUser } = useAuthStore();
  const canAssign = can(currentUser?.role, 'assignJobs');

  const [activeTab, setActiveTab] = useState<QcStatus>('unassigned');
  const [search,     setSearch]     = useState('');
  const [searchResults, setSearchResults] = useState<JobListItem[] | null>(null);
  const [searching,  setSearching]  = useState(false);
  const [assignTarget, setAssignTarget] = useState<JobListItem | null>(null);

  const { jobs, loading, hasMore, loadingMore, loadMore } = useQcJobs({ status: activeTab });

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) { setSearchResults(null); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      searchJobs(trimmed)
        .then(setSearchResults)
        .catch((err) => { console.error('[JobsPage] search failed:', err); setSearchResults([]); })
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  const isSearchMode = search.trim().length > 0;
  const displayedJobs = useMemo(() => (isSearchMode ? searchResults ?? [] : jobs), [isSearchMode, searchResults, jobs]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Jobs</h1>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search by QC number, customer name, or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
        />
      </div>

      {!isSearchMode && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {TAB_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveTab(s)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors shrink-0',
                activeTab === s ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {QC_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {(isSearchMode ? searching : loading) ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
        </div>
      ) : displayedJobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {isSearchMode ? 'No jobs match your search.' : `No jobs in ${QC_STATUS_LABELS[activeTab]}.`}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedJobs.map((job) => (
            <JobRow key={job.id} job={job} canAssign={canAssign} onAssign={setAssignTarget} />
          ))}
        </div>
      )}

      {!isSearchMode && hasMore && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="w-full mt-4">
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}

      <AssignDialog job={assignTarget} onClose={() => setAssignTarget(null)} />
    </div>
  );
}
