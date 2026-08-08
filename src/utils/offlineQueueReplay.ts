import { doc, runTransaction, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/firebase/config';
import { uploadToCloudinary } from '@/utils/uploadToCloudinary';
import {
  listQueuedPhotos, removeQueuedPhoto, markAttemptFailed, type QueuedPhoto,
} from '@/utils/offlinePhotoQueue';
import type { QcJob, SignOff } from '@/types/qc';

const SIGNOFF_FIELD: Record<SignOff['role'], 'inspectorSignOff' | 'customerSignOff' | 'approverSignOff'> = {
  inspector: 'inspectorSignOff',
  customer:  'customerSignOff',
  approver:  'approverSignOff',
};

// A real Cloudinary-side rejection (bad preset, quota, anything
// uploadWithRetry's own retries already exhausted for a non-network
// reason) would fail identically forever if queued — that's not
// resilience, it's a bug hiding a real configuration problem. Only a
// failure that actually looks like "the network isn't there" is worth
// queueing; anything else must still surface as a real, visible error.
export function isConnectivityFailure(err: unknown): boolean {
  if (!navigator.onLine) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /network error/i.test(message) || /timed out/i.test(message);
}

// Reads the current photoUrls and appends to it inside a transaction,
// rather than a plain updateDoc with a stale array — the live document
// may have changed (other photos added/removed on this same field) since
// this one was queued. Rebuilds the whole per-field answer from the
// transaction's own fresh read so nothing else on that answer (status,
// remark) can be clobbered by a stale local reference either.
async function appendReplayedChecklistPhoto(jobId: string, fieldId: string, url: string): Promise<void> {
  const jobRef = doc(db, 'qcJobs', jobId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists()) throw new Error(`Job ${jobId} no longer exists`);
    const data     = snap.data() as { answers?: QcJob['answers']; reworkRound?: number };
    const answers  = data.answers ?? {};
    const existing = answers[fieldId];
    const photoUrls = [...(existing?.photoUrls ?? []), url];
    tx.update(jobRef, {
      [`answers.${fieldId}`]: {
        ...(existing ?? {
          fieldId, status: null, remark: '', photoUrls: [],
          answeredAt: null, answeredBy: '', round: data.reworkRound ?? 0,
        }),
        photoUrls,
        answeredAt: serverTimestamp(),
        answeredBy: auth.currentUser?.uid ?? existing?.answeredBy ?? '',
      },
      updatedAt: serverTimestamp(),
    });
  });
}

async function writeReplayedSignOff(
  jobId: string,
  role: SignOff['role'],
  payload: Omit<SignOff, 'signatureUrl' | 'signedAt'>,
  url: string,
): Promise<void> {
  await updateDoc(doc(db, 'qcJobs', jobId), {
    [SIGNOFF_FIELD[role]]: { ...payload, signatureUrl: url, signedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

async function replayOne(item: QueuedPhoto): Promise<void> {
  const ext  = item.mimeType.split('/')[1] ?? 'jpg';
  const file = new File([item.blob], `${item.kind}-${item.fieldId}-${item.id}.${ext}`, { type: item.mimeType });
  const { url } = await uploadToCloudinary(file, {
    qcNum: item.qcNum,
    fieldId: item.fieldId,
    uploadType: item.kind === 'signature' ? 'signature' : 'checklist',
    skipCompression: item.kind === 'signature',
  });

  if (item.kind === 'checklist') {
    await appendReplayedChecklistPhoto(item.jobId, item.fieldId, url);
  } else {
    await writeReplayedSignOff(item.jobId, item.fieldId as SignOff['role'], item.signOffPayload!, url);
  }
}

let processing = false; // guards against the 'online' event and the
                         // periodic safety-net retry overlapping

export async function processOfflineQueue(): Promise<void> {
  if (processing || !navigator.onLine) return;
  processing = true;
  try {
    const items = await listQueuedPhotos();
    for (const item of items) {
      try {
        await replayOne(item);
        await removeQueuedPhoto(item.id); // only ever reached after both
                                           // the upload AND the Firestore
                                           // write above have succeeded
      } catch (err) {
        await markAttemptFailed(item.id, err instanceof Error ? err.message : String(err));
        // deliberately no removal — stays queued for the next trigger
      }
    }
  } finally {
    processing = false;
  }
}
