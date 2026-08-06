import { useEffect, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  startAfter, getDocs, getCountFromServer, Timestamp,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useTaskStore } from '@/store/taskStore';
import { useAuthStore } from '@/store/authStore';
import { logError } from '@/utils/logError';
import type { Task, TaskStatus, PipelineStage, StageHistoryEntry, JourneyStepAnswer } from '@/types';

export function docToTask(d: { id: string; data: () => Record<string, unknown> }): Task {
  const data = d.data();
  return {
    id:               d.id,
    taskNum:          (data['taskNum']          as string)  ?? '',
    title:            (data['title']            as string)  ?? '',
    priorityScore:    (data['priorityScore']    as number | undefined) ?? 6,
    titleWords:       (data['titleWords']       as string[] | undefined) ?? [],
    description:      (data['description']      as string)  ?? undefined,
    district:                (data['district']                as string | undefined) ?? undefined,
    state:                   (data['state']                   as string | undefined) ?? undefined,
    leadSource:              (data['leadSource']              as string | undefined) ?? undefined,
    leadSourceEmployeeName:  (data['leadSourceEmployeeName']  as string | undefined) ?? undefined,
    leadGeneratedByUid:      (data['leadGeneratedByUid']      as string | null)      ?? null,
    leadGeneratedByName:     (data['leadGeneratedByName']     as string | undefined) ?? undefined,
    leadGeneratedByNote:     (data['leadGeneratedByNote']     as string | undefined) ?? undefined,
    assignedTo:       (data['assignedTo']       as string | null) ?? null,
    assignedToName:   (data['assignedToName']   as string)  ?? '',
    assignedToCode:   (data['assignedToCode']   as string)  ?? '',
    assignedToMobile: (data['assignedToMobile'] as string | undefined) ?? undefined,
    consumerMobile:   (data['consumerMobile']  as string | undefined) ?? undefined,
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
    pipelineStage:           ((data['pipelineStage'] as string) ?? 'survey') as PipelineStage,
    stageHistory:            ((data['stageHistory'] as StageHistoryEntry[]) ?? []).map((e: StageHistoryEntry) => ({
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

const PAGE_SIZE = 50;

export function useArchivedTasks() {
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [hasMore,       setHasMore]       = useState(false);
  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const { currentUser } = useAuthStore();

  async function loadArchivedTasks() {
    if (!currentUser || currentUser.role !== 'admin') return;
    setLoading(true);
    lastDocRef.current = null;
    try {
      const snap = await getDocs(query(
        collection(db, 'tasks'),
        where('archived', '==', true),
        orderBy('archivedAt', 'desc'),
        limit(50),
      ));
      setArchivedTasks(snap.docs.map(docToTask));
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === 50);
    } catch (err) {
      console.error('[useArchivedTasks] error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreArchived() {
    if (!lastDocRef.current || !currentUser) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'tasks'),
        where('archived', '==', true),
        orderBy('archivedAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(50),
      ));
      setArchivedTasks((prev) => [...prev, ...snap.docs.map(docToTask)]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === 50);
    } catch (err) {
      console.error('[useArchivedTasks] loadMore error:', err);
    } finally {
      setLoading(false);
    }
  }

  return { archivedTasks, loading, hasMore, loadArchivedTasks, loadMoreArchived };
}

export type AdminFilter =
  | 'all'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'follow_up'
  | 'overdue'
  | 'needs_correction'
  | 'archived'
  | 'dropped'
  | 'converted'
  | 'pipeline_proposal'
  | 'pipeline_field_review'
  | 'pipeline_documents'
  | 'pipeline_backend'
  | 'unassigned'
  | 'unassigned_backend'
  | 'my_tasks'
  | 'sales_closed';

export function useTasks() {
  const {
    setTasks, setLastUpdated, setIsConnected,
    setHasMore, setLoadingMore, setLoadMore,
    setIsLoadingTasks,
  } = useTaskStore();
  const { currentUser } = useAuthStore();
  const lastDocRef      = useRef<DocumentSnapshot | null>(null);
  const unsubRef        = useRef<(() => void) | null>(null);

  // ── Field engineer: simple listener on own tasks ──────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const pipelineRoles = ['proposal', 'backend', 'logistics', 'installation'];
    if (pipelineRoles.includes(currentUser.role)) return;
    if (currentUser.role === 'admin' ||
        currentUser.role === 'view_only' ||
        currentUser.role === 'backend_manager') return; // handled by subscribeToFilter / own page

    const q = query(
      collection(db, 'tasks'),
      where('assignedTo', '==', currentUser.uid),
      where('archived',   '==', false),
      orderBy('createdAt', 'desc'),
      limit(200),
    );
    const unsub = onSnapshot(q,
      (snap) => {
        setTasks(snap.docs.map(docToTask));
        setLastUpdated(new Date());
        setIsConnected(true);
      },
      (err) => {
        console.error('[useTasks] field error:', err);
        void logError('useTasks.listener', err, {});
        setIsConnected(false);
      },
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  // ── Admin: build query for a given filter ─────────────────────────────────
  function buildAdminQuery(
    filter: AdminFilter,
    searchTerm?: string,
    engineerUid?: string,
    districtFilter?: string,
    dateFilter?: string,
    dueDateFilter?: string,
  ) {
    const base = collection(db, 'tasks');

    // Engineer filter — bypass all other filter logic
    if (engineerUid) {
      return {
        q: query(
          collection(db, 'tasks'),
          where('assignedTo', '==', engineerUid),
          where('archived',   '==', false),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE),
        ),
        isSearch: false as const,
      };
    }

    // District filter — bypass switch
    if (districtFilter) {
      return {
        q: query(
          collection(db, 'tasks'),
          where('district', '==', districtFilter),
          where('archived', '==', false),
          orderBy('updatedAt', 'desc'),
          limit(PAGE_SIZE),
        ),
        isSearch: false as const,
      };
    }

    // Date filter — range query on createdAt for a specific day
    if (dateFilter) {
      const startOfDay = new Date(dateFilter + 'T00:00:00');
      const endOfDay   = new Date(dateFilter + 'T23:59:59.999');
      return {
        q: query(
          collection(db, 'tasks'),
          where('archived',   '==', false),
          where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
          where('createdAt', '<=', Timestamp.fromDate(endOfDay)),
          orderBy('createdAt', 'desc'),
          limit(200),
        ),
        isSearch: false as const,
      };
    }

    // Due date filter — range query on dueDate for a specific day
    if (dueDateFilter) {
      const startOfDay = new Date(dueDateFilter + 'T00:00:00');
      const endOfDay   = new Date(dueDateFilter + 'T23:59:59.999');
      return {
        q: query(
          collection(db, 'tasks'),
          where('archived', '==', false),
          where('dueDate',  '>=', Timestamp.fromDate(startOfDay)),
          where('dueDate',  '<=', Timestamp.fromDate(endOfDay)),
          orderBy('dueDate', 'asc'),
          limit(200),
        ),
        isSearch: false as const,
      };
    }

    if (searchTerm && searchTerm.trim().length > 0) {
      const term = searchTerm.trim().toLowerCase();
      const isMobile = /^\d{10}$/.test(searchTerm.trim());
      if (filter === 'my_tasks') {
        const taskNumQuery = query(
          base,
          where('archived',  '==', false),
          where('createdBy', '==', currentUser!.uid),
          where('taskNum',   '>=', searchTerm.trim().toUpperCase()),
          where('taskNum',   '<=', searchTerm.trim().toUpperCase() + ''),
          limit(PAGE_SIZE),
        );
        const titleQuery = query(
          base,
          where('archived',   '==', false),
          where('createdBy',  '==', currentUser!.uid),
          where('titleWords', 'array-contains', term),
          limit(PAGE_SIZE),
        );
        const mobileQuery = isMobile
          ? query(base, where('archived', '==', false), where('createdBy', '==', currentUser!.uid), where('consumerMobile', '==', searchTerm.trim()), limit(PAGE_SIZE))
          : null;
        return { taskNumQuery, titleQuery, mobileQuery, isSearch: true as const };
      }
      const taskNumQuery = query(
        base,
        where('archived', '==', false),
        where('taskNum',  '>=', searchTerm.trim().toUpperCase()),
        where('taskNum',  '<=', searchTerm.trim().toUpperCase() + ''),
        limit(PAGE_SIZE),
      );
      const titleQuery = query(
        base,
        where('archived',   '==', false),
        where('titleWords', 'array-contains', term),
        limit(PAGE_SIZE),
      );
      const mobileQuery = isMobile
        ? query(base, where('archived', '==', false), where('consumerMobile', '==', searchTerm.trim()), limit(PAGE_SIZE))
        : null;
      return { taskNumQuery, titleQuery, mobileQuery, isSearch: true as const };
    }

    let q;
    switch (filter) {
      case 'pending':
        q = query(base,
          where('archived', '==', false),
          where('status',   '==', 'pending'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'in_progress':
        q = query(base,
          where('archived', '==', false),
          where('status',   '==', 'in_progress'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'completed':
        q = query(base,
          where('archived', '==', false),
          where('status',   '==', 'completed'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'blocked':
        q = query(base,
          where('archived', '==', false),
          where('status',   '==', 'blocked'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'pipeline_proposal':
        q = query(base,
          where('archived',      '==', false),
          where('pipelineStage', '==', 'proposal'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'pipeline_field_review':
        q = query(base,
          where('archived',      '==', false),
          where('pipelineStage', '==', 'field_review'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'pipeline_documents':
        q = query(base,
          where('archived',      '==', false),
          where('pipelineStage', '==', 'documents'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'pipeline_backend':
        q = query(base,
          where('archived',      '==', false),
          where('pipelineStage', '==', 'backend'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'converted':
        q = query(base,
          where('archived',      '==', false),
          where('pipelineStage', '==', 'completed'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'dropped':
        q = query(base,
          where('archived',      '==', false),
          where('pipelineStage', '==', 'dropped'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'unassigned':
        q = query(base,
          where('archived',      '==', false),
          where('pipelineStage', '==', 'proposal'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'unassigned_backend':
        q = query(base,
          where('archived',      '==', false),
          where('pipelineStage', '==', 'backend'),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'follow_up':
        q = query(base,
          where('archived',     '==', false),
          where('followUpDate', '!=', null),
          orderBy('followUpDate', 'asc'),
          limit(PAGE_SIZE));
        break;
      case 'overdue': {
        const now = new Date();
        q = query(base,
          where('archived', '==', false),
          where('status',   'in', ['pending', 'in_progress', 'blocked']),
          where('dueDate',  '<',  Timestamp.fromDate(now)),
          orderBy('dueDate', 'asc'),
          limit(PAGE_SIZE));
        break;
      }
      case 'needs_correction':
        q = query(base,
          where('archived',           '==', false),
          where('correctionReturnTo', '!=', null),
          orderBy('correctionReturnTo', 'asc'),
          orderBy('correctionSetAt',    'desc'),
          limit(PAGE_SIZE));
        break;
      case 'sales_closed':
        // Includes dropped-after-closed leads by design — this list is not
        // filtered by pipelineStage, unlike the badge count in useTabCounts.
        q = query(base,
          where('archived',   '==', false),
          where('saleClosed', '==', true),
          orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        break;
      case 'my_tasks':
        q = query(base,
          where('archived',  '==', false),
          where('createdBy', '==', currentUser!.uid),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE));
        break;
      default: // 'all'
        q = query(base,
          where('archived',     '==', false),
          orderBy('priorityScore', 'asc'),
          orderBy('updatedAt',     'desc'),
          limit(PAGE_SIZE));
    }
    return { q, isSearch: false as const };
  }

  // ── Admin: subscribe to a filter ──────────────────────────────────────────
  function subscribeToFilter(
    filter: AdminFilter,
    searchTerm?: string,
    engineerUid?: string,
    districtFilter?: string,
    dateFilter?: string,
    dueDateFilter?: string,
  ) {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'view_only') return;

    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    lastDocRef.current = null;
    setHasMore(false);
    setTasks([]);
    setIsLoadingTasks(true);

    const built = buildAdminQuery(filter, searchTerm, engineerUid, districtFilter, dateFilter, dueDateFilter);

    if (built.isSearch) {
      const { taskNumQuery, titleQuery, mobileQuery } = built;
      const queryPromises = [getDocs(taskNumQuery), getDocs(titleQuery)];
      if (mobileQuery) queryPromises.push(getDocs(mobileQuery));
      Promise.all(queryPromises).then((snaps) => {
        const seen  = new Set<string>();
        const merged: Task[] = [];
        snaps.flatMap((snap) => snap.docs).forEach((d) => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            merged.push(docToTask(d));
          }
        });
        merged.sort((a, b) =>
          (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
        );
        setTasks(merged);
        setIsLoadingTasks(false);
        setIsConnected(true);
        setHasMore(false);
      }).catch((err) => {
        console.error('[useTasks] search error:', err);
        void logError('useTasks.listener', err, {});
        setIsLoadingTasks(false);
      });
      return;
    }

    // Normal filter — real-time onSnapshot
    const { q } = built;
    const unsub = onSnapshot(q,
      (snap) => {
        const rawTasks = snap.docs.map(docToTask);
        const filtered = filter === 'unassigned'
          ? rawTasks.filter(t => !t.proposalAssignedTo)
          : filter === 'unassigned_backend'
          ? rawTasks.filter(t => !t.backendAssignedTo)
          : filter === 'follow_up'
          ? rawTasks.filter(t => !!t.followUpDate && (!t.pipelineStage || t.pipelineStage === 'survey') && t.status !== 'completed')
          : rawTasks;
        setTasks(filtered);
        setLastUpdated(new Date());
        setIsConnected(true);
        setIsLoadingTasks(false);
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
        const activeLimit = (dateFilter || dueDateFilter) ? 200 : PAGE_SIZE;
        setHasMore(snap.docs.length === activeLimit);
      },
      (err) => {
        console.error('[useTasks] admin error:', err);
        void logError('useTasks.listener', err, {});
        setIsConnected(false);
        setIsLoadingTasks(false);
      },
    );
    unsubRef.current = unsub;

    setLoadMore(async () => {
      if (!lastDocRef.current) return;
      setLoadingMore(true);
      try {
        // Date filter uses its own range constraints captured from closure
        if (dateFilter) {
          const startOfDay = new Date(dateFilter + 'T00:00:00');
          const endOfDay   = new Date(dateFilter + 'T23:59:59.999');
          const moreSnap = await getDocs(query(
            collection(db, 'tasks'),
            where('archived',   '==', false),
            where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
            where('createdAt', '<=', Timestamp.fromDate(endOfDay)),
            orderBy('createdAt', 'desc'),
            startAfter(lastDocRef.current),
            limit(200),
          ));
          const moreTasks = moreSnap.docs.map(docToTask);
          setTasks([...useTaskStore.getState().tasks, ...moreTasks]);
          lastDocRef.current = moreSnap.docs[moreSnap.docs.length - 1] ?? null;
          setHasMore(moreSnap.docs.length === 200);
          setLoadingMore(false);
          return;
        }
        // Due date filter loadMore
        if (dueDateFilter) {
          const startOfDay = new Date(dueDateFilter + 'T00:00:00');
          const endOfDay   = new Date(dueDateFilter + 'T23:59:59.999');
          const moreSnap = await getDocs(query(
            collection(db, 'tasks'),
            where('archived', '==', false),
            where('dueDate',  '>=', Timestamp.fromDate(startOfDay)),
            where('dueDate',  '<=', Timestamp.fromDate(endOfDay)),
            orderBy('dueDate', 'asc'),
            startAfter(lastDocRef.current),
            limit(200),
          ));
          const moreTasks = moreSnap.docs.map(docToTask);
          setTasks([...useTaskStore.getState().tasks, ...moreTasks]);
          lastDocRef.current = moreSnap.docs[moreSnap.docs.length - 1] ?? null;
          setHasMore(moreSnap.docs.length === 200);
          setLoadingMore(false);
          return;
        }
        const filterConstraints = (() => {
          switch (filter) {
            case 'pending':
              return [where('archived','==',false), where('status','==','pending'), orderBy('createdAt','desc')];
            case 'in_progress':
              return [where('archived','==',false), where('status','==','in_progress'), orderBy('createdAt','desc')];
            case 'completed':
              return [where('archived','==',false), where('status','==','completed'), orderBy('createdAt','desc')];
            case 'blocked':
              return [where('archived','==',false), where('status','==','blocked'), orderBy('createdAt','desc')];
            case 'pipeline_proposal':
              return [where('archived','==',false), where('pipelineStage','==','proposal'), orderBy('createdAt','desc')];
            case 'pipeline_field_review':
              return [where('archived','==',false), where('pipelineStage','==','field_review'), orderBy('createdAt','desc')];
            case 'pipeline_documents':
              return [where('archived','==',false), where('pipelineStage','==','documents'), orderBy('createdAt','desc')];
            case 'pipeline_backend':
              return [where('archived','==',false), where('pipelineStage','==','backend'), orderBy('createdAt','desc')];
            case 'converted':
              return [where('archived','==',false), where('pipelineStage','==','completed'), orderBy('createdAt','desc')];
            case 'dropped':
              return [where('archived','==',false), where('pipelineStage','==','dropped'), orderBy('createdAt','desc')];
            case 'unassigned':
              return [where('archived','==',false), where('pipelineStage','==','proposal'), orderBy('createdAt','desc')];
            case 'unassigned_backend':
              return [where('archived','==',false), where('pipelineStage','==','backend'), orderBy('createdAt','desc')];
            case 'my_tasks':
              return [where('archived','==',false), where('createdBy','==',currentUser!.uid), orderBy('createdAt','desc')];
            case 'follow_up':
              return [
                where('archived',     '==', false),
                where('followUpDate', '!=', null),
                orderBy('followUpDate', 'asc'),
              ];
            case 'overdue': {
              const now = new Date();
              return [
                where('archived', '==', false),
                where('status',   'in', ['pending', 'in_progress', 'blocked']),
                where('dueDate',  '<',  Timestamp.fromDate(now)),
                orderBy('dueDate', 'asc'),
              ];
            }
            case 'needs_correction':
              return [
                where('archived',           '==', false),
                where('correctionReturnTo', '!=', null),
                orderBy('correctionReturnTo', 'asc'),
                orderBy('correctionSetAt',    'desc'),
              ];
            case 'sales_closed':
              return [
                where('archived',   '==', false),
                where('saleClosed', '==', true),
                orderBy('createdAt', 'desc'),
              ];
            default:
              return [where('archived','==',false), orderBy('priorityScore','asc'), orderBy('updatedAt','desc')];
          }
        })();
        const moreSnap = await getDocs(query(
          collection(db, 'tasks'),
          ...filterConstraints,
          startAfter(lastDocRef.current),
          limit(PAGE_SIZE),
        ));
        const moreTasks = moreSnap.docs.map(docToTask);
        const filteredMore = filter === 'unassigned'
          ? moreTasks.filter((t) => !t.proposalAssignedTo)
          : filter === 'unassigned_backend'
          ? moreTasks.filter((t) => !t.backendAssignedTo)
          : filter === 'follow_up'
          ? moreTasks.filter((t) => !!t.followUpDate && (!t.pipelineStage || t.pipelineStage === 'survey') && t.status !== 'completed')
          : moreTasks;
        const existing = useTaskStore.getState().tasks;
        setTasks([...existing, ...filteredMore]);
        lastDocRef.current = moreSnap.docs[moreSnap.docs.length - 1] ?? null;
        setHasMore(moreSnap.docs.length === PAGE_SIZE);
      } catch (err) {
        console.error('[useTasks] loadMore error:', err);
      } finally {
        setLoadingMore(false);
      }
    });
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []);

  return { subscribeToFilter };
}

export function useTabCounts() {
  const { currentUser } = useAuthStore();
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const cancelRef = useRef(false);

  async function fetchCounts() {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'view_only') return;
    const base = collection(db, 'tasks');
    const now  = new Date();
    const results = await Promise.allSettled([
      getCountFromServer(query(base, where('archived', '==', false))),
      getCountFromServer(query(base, where('archived', '==', false), where('status', '==', 'pending'), where('pipelineStage', 'not-in', ['dropped', 'completed']))),
      getCountFromServer(query(base, where('archived', '==', false), where('status', '==', 'in_progress'), where('pipelineStage', 'not-in', ['dropped', 'completed']))),
      getCountFromServer(query(base, where('archived', '==', false), where('status', '==', 'completed'))),
      getCountFromServer(query(base, where('archived', '==', false), where('status', '==', 'blocked'), where('pipelineStage', 'not-in', ['dropped', 'completed']))),
      getCountFromServer(query(base, where('archived', '==', false), where('followUpDate', '!=', null))),
      getCountFromServer(query(base, where('archived', '==', false), where('status', 'in', ['pending', 'in_progress', 'blocked']), where('dueDate', '<', Timestamp.fromDate(now)))),
      getCountFromServer(query(base, where('archived', '==', false), where('correctionReturnTo', '!=', null))),
      // Excludes dropped leads for parity with the Dashboard "Sales Closed" card.
      // The sales_closed TAB LIST (buildAdminQuery) intentionally does NOT apply
      // this pipelineStage exclusion, so dropped-after-closed anomalies still
      // show up as rows — this badge count can therefore read a few lower than
      // the number of rows the tab actually renders. That mismatch is by design.
      getCountFromServer(query(base, where('archived', '==', false), where('saleClosed', '==', true), where('pipelineStage', '!=', 'dropped'))),
    ]);
    if (cancelRef.current) return;
    const keys = ['all', 'pending', 'in_progress', 'completed', 'blocked', 'follow_up', 'overdue', 'needs_correction', 'sales_closed'];
    const counts: Record<string, number> = {};
    results.forEach((r, i) => {
      counts[keys[i]] = r.status === 'fulfilled' ? r.value.data().count : 0;
    });
    setTabCounts(counts);
  }

  useEffect(() => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'view_only') return;
    cancelRef.current = false;
    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    return () => {
      cancelRef.current = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid, currentUser?.role]);

  return { tabCounts, refreshTabCounts: fetchCounts };
}

