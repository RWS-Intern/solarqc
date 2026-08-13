import { useNavigate } from 'react-router-dom';
import { signOut }     from 'firebase/auth';
import { LogOut }      from 'lucide-react';
import { ref, set, serverTimestamp } from 'firebase/database';
import { auth, rtdb }  from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { ROLES, roleLabel } from '@/config/roles';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useAuthStore();
  // TODO(Phase 3/4): reconnect a live/reconnecting dot once a QC job
  // listener sets connection state again — useTaskStore no longer has one.

  const handleLogout = async () => {
    // Best-effort — attempted BEFORE signing out, since after signOut the
    // RTDB connection loses auth context and the write would be rejected
    // outright. Deliberately NOT awaited: this must never be able to block
    // the actual sign-out below. It previously was awaited with no error
    // handling, so a rejected write here (confirmed live: the RTDB rules
    // deploy had never actually gone out, so every presence write was
    // permission-denied for every role) silently broke logout completely —
    // signOut() was simply never reached.
    const uid = auth.currentUser?.uid;
    if (uid) {
      set(ref(rtdb, `presence/${uid}`), {
        online:   false,
        lastSeen: serverTimestamp(),
        name:     currentUser?.name ?? '',
        role:     currentUser?.role ?? '',
      }).catch((err) => console.error('[Header] presence cleanup on logout failed:', err));
    }
    await signOut(auth);
    setCurrentUser(null);
    navigate('/login');
  };

  const initial = currentUser?.name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <header className="flex h-14 w-full items-center justify-between bg-gradient-to-r from-brand-navy to-brand-blue px-4 shadow-md">
      <div className="flex items-center gap-2">
        <img src="/logo/rite-solar-icon-mark.png" alt="Rite Solar" className="h-7 w-7" />
        <span className="text-base font-bold text-white">SolarQC</span>
      </div>

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 border border-white/30 text-white text-sm font-bold hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-brand-blue">
              {initial}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <p className="font-semibold text-sm">{currentUser?.name}</p>
            </DropdownMenuLabel>
            <div className="px-2 pb-1">
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${currentUser ? ROLES[currentUser.role].badgeBg : 'bg-brand-green'} ${currentUser ? ROLES[currentUser.role].badgeText : 'text-white'}`}>
                {roleLabel(currentUser?.role)}
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
