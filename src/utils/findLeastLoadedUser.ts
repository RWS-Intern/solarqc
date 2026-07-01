import {
  collection, getDocs, query,
  where, doc, runTransaction, increment, getDoc,
} from 'firebase/firestore';
import { db } from '@/firebase/config';

export interface AssignableUser {
  uid:  string;
  name: string;
}

/**
 * Finds the least loaded active user of a given role.
 * Uses memberCounts in appConfig for O(1) lookup.
 * Returns null if no active users exist for that role.
 */
export async function findLeastLoadedUser(
  role: 'proposal' | 'backend',
): Promise<AssignableUser | null> {
  try {
    const usersSnap = await getDocs(query(
      collection(db, 'users'),
      where('role',   '==', role),
      where('active', '==', true),
    ));

    if (usersSnap.empty) return null;

    const configSnap = await getDocs(query(
      collection(db, 'appConfig'),
    ));
    const configDoc = configSnap.docs.find((d) => d.id === 'global');
    const memberCounts = (
      configDoc?.data()['memberCounts'] ?? {}
    ) as Record<string, number>;

    let leastUid   = '';
    let leastName  = '';
    let leastCount = Infinity;

    usersSnap.docs.forEach((d) => {
      const uid   = d.id;
      const name  = (d.data()['name'] as string) ?? '';
      const count = memberCounts[uid] ?? 0;
      if (
        count < leastCount ||
        (count === leastCount && name < leastName)
      ) {
        leastCount = count;
        leastUid   = uid;
        leastName  = name;
      }
    });

    if (!leastUid) return null;
    return { uid: leastUid, name: leastName };
  } catch (err) {
    console.error('[findLeastLoadedUser] failed:', err);
    return null;
  }
}

/**
 * Atomically assigns a task to the least loaded user
 * using a Firestore transaction to prevent race conditions.
 * Updates both the task document AND memberCounts counter
 * in the same atomic operation.
 *
 * Returns the assigned user or null if assignment failed.
 */
export async function assignLeastLoaded(
  taskId:    string,
  role:      'proposal' | 'backend',
  uidField:  string,
  nameField: string,
): Promise<AssignableUser | null> {
  try {
    const taskRef      = doc(db, 'tasks', taskId);
    const appConfigRef = doc(db, 'appConfig', 'global');

    // Fetch users OUTSIDE transaction
    const usersSnap = await getDocs(query(
      collection(db, 'users'),
      where('role',   '==', role),
      where('active', '==', true),
    ));
    if (usersSnap.empty) return null;

    await runTransaction(db, async (tx) => {
      const [taskSnap, configSnap] = await Promise.all([
        tx.get(taskRef),
        tx.get(appConfigRef),
      ]);

      if (!taskSnap.exists()) {
        throw new Error('Task not found');
      }

      const memberCounts = (
        configSnap.data()?.['memberCounts'] ?? {}
      ) as Record<string, number>;

      // Re-pick best from fresh memberCounts (inside tx)
      let bestUid   = '';
      let bestName  = '';
      let bestCount = Infinity;

      usersSnap.docs.forEach((d) => {
        const uid   = d.id;
        const name  = (d.data()['name'] as string) ?? '';
        const count = memberCounts[uid] ?? 0;
        if (
          count < bestCount ||
          (count === bestCount && name < bestName)
        ) {
          bestCount = count;
          bestUid   = uid;
          bestName  = name;
        }
      });

      if (!bestUid) throw new Error('No valid assignee found');

      tx.update(taskRef, {
        [uidField]:  bestUid,
        [nameField]: bestName,
      });

      tx.update(appConfigRef, {
        [`memberCounts.${bestUid}`]: increment(1),
      });
    });

    // Read back the assigned values from the task
    const finalSnap = await getDoc(doc(db, 'tasks', taskId));
    if (finalSnap.exists()) {
      const data = finalSnap.data();
      const uid  = data[uidField]  as string;
      const name = data[nameField] as string;
      if (uid) return { uid, name };
    }
    return null;
  } catch (err) {
    console.error('[assignLeastLoaded] failed:', err);
    return null;
  }
}
