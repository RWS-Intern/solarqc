import { create } from 'zustand';
import type { Task } from '@/types';

interface TaskState {
  tasks:          Task[];
  setTasks:       (tasks: Task[]) => void;
  lastUpdated:    Date | null;
  setLastUpdated: (date: Date)    => void;
  isConnected:    boolean;
  setIsConnected: (v: boolean)    => void;
  // Pagination
  hasMore:        boolean;
  setHasMore:     (v: boolean)    => void;
  loadingMore:    boolean;
  setLoadingMore: (v: boolean)    => void;
  loadMore:       (() => void) | null;
  setLoadMore:    (fn: (() => void) | null) => void;
  // Loading state for admin filter queries
  isLoadingTasks:    boolean;
  setIsLoadingTasks: (v: boolean) => void;
  // Proposal stage tasks
  proposalTasks:           Task[];
  proposalTasksLoading:    boolean;
  setProposalTasks:        (tasks: Task[]) => void;
  setProposalTasksLoading: (v: boolean)    => void;
  // Proposal history tasks (past proposal stage)
  proposalHistoryTasks:        Task[];
  proposalHistoryLoading:      boolean;
  setProposalHistoryTasks:     (tasks: Task[]) => void;
  setProposalHistoryLoading:   (v: boolean)    => void;
  // Proposal history pagination
  proposalHistoryHasMore:    boolean;
  proposalHistoryLastDoc:    unknown;
  setProposalHistoryHasMore: (v: boolean) => void;
  setProposalHistoryLastDoc: (d: unknown) => void;
  // Backend stage tasks
  backendTasks:           Task[];
  backendTasksLoading:    boolean;
  setBackendTasks:        (tasks: Task[]) => void;
  setBackendTasksLoading: (v: boolean)    => void;
  // Backend history tasks (past backend stage)
  backendHistoryTasks:        Task[];
  backendHistoryLoading:      boolean;
  setBackendHistoryTasks:     (tasks: Task[]) => void;
  setBackendHistoryLoading:   (v: boolean)    => void;
  // Backend history pagination
  backendHistoryHasMore:    boolean;
  backendHistoryLastDoc:    unknown;
  setBackendHistoryHasMore: (v: boolean) => void;
  setBackendHistoryLastDoc: (d: unknown) => void;
  // Accurate active counts from getCountFromServer (independent of pagination)
  proposalActiveCount:    number;
  setProposalActiveCount: (v: number) => void;
  backendActiveCount:     number;
  setBackendActiveCount:  (v: number) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks:          [],
  setTasks:       (tasks) => set({ tasks }),
  lastUpdated:    null,
  setLastUpdated: (date)  => set({ lastUpdated: date }),
  isConnected:    false,
  setIsConnected: (v)     => set({ isConnected: v }),
  hasMore:        false,
  setHasMore:     (v)     => set({ hasMore: v }),
  loadingMore:    false,
  setLoadingMore: (v)     => set({ loadingMore: v }),
  loadMore:       null,
  setLoadMore:    (fn)    => set({ loadMore: fn }),
  isLoadingTasks:    false,
  setIsLoadingTasks: (v)  => set({ isLoadingTasks: v }),
  proposalTasks:           [],
  proposalTasksLoading:    false,
  setProposalTasks:        (tasks) => set({ proposalTasks: tasks }),
  setProposalTasksLoading: (v)     => set({ proposalTasksLoading: v }),
  proposalHistoryTasks:        [],
  proposalHistoryLoading:      false,
  setProposalHistoryTasks:     (tasks) => set({ proposalHistoryTasks: tasks }),
  setProposalHistoryLoading:   (v)     => set({ proposalHistoryLoading: v }),
  proposalHistoryHasMore:    false,
  proposalHistoryLastDoc:    null,
  setProposalHistoryHasMore: (v) => set({ proposalHistoryHasMore: v }),
  setProposalHistoryLastDoc: (d) => set({ proposalHistoryLastDoc: d }),
  backendTasks:           [],
  backendTasksLoading:    false,
  setBackendTasks:        (tasks) => set({ backendTasks: tasks }),
  setBackendTasksLoading: (v)     => set({ backendTasksLoading: v }),
  backendHistoryTasks:        [],
  backendHistoryLoading:      false,
  setBackendHistoryTasks:     (tasks) => set({ backendHistoryTasks: tasks }),
  setBackendHistoryLoading:   (v)     => set({ backendHistoryLoading: v }),
  backendHistoryHasMore:    false,
  backendHistoryLastDoc:    null,
  setBackendHistoryHasMore: (v) => set({ backendHistoryHasMore: v }),
  setBackendHistoryLastDoc: (d) => set({ backendHistoryLastDoc: d }),
  proposalActiveCount:    0,
  setProposalActiveCount: (v) => set({ proposalActiveCount: v }),
  backendActiveCount:     0,
  setBackendActiveCount:  (v) => set({ backendActiveCount: v }),
}));
