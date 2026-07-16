import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';

export interface DuplicateMatch {
  taskId:    string;
  taskNum:   string;
  title:     string;
  createdAt: Date;
}

export async function checkDuplicateConsumerMobile(
  mobile: string,
  excludeTaskId?: string,
): Promise<DuplicateMatch | null> {
  const snap = await getDocs(query(
    collection(db, 'tasks'),
    where('archived', '==', false),
    where('consumerMobile', '==', mobile),
  ));
  const match = snap.docs.find((d) => d.id !== excludeTaskId);
  if (!match) return null;
  const data = match.data();
  const createdAtRaw = data['createdAt'] as { toDate?: () => Date } | null;
  return {
    taskId:    match.id,
    taskNum:   (data['taskNum'] as string) ?? '',
    title:     (data['title']   as string) ?? '',
    createdAt: createdAtRaw?.toDate?.() ?? new Date(),
  };
}
