import { useState, useEffect } from 'react';
import {
  collection, query, where, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { QcJob, QcStatus } from '@/types/qc';

// What JobRow/CustomersPage's directory rows actually render — a search
// hit only fetches these fields, so it's typed narrower rather than cast
// up to the full QcJob shape. A real QcJob (from tab/list browsing)
// satisfies this structurally with no cast needed either way. `tally` is
// included so CustomersPage's critical-fail filter can compose with a
// search hit client-side — the full document (tally included) is already
// read off Firestore either way, this just stops discarding it.
export type JobListItem = Pick<QcJob, 'id' | 'qcNum' | 'status' | 'customer' | 'inspectorUid' | 'inspectorName' | 'updatedAt' | 'tally'>;

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
    tally: (data['tally'] as QcJob['tally']) ?? {
      total: 0, answered: 0, pass: 0, fail: 0, na: 0,
      criticalFail: 0, majorFail: 0, minorFail: 0, suggestedVerdict: 'pass',
    },
  };
}

// Search switches the query mode away from tab/status-filtering entirely —
// same pattern the old sales app used, since Firestore can't combine an
// arbitrary search term with a status filter without more indexes than
// exist. Auto-detects mobile (10 digits) vs a QC number vs a name. Always
// spans every status — that's what makes this reusable for both JobsPage
// (search overrides whichever tab is active) and CustomersPage's directory
// (which has no status filter to override in the first place).
export async function searchJobs(term: string): Promise<JobListItem[]> {
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
    // NB: the "+ ''" suffix is what makes this a prefix range instead
    // of collapsing to an exact match ('' sorts after every normal
    // character) — see plan §11.4, the bug being deliberately NOT repeated.
    const snap = await getDocs(query(
      collection(db, 'qcJobs'),
      where('archived', '==', false),
      where('qcNum', '>=', prefix),
      where('qcNum', '<=', prefix + ''),
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

// Shared debounced-search state — JobsPage (search overrides the active
// tab) and CustomersPage (search overrides the flat directory list) both
// need identical "type, wait, query, show results" behavior over the same
// searchJobs() call.
export function useJobSearch() {
  const [search,  setSearch]  = useState('');
  const [results, setResults] = useState<JobListItem[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) { setResults(null); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      searchJobs(trimmed)
        .then(setResults)
        .catch((err) => { console.error('[useJobSearch] search failed:', err); setResults([]); })
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  const isSearchMode = search.trim().length > 0;
  return { search, setSearch, results: results ?? [], searching, isSearchMode };
}
