import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';

export interface DuplicateMatch {
  jobId:     string;
  qcNum:     string;
  name:      string;
  createdAt: Date;
}

export async function checkDuplicateCustomerMobile(
  mobile: string,
  excludeJobId?: string,
): Promise<DuplicateMatch | null> {
  const snap = await getDocs(query(
    collection(db, 'qcJobs'),
    where('archived', '==', false),
    where('customer.mobile', '==', mobile),
  ));
  const match = snap.docs.find((d) => d.id !== excludeJobId);
  if (!match) return null;
  const data = match.data();
  const createdAtRaw = data['createdAt'] as { toDate?: () => Date } | null;
  return {
    jobId:     match.id,
    qcNum:     (data['qcNum'] as string) ?? '',
    name:      (data['customer'] as { name?: string } | undefined)?.name ?? '',
    createdAt: createdAtRaw?.toDate?.() ?? new Date(),
  };
}
