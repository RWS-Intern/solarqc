import {
  doc, updateDoc, addDoc, collection, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import type { TaskStatus, FieldType } from '@/types';

interface SubmitData {
  status:           TaskStatus;
  blockedReason:    string | null;
  fieldAnswers:     Record<string, { value: string; type: FieldType }>;
  fieldPhotos:      Record<string, string[]>;
  location:         { lat: number; lng: number } | null;
  followUpDate:     Date | null;
  previousStatus:   TaskStatus;
  taskNum:          string;
  title:            string;
}

export function useTaskSubmit() {
  const { currentUser } = useAuthStore();
  const { showToast }   = useToast();

  async function submitTaskUpdate(taskId: string, data: SubmitData): Promise<void> {
    if (!currentUser) throw new Error('Not authenticated');

    const taskRef = doc(db, 'tasks', taskId);

    await updateDoc(taskRef, {
      status:           data.status,
      blockedReason:    data.blockedReason ?? null,
      fieldAnswers:     data.fieldAnswers,
      fieldPhotos:      data.fieldPhotos,
      location:         data.location,
      followUpDate:     data.followUpDate ? Timestamp.fromDate(data.followUpDate) : null,
      submittedBy:      currentUser.uid,
      submittedAt:      serverTimestamp(),
      updatedAt:        serverTimestamp(),
    });

    try {
      await addDoc(collection(db, 'tasks', taskId, 'updates'), {
        submittedBy:      currentUser.uid,
        submittedByName:  currentUser.name,
        submittedAt:      serverTimestamp(),
        status:           data.status,
        location:         data.location,
        blockedReason:    data.blockedReason ?? null,
        fieldAnswers:     data.fieldAnswers,
        fieldPhotos:      data.fieldPhotos,
        taskNum:          data.taskNum,
        title:            data.title,
        followUpDate:     data.followUpDate ? Timestamp.fromDate(data.followUpDate) : null,
      });
    } catch (err) {
      console.error('[Firestore] Failed to write update history:', err);
      // Don't throw — main task doc already saved successfully
    }

    showToast('Update submitted', 'success');
  }

  return { submitTaskUpdate };
}
