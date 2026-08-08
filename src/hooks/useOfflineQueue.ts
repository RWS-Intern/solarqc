import { useState, useEffect } from 'react';
import {
  listQueuedPhotos, listQueuedPhotosFor, onQueueChange, type QueuedPhoto,
} from '@/utils/offlinePhotoQueue';
import type { SignOff } from '@/types/qc';

// Total pending items (photos + signatures) across every job — what
// OfflineBanner shows. Re-polls IndexedDB on every queue change, including
// ones fired by the background replay processor, not just this device's
// own enqueue calls.
export function useOfflineQueueCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    function refresh() {
      void listQueuedPhotos().then((items) => { if (mounted) setCount(items.length); });
    }
    refresh();
    const unsubscribe = onQueueChange(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, []);

  return count;
}

// Queued-but-unconfirmed checklist photos for one field — PhotoZone merges
// these into its thumbnail grid alongside the confirmed `photos` prop.
export function useOfflinePhotosFor(jobId: string | undefined, fieldId: string | undefined): QueuedPhoto[] {
  const [items, setItems] = useState<QueuedPhoto[]>([]);

  useEffect(() => {
    if (!jobId || !fieldId) { setItems([]); return; }
    const jid = jobId, fid = fieldId;
    let mounted = true;
    function refresh() {
      void listQueuedPhotosFor(jid, fid).then((all) => {
        if (mounted) setItems(all.filter((p) => p.kind === 'checklist'));
      });
    }
    refresh();
    const unsubscribe = onQueueChange(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [jobId, fieldId]);

  return items;
}

// The one queued-but-unconfirmed signature for a given job+role, if any —
// SingleSignOff/SignOffBlock render a "pending sync" view from this
// instead of a blank canvas or a silent error.
export function useQueuedSignature(jobId: string | undefined, role: SignOff['role']): QueuedPhoto | null {
  const [item, setItem] = useState<QueuedPhoto | null>(null);

  useEffect(() => {
    if (!jobId) { setItem(null); return; }
    const jid = jobId;
    let mounted = true;
    function refresh() {
      void listQueuedPhotosFor(jid, role).then((all) => {
        if (mounted) setItem(all.find((p) => p.kind === 'signature') ?? null);
      });
    }
    refresh();
    const unsubscribe = onQueueChange(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [jobId, role]);

  return item;
}
