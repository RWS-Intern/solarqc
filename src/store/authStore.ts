import { create } from 'zustand';
import type { AppUser } from '@/types';

interface AuthState {
  currentUser: AppUser | null;
  loading:     boolean;
  authError:   string | null;
  setCurrentUser: (user: AppUser | null) => void;
  setLoading:     (v: boolean)           => void;
  setAuthError:   (e: string | null)     => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  loading:     true,
  authError:   null,
  setCurrentUser: (user) => set({ currentUser: user }),
  setLoading:     (v)    => set({ loading: v }),
  setAuthError:   (e)    => set({ authError: e }),
}));
