import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore }      from '@/store/authStore';
import { useTasks }          from '@/hooks/useTasks';
import { useUsers }          from '@/hooks/useUsers';
import { Header }            from './Header';
import { BottomNav }         from './BottomNav';
import { SideNav }           from './SideNav';
import { OfflineBanner }     from '@/components/offline/OfflineBanner';
import { TaskQueueProcessor } from '@/components/offline/TaskQueueProcessor';

function TasksListener() {
  const { currentUser } = useAuthStore();
  // Admins use subscribeToFilter from TasksPage
  // Pipeline roles have their own hooks
  // Only field engineers need this listener
  if (!currentUser || currentUser.role !== 'field') {
    return null;
  }
  return <FieldTasksListener />;
}

function FieldTasksListener() {
  useTasks();
  return null;
}

function UsersListener()  { useUsers();  return null; }

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
      <TasksListener />
      {(currentUser.role === 'admin' || currentUser.role === 'view_only') && <UsersListener />}
      <TaskQueueProcessor />

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
