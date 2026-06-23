import { useEffect, useRef }  from 'react';
import { useNetworkStatus }   from '@/hooks/useNetworkStatus';
import { useAuthStore }       from '@/store/authStore';
import {
  getAllQueued, dequeueTaskUpdate, updateQueueItem,
} from '@/hooks/useTaskOfflineQueue';
import { uploadToCloudinary } from '@/utils/uploadToCloudinary';
import { _emitToast }         from '@/components/ui/toast';
import {
  doc, updateDoc, addDoc, collection, serverTimestamp,
} from 'firebase/firestore';
import { db }                 from '@/firebase/config';
import type { QueuedTaskUpdate } from '@/types';

function base64ToFile(base64: string, filename: string): File {
  const arr   = base64.split(',');
  const mime  = arr[0].match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const bstr  = atob(arr[1]);
  let   n     = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

async function uploadIfBase64(
  url:           string,
  taskNum:       string,
  photoType:     'field' | 'completion',
  index:         number,
  fieldId?:      string,
  engineerCode?: string,
  engineerName?: string,
): Promise<string> {
  if (url.startsWith('https://')) return url;
  if (!url.startsWith('data:'))   return url;
  const file   = base64ToFile(url, `photo_${index}.jpg`);
  const result = await uploadToCloudinary(file, {
    taskNum,
    fieldId,
    photoType,
    index,
    fieldLabel:  fieldId,
    engineerCode,
    engineerName,
  });
  return result.url;
}

async function uploadFieldPhotos(
  photos:        Record<string, string[]>,
  taskNum:       string,
  engineerCode?: string,
  engineerName?: string,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const [fieldId, urls] of Object.entries(photos)) {
    result[fieldId] = await Promise.all(
      urls.map(async (url, i) => {
        try {
          return await uploadIfBase64(url, taskNum, 'field', i, fieldId, engineerCode, engineerName);
        } catch (err) {
          console.error(`[Queue] Photo upload failed for field ${fieldId} index ${i}:`, err);
          return url; // keep original URL on failure
        }
      })
    );
  }
  return result;
}

export function TaskQueueProcessor() {
  const isOnline        = useNetworkStatus();
  const { currentUser } = useAuthStore();
  const processingRef   = useRef(false);

  async function processQueue() {
    if (processingRef.current || !currentUser) return;
    const queue = await getAllQueued();
    if (queue.length === 0) return;

    processingRef.current = true;
    let succeeded = 0, failed = 0;
    const MAX_ATTEMPTS = 5;

    for (const item of queue) {
      if (item.attempts >= MAX_ATTEMPTS) {
        console.error(
          `[Queue] Item ${item.taskId} exceeded max attempts (${MAX_ATTEMPTS}). Removing from queue.`
        );
        await dequeueTaskUpdate(item.id!);
        continue;
      }
      try {
        await processSingleItem(item);
        await dequeueTaskUpdate(item.id!);
        succeeded++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await updateQueueItem(item.id!, { attempts: item.attempts + 1, lastError: message });
        failed++;
        break;
      }
    }

    processingRef.current = false;

    if (succeeded > 0 && failed === 0) {
      _emitToast(`${succeeded} offline update${succeeded !== 1 ? 's' : ''} synced successfully`, 'success');
    } else if (succeeded > 0 && failed > 0) {
      _emitToast(`${succeeded} synced, ${failed} failed — will retry when reconnected`, 'warning');
    } else if (failed > 0) {
      _emitToast('Offline sync failed — will retry when reconnected', 'error');
    }
  }

  async function processSingleItem(item: QueuedTaskUpdate) {
    const engineerCode = currentUser?.engineerCode ?? '';
    const engineerName = currentUser?.name ?? '';

    const finalFieldPhotos = await uploadFieldPhotos(item.payload.fieldPhotos, item.taskNum, engineerCode, engineerName);

    const taskRef = doc(db, 'tasks', item.taskId);
    await updateDoc(taskRef, {
      status:           item.payload.status,
      blockedReason:    item.payload.blockedReason ?? null,
      fieldAnswers:     item.payload.fieldAnswers,
      fieldPhotos:      finalFieldPhotos,
      location:         item.payload.location,
      followUpDate:     item.payload.followUpDate
        ? new Date(item.payload.followUpDate as string)
        : null,
      submittedBy:      currentUser?.uid ?? '',
      submittedAt:      serverTimestamp(),
      updatedAt:        serverTimestamp(),
    });

    await addDoc(collection(db, 'tasks', item.taskId, 'updates'), {
      submittedBy:      currentUser?.uid ?? '',
      submittedByName:  currentUser?.name ?? '',
      submittedAt:      serverTimestamp(),
      status:           item.payload.status,
      location:         item.payload.location,
      blockedReason:    item.payload.blockedReason ?? null,
      fieldAnswers:     item.payload.fieldAnswers,
      fieldPhotos:      finalFieldPhotos,
      taskNum:          item.taskNum,
      title:            item.title,
    });
  }

  useEffect(() => {
    if (!isOnline) return;
    const timer = setTimeout(() => { processQueue(); }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, currentUser?.uid]);

  return null;
}
