import { useEffect, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  startAfter, getDocs,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useTaskStore } from '@/store/taskStore';
import { useAuthStore } from '@/store/authStore';
import type { Task, TaskStatus } from '@/types';

function docToTask(d: { id: string; data: () => Record<string, unknown> }): Task {
  const data = d.data();
  return {
    id:               d.id,
    taskNum:          (data['taskNum']          as string)  ?? '',
    title:            (data['title']            as string)  ?? '',
    description:      (data['description']      as string)  ?? undefined,
    assignedTo:       (data['assignedTo']       as string | null) ?? null,
    assignedToName:   (data['assignedToName']   as string)  ?? '',
    assignedToCode:   (data['assignedToCode']   as string)  ?? '',
    status:           ((data['status']          as string)  ?? 'pending') as TaskStatus,
    dueDate:          (data['dueDate'] as { toDate?: () => Date } | null)?.toDate?.()        ?? null,
    followUpDate:     (data['followUpDate'] as { toDate?: () => Date } | null)?.toDate?.()   ?? null,
    fields:           (data['fields']           as Task['fields'])  ?? [],
    fieldAnswers:     (data['fieldAnswers']      as Task['fieldAnswers'])  ?? {},
    fieldPhotos:      (data['fieldPhotos']       as Task['fieldPhotos'])   ?? {},
    completionPhotos: (data['completionPhotos']  as string[]) ?? [],
    blockedReason:    (data['blockedReason']     as string | null)  ?? null,
    location:         (data['location']          as Task['location'])      ?? null,
    submittedBy:      (data['submittedBy']       as string | null)  ?? null,
    submittedAt:      (data['submittedAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
    createdBy:        (data['createdBy']         as string)  ?? '',
    createdAt:        (data['createdAt'] as { toDate?: () => Date } | null)?.toDate?.()   ?? new Date(),
    updatedAt:        (data['updatedAt'] as { toDate?: () => Date } | null)?.toDate?.()   ?? new Date(),
    archived:         (data['archived']          as boolean) ?? false,
    archivedAt:       (data['archivedAt'] as { toDate?: () => Date } | null)?.toDate?.()  ?? null,
  };
}

const PAGE_SIZE = 200;

export function useArchivedTasks() {
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [loading, setLoading]             = useState(false);
  const { currentUser }                   = useAuthStore();

  async function loadArchivedTasks() {
    if (!currentUser || currentUser.role !== 'admin') return;
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'tasks'),
        where('archived', '==', true),
        orderBy('archivedAt', 'desc'),
        limit(100),
      ));
      setArchivedTasks(snap.docs.map(docToTask));
    } catch (err) {
      console.error('[useArchivedTasks] error:', err);
    } finally {
      setLoading(false);
    }
  }

  return { archivedTasks, loading, loadArchivedTasks };
}

export function useTasks() {
  const { setTasks, setLastUpdated, setIsConnected, setHasMore, setLoadingMore, setLoadMore } = useTaskStore();
  const { currentUser } = useAuthStore();
  const lastDocRef = useRef<DocumentSnapshot | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    lastDocRef.current = null;
    setHasMore(false);
    setLoadMore(null);

    let q;
    if (currentUser.role === 'admin') {
      q = query(
        collection(db, 'tasks'),
        where('archived', '==', false),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE),
      );
    } else {
      q = query(
        collection(db, 'tasks'),
        where('assignedTo', '==', currentUser.uid),
        where('archived', '==', false),
        orderBy('createdAt', 'desc'),
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const tasks = snap.docs.map(docToTask);
        setTasks(tasks);
        setLastUpdated(new Date());
        setIsConnected(true);
        if (currentUser.role === 'admin') {
          lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
          setHasMore(snap.docs.length === PAGE_SIZE);
        }
      },
      (err) => {
        console.error('[useTasks] snapshot error:', err);
        setIsConnected(false);
      },
    );

    async function loadMore() {
      if (!lastDocRef.current) return;
      setLoadingMore(true);
      try {
        const moreQuery = query(
          collection(db, 'tasks'),
          where('archived', '==', false),
          orderBy('createdAt', 'desc'),
          startAfter(lastDocRef.current),
          limit(PAGE_SIZE),
        );
        const snap = await getDocs(moreQuery);
        const moreTasks = snap.docs.map(docToTask);
        const existing = useTaskStore.getState().tasks;
        setTasks([...existing, ...moreTasks]);
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (err) {
        console.error('[useTasks] loadMore error:', err);
      } finally {
        setLoadingMore(false);
      }
    }

    if (currentUser.role === 'admin') {
      setLoadMore(loadMore);

      // Background load all tasks for full-search coverage
      const loadSearchTasks = () => {
        const { setSearchTasks, setSearchTasksLoaded } = useTaskStore.getState();
        setSearchTasksLoaded(false);
        getDocs(query(
          collection(db, 'tasks'),
          where('archived', '==', false),
          orderBy('createdAt', 'desc'),
        )).then((snap) => {
          setSearchTasks(snap.docs.map(docToTask));
        }).catch((err) => {
          console.error('[useTasks] search load failed:', err);
        });
      };

      loadSearchTasks();

      // Refresh every 5 minutes so newly created tasks appear in search
      const interval = setInterval(loadSearchTasks, 5 * 60 * 1000);

      return () => {
        unsubscribe();
        clearInterval(interval);
      };
    }

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);
}
