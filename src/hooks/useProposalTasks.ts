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

function docToProposalTask(d: { id: string; data: () => Record<string, unknown> }): Task {
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
                               inputValue: (s.inputValue as string | undefined) ?? undefined,
                               recordedAt: (s.recordedAt as unknown as { toDate?: () => Date })?.toDate?.() ?? null,
                             })),
    currentStepIndex:        (data['currentStepIndex'] as number) ?? 0,
    journeyCompleted:        (data['journeyCompleted'] as boolean) ?? false,
  };
}

const HISTORY_PAGE = 50;

function buildHistoryQuery(
  role: string,
  uid: string,
  afterDoc?: DocumentSnapshot,
) {
  const stages = ['field_review', 'backend', 'completed', 'dropped'] as const;
  if (role === 'admin') {
    return query(
      collection(db, 'tasks'),
      where('pipelineStage', 'in', [...stages]),
      where('archived', '==', false),
      orderBy('createdAt', 'desc'),
      ...(afterDoc ? [startAfter(afterDoc)] : []),
      limit(HISTORY_PAGE),
    );
  }
  return query(
    collection(db, 'tasks'),
    where('proposalAssignedTo', '==', uid),
    where('pipelineStage', 'in', [...stages]),
    where('archived', '==', false),
    orderBy('createdAt', 'desc'),
    ...(afterDoc ? [startAfter(afterDoc)] : []),
    limit(HISTORY_PAGE),
  );
}

export function useProposalTasks() {
  const { currentUser } = useAuthStore();
  const { setProposalTasks, setProposalTasksLoading } = useTaskStore();

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== 'proposal' && currentUser.role !== 'admin') return;

    setProposalTasksLoading(true);

    const q = currentUser.role === 'admin'
      ? query(
          collection(db, 'tasks'),
          where('pipelineStage', '==', 'proposal'),
          where('archived', '==', false),
          orderBy('createdAt', 'desc'),
        )
      : query(
          collection(db, 'tasks'),
          where('pipelineStage', '==', 'proposal'),
          where('proposalAssignedTo', '==', currentUser.uid),
          where('archived', '==', false),
          orderBy('createdAt', 'desc'),
        );

    const unsub = onSnapshot(q, (snap) => {
      setProposalTasks(snap.docs.map(docToProposalTask));
      setProposalTasksLoading(false);
    }, (err) => {
      console.error('[useProposalTasks] error:', err);
      setProposalTasksLoading(false);
    });

    // Load initial history page
    const {
      setProposalHistoryTasks,
      setProposalHistoryLoading,
      setProposalHistoryHasMore,
      setProposalHistoryLastDoc,
    } = useTaskStore.getState();

    setProposalHistoryLoading(true);
    getDocs(buildHistoryQuery(currentUser.role, currentUser.uid)).then((snap) => {
      setProposalHistoryTasks(snap.docs.map(docToProposalTask));
      setProposalHistoryLoading(false);
      setProposalHistoryHasMore(snap.docs.length === HISTORY_PAGE);
      setProposalHistoryLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    }).catch((err) => {
      console.error('[useProposalTasks] history error:', err);
      setProposalHistoryLoading(false);
    });

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);
}

export function useLoadMoreProposalHistory() {
  const {
    proposalHistoryTasks,
    proposalHistoryHasMore,
    proposalHistoryLastDoc,
    setProposalHistoryTasks,
    setProposalHistoryLoading,
    setProposalHistoryHasMore,
    setProposalHistoryLastDoc,
  } = useTaskStore();
  const { currentUser } = useAuthStore();

  async function loadMore() {
    if (!proposalHistoryHasMore || !proposalHistoryLastDoc) return;
    if (!currentUser) return;
    setProposalHistoryLoading(true);
    try {
      const snap = await getDocs(
        buildHistoryQuery(
          currentUser.role,
          currentUser.uid,
          proposalHistoryLastDoc as DocumentSnapshot,
        ),
      );
      setProposalHistoryTasks([
        ...proposalHistoryTasks,
        ...snap.docs.map(docToProposalTask),
      ]);
      setProposalHistoryHasMore(snap.docs.length === HISTORY_PAGE);
      setProposalHistoryLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    } catch (err) {
      console.error('[loadMoreProposalHistory] error:', err);
    } finally {
      setProposalHistoryLoading(false);
    }
  }

  return { loadMore, hasMore: proposalHistoryHasMore };
}
