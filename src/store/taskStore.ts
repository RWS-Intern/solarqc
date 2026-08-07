import { create } from 'zustand';

interface ConnectionState {
  isConnected:    boolean;
  setIsConnected: (v: boolean) => void;
}

export const useTaskStore = create<ConnectionState>((set) => ({
  isConnected:    false,
  setIsConnected: (v) => set({ isConnected: v }),
}));
