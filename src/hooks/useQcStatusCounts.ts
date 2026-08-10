import { useState, useEffect } from 'react';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { QcStatus } from '@/types/qc';

// No denormalized live counters — getCountFromServer on demand, per
// status value, matching Phase 3's own design decision. Each status is
// its own equality-only query (rather than a single `status in [...]`
// query) so every call is servable by a plain single-field or existing
// two-field index prefix with zero ambiguity, confirmed live rather than
// assumed.
export function useQcStatusCounts(statuses: QcStatus[], inspectorUid?: string) {
  const [counts, setCounts]   = useState<Partial<Record<QcStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const statusKey = statuses.join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all(
      statuses.map(async (status) => {
        const constraints = inspectorUid
          ? [where('inspectorUid', '==', inspectorUid), where('status', '==', status)]
          : [where('status', '==', status)];
        const snap = await getCountFromServer(query(collection(db, 'qcJobs'), ...constraints));
        return [status, snap.data().count] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setCounts(Object.fromEntries(entries));
        setLoading(false);
      })
      .catch((err) => {
        console.error('[useQcStatusCounts] count query failed:', err);
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, inspectorUid]);

  return { counts, loading };
}

// tally.criticalFail already has a composite index (Phase 1) pairing it
// with status + updatedAt — a plain inequality on the field alone is
// servable by Firestore's default single-field indexing regardless, but
// confirmed live rather than assumed either way.
export function useQcCriticalFailCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCountFromServer(query(collection(db, 'qcJobs'), where('tally.criticalFail', '>', 0)))
      .then((snap) => { if (!cancelled) setCount(snap.data().count); })
      .catch((err) => console.error('[useQcCriticalFailCount] count query failed:', err));
    return () => { cancelled = true; };
  }, []);

  return count;
}
