import { useEffect } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  getDocs, startAfter, limit,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db }           from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';
import type { Task, PipelineStage, StageHistoryEntry, JourneyStepAnswer } from '@/types';

function docToBackendTask(d: { id: string; data: () => Record<string, unknown> }): Task {
  const data = d.data();
  return {
    id:               d.id,
    taskNum:          (data['taskNum']         as string)  ?? '',
    title:            (data['title']           as string)  ?? '',
    description:      (data['description']     as string)  ?? undefined,
    assignedTo:       (data['assignedTo']      as string | null) ?? null,
    assignedToName:   (data['assignedToName']  as string)  ?? '',
    assignedToCode:   (data['assignedToCode']  as string)  ?? '',
    status:           ((data['status']         as string)  ?? 'pending') as Task['status'],
    dueDate:          (data['dueDate']      as { toDate?: () => Date } | null)?.toDate?.()      ?? null,
    followUpDate:     (data['followUpDate'] as { toDate?: () => Date } | null)?.toDate?.()      ?? null,
    fields:           (data['fields']          as Task['fields'])  ?? [],
    fieldAnswers:     (data['fieldAnswers']     as Task['fieldAnswers']) ?? {},
    fieldPhotos:      (data['fieldPhotos']      as Task['fieldPhotos'])  ?? {},
    completionPhotos: (data['completionPhotos'] as string[]) ?? [],
    blockedReason:    (data['blockedReason']    as string | null) ?? null,
    location:         (data['location']         as Task['location'])    ?? null,
    submittedBy:      (data['submittedBy']      as string | null) ?? null,
    submittedAt:      (data['submittedAt'] as { toDate?: () => Date } | null)?.toDate?.()       ?? null,
    createdBy:        (data['createdBy']        as string)  ?? '',
    createdAt:        (data['createdAt'] as { toDate?: () => Date } | null)?.toDate?.()         ?? new Date(),
    updatedAt:        (data['updatedAt'] as { toDate?: () => Date } | null)?.toDate?.()         ?? new Date(),
    archived:         (data['archived']         as boolean) ?? false,
    archivedAt:       (data['archivedAt'] as { toDate?: () => Date } | null)?.toDate?.()        ?? null,
    pipelineStage:           ((data['pipelineStage'] as string) ?? 'survey') as PipelineStage,
    stageHistory:            ((data['stageHistory'] as StageHistoryEntry[]) ?? []).map((e) => ({
                               ...e,
                               timestamp: (e.timestamp as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date(),
                             })),
    proposalAssignedTo:      (data['proposalAssignedTo']      as string | null) ?? null,
    proposalAssignedToName:  (data['proposalAssignedToName']  as string) ?? '',
    backendAssignedTo:       (data['backendAssignedTo']       as string | null) ?? null,
    backendAssignedToName:   (data['backendAssignedToName']   as string) ?? '',
    logisticsAssignedTo:     (data['logisticsAssignedTo']     as string | null) ?? null,
    logisticsAssignedToName: (data['logisticsAssignedToName'] as string) ?? '',
    installationAssignedTo:      (data['installationAssignedTo']      as string | null) ?? null,
    installationAssignedToName:  (data['installationAssignedToName']  as string) ?? '',
    proposalRevisionCount:   (data['proposalRevisionCount']   as number) ?? 0,
    droppedReason:           (data['droppedReason']           as string | null) ?? null,
    paymentType:             ((data['paymentType'] as string) ?? null) as 'cash' | 'loan' | null,
    applicationJourneySteps: ((data['applicationJourneySteps'] as JourneyStepAnswer[]) ?? []).map((s) => ({
                               ...s,
                               recordedAt: (s.recordedAt as unknown as { toDate?: () => Date })?.toDate?.() ?? null,
                               inputValue: (s as unknown as { inputValue?: string }).inputValue,
                             })),
    currentStepIndex:        (data['currentStepIndex'] as number) ?? 0,
    journeyCompleted:        (data['journeyCompleted'] as boolean) ?? false,
  };
}

const HISTORY_PAGE = 50;

export function useBackendTasks() {
  const { currentUser } = useAuthStore();
  const { setBackendTasks, setBackendTasksLoading } = useTaskStore();

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== 'backend' && currentUser.role !== 'admin') return;

    setBackendTasksLoading(true);

    const q = currentUser.role === 'admin'
      ? query(
          collection(db, 'tasks'),
          where('pipelineStage', '==', 'backend'),
          where('archived', '==', false),
          orderBy('createdAt', 'desc'),
        )
      : query(
          collection(db, 'tasks'),
          where('pipelineStage', '==', 'backend'),
          where('backendAssignedTo', '==', currentUser.uid),
          where('archived', '==', false),
          orderBy('createdAt', 'desc'),
        );

    const unsub = onSnapshot(q, (snap) => {
      setBackendTasks(snap.docs.map(docToBackendTask));
      setBackendTasksLoading(false);
    }, (err) => {
      console.error('[useBackendTasks] error:', err);
      setBackendTasksLoading(false);
    });

    // Load initial history page
    const {
      setBackendHistoryTasks,
      setBackendHistoryLoading,
      setBackendHistoryHasMore,
      setBackendHistoryLastDoc,
    } = useTaskStore.getState();

    setBackendHistoryLoading(true);
    getDocs(
      currentUser.role === 'admin'
        ? query(
            collection(db, 'tasks'),
            where('pipelineStage', 'in', ['completed', 'dropped']),
            where('archived', '==', false),
            orderBy('createdAt', 'desc'),
            limit(HISTORY_PAGE),
          )
        : query(
            collection(db, 'tasks'),
            where('backendAssignedTo', '==', currentUser.uid),
            where('pipelineStage', 'in', ['completed', 'dropped']),
            where('archived', '==', false),
            orderBy('createdAt', 'desc'),
            limit(HISTORY_PAGE),
          )
    ).then((snap) => {
      setBackendHistoryTasks(snap.docs.map(docToBackendTask));
      setBackendHistoryLoading(false);
      setBackendHistoryHasMore(snap.docs.length === HISTORY_PAGE);
      setBackendHistoryLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    }).catch((err) => {
      console.error('[useBackendTasks] history error:', err);
      setBackendHistoryLoading(false);
    });

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);
}

export function useLoadMoreBackendHistory() {
  const {
    backendHistoryTasks,
    backendHistoryHasMore,
    backendHistoryLastDoc,
    setBackendHistoryTasks,
    setBackendHistoryLoading,
    setBackendHistoryHasMore,
    setBackendHistoryLastDoc,
  } = useTaskStore();
  const { currentUser } = useAuthStore();

  async function loadMore() {
    if (!backendHistoryHasMore || !backendHistoryLastDoc) return;
    if (!currentUser) return;
    setBackendHistoryLoading(true);
    try {
      const snap = await getDocs(
        currentUser.role === 'admin'
          ? query(
              collection(db, 'tasks'),
              where('pipelineStage', 'in', ['completed', 'dropped']),
              where('archived', '==', false),
              orderBy('createdAt', 'desc'),
              startAfter(backendHistoryLastDoc as DocumentSnapshot),
              limit(HISTORY_PAGE),
            )
          : query(
              collection(db, 'tasks'),
              where('backendAssignedTo', '==', currentUser.uid),
              where('pipelineStage', 'in', ['completed', 'dropped']),
              where('archived', '==', false),
              orderBy('createdAt', 'desc'),
              startAfter(backendHistoryLastDoc as DocumentSnapshot),
              limit(HISTORY_PAGE),
            )
      );
      setBackendHistoryTasks([
        ...backendHistoryTasks,
        ...snap.docs.map(docToBackendTask),
      ]);
      setBackendHistoryHasMore(snap.docs.length === HISTORY_PAGE);
      setBackendHistoryLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    } catch (err) {
      console.error('[loadMoreBackendHistory] error:', err);
    } finally {
      setBackendHistoryLoading(false);
    }
  }

  return { loadMore, hasMore: backendHistoryHasMore };
}
