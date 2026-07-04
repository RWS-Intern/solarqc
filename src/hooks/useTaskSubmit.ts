import {
  doc, updateDoc, addDoc, collection, serverTimestamp, Timestamp, setDoc, arrayUnion,
  increment,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { assignLeastLoaded } from '@/utils/findLeastLoadedUser';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import type { TaskStatus, FieldType, FieldDefinition } from '@/types';

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

    // Step 1: Save main task data
    await updateDoc(taskRef, {
      status:        data.status,
      blockedReason: data.blockedReason ?? null,
      fieldAnswers:  data.fieldAnswers,
      fieldPhotos:   data.fieldPhotos,
      location:      data.location,
      followUpDate:  data.followUpDate ? Timestamp.fromDate(data.followUpDate) : null,
      submittedBy:   currentUser.uid,
      submittedAt:   serverTimestamp(),
      updatedAt:     serverTimestamp(),
    });

    // Step 2: Pipeline transition — survey → proposal (only on completed)
    if (data.status === 'completed') {
      try {
        const stageHistoryEntry = {
          fromStage: 'survey' as const,
          toStage:   'proposal' as const,
          timestamp: Timestamp.now(),
          actorUid:  currentUser.uid,
          actorName: currentUser.name,
          actorRole: 'field',
          note:      '',
        };

        await updateDoc(taskRef, {
          pipelineStage: 'proposal',
          stageHistory:  arrayUnion(stageHistoryEntry),
          updatedAt:     serverTimestamp(),
        });

        const surveyStageRef = doc(db, 'tasks', taskId, 'stages', 'survey');
        await setDoc(surveyStageRef, {
          fieldAnswers:       data.fieldAnswers,
          fieldPhotos:        data.fieldPhotos,
          location:           data.location,
          submittedAt:        serverTimestamp(),
          submittedBy:        currentUser.uid,
          surveyFormSnapshot: data.fields,
        });

        // Update pipeline stage counters
        await updateDoc(doc(db, 'appConfig', 'global'), {
          'pipelineCounts.survey':             increment(-1),
          'pipelineCounts.proposal':           increment(1),
          'pipelineCounts.unassigned_proposal': increment(1),
        }).catch((err) => console.error('[Pipeline] pipelineCounts update failed:', err));

        // Auto-assign to least loaded proposal team member
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

      } catch (pipelineErr) {
        console.error('[Pipeline] FAILED to transition survey → proposal:', pipelineErr);
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
