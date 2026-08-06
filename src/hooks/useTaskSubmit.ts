import {
  doc, updateDoc, addDoc, collection, serverTimestamp, Timestamp, arrayUnion,
  increment, runTransaction, getDoc,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { assignLeastLoaded } from '@/utils/findLeastLoadedUser';
import { resolveCorrectionReturn } from '@/hooks/usePipelineActions';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import { computePriorityScore } from '@/utils/taskScoring';
import { enqueueTaskUpdate } from '@/hooks/useTaskOfflineQueue';
import { logError } from '@/utils/logError';
import { computeSaleClosedEvidence } from '@/utils/computeSaleClosed';
import type { TaskStatus, FieldType, FieldDefinition, PipelineStage } from '@/types';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface SubmitData {
  status:           TaskStatus;
  blockedReason:    string | null;
  fieldAnswers:     Record<string, { value: string; type: FieldType }>;
  fieldPhotos:      Record<string, string[]>;
  location:         { lat: number; lng: number; accuracy?: number } | null;
  followUpDate:     Date | null;
  previousStatus:   TaskStatus;
  taskNum:          string;
  title:            string;
  fields:           FieldDefinition[];
}

export function useTaskSubmit() {
  const { currentUser } = useAuthStore();
  const { showToast }   = useToast();

  async function submitTaskUpdate(taskId: string, data: SubmitData): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    const taskRef = doc(db, 'tasks', taskId);

    // Read the current sale-closed field mapping and the task's existing
    // saleClosedSource once, up front, so the Step-1 write below can carry
    // the recomputed flag without ever overwriting a manual admin override.
    const cfgSnap = await getDoc(doc(db, 'appConfig', 'global'));
    const saleClosedConfig = cfgSnap.data()?.['saleClosedConfig'] as
      import('@/types').SaleClosedConfig | undefined;
    const curTaskSnap = await getDoc(taskRef);
    const curTask = curTaskSnap.data() ?? {};
    const existingSource = curTask['saleClosedSource'] as
      'auto' | 'manual' | null | undefined;
    const newSaleClosed = computeSaleClosedEvidence(
      {
        fieldAnswers:    data.fieldAnswers,
        fieldPhotos:     data.fieldPhotos,
        documentAnswers: curTask['documentAnswers'],
        documentPhotos:  curTask['documentPhotos'],
      },
      saleClosedConfig,
    );
    const saleClosedUpdate = existingSource === 'manual'
      ? {}
      : { saleClosed: newSaleClosed, saleClosedSource: 'auto' as const };

    // Step 1: Save main task data — retried up to 3 times on transient errors.
    // Photos are already in Cloudinary at this point (uploaded at capture time in
    // PhotoZone.tsx). Retrying guarantees the https:// URLs are committed to Firestore
    // even if a brief network blip hits the first attempt (the T-009 scenario).
    const RETRY_DELAYS = [500, 1000];
    let lastWriteErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await updateDoc(taskRef, {
          status:        data.status,
          priorityScore: computePriorityScore('survey', data.status),
          blockedReason: data.blockedReason ?? null,
          fieldAnswers:  data.fieldAnswers,
          fieldPhotos:   data.fieldPhotos,
          location:      data.location,
          followUpDate:  data.followUpDate ? Timestamp.fromDate(data.followUpDate) : null,
          submittedBy:   currentUser.uid,
          submittedAt:   serverTimestamp(),
          updatedAt:     serverTimestamp(),
          ...saleClosedUpdate,
        });
        lastWriteErr = undefined;
        break;
      } catch (err) {
        lastWriteErr = err;
        const code = (err as { code?: string }).code;
        if (code === 'permission-denied') throw err;
        if (attempt < 3) {
          console.warn(`[useTaskSubmit] Retrying main write, attempt ${attempt + 1} of 3`);
          await wait(RETRY_DELAYS[attempt - 1]);
        } else {
          void logError('taskSubmit.mainWrite', err, { taskId, attempt });
        }
      }
    }
    if (lastWriteErr !== undefined) {
      // All 3 retries failed — save to offline queue so the user's work isn't lost
      try {
        await enqueueTaskUpdate({
          taskId:         taskId,
          taskNum:        data.taskNum,
          title:          data.title,
          previousStatus: data.previousStatus,
          queuedAt:       Date.now(),
          attempts:       0,
          payload: {
            status:           data.status,
            blockedReason:    data.blockedReason ?? null,
            fieldAnswers:     data.fieldAnswers,
            fieldPhotos:      data.fieldPhotos,
            location:         data.location ?? null,
            followUpDate:     data.followUpDate ?? null,
            submittedAt:      new Date().toISOString(),
            fields:           data.fields,
            completionPhotos: [],
          },
        });
        showToast('Saved locally — will sync when connection improves.', 'success');
        return;
      } catch {
        throw lastWriteErr;
      }
    }

    // Step 2: Pipeline transition — survey → proposal (or correction-return stage)
    if (data.status === 'completed') {
      let surveyTargetStage:      PipelineStage = 'proposal';
      let surveyIsReturning                     = false;
      let surveyReturnAssignedTo: string | null = null;
      let surveyReturnAssignedToName            = '';

      let pipelineTransitionErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const surveyStageRef = doc(db, 'tasks', taskId, 'stages', 'survey');
          await runTransaction(db, async (tx) => {
            const taskSnap = await tx.get(taskRef);
            if (!taskSnap.exists()) throw new Error('Task not found');

            const corrResult = resolveCorrectionReturn(taskSnap.data() as Record<string, unknown>, 'proposal');
            surveyTargetStage          = corrResult.targetStage;
            surveyIsReturning          = corrResult.isReturning;
            surveyReturnAssignedTo     = corrResult.returnAssignedTo;
            surveyReturnAssignedToName = corrResult.returnAssignedToName;

            const stageHistoryEntry = {
              fromStage: 'survey' as const,
              toStage:   surveyTargetStage,
              timestamp: Timestamp.now(),
              actorUid:  currentUser.uid,
              actorName: currentUser.name,
              actorRole: 'field',
              note:      '',
            };

            const taskUpdates: Record<string, unknown> = {
              pipelineStage: surveyTargetStage,
              priorityScore: computePriorityScore(surveyTargetStage, 'completed'),
              stageHistory:  arrayUnion(stageHistoryEntry),
              updatedAt:     serverTimestamp(),
            };

            if (surveyIsReturning) {
              taskUpdates['correctionReturnTo']             = null;
              taskUpdates['correctionReturnAssignedTo']     = null;
              taskUpdates['correctionReturnAssignedToName'] = '';
              taskUpdates['correctionNote']                 = '';
              taskUpdates['correctionSetAt']                = null;
              if (surveyReturnAssignedTo) {
                if (surveyTargetStage === 'proposal') {
                  taskUpdates['proposalAssignedTo']     = surveyReturnAssignedTo;
                  taskUpdates['proposalAssignedToName'] = surveyReturnAssignedToName;
                } else if (surveyTargetStage === 'backend') {
                  taskUpdates['backendAssignedTo']     = surveyReturnAssignedTo;
                  taskUpdates['backendAssignedToName'] = surveyReturnAssignedToName;
                }
              }
            }

            tx.update(taskRef, taskUpdates);

            tx.set(surveyStageRef, {
              fieldAnswers:       data.fieldAnswers,
              fieldPhotos:        data.fieldPhotos,
              location:           data.location,
              submittedAt:        serverTimestamp(),
              submittedBy:        currentUser.uid,
              surveyFormSnapshot: data.fields,
            });

            const countUpdates: Record<string, unknown> = {
              'pipelineCounts.survey':                    increment(-1),
              [`pipelineCounts.${surveyTargetStage}`]:    increment(1),
            };
            if (surveyIsReturning && surveyReturnAssignedTo) {
              countUpdates[`memberCounts.${surveyReturnAssignedTo}`] = increment(1);
            } else if (!surveyIsReturning || !surveyReturnAssignedTo) {
              if (surveyTargetStage === 'proposal') {
                countUpdates['pipelineCounts.unassigned_proposal'] = increment(1);
              } else if (surveyTargetStage === 'backend') {
                countUpdates['pipelineCounts.unassigned_backend'] = increment(1);
              }
            }
            if (['completed', 'dropped'].includes(surveyTargetStage as string)) {
              countUpdates['pipelineCounts.total_active'] = increment(-1);
            }
            tx.update(doc(db, 'appConfig', 'global'), countUpdates);
          });

          pipelineTransitionErr = undefined;
          break;
        } catch (err) {
          pipelineTransitionErr = err;
          if (attempt < 3) {
            console.warn(`[Pipeline] Retrying survey → proposal transition, attempt ${attempt + 1} of 3`);
            await wait(RETRY_DELAYS[attempt - 1]);
          } else {
            void logError('taskSubmit.pipelineTransition', err, { taskId, attempt });
          }
        }
      }

      if (pipelineTransitionErr !== undefined) {
        console.error('[Pipeline] FAILED to transition survey → proposal after 3 attempts:', pipelineTransitionErr);
        showToast('Submission saved, but the stage transition failed. Admin has been notified.', 'error');
      } else if (surveyIsReturning && surveyReturnAssignedTo) {
        // Assignee restored directly in transaction — nothing more to do
      } else if ((surveyTargetStage as string) === 'backend') {
        try {
          const assigned = await assignLeastLoaded(taskId, 'backend', 'backendAssignedTo', 'backendAssignedToName');
          if (assigned) {
            await updateDoc(doc(db, 'appConfig', 'global'), {
              'pipelineCounts.unassigned_backend': increment(-1),
            }).catch((err) => console.error('[Pipeline] unassigned decrement failed:', err));
          }
        } catch (assignErr) {
          console.error('[Pipeline] auto-assign backend failed:', assignErr);
        }
      } else if ((surveyTargetStage as string) === 'proposal') {
        try {
          const assigned = await assignLeastLoaded(taskId, 'proposal', 'proposalAssignedTo', 'proposalAssignedToName');
          if (assigned) {
            await updateDoc(doc(db, 'appConfig', 'global'), {
              'pipelineCounts.unassigned_proposal': increment(-1),
            }).catch((err) => console.error('[Pipeline] unassigned decrement failed:', err));
          }
        } catch (assignErr) {
          console.error('[Pipeline] auto-assign proposal failed:', assignErr);
        }
      }
      // else: target is field_review, documents, completed, or dropped —
      // none of these have an assignable team member, do nothing.

      if (pipelineTransitionErr === undefined && surveyIsReturning) {
        showToast(`Correction resolved — task returned to ${(surveyTargetStage as string).replace('_', ' ')}.`, 'success');
      }
    }

    // Step 3: Write immutable update history
    try {
      await addDoc(collection(db, 'tasks', taskId, 'updates'), {
        submittedBy:     currentUser.uid,
        submittedByName: currentUser.name,
        submittedAt:     serverTimestamp(),
        status:          data.status,
        location:        data.location,
        blockedReason:   data.blockedReason ?? null,
        fieldAnswers:    data.fieldAnswers,
        fieldPhotos:     data.fieldPhotos,
        taskNum:         data.taskNum,
        title:           data.title,
        followUpDate:    data.followUpDate ? Timestamp.fromDate(data.followUpDate) : null,
      });
    } catch (err) {
      console.error('[Firestore] Failed to write update history:', err);
      void logError('taskSubmit.updateHistory', err, { taskId });
    }

    showToast('Update submitted', 'success');
  }

  return { submitTaskUpdate };
}
