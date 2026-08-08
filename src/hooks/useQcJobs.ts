import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, where, orderBy, limit, startAfter, onSnapshot, getDocs,
  type QueryDocumentSnapshot, type DocumentData, type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import type { QcJob, QcStatus, SignOff } from '@/types/qc';

const PAGE_SIZE = 25;

function toDate(v: unknown): Date | null {
  return (v as { toDate?: () => Date } | null)?.toDate?.() ?? null;
}

// See useQcJob.ts's identical helper — a naive cast leaves `signedAt` as a
// Firestore Timestamp, not the `Date` the SignOff type promises.
function toSignOff(raw: unknown): SignOff | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    role:         r['role'] as SignOff['role'],
    name:         (r['name'] as string) ?? '',
    designation:  r['designation'] as string | undefined,
    uid:          (r['uid'] as string | null) ?? null,
    signatureUrl: (r['signatureUrl'] as string) ?? '',
    signedAt:     toDate(r['signedAt']) ?? new Date(0),
    location:     (r['location'] as SignOff['location']) ?? null,
    deviceInfo:   (r['deviceInfo'] as string) ?? '',
    declaration:  (r['declaration'] as string) ?? '',
  };
}

function docToQcJob(d: QueryDocumentSnapshot<DocumentData>): QcJob {
  const data = d.data();
  return {
    id:            d.id,
    qcNum:         data['qcNum']       ?? '',
    status:        data['status']      ?? 'unassigned',
    reworkRound:   data['reworkRound'] ?? 0,

    customer: data['customer'] ?? {
      name: '', nameLower: '', nameWords: [], mobile: '', address: '', district: '', state: '',
    },
    system: data['system'] ?? { sizeKw: 0 },

    inspectorUid:    data['inspectorUid']    ?? null,
    inspectorName:   data['inspectorName']   ?? '',
    inspectorCode:   data['inspectorCode']   ?? '',
    inspectorMobile: data['inspectorMobile'] ?? '',
    approverUid:     data['approverUid']     ?? null,
    approverName:    data['approverName']    ?? '',

    scheduledDate: toDate(data['scheduledDate']),
    dueDate:       toDate(data['dueDate']),

    template:        data['template']        ?? [],
    templateVersion: data['templateVersion'] ?? 1,
    answers:         data['answers']         ?? {},

    tally: data['tally'] ?? {
      total: 0, answered: 0, pass: 0, fail: 0, na: 0,
      criticalFail: 0, majorFail: 0, minorFail: 0, suggestedVerdict: 'pass',
    },

    location:   data['location'] ?? null,
    locationAt: toDate(data['locationAt']),

    inspectorSignOff: toSignOff(data['inspectorSignOff']),
    customerSignOff:  toSignOff(data['customerSignOff']),
    approverSignOff:  toSignOff(data['approverSignOff']),

    verdict:          data['verdict']          ?? null,
    verdictNote:      data['verdictNote']      ?? '',
    conditions:       data['conditions']       ?? '',
    rejectionReason:  data['rejectionReason']  ?? '',
    reworkPointIds:   data['reworkPointIds']   ?? [],
    approverComments: data['approverComments'] ?? {},

    submittedAt: toDate(data['submittedAt']),
    reviewedAt:  toDate(data['reviewedAt']),
    completedAt: toDate(data['completedAt']),

    reportUrl:  data['reportUrl']  ?? null,
    reportedAt: toDate(data['reportedAt']),

    createdBy:    data['createdBy'] ?? '',
    createdAt:    toDate(data['createdAt']) ?? new Date(0),
    updatedAt:    toDate(data['updatedAt']) ?? new Date(0),
    archived:     data['archived'] ?? false,
    archivedAt:   toDate(data['archivedAt']),
    cancelReason: data['cancelReason'] ?? null,
  };
}

interface UseQcJobsOptions {
  status?: QcStatus;
}

export function useQcJobs(opts: UseQcJobsOptions = {}) {
  const { currentUser } = useAuthStore();
  const role = currentUser?.role;
  const uid  = currentUser?.uid;
  const status = opts.status;

  const [jobs,        setJobs]        = useState<QcJob[]>([]);
  const [loading,      setLoading]    = useState(true);
  const [loadingMore,  setLoadingMore] = useState(false);
  const [hasMore,      setHasMore]    = useState(false);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Load-bearing, not stylistic — plan §2.4 / Phase 3 §2.4. Firestore's
  // list-query rule requires EVERY document a query would return to satisfy
  // the read rule; it does not narrow the result set server-side. An
  // inspector's query must filter by inspectorUid itself, or an unfiltered
  // query fails outright with permission-denied the moment it would have
  // matched even one job that isn't theirs.
  function buildConstraints(): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];
    if (role === 'qc_inspector') {
      constraints.push(where('inspectorUid', '==', uid));
      constraints.push(where('archived', '==', false));
    } else if (status) {
      // admin/qc_manager/viewer/approver, tab-scoped by status. Deliberately
      // NOT also filtering archived==false here — nothing gets archived
      // until a later phase builds that action, and the declared composite
      // indexes (Phase 1 §3.7) pair status+updatedAt without archived; a
      // 3-field (archived, status, updatedAt) index doesn't exist and
      // wasn't declared for this phase.
    }
    if (status) constraints.push(where('status', '==', status));
    return constraints;
  }

  useEffect(() => {
    if (!currentUser) { setJobs([]); setLoading(false); return; }
    setLoading(true);

    const q = query(
      collection(db, 'qcJobs'),
      ...buildConstraints(),
      orderBy('updatedAt', 'desc'),
      limit(PAGE_SIZE),
    );

    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        setJobs(snap.docs.map(docToQcJob));
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
        setHasMore(snap.docs.length === PAGE_SIZE);
        setHasPendingWrites(snap.metadata.hasPendingWrites);
        setLoading(false);
      },
      (err) => {
        console.error('[useQcJobs] snapshot error:', err);
        setLoading(false);
      },
    );

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, uid, status]);

  const loadMore = useCallback(async () => {
    if (!currentUser || !lastDocRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'qcJobs'),
        ...buildConstraints(),
        orderBy('updatedAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      const more = snap.docs.map(docToQcJob);
      setJobs((prev) => [...prev, ...more]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? lastDocRef.current;
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('[useQcJobs] loadMore failed:', err);
    } finally {
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, uid, status, loadingMore, currentUser]);

  return { jobs, loading, loadingMore, hasMore, loadMore, hasPendingWrites };
}
