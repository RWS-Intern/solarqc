import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';

export async function logError(
  action: string,
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const currentUser = useAuthStore.getState().currentUser;
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code ?? null;

    await addDoc(collection(db, 'errorLogs'), {
      action,
      errorMessage: message,
      errorCode: code,
      userId: currentUser?.uid ?? null,
      userName: currentUser?.name ?? 'unknown',
      userRole: currentUser?.role ?? 'unknown',
      context: context ?? {},
      online: navigator.onLine,
      createdAt: serverTimestamp(),
    });
  } catch (logErr) {
    // Never let logging failure break the app or mask the original error
    console.error('[logError] failed to write error log:', logErr);
  }
}
