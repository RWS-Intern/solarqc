import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, BarChart2, FileText, Settings, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';
import { cn }           from '@/lib/utils';

const fieldItems = [
  { to: '/dashboard', label: 'Home',  Icon: LayoutDashboard },
  { to: '/tasks',     label: 'Tasks', Icon: ClipboardList },
];

const proposalItems = [
  { to: '/dashboard', label: 'Home',      Icon: LayoutDashboard },
  { to: '/proposal',  label: 'Proposals', Icon: FileText },
];

const backendItems = [
  { to: '/dashboard', label: 'Home',    Icon: LayoutDashboard },
  { to: '/backend',   label: 'Backend', Icon: Settings },
];

const adminItems = [
  { to: '/dashboard',  label: 'Home',       Icon: LayoutDashboard },
  { to: '/tasks',      label: 'Tasks',      Icon: ClipboardList },
  { to: '/team',       label: 'Team',       Icon: Users },
  { to: '/template',   label: 'Template',   Icon: FileText },
  { to: '/reports',    label: 'Reports',    Icon: BarChart2 },
  { to: '/error-logs', label: 'Error Logs', Icon: AlertCircle },
];

const backendManagerItems = [
  { to: '/dashboard',       label: 'Home',    Icon: LayoutDashboard },
  { to: '/backend-manager', label: 'Backend', Icon: Settings },
];

export function SideNav() {
  const { currentUser } = useAuthStore();
  const { proposalActiveCount, backendActiveCount } = useTaskStore();
  const role = currentUser?.role;
  const items = role === 'admin' || role === 'view_only'
    ? adminItems
    : role === 'proposal'
    ? proposalItems
    : role === 'backend'
    ? backendItems
    : role === 'backend_manager'
    ? backendManagerItems
    : fieldItems;

  const badgeCount = role === 'proposal'
    ? proposalActiveCount
    : role === 'backend'
    ? backendActiveCount
    : 0;

  return (
    <aside className="fixed left-0 top-14 z-40 hidden h-[calc(100vh-3.5rem)] w-52 flex-col border-r border-gray-100 bg-white shadow-sm md:flex">
      <nav className="flex flex-col gap-1 p-2 pt-4">
        <div className="px-3 pb-4 mb-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Navigation
          </p>
        </div>
        {items.map(({ to, label, Icon }) => {
          const showBadge = badgeCount > 0 && (
            (role === 'proposal' && to === '/proposal') ||
            (role === 'backend'  && to === '/backend')
          );
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-blue text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{label}</span>
              {showBadge && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold px-1">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
