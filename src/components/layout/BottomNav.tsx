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

export function BottomNav() {
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[4.5rem] items-stretch border-t border-gray-100 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden">
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
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
                isActive ? 'text-brand-blue' : 'text-gray-400 hover:text-gray-600'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-brand-blue" />
                )}
                <div className="relative">
                  <Icon className={cn('h-6 w-6', isActive && 'text-brand-blue')} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 text-white text-[9px] font-bold px-0.5">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </div>
                <span className={cn('text-[11px] font-medium', isActive ? 'text-brand-blue' : 'text-gray-400')}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
