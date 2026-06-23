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
  // Search layer (full unpaginated set for admin)
  searchTasks:          Task[];
  searchTasksLoaded:    boolean;
  setSearchTasks:       (tasks: Task[]) => void;
  setSearchTasksLoaded: (loaded: boolean) => void;
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
  searchTasks:          [],
  searchTasksLoaded:    false,
  setSearchTasks:       (tasks) => set({ searchTasks: tasks, searchTasksLoaded: true }),
  setSearchTasksLoaded: (loaded) => set({ searchTasksLoaded: loaded }),
}));
