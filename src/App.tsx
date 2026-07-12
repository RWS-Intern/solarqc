import { useEffect }   from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth }     from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import { useAuthStore } from '@/store/authStore';
import { Toaster }     from '@/components/ui/toaster';
import { Layout }      from '@/components/layout/Layout';
import { LoginPage }   from '@/pages/LoginPage';
import { SignupPage }  from '@/pages/SignupPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TasksPage }   from '@/pages/TasksPage';
import { TeamPage }    from '@/pages/TeamPage';
import { TemplatePage } from '@/pages/TemplatePage';
import { ReportsPage }  from '@/pages/ReportsPage';
import { ProposalPage }        from '@/pages/ProposalPage';
import { BackendPage }         from '@/pages/BackendPage';
import { BackendManagerPage }  from '@/pages/BackendManagerPage';

function ComingSoonPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
      <p className="text-5xl">🚧</p>
      <h1 className="text-2xl font-bold text-gray-800">Coming Soon</h1>
      <p className="text-sm text-gray-500 max-w-xs">
        This section is under construction. Check back soon!
      </p>
    </div>
  );
}

function AuthInit({ children }: { children: React.ReactNode }) {
  useAuth();
  usePresence();
  return <>{children}</>;
}

interface ProtectedRouteProps {
  requireAdmin?:       boolean;
  requireRole?:        string;
  requireAdminOrField?: boolean;
  children:            React.ReactNode;
}

function ProtectedRoute({ requireAdmin = false, requireRole, requireAdminOrField = false, children }: ProtectedRouteProps) {
  const { currentUser, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" replace />;
  if (requireAdmin && currentUser.role !== 'admin' && currentUser.role !== 'view_only') return <Navigate to="/dashboard" replace />;
  if (requireRole && currentUser.role !== requireRole && currentUser.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  if (requireAdminOrField) {
    const role = currentUser.role;
    if (role === 'proposal') return <Navigate to="/proposal" replace />;
    if (role === 'backend') return <Navigate to="/backend" replace />;
    if (role === 'backend_manager') return <Navigate to="/backend-manager" replace />;
    if (role === 'logistics' || role === 'installation') {
      return <Navigate to="/coming-soon" replace />;
    }
  }
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
            <Route path="/tasks"     element={<ProtectedRoute requireAdminOrField><TasksPage /></ProtectedRoute>} />

            <Route
              path="/proposal"
              element={
                <ProtectedRoute requireRole="proposal">
                  <ProposalPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/backend"
              element={
                <ProtectedRoute requireRole="backend">
                  <BackendPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/backend-manager"
              element={
                <ProtectedRoute requireRole="backend_manager">
                  <BackendManagerPage />
                </ProtectedRoute>
              }
            />

            <Route path="/coming-soon" element={<ComingSoonPage />} />
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
