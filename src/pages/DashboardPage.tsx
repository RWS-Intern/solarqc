import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';
import { ensureSuperAdmin } from '@/firebase/initAppConfig';
import { can, roleLabel } from '@/config/roles';

function formatFullDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  });
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `Good ${part}, ${name.split(' ')[0]}`;
}

// TODO(Phase 9): rebuild per-role dashboards (inspector = my jobs by status +
// overdue; approver = pending queue + turnaround; admin/manager = throughput,
// critical-fail rate, per-inspector and per-district stats) per plan §5.1.

export function DashboardPage() {
  const { currentUser } = useAuthStore();
  const { onlineUsers, onlineCount } = useOnlineUsers();

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      ensureSuperAdmin(currentUser.uid);
    }
  }, [currentUser?.role, currentUser?.uid]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <p className="text-xs font-medium text-gray-400 mb-0.5">
        {currentUser ? greeting(currentUser.name) : 'Welcome'}
      </p>
      <h1 className="text-xl font-bold text-gray-900 mb-0.5">Dashboard</h1>
      <p className="text-sm text-gray-400 mb-5">{formatFullDate(new Date())}</p>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-base font-semibold text-gray-800">
          Welcome, {currentUser?.name} — {roleLabel(currentUser?.role)}.
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Your dashboard is being rebuilt for QC.
        </p>
      </div>

      {currentUser && can(currentUser.role, 'viewPresence') && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 mt-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold text-green-800">
              {onlineCount} {onlineCount === 1 ? 'user' : 'users'} online now
            </span>
          </div>
          {onlineUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {onlineUsers.map((u) => (
                <span
                  key={u.uid}
                  className="text-xs bg-white border border-green-200 text-green-700 rounded-full px-2 py-0.5"
                >
                  {u.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
