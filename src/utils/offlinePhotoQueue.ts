import { openDB, type IDBPDatabase } from 'idb';
import type { SignOff } from '@/types/qc';

const DB_NAME    = 'solarqc-photo-queue';
const DB_VERSION = 1;
const STORE_NAME = 'queuedPhotos';

export interface QueuedPhoto {
  id:        string;
  jobId:     string;
  qcNum:     string;
  kind:      'checklist' | 'signature';
  fieldId:   string;   // checklist fieldId, OR the signature's role ('inspector' | 'approver' | 'customer')
  blob:      Blob;
  mimeType:  string;
  createdAt: number;
  attempts:  number;
  lastError?: string;
  // Only populated for kind:'signature' — everything needed to complete
  // the SignOff write once the URL is known, so a signature captured
  // offline is fully specified the moment it's queued, not reconstructed
  // later from whatever local component state happens to still exist.
  signOffPayload?: Omit<SignOff, 'signatureUrl' | 'signedAt'>;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// A tiny pub/sub, not a library — IndexedDB has no native "subscribe to
// changes" API, and every UI surface that shows queue state (PhotoZone
// thumbnails, SingleSignOff's pending view, OfflineBanner's count) needs
// to re-render when the queue changes out from under it, including from
// the background replay processor, not just from user action in that
// component.
const listeners = new Set<() => void>();
export function onQueueChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify() { listeners.forEach((cb) => cb()); }

export async function enqueuePhoto(
  entry: Omit<QueuedPhoto, 'id' | 'createdAt' | 'attempts'>,
): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  await db.put(STORE_NAME, { ...entry, id, createdAt: Date.now(), attempts: 0 });
  notify();
  return id;
}

export async function listQueuedPhotos(): Promise<QueuedPhoto[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function listQueuedPhotosFor(jobId: string, fieldId?: string): Promise<QueuedPhoto[]> {
  const all = await listQueuedPhotos();
  return all.filter((p) => p.jobId === jobId && (fieldId === undefined || p.fieldId === fieldId));
}

// Deletion happens ONLY here, and this function is called from exactly
// one place in the whole codebase: the success branch of the replay
// processor (offlineQueueReplay.ts), never a catch branch. That's the
// actual fix for §11.2 — not a smarter retry policy, just making it
// structurally hard to delete a queue entry on any path other than
// confirmed success.
export async function removeQueuedPhoto(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
  notify();
}

export async function markAttemptFailed(id: string, error: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) return;
  await db.put(STORE_NAME, { ...existing, attempts: existing.attempts + 1, lastError: error });
  notify();
}
