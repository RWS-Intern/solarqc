import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Task } from '@/types';

export function useEngineerTaskStats(uid: string, role: string) {
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    let q;
    if (role === 'proposal') {
      q = query(
        collection(db, 'tasks'),
        where('proposalAssignedTo', '==', uid),
        where('archived', '==', false),
      );
    } else if (role === 'backend') {
      q = query(
        collection(db, 'tasks'),
        where('backendAssignedTo', '==', uid),
        where('archived', '==', false),
      );
    } else {
      // field engineer and others
      q = query(
        collection(db, 'tasks'),
        where('assignedTo', '==', uid),
        where('archived',   '==', false),
      );
    }

    const unsubscribe = onSnapshot(q,
      (snap) => {
        const result = snap.docs.map((d) => {
          const data = d.data();
          const rawDue     = data['dueDate'];
          const rawCreated = data['createdAt'];
          return {
            id:            d.id,
            title:         (data['title']         ?? '') as string,
            taskNum:       (data['taskNum']        ?? '') as string,
            status:        (data['status']         ?? 'pending') as Task['status'],
            archived:      (data['archived']       ?? false)     as boolean,
            pipelineStage: (data['pipelineStage']  ?? 'survey')  as Task['pipelineStage'],
            dueDate:       rawDue     instanceof Timestamp ? rawDue.toDate()     : null,
            createdAt:     rawCreated instanceof Timestamp ? rawCreated.toDate() : new Date(),
          } as Task;
        });
        setTasks(result);
        setLoading(false);
      },
      (err) => {
        console.error('[useEngineerTaskStats]', err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [uid, role]);

  return { tasks, loading };
}
