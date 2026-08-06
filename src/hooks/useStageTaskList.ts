import { useEffect, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  startAfter, getDocs, getCountFromServer,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Task } from '@/types';

const PAGE_SIZE = 50;

export interface StageTaskListResult {
  tasks:         Task[];
  isLoading:     boolean;
  hasMore:       boolean;
  loadingMore:   boolean;
  loadMore:      () => Promise<void>;
  search:        (term: string) => Promise<void>;
  searchResults: Task[];
  isSearching:   boolean;
  clearSearch:   () => void;
  activeCount:   number;
}

/**
 * Reusable hook for paginated, real-time active-stage task lists with
 * Firestore search. Used by useProposalTasks, useBackendTasks, and
 * BackendManagerPage.
 *
 * Pagination uses orderBy('updatedAt','desc') + limit(50) + startAfter cursor.
 * Search runs 3 parallel getDocs queries (taskNum, titleWords, consumerMobile),
 * scoped by the same stage + assignee constraints. The caller is responsible
 * for debouncing before calling search() — this function executes immediately.
 *
 * @param stage         - pipelineStage value to filter on ('proposal'|'backend')
 * @param assigneeField - Firestore field to scope by, or null for unscoped view
 * @param assigneeUid   - uid value (ignored when assigneeField is null)
 * @param mapper        - doc-to-Task conversion; pass the hook's own mapper
 * @param enabled       - skip subscription entirely (e.g. wrong role)
 */
export function useStageTaskList(
  stage: string,
  assigneeField: string | null | undefined,
  assigneeUid: string | undefined,
  mapper: (d: { id: string; data: () => Record<string, unknown> }) => Task,
  enabled = true,
): StageTaskListResult {
  const [tasks,         setTasks]         = useState<Task[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [hasMore,       setHasMore]       = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [isSearching,   setIsSearching]   = useState(false);
  const [activeCount,   setActiveCount]   = useState(0);

  const lastDocRef     = useRef<DocumentSnapshot | null>(null);
  const loadingMoreRef = useRef(false);
  // Incremented on every new search or clearSearch to discard stale results
  const searchIdRef = useRef(0);

  // Build Firestore constraints shared by the snapshot, loadMore, and search queries
  function buildConstraints() {
    const c = [
      where('pipelineStage', '==', stage),
      where('archived', '==', false),
    ] as ReturnType<typeof where>[];
    if (assigneeField && assigneeUid) {
      c.push(where(assigneeField, '==', assigneeUid));
    }
    return c;
  }

  // ── Accurate total count via getCountFromServer (60 s refresh) ─────────────
  useEffect(() => {
    if (!enabled || (assigneeField && !assigneeUid)) {
      setActiveCount(0);
      return;
    }
    async function fetchCount() {
      try {
        const snap = await getCountFromServer(
          query(collection(db, 'tasks'), ...buildConstraints()),
        );
        setActiveCount(snap.data().count);
      } catch (err) {
        console.error('[useStageTaskList] count error:', err);
      }
    }
    fetchCount();
    const intervalId = setInterval(fetchCount, 60_000);
    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stage, assigneeField ?? '', assigneeUid ?? '']);

  // ── Main paginated real-time listener ───────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    // Scoped view but uid not yet available — wait for auth to resolve
    if (assigneeField && !assigneeUid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setTasks([]);
    setHasMore(false);
    setSearchResults([]);
    setIsSearching(false);
    searchIdRef.current++;   // invalidate any in-flight search from prior subscription
    lastDocRef.current = null;

    const q = query(
      collection(db, 'tasks'),
      ...buildConstraints(),
      orderBy('updatedAt', 'desc'),
      limit(PAGE_SIZE),
    );

    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(mapper));
      setIsLoading(false);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
    }, (err) => {
      console.error('[useStageTaskList] snapshot error:', err);
      setIsLoading(false);
    });

    return unsub;
  // mapper is module-level (stable reference); stage/field/uid are primitives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stage, assigneeField ?? '', assigneeUid ?? '']);

  // ── Load next page ──────────────────────────────────────────────────────────
  async function loadMore() {
    if (!lastDocRef.current || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'tasks'),
        ...buildConstraints(),
        orderBy('updatedAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE),
      ));
      setTasks((prev) => [...prev, ...snap.docs.map(mapper)]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('[useStageTaskList] loadMore error:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  // ── Firestore search — caller must debounce (350 ms) before calling ─────────
  async function search(term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      clearSearch();
      return;
    }
    const id = ++searchIdRef.current;
    setIsSearching(true);
    setIsLoading(true);
    try {
      const base     = collection(db, 'tasks');
      const bc       = buildConstraints();
      const isMobile = /^\d{10}$/.test(trimmed);

      // Mirror the exact >= / <= '' pattern used in useTasks.ts
      const taskNumQuery = query(
        base, ...bc,
        where('taskNum', '>=', trimmed.toUpperCase()),
        where('taskNum', '<=', trimmed.toUpperCase() + ''),
        limit(PAGE_SIZE),
      );
      const titleQuery = query(
        base, ...bc,
        where('titleWords', 'array-contains', trimmed.toLowerCase()),
        limit(PAGE_SIZE),
      );
      const queryPromises = [getDocs(taskNumQuery), getDocs(titleQuery)];
      if (isMobile) {
        queryPromises.push(getDocs(query(
          base, ...bc,
          where('consumerMobile', '==', trimmed),
          limit(PAGE_SIZE),
        )));
      }

      const snaps = await Promise.all(queryPromises);

      // Discard if a newer search or clearSearch fired while we were awaiting
      if (id !== searchIdRef.current) return;

      const seen   = new Set<string>();
      const merged: Task[] = [];
      snaps.flatMap((snap) => snap.docs).forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          merged.push(mapper(d));
        }
      });
      merged.sort((a, b) =>
        (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
      );
      setSearchResults(merged);
    } catch (err) {
      if (id !== searchIdRef.current) return;
      console.error('[useStageTaskList] search error:', err);
      setSearchResults([]);
    } finally {
      if (id === searchIdRef.current) {
        setIsLoading(false);
      }
    }
  }

  function clearSearch() {
    searchIdRef.current++;    // cancels any in-flight search
    setSearchResults([]);
    setIsSearching(false);
    setIsLoading(false);
  }

  return {
    tasks,
    isLoading,
    hasMore,
    loadingMore,
    loadMore,
    search,
    searchResults,
    isSearching,
    clearSearch,
    activeCount,
  };
}
