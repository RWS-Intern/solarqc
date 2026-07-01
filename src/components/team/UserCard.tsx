import { UserCog, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEngineerTaskStats } from '@/hooks/useEngineerTaskStats';
import type { User, UserRole } from '@/types';

interface UserCardProps {
  user:            User;
  isSelf:          boolean;
  onEdit:          (user: User) => void;
  onToggleActive:  (user: User) => void;
  onView?:         (user: User) => void;
  onChangeRole?:   (user: User, newRole: UserRole) => void;
  isSuperAdmin?:   boolean;
}

const ROLE_CONFIG: Record<string, { label: string; avatarBg: string; badgeBg: string; badgeText: string }> = {
  admin:        { label: 'Admin',                 avatarBg: 'bg-brand-navy',  badgeBg: 'bg-brand-navy/10', badgeText: 'text-brand-navy'  },
  field:        { label: 'Field Engineer',        avatarBg: 'bg-teal-600',    badgeBg: 'bg-teal-100',      badgeText: 'text-teal-700'    },
  proposal:     { label: 'Proposal Engineer',     avatarBg: 'bg-violet-600',  badgeBg: 'bg-violet-100',    badgeText: 'text-violet-700'  },
  backend:      { label: 'Backend Engineer',      avatarBg: 'bg-orange-500',  badgeBg: 'bg-orange-100',    badgeText: 'text-orange-700'  },
  logistics:    { label: 'Logistics',             avatarBg: 'bg-sky-600',     badgeBg: 'bg-sky-100',       badgeText: 'text-sky-700'     },
  installation: { label: 'Installation Engineer', avatarBg: 'bg-green-700',   badgeBg: 'bg-green-100',     badgeText: 'text-green-700'   },
};

function Avatar({ user }: { user: User }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || '?';
  const bg = ROLE_CONFIG[user.role]?.avatarBg ?? 'bg-gray-500';

  return (
    <div
      className={cn(
        'h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-white font-semibold text-sm',
        bg,
        !user.active && 'opacity-50',
      )}
    >
      {initial}
    </div>
  );
}

function RoleBadge({ role }: { role: User['role'] }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        cfg?.badgeBg  ?? 'bg-gray-100',
        cfg?.badgeText ?? 'text-gray-600',
      )}
    >
      {cfg?.label ?? role}
    </span>
  );
}

export function UserCard({ user, isSelf, onEdit, onToggleActive, onView, onChangeRole, isSuperAdmin }: UserCardProps) {
  const isNonAdmin = user.role !== 'admin';
  const { tasks, loading: statsLoading } = useEngineerTaskStats(
    isNonAdmin ? user.id : '',
    user.role,
  );

  const assignedCount  = tasks.length;
  const completedCount = user.role === 'backend'
    ? tasks.filter((t) => t.pipelineStage === 'completed').length
    : user.role === 'proposal'
    ? tasks.filter((t) =>
        t.pipelineStage === 'completed' ||
        t.pipelineStage === 'dropped'
      ).length
    : tasks.filter((t) => t.status === 'completed').length;
  const completionPct  = assignedCount > 0
    ? Math.round((completedCount / assignedCount) * 100)
    : 0;

  function handleChangeRole() {
    if (!onChangeRole) return;
    const roleOptions = ['field', 'proposal', 'backend', 'admin'] as UserRole[];
    const labels: Record<string, string> = {
      field:    'Field Engineer',
      proposal: 'Proposal Team',
      backend:  'Backend Team',
      admin:    'Admin',
    };
    const optionStr = roleOptions
      .filter((r) => r !== user.role)
      .map((r, i) => `${i + 1}. ${labels[r]}`)
      .join('\n');
    const input = window.prompt(
      `Change role for ${user.name} (currently ${labels[user.role] ?? user.role}).\n\nSelect new role:\n${optionStr}\n\nEnter number:`,
    );
    if (!input) return;
    const available = roleOptions.filter((r) => r !== user.role);
    const idx = parseInt(input.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= available.length) {
      window.alert('Invalid selection. No changes made.');
      return;
    }
    const newRole = available[idx];
    const confirmMsg = newRole === 'admin'
      ? `Promote ${user.name} to Admin? They will have FULL access to everything.`
      : `Change ${user.name}'s role to ${labels[newRole]}?`;
    if (!window.confirm(confirmMsg)) return;
    onChangeRole(user, newRole);
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4 flex gap-3 items-start transition-opacity',
        !user.active && 'opacity-60',
      )}
    >
      <Avatar user={user} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('font-semibold text-sm text-gray-900', !user.active && 'line-through text-gray-400')}>
            {user.name}
          </span>
          {isSelf && (
            <span className="text-xs text-gray-400 font-normal">(You)</span>
          )}
          {isSuperAdmin && (
            <span title="Super Admin" className="text-amber-400 text-xs">👑</span>
          )}
          {user.fcmToken && (
            <Wifi className="h-3.5 w-3.5 text-green-500 shrink-0" aria-label="Push notifications active" />
          )}
        </div>

        <p className="text-xs text-gray-500 mt-0.5 truncate">{user.email}</p>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <RoleBadge role={user.role} />
          {isNonAdmin && user.engineerCode && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 font-mono">
              {user.engineerCode}
            </span>
          )}
          {user.role === 'field' && user.district && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600">
              {user.district}
            </span>
          )}
          {!user.active && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600">
              Disabled
            </span>
          )}
        </div>

        {isNonAdmin && (
          <p className="text-xs text-gray-400 mt-1.5">
            {statsLoading ? (
              <span className="text-gray-300">Loading tasks…</span>
            ) : (
              (() => {
                if (user.role === 'proposal') {
                  const active = tasks.filter((t) =>
                    t.pipelineStage === 'proposal'
                  ).length;
                  const done = tasks.filter((t) =>
                    t.pipelineStage === 'completed' ||
                    t.pipelineStage === 'dropped'
                  ).length;
                  return (
                    <>
                      <span className="font-medium text-gray-600">{active}</span> active
                      {' · '}
                      <span className="font-medium text-gray-600">{done}</span> done
                    </>
                  );
                }
                if (user.role === 'backend') {
                  const active = tasks.filter((t) =>
                    t.pipelineStage === 'backend'
                  ).length;
                  const converted = tasks.filter((t) =>
                    t.pipelineStage === 'completed'
                  ).length;
                  return (
                    <>
                      <span className="font-medium text-gray-600">{active}</span> active
                      {' · '}
                      <span className="font-medium text-gray-600">{converted}</span> converted
                    </>
                  );
                }
                // field engineer default
                return (
                  <>
                    <span className="font-medium text-gray-600">{assignedCount}</span> assigned
                    {' · '}
                    <span className="font-medium text-gray-600">{completedCount}</span> completed
                    {' · '}
                    <span className="font-medium text-gray-600">{completionPct}%</span>
                  </>
                );
              })()
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 shrink-0">
        {isNonAdmin && onView && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 min-h-[44px] sm:min-h-0 text-xs px-2.5 text-brand-blue border-brand-blue/30 hover:bg-blue-50"
            onClick={() => onView(user)}
          >
            View
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 min-h-[44px] sm:min-h-0 text-xs px-2.5"
          onClick={() => onEdit(user)}
        >
          Edit
        </Button>
        {!isSelf && !isSuperAdmin && onChangeRole && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 min-h-[44px] sm:min-h-0 text-xs px-2.5 border-gray-200 text-gray-600 hover:text-brand-blue hover:border-brand-blue gap-1.5"
            onClick={handleChangeRole}
          >
            <><UserCog className="h-3.5 w-3.5" /> Change Role</>
          </Button>
        )}
        {!isSelf && !isSuperAdmin && (
          <Button
            size="sm"
            variant="outline"
            className={cn(
              'h-7 min-h-[44px] sm:min-h-0 text-xs px-2.5',
              user.active
                ? 'text-red-600 border-red-200 hover:bg-red-50'
                : 'text-green-700 border-green-200 hover:bg-green-50',
            )}
            onClick={() => onToggleActive(user)}
          >
            {user.active ? 'Disable' : 'Enable'}
          </Button>
        )}
      </div>
    </div>
  );
}
