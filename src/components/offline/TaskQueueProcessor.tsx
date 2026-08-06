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
  getDoc, arrayUnion, increment, Timestamp, runTransaction,
} from 'firebase/firestore';
import { db }                       from '@/firebase/config';
import { assignLeastLoaded }        from '@/utils/findLeastLoadedUser';
import { resolveCorrectionReturn }  from '@/hooks/usePipelineActions';
import { computePriorityScore }     from '@/utils/taskScoring';
import { logError }               from '@/utils/logError';
import { computeSaleClosedEvidence } from '@/utils/computeSaleClosed';
import type { QueuedTaskUpdate, PipelineStage } from '@/types';

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
          void logError('offlineQueue.photoUploadFailed', err, { fieldId, index: i });
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
        void logError('offlineQueue.syncFailed', err, { taskId: item.taskId, attempts: item.attempts });
        failed++;
        continue;
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

    let anyOversized = false;
    const rawCompletionPhotos = await Promise.all(
      (item.payload.completionPhotos ?? []).map(async (url, i) => {
        try {
          if (url.startsWith('data:')) {
            const isPdf          = url.startsWith('data:application/pdf');
            const limitBytes     = isPdf ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
            const base64Data     = url.split(',')[1] ?? '';
            const estimatedBytes = base64Data.length * 0.75;
            if (estimatedBytes > limitBytes) {
              console.warn(
                `[Queue] Skipping oversized completion photo for task ${item.taskId} ` +
                `(index ${i}): estimated ${(estimatedBytes / (1024 * 1024)).toFixed(1)}MB ` +
                `exceeds the ${isPdf ? '20' : '10'}MB limit. Upload not attempted.`
              );
              anyOversized = true;
              return null;
            }
          }
          return await uploadIfBase64(url, item.taskNum, 'completion', i, undefined, engineerCode, engineerName);
        } catch {
          return url;
        }
      })
    );
    if (anyOversized) {
      _emitToast('One file was too large to upload and was skipped. Max size: 15MB.', 'error');
    }
    const finalCompletionPhotos = rawCompletionPhotos.filter((u): u is string => u !== null);

    const taskRef = doc(db, 'tasks', item.taskId);

    // Read the current sale-closed field mapping and the task's existing
    // saleClosedSource once, up front, so the write below can carry the
    // recomputed flag without ever overwriting a manual admin override —
    // same rule as useTaskSubmit.ts and submitDocuments.
    const cfgSnap = await getDoc(doc(db, 'appConfig', 'global'));
    const saleClosedConfig = cfgSnap.data()?.['saleClosedConfig'] as
      import('@/types').SaleClosedConfig | undefined;
    const curTaskSnap = await getDoc(taskRef);
    const curTask = curTaskSnap.data() ?? {};
    const existingSource = curTask['saleClosedSource'] as
      'auto' | 'manual' | null | undefined;
    const newSaleClosed = computeSaleClosedEvidence(
      {
        fieldAnswers:    item.payload.fieldAnswers,
        fieldPhotos:     finalFieldPhotos,
        documentAnswers: curTask['documentAnswers'],
        documentPhotos:  curTask['documentPhotos'],
      },
      saleClosedConfig,
    );
    const saleClosedUpdate = existingSource === 'manual'
      ? {}
      : { saleClosed: newSaleClosed, saleClosedSource: 'auto' as const };

    await updateDoc(taskRef, {
      status:           item.payload.status,
      blockedReason:    item.payload.blockedReason ?? null,
      fieldAnswers:     item.payload.fieldAnswers,
      fieldPhotos:      finalFieldPhotos,
      completionPhotos: finalCompletionPhotos,
      location:         item.payload.location,
      followUpDate:     item.payload.followUpDate
        ? new Date(item.payload.followUpDate as string)
        : null,
      submittedBy:      currentUser?.uid ?? '',
      submittedAt:      serverTimestamp(),
      updatedAt:        serverTimestamp(),
      ...saleClosedUpdate,
    });

    if (!item.historyWritten) {
      await addDoc(collection(db, 'tasks', item.taskId, 'updates'), {
        submittedBy:      currentUser?.uid ?? '',
        submittedByName:  currentUser?.name ?? '',
        submittedAt:      serverTimestamp(),
        status:           item.payload.status,
        location:         item.payload.location,
        blockedReason:    item.payload.blockedReason ?? null,
        fieldAnswers:     item.payload.fieldAnswers,
        fieldPhotos:      finalFieldPhotos,
        completionPhotos: finalCompletionPhotos,
        taskNum:          item.taskNum,
        title:            item.title,
      });
      await updateQueueItem(item.id!, { historyWritten: true });
    }

    // ── Pipeline transition for completed survey ──────────────
    if (item.payload.status === 'completed') {
      try {
        const freshSnap = await getDoc(taskRef);
        if (!freshSnap.exists()) return;

        const freshData = freshSnap.data();
        const stage     = freshData['pipelineStage'] as string;

        // Only trigger if still at survey stage (avoid re-triggering if already moved)
        if (stage !== 'survey') return;

        let offlineTargetStage:      PipelineStage = 'proposal';
        let offlineIsReturning                     = false;
        let offlineReturnAssignedTo: string | null = null;
        let offlineReturnAssignedToName            = '';

        const surveyStageRef = doc(db, 'tasks', item.taskId, 'stages', 'survey');
        await runTransaction(db, async (tx) => {
          const taskSnap = await tx.get(taskRef);
          if (!taskSnap.exists()) return;

          const corrResult = resolveCorrectionReturn(taskSnap.data() as Record<string, unknown>, 'proposal');
          offlineTargetStage          = corrResult.targetStage;
          offlineIsReturning          = corrResult.isReturning;
          offlineReturnAssignedTo     = corrResult.returnAssignedTo;
          offlineReturnAssignedToName = corrResult.returnAssignedToName;

          const stageHistoryEntry = {
            fromStage: 'survey' as const,
            toStage:   offlineTargetStage,
            timestamp: Timestamp.now(),
            actorUid:  currentUser?.uid  ?? '',
            actorName: currentUser?.name ?? '',
            actorRole: 'field',
            note:      '(synced from offline queue)',
          };

          const taskUpdates: Record<string, unknown> = {
            pipelineStage: offlineTargetStage,
            priorityScore: computePriorityScore(offlineTargetStage, 'completed'),
            stageHistory:  arrayUnion(stageHistoryEntry),
            updatedAt:     serverTimestamp(),
          };

          if (offlineIsReturning) {
            taskUpdates['correctionReturnTo']             = null;
            taskUpdates['correctionReturnAssignedTo']     = null;
            taskUpdates['correctionReturnAssignedToName'] = '';
            taskUpdates['correctionNote']                 = '';
            taskUpdates['correctionSetAt']                = null;
            if (offlineReturnAssignedTo) {
              if (offlineTargetStage === 'proposal') {
                taskUpdates['proposalAssignedTo']     = offlineReturnAssignedTo;
                taskUpdates['proposalAssignedToName'] = offlineReturnAssignedToName;
              } else if (offlineTargetStage === 'backend') {
                taskUpdates['backendAssignedTo']     = offlineReturnAssignedTo;
                taskUpdates['backendAssignedToName'] = offlineReturnAssignedToName;
              }
            }
          }

          tx.set(surveyStageRef, {
            fieldAnswers:       item.payload.fieldAnswers,
            fieldPhotos:        finalFieldPhotos,
            location:           item.payload.location,
            submittedAt:        serverTimestamp(),
            submittedBy:        currentUser?.uid ?? '',
            surveyFormSnapshot: item.payload.fields ?? [],
          });
          tx.update(taskRef, taskUpdates);

          const countUpdates: Record<string, unknown> = {
            'pipelineCounts.survey':                       increment(-1),
            [`pipelineCounts.${offlineTargetStage}`]:      increment(1),
          };
          if (offlineIsReturning && offlineReturnAssignedTo) {
            countUpdates[`memberCounts.${offlineReturnAssignedTo}`] = increment(1);
          } else if (!offlineIsReturning || !offlineReturnAssignedTo) {
            if (offlineTargetStage === 'proposal') {
              countUpdates['pipelineCounts.unassigned_proposal'] = increment(1);
            } else if (offlineTargetStage === 'backend') {
              countUpdates['pipelineCounts.unassigned_backend'] = increment(1);
            }
          }
          if (['completed', 'dropped'].includes(offlineTargetStage as string)) {
            countUpdates['pipelineCounts.total_active'] = increment(-1);
          }
          tx.update(doc(db, 'appConfig', 'global'), countUpdates);
        });

        if (offlineIsReturning && offlineReturnAssignedTo) {
          // Assignee restored directly in transaction — nothing more to do
        } else if ((offlineTargetStage as string) === 'backend') {
          try {
            const assigned = await assignLeastLoaded(item.taskId, 'backend', 'backendAssignedTo', 'backendAssignedToName');
            if (assigned) {
              await updateDoc(doc(db, 'appConfig', 'global'), {
                'pipelineCounts.unassigned_backend': increment(-1),
              }).catch(console.error);
            }
          } catch (assignErr) {
            console.error('[Queue] offline auto-assign backend failed:', assignErr);
          }
        } else if ((offlineTargetStage as string) === 'proposal') {
          try {
            const assigned = await assignLeastLoaded(item.taskId, 'proposal', 'proposalAssignedTo', 'proposalAssignedToName');
            if (assigned) {
              await updateDoc(doc(db, 'appConfig', 'global'), {
                'pipelineCounts.unassigned_proposal': increment(-1),
              }).catch(console.error);
            }
          } catch (assignErr) {
            console.error('[Queue] offline auto-assign proposal failed:', assignErr);
          }
        }
        // else: target is field_review, documents, completed, or dropped —
        // none of these have an assignable team member, do nothing.

        if (offlineIsReturning) {
          console.log(`[Queue] Correction resolved for offline item ${item.taskId} — task returned to ${offlineTargetStage}`);
        }
        console.warn('[Queue] Pipeline transition triggered for offline survey completion:', item.taskId);
      } catch (pipelineErr) {
        console.error('[Queue] Pipeline transition failed for offline item:', pipelineErr);
      }
    }
  }

  useEffect(() => {
    if (!isOnline) return;
    const timer = setTimeout(() => { processQueue(); }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, currentUser?.uid]);

  return null;
}
