import { useEffect } from 'react';
import {
  collection, query, where, orderBy,
  getDocs, startAfter, limit,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db }           from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';
import { useStageTaskList } from '@/hooks/useStageTaskList';
import { logError } from '@/utils/logError';
import type { Task, PipelineStage, StageHistoryEntry, JourneyStepAnswer } from '@/types';

// Exported so BackendManagerPage can pass it as the mapper to useStageTaskList
export function docToBackendTask(d: { id: string; data: () => Record<string, unknown> }): Task {
  const data = d.data();
  return {
    id:               d.id,
    taskNum:          (data['taskNum']         as string)  ?? '',
    title:            (data['title']           as string)  ?? '',
    priorityScore:    (data['priorityScore']   as number | undefined) ?? 6,
    titleWords:       (data['titleWords']      as string[] | undefined) ?? [],
    description:      (data['description']     as string)  ?? undefined,
    district:                (data['district']                as string | undefined) ?? undefined,
    state:                   (data['state']                   as string | undefined) ?? undefined,
    leadSource:              (data['leadSource']              as string | undefined) ?? undefined,
    leadSourceEmployeeName:  (data['leadSourceEmployeeName']  as string | undefined) ?? undefined,
    leadGeneratedByUid:      (data['leadGeneratedByUid']      as string | null)      ?? null,
    leadGeneratedByName:     (data['leadGeneratedByName']     as string | undefined) ?? undefined,
    leadGeneratedByNote:     (data['leadGeneratedByNote']     as string | undefined) ?? undefined,
    assignedTo:       (data['assignedTo']      as string | null) ?? null,
    assignedToName:   (data['assignedToName']  as string)  ?? '',
    assignedToCode:   (data['assignedToCode']  as string)  ?? '',
    assignedToMobile: (data['assignedToMobile'] as string | undefined) ?? undefined,
    consumerMobile:   (data['consumerMobile']  as string | undefined) ?? undefined,
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
    correctionReturnTo:             (data['correctionReturnTo']             as PipelineStage | null | undefined) ?? null,
    saleClosed:                     (data['saleClosed']       as boolean | undefined) ?? false,
    saleClosedSource:               (data['saleClosedSource'] as 'auto' | 'manual' | null | undefined) ?? null,
    correctionReturnAssignedTo:     (data['correctionReturnAssignedTo']     as string | null | undefined)        ?? null,
    correctionReturnAssignedToName: (data['correctionReturnAssignedToName'] as string | undefined)               ?? '',
    correctionNote:                 (data['correctionNote']                 as string | undefined)               ?? undefined,
    correctionSetAt:                (data['correctionSetAt'] as { toDate?: () => Date } | null)?.toDate?.()      ?? null,
    backendRemark:           (data['backendRemark']           as string | undefined) ?? undefined,
    backendRemarkUpdatedBy:  (data['backendRemarkUpdatedBy']  as string | undefined) ?? undefined,
    backendRemarkUpdatedAt:  (data['backendRemarkUpdatedAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
    proposalRemark:          (data['proposalRemark']          as string | undefined) ?? undefined,
    proposalRemarkUpdatedBy: (data['proposalRemarkUpdatedBy'] as string | undefined) ?? undefined,
    proposalRemarkUpdatedAt: (data['proposalRemarkUpdatedAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
    documentAnswers:         (data['documentAnswers']         as Task['documentAnswers']) ?? {},
    documentPhotos:          (data['documentPhotos']          as Task['documentPhotos'])  ?? {},
    documentsCompleted:      (data['documentsCompleted']      as boolean) ?? false,
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
  const {
    setBackendTasks,
    setBackendTasksLoading,
    setBackendActiveCount,
  } = useTaskStore();

  // Determine scope: admin sees all, non-admin scoped to own uid
  const assigneeField = currentUser?.role === 'admin' ? null : 'backendAssignedTo';
  const assigneeUid   = currentUser?.role === 'admin' ? undefined : currentUser?.uid;
  const enabled       = !!currentUser && (
    currentUser.role === 'backend' || currentUser.role === 'admin'
  );

  // ── Paginated active-task list (replaces unbounded onSnapshot) ──────────────
  const activeList = useStageTaskList(
    'backend',
    assigneeField,
    assigneeUid,
    docToBackendTask,
    enabled,
  );

  // Sync active tasks + loading state into taskStore so nav badges,
  // DashboardPage, and BackendPage (reading from store) stay consistent
  useEffect(() => {
    setBackendTasks(activeList.tasks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList.tasks]);

  useEffect(() => {
    setBackendTasksLoading(activeList.isLoading);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList.isLoading]);

  useEffect(() => {
    setBackendActiveCount(activeList.activeCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList.activeCount]);

  // ── History: initial page load (unchanged logic) ────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== 'backend' && currentUser.role !== 'admin') return;

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
      void logError('useBackendTasks.listener', err, {});
      setBackendHistoryLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  // Return active-list pagination + search so BackendPage can wire them up
  return {
    loadMore:      activeList.loadMore,
    hasMore:       activeList.hasMore,
    loadingMore:   activeList.loadingMore,
    search:        activeList.search,
    searchResults: activeList.searchResults,
    isSearching:   activeList.isSearching,
    clearSearch:   activeList.clearSearch,
  };
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
