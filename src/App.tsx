import { useEffect }   from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth }     from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { Toaster }     from '@/components/ui/toaster';
import { Layout }      from '@/components/layout/Layout';
import { LoginPage }   from '@/pages/LoginPage';
import { SignupPage }  from '@/pages/SignupPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TasksPage }   from '@/pages/TasksPage';
import { TeamPage }    from '@/pages/TeamPage';
import { TemplatePage } from '@/pages/TemplatePage';
import { ReportsPage } from '@/pages/ReportsPage';

function AuthInit({ children }: { children: React.ReactNode }) {
  useAuth();
  return <>{children}</>;
}

interface ProtectedRouteProps {
  requireAdmin?: boolean;
  children: React.ReactNode;
}

function ProtectedRoute({ requireAdmin = false, children }: ProtectedRouteProps) {
  const { currentUser, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
      </div>
    );
  }

  if (!currentUser)                                 return <Navigate to="/login" replace />;
  if (requireAdmin && currentUser.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function CatchAll() {
  const { currentUser, loading } = useAuthStore();
  if (loading) return null;
  return <Navigate to={currentUser ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  useEffect(() => {
    document.body.style.backgroundColor = '#F0F4F8';
  }, []);

  return (
    <BrowserRouter>
      <Toaster />
      <AuthInit>
        <Routes>
          <Route path="/"                 element={<Navigate to="/login" replace />} />
          <Route path="/login"            element={<LoginPage />} />
          <Route path="/signup/:inviteId" element={<SignupPage />} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tasks"     element={<TasksPage />} />

            <Route path="/team"     element={<ProtectedRoute requireAdmin><TeamPage /></ProtectedRoute>} />
            <Route path="/template" element={<ProtectedRoute requireAdmin><TemplatePage /></ProtectedRoute>} />
            <Route path="/reports"  element={<ProtectedRoute requireAdmin><ReportsPage /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<CatchAll />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}
