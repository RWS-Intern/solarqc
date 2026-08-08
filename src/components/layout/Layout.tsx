import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore }      from '@/store/authStore';
import { useUsers }          from '@/hooks/useUsers';
import { useOfflineQueueProcessor } from '@/hooks/useOfflineQueueProcessor';
import { can }               from '@/config/roles';
import { Header }            from './Header';
import { BottomNav }         from './BottomNav';
import { SideNav }           from './SideNav';
import { OfflineBanner }     from '@/components/offline/OfflineBanner';

function UsersListener()        { useUsers();                return null; }
function OfflineQueueListener() { useOfflineQueueProcessor(); return null; }

export function Layout() {
  const { currentUser, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-brand-background">
      {can(currentUser.role, 'viewPresence') && <UsersListener />}
      <OfflineQueueListener />

      {/* Header — fixed at top, always visible */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14">
        <Header />
      </header>

      {/* Sidebar — fixed on desktop, below header */}
      <SideNav />

      {/* Offline banner — fixed just below header */}
      <div className="fixed top-14 left-0 right-0 z-40 md:left-52">
        <OfflineBanner />
      </div>

      {/* Main content — pushed down by header height, right of sidebar on desktop */}
      <main className="pt-14 md:ml-52 min-h-screen">
        <div className="px-4 py-5 pb-24 md:pb-8">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav — fixed at bottom, mobile only */}
      <BottomNav />
    </div>
  );
}
