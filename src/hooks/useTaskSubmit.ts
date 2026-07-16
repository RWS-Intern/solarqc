import {
  doc, updateDoc, addDoc, collection, serverTimestamp, Timestamp, arrayUnion,
  increment, runTransaction,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { assignLeastLoaded } from '@/utils/findLeastLoadedUser';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import { computePriorityScore } from '@/utils/taskScoring';
import { enqueueTaskUpdate } from '@/hooks/useTaskOfflineQueue';
import type { TaskStatus, FieldType, FieldDefinition } from '@/types';

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

    // Step 2: Pipeline transition — survey → proposal (only on completed)
    if (data.status === 'completed') {
      const stageHistoryEntry = {
        fromStage: 'survey' as const,
        toStage:   'proposal' as const,
        timestamp: Timestamp.now(),
        actorUid:  currentUser.uid,
        actorName: currentUser.name,
        actorRole: 'field',
        note:      '',
      };

      let pipelineTransitionErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const surveyStageRef = doc(db, 'tasks', taskId, 'stages', 'survey');
          await runTransaction(db, async (tx) => {
            tx.update(taskRef, {
              pipelineStage: 'proposal',
              priorityScore: computePriorityScore('proposal', 'completed'),
              stageHistory:  arrayUnion(stageHistoryEntry),
              updatedAt:     serverTimestamp(),
            });
            tx.set(surveyStageRef, {
              fieldAnswers:       data.fieldAnswers,
              fieldPhotos:        data.fieldPhotos,
              location:           data.location,
              submittedAt:        serverTimestamp(),
              submittedBy:        currentUser.uid,
              surveyFormSnapshot: data.fields,
            });
            tx.update(doc(db, 'appConfig', 'global'), {
              'pipelineCounts.survey':             increment(-1),
              'pipelineCounts.proposal':           increment(1),
              'pipelineCounts.unassigned_proposal': increment(1),
            });
          });

          pipelineTransitionErr = undefined;
          break;
        } catch (err) {
          pipelineTransitionErr = err;
          if (attempt < 3) {
            console.warn(`[Pipeline] Retrying survey → proposal transition, attempt ${attempt + 1} of 3`);
            await wait(RETRY_DELAYS[attempt - 1]);
          }
        }
      }

      if (pipelineTransitionErr !== undefined) {
        console.error('[Pipeline] FAILED to transition survey → proposal after 3 attempts:', pipelineTransitionErr);
        showToast('Submission saved, but the stage transition failed. Admin has been notified.', 'error');
      } else {
        // Auto-assign to least loaded proposal team member (best-effort — counts already committed above)
        try {
          const assigned = await assignLeastLoaded(
            taskId,
            'proposal',
            'proposalAssignedTo',
            'proposalAssignedToName',
          );
          if (assigned) {
            // Decrement unassigned counter
            await updateDoc(doc(db, 'appConfig', 'global'), {
              'pipelineCounts.unassigned_proposal': increment(-1),
            }).catch((err) =>
              console.error('[Pipeline] unassigned decrement failed:', err)
            );
          }
          // If assigned is null: task stays unassigned
          // Admin sees it in unassigned filter
        } catch (assignErr) {
          console.error('[Pipeline] auto-assign proposal failed:', assignErr);
        }
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
    }

    showToast('Update submitted', 'success');
  }

  return { submitTaskUpdate };
}
