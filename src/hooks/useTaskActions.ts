import {
  collection, doc, addDoc, updateDoc,
  runTransaction, serverTimestamp, Timestamp, increment, arrayUnion,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import type { FieldEngineer } from '@/hooks/useFieldEngineers';

interface CreateTaskData {
  title:            string;
  description?:     string;
  district?:        string;
  assignedTo:       string | null;
  assignedToName:   string;
  assignedToCode:   string;
  assignedToMobile?: string;
  dueDate:          Date | null;
}

export function useTaskActions() {
  const { currentUser } = useAuthStore();
  const { showToast }   = useToast();

  async function createTask(data: CreateTaskData): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    const configRef = doc(db, 'appConfig', 'global');
    let taskNum = '';
    let templateFields: unknown[] = [];

    await runTransaction(db, async (tx) => {
      const configSnap = await tx.get(configRef);
      const next = ((configSnap.data()?.['taskNumCounter'] as number | undefined) ?? 0) + 1;
      taskNum = `T-${String(next).padStart(3, '0')}`;
      templateFields = (configSnap.data()?.['taskTemplate'] as unknown[]) ?? [];
      tx.update(configRef, { taskNumCounter: next });
    });

    await addDoc(collection(db, 'tasks'), {
      taskNum,
      title:            data.title.trim(),
      titleLower:       data.title.trim().toLowerCase(),
      description:      data.description?.trim() ?? '',
      district:         data.district?.trim() ?? '',
      assignedTo:       data.assignedTo,
      assignedToName:   data.assignedToName,
      assignedToCode:   data.assignedToCode,
      assignedToMobile: data.assignedToMobile ?? '',
      dueDate:          data.dueDate ? Timestamp.fromDate(data.dueDate) : null,
      followUpDate:     null,
      status:           'pending',
      fields:           templateFields,
      fieldAnswers:     {},
      fieldPhotos:      {},
      completionPhotos: [],
      blockedReason:    null,
      location:         null,
      submittedBy:      null,
      submittedAt:      null,
      archived:                false,
      pipelineStage:           'survey' as const,
      stageHistory:            [],
      proposalAssignedTo:      null,
      proposalAssignedToName:  '',
      backendAssignedTo:       null,
      backendAssignedToName:   '',
      proposalRevisionCount:   0,
      droppedReason:           null,
      paymentType:             null,
      applicationJourneySteps: [],
      currentStepIndex:        0,
      journeyCompleted:        false,
      createdBy:               currentUser.uid,
      createdAt:        serverTimestamp(),
      updatedAt:        serverTimestamp(),
    });

    await updateDoc(doc(db, 'appConfig', 'global'), {
      'pipelineCounts.survey':       increment(1),
      'pipelineCounts.total_active': increment(1),
    });

    // Best-effort: ensure any newly typed district is added to the global list.
    // Uses arrayUnion so concurrent writes are safe and duplicates are impossible.
    const district = data.district?.trim();
    if (district) {
      updateDoc(doc(db, 'appConfig', 'global'), {
        districts: arrayUnion(district),
      }).catch((err) => console.error('[createTask] district arrayUnion failed:', err));
    }

    showToast(`Task ${taskNum} created`, 'success');
  }

  async function assignTask(
    taskId:   string,
    engineer: FieldEngineer,
  ): Promise<void> {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(taskRef);
        if (!snap.exists()) throw new Error('Task not found');

        const currentAssignedTo   = snap.data()['assignedTo'];
        const currentAssigneeName = snap.data()['assignedToName'];

        if (currentAssignedTo && currentAssignedTo !== engineer.uid) {
          console.warn(
            `[assignTask] Reassigning from ${currentAssigneeName} to ${engineer.displayName}`,
          );
        }

        tx.update(taskRef, {
          assignedTo:       engineer.uid,
          assignedToName:   engineer.displayName,
          assignedToCode:   engineer.engineerCode ?? '',
          assignedToMobile: engineer.mobileNumber ?? '',
          updatedAt:        serverTimestamp(),
        });
      });
      showToast(`Assigned to ${engineer.displayName}`, 'success');
    } catch (err) {
      console.error('[assignTask] failed:', err);
      showToast('Failed to assign task. Try again.', 'error');
      throw err;
    }
  }

  async function archiveTask(taskId: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      const taskRef      = doc(db, 'tasks', taskId);
      const appConfigRef = doc(db, 'appConfig', 'global');

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const data        = taskSnap.data();
        const stage       = (data['pipelineStage'] as string) ?? 'survey';
        const proposalUid = data['proposalAssignedTo'] as string | null;
        const backendUid  = data['backendAssignedTo']  as string | null;
        const archived    = data['archived'] as boolean;

        if (archived) throw new Error('Task already archived');

        tx.update(taskRef, {
          archived:   true,
          archivedAt: serverTimestamp(),
          updatedAt:  serverTimestamp(),
        });

        const pcUpdates: Record<string, unknown> = {};
        const mcUpdates: Record<string, unknown> = {};

        const activeStages   = ['survey', 'proposal', 'field_review', 'backend'];
        const terminalStages = ['completed', 'dropped'];
        if (activeStages.includes(stage)) {
          pcUpdates[`pipelineCounts.${stage}`]     = increment(-1);
          pcUpdates['pipelineCounts.total_active'] = increment(-1);
        } else if (terminalStages.includes(stage)) {
          pcUpdates[`pipelineCounts.${stage}`]     = increment(-1);
        }

        if (stage === 'proposal' && !proposalUid) {
          pcUpdates['pipelineCounts.unassigned_proposal'] = increment(-1);
        }
        if (stage === 'backend' && !backendUid) {
          pcUpdates['pipelineCounts.unassigned_backend'] = increment(-1);
        }

        if (stage === 'proposal' && proposalUid) {
          mcUpdates[`memberCounts.${proposalUid}`] = increment(-1);
        }
        if (stage === 'backend' && backendUid) {
          mcUpdates[`memberCounts.${backendUid}`] = increment(-1);
        }

        const allUpdates = { ...pcUpdates, ...mcUpdates };
        if (Object.keys(allUpdates).length > 0) {
          tx.update(appConfigRef, allUpdates);
        }
      });

      showToast('Task archived', 'success');
    } catch (err) {
      console.error('[archiveTask] failed:', err);
      showToast('Failed to archive task. Try again.', 'error');
      throw err;
    }
  }

  async function updateTaskTitle(
    taskId:   string,
    newTitle: string,
  ): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    if (!newTitle.trim()) throw new Error('Title cannot be empty');
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        title:      newTitle.trim(),
        titleLower: newTitle.trim().toLowerCase(),
        updatedAt:  serverTimestamp(),
      });
      showToast('Title updated', 'success');
    } catch (err) {
      console.error('[updateTaskTitle] failed:', err);
      showToast('Failed to update title. Try again.', 'error');
      throw err;
    }
  }

  async function unarchiveTask(taskId: string): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');
    try {
      const taskRef      = doc(db, 'tasks', taskId);
      const appConfigRef = doc(db, 'appConfig', 'global');

      await runTransaction(db, async (tx) => {
        const taskSnap = await tx.get(taskRef);
        if (!taskSnap.exists()) throw new Error('Task not found');

        const data        = taskSnap.data();
        const stage       = (data['pipelineStage'] as string) ?? 'survey';
        const proposalUid = data['proposalAssignedTo'] as string | null;
        const backendUid  = data['backendAssignedTo']  as string | null;
        const archived    = data['archived'] as boolean;

        if (!archived) throw new Error('Task is not archived');

        tx.update(taskRef, {
          archived:   false,
          archivedAt: null,
          updatedAt:  serverTimestamp(),
        });

        const allUpdates: Record<string, unknown> = {};

        const activeStages   = ['survey', 'proposal', 'field_review', 'backend'];
        const terminalStages = ['completed', 'dropped'];
        if (activeStages.includes(stage)) {
          allUpdates[`pipelineCounts.${stage}`]     = increment(1);
          allUpdates['pipelineCounts.total_active'] = increment(1);
        } else if (terminalStages.includes(stage)) {
          allUpdates[`pipelineCounts.${stage}`]     = increment(1);
        }

        if (stage === 'proposal' && !proposalUid) {
          allUpdates['pipelineCounts.unassigned_proposal'] = increment(1);
        }
        if (stage === 'backend' && !backendUid) {
          allUpdates['pipelineCounts.unassigned_backend'] = increment(1);
        }

        if (stage === 'proposal' && proposalUid) {
          allUpdates[`memberCounts.${proposalUid}`] = increment(1);
        }
        if (stage === 'backend' && backendUid) {
          allUpdates[`memberCounts.${backendUid}`] = increment(1);
        }

        if (Object.keys(allUpdates).length > 0) {
          tx.update(appConfigRef, allUpdates);
        }
      });

      showToast('Task restored', 'success');
    } catch (err) {
      console.error('[unarchiveTask] failed:', err);
      showToast('Failed to restore task. Try again.', 'error');
      throw err;
    }
  }

  return { createTask, assignTask, archiveTask, unarchiveTask, updateTaskTitle };
}
