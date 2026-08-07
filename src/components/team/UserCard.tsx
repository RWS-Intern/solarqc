import { UserCog, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ALL_ROLES, ROLES, roleLabel, ROLE_CODE_PREFIX } from '@/config/roles';
import type { User, UserRole } from '@/types';

interface UserCardProps {
  user:            User;
  isSelf:          boolean;
  onEdit?:         (user: User) => void;
  onToggleActive?: (user: User) => void;
  onView?:         (user: User) => void;
  onChangeRole?:   (user: User, newRole: UserRole) => void;
  isSuperAdmin?:   boolean;
  isOnline?:       boolean;
  lastSeen?:       number | null;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Avatar({ user }: { user: User }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || '?';
  const bg = ROLES[user.role]?.badgeBg ?? 'bg-gray-500';

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
  const cfg = ROLES[role];
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

export function UserCard({ user, isSelf, onEdit, onToggleActive, onView, onChangeRole, isSuperAdmin, isOnline, lastSeen }: UserCardProps) {
  const hasCode = !!ROLE_CODE_PREFIX[user.role];

  function handleChangeRole() {
    if (!onChangeRole) return;
    const options = ALL_ROLES.filter((r) => r !== user.role);
    const optionStr = options
      .map((r, i) => `${i + 1}. ${roleLabel(r)}`)
      .join('\n');
    const input = window.prompt(
      `Change role for ${user.name} (currently ${roleLabel(user.role)}).\n\nSelect new role:\n${optionStr}\n\nEnter number:`,
    );
    if (!input) return;
    const idx = parseInt(input.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= options.length) {
      window.alert('Invalid selection. No changes made.');
      return;
    }
    const newRole = options[idx];
    const confirmMsg = newRole === 'admin'
      ? `Promote ${user.name} to Admin? They will have FULL access to everything.`
      : `Change ${user.name}'s role to ${roleLabel(newRole)}?`;
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
      <div className="relative shrink-0">
        <Avatar user={user} />
        <div className={cn(
          'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white',
          isOnline ? 'bg-green-500' : 'bg-gray-300',
        )} />
      </div>

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
        {!isOnline && lastSeen && (
          <p className="text-xs font-medium text-gray-600 mt-0.5">Last seen {timeAgo(lastSeen)}</p>
        )}

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <RoleBadge role={user.role} />
          {hasCode && user.engineerCode && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 font-mono">
              {user.engineerCode}
            </span>
          )}
          {user.district && (
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
      </div>

      <div className="flex flex-col gap-1.5 shrink-0">
        {hasCode && onView && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 min-h-[44px] sm:min-h-0 text-xs px-2.5 text-brand-blue border-brand-blue/30 hover:bg-blue-50"
            onClick={() => onView(user)}
          >
            View
          </Button>
        )}
        {onEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 min-h-[44px] sm:min-h-0 text-xs px-2.5"
            onClick={() => onEdit(user)}
          >
            Edit
          </Button>
        )}
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
        {!isSelf && !isSuperAdmin && onToggleActive && (
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
