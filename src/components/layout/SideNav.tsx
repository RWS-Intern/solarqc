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

export function SideNav() {
  const { currentUser } = useAuthStore();
  const items = currentUser?.role === 'admin' ? adminItems : fieldItems;

  return (
    <aside className="fixed left-0 top-14 z-40 hidden h-[calc(100vh-3.5rem)] w-52 flex-col border-r border-gray-100 bg-white shadow-sm md:flex">
      <nav className="flex flex-col gap-1 p-2 pt-4">
        <div className="px-3 pb-4 mb-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Navigation
          </p>
        </div>
        {items.map(({ to, label, Icon }) => (
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
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
