import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, BarChart2, FileText,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn }           from '@/lib/utils';

const fieldItems = [
  { to: '/dashboard', label: 'Home',  Icon: LayoutDashboard },
  { to: '/tasks',     label: 'Tasks', Icon: ClipboardList },
];

const adminItems = [
  { to: '/dashboard', label: 'Home',     Icon: LayoutDashboard },
  { to: '/tasks',     label: 'Tasks',    Icon: ClipboardList },
  { to: '/team',      label: 'Team',     Icon: Users },
  { to: '/template',  label: 'Template', Icon: FileText },
  { to: '/reports',   label: 'Reports',  Icon: BarChart2 },
];

export function BottomNav() {
  const { currentUser } = useAuthStore();
  const items = currentUser?.role === 'admin' ? adminItems : fieldItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[4.5rem] items-stretch border-t border-gray-100 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden">
      {items.map(({ to, label, Icon }) => (
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
              <Icon className={cn('h-6 w-6', isActive && 'text-brand-blue')} />
              <span className={cn('text-[11px] font-medium', isActive ? 'text-brand-blue' : 'text-gray-400')}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
