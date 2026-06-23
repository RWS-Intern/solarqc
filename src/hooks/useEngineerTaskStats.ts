import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Task } from '@/types';

export function useEngineerTaskStats(uid: string) {
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setTasks([]); setLoading(false); return; }
    setLoading(true);

    const q = query(collection(db, 'tasks'), where('assignedTo', '==', uid));

    const unsubscribe = onSnapshot(q,
      (snap) => {
        const result = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id:       d.id,
              status:   (data['status']   ?? 'pending') as Task['status'],
              archived: (data['archived'] ?? false)     as boolean,
            } as Task;
          })
          .filter((t) => !t.archived);
        setTasks(result);
        setLoading(false);
      },
      (err) => { console.error('[useEngineerTaskStats]', err); setLoading(false); },
    );

    return () => unsubscribe();
  }, [uid]);

  return { tasks, loading };
}
