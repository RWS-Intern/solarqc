import {
  collection, doc, addDoc, updateDoc,
  runTransaction, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import type { FieldEngineer } from '@/hooks/useFieldEngineers';

interface CreateTaskData {
  title:          string;
  description?:   string;
  assignedTo:     string | null;
  assignedToName: string;
  assignedToCode: string;
  dueDate:        Date | null;
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
      description:      data.description?.trim() ?? '',
      assignedTo:       data.assignedTo,
      assignedToName:   data.assignedToName,
      assignedToCode:   data.assignedToCode,
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
      archived:         false,
      createdBy:        currentUser.uid,
      createdAt:        serverTimestamp(),
      updatedAt:        serverTimestamp(),
    });

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
          assignedTo:     engineer.uid,
          assignedToName: engineer.displayName,
          assignedToCode: engineer.engineerCode ?? '',
          updatedAt:      serverTimestamp(),
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
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        archived:  true,
        archivedAt: serverTimestamp(),
        updatedAt:  serverTimestamp(),
      });
      showToast('Task archived', 'success');
    } catch (err) {
      console.error('[archiveTask] failed:', err);
      showToast('Failed to archive task. Try again.', 'error');
      throw err;
    }
  }

  async function unarchiveTask(taskId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        archived:   false,
        archivedAt: null,
        updatedAt:  serverTimestamp(),
      });
      showToast('Task restored', 'success');
    } catch (err) {
      console.error('[unarchiveTask] failed:', err);
      showToast('Failed to restore task. Try again.', 'error');
      throw err;
    }
  }

  return { createTask, assignTask, archiveTask, unarchiveTask };
}
