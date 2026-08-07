import { NavLink } from 'react-router-dom';
import * as Icons  from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { ROLES }        from '@/config/roles';
import { cn }            from '@/lib/utils';

interface NavProps {
  variant: 'bottom' | 'side';
}

export function Nav({ variant }: NavProps) {
  const { currentUser } = useAuthStore();
  const role  = currentUser?.role;
  const items = role ? ROLES[role].navItems : [];

  if (variant === 'bottom') {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[4.5rem] items-stretch border-t border-gray-100 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden">
        {items.map(({ to, label, icon }) => {
          const Icon = Icons[icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>;
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
                  <Icon className={cn('h-6 w-6', isActive && 'text-brand-blue')} />
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

  return (
    <aside className="fixed left-0 top-14 z-40 hidden h-[calc(100vh-3.5rem)] w-52 flex-col border-r border-gray-100 bg-white shadow-sm md:flex">
      <nav className="flex flex-col gap-1 p-2 pt-4">
        <div className="px-3 pb-4 mb-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Navigation
          </p>
        </div>
        {items.map(({ to, label, icon }) => {
          const Icon = Icons[icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>;
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
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
