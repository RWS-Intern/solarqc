import { useState, useMemo } from 'react';
import { Search, UserPlus, Download } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useUserActions } from '@/hooks/useUserActions';
import { useAuthStore }   from '@/store/authStore';
import { useAppConfig }   from '@/hooks/useAppConfig';
import { useTeamStats }     from '@/hooks/useTeamStats';
import { useOnlineUsers }   from '@/hooks/useOnlineUsers';
import { UserCard }               from '@/components/team/UserCard';
import { EditUserModal }          from '@/components/team/EditUserModal';
import { CreateUserModal }        from '@/components/team/CreateUserModal';
import { EngineerDetailDrawer }   from '@/components/team/EngineerDetailDrawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { User, UserRole } from '@/types';

function exportEngineersCsv(users: User[]): void {
  const headers = ['Name', 'Engineer Code', 'Email', 'Role', 'Status'].join(',');
  const rows = users.map((u) =>
    [
      `"${u.name  ?? ''}"`,
      `"${u.engineerCode ?? ''}"`,
      `"${u.email ?? ''}"`,
      `"${u.role  ?? ''}"`,
      `"${u.active === false ? 'Disabled' : 'Active'}"`,
    ].join(',')
  );
  const csv  = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'engineers.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type FilterTab = 'all' | 'admin' | 'field' | 'proposal' | 'backend' | 'view_only' | 'backend_manager' | 'disabled';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',             label: 'All'              },
  { key: 'admin',           label: 'Admins'            },
  { key: 'field',           label: 'Field Engineers'   },
  { key: 'proposal',        label: 'Proposal Team'     },
  { key: 'backend',         label: 'Backend Team'      },
  { key: 'view_only',       label: 'View Only'         },
  { key: 'backend_manager', label: 'Backend Managers'  },
  { key: 'disabled',        label: 'Disabled'          },
];

export function TeamPage() {
  const { users, loading } = useUserStore();
  const { currentUser }    = useAuthStore();
  const { config }         = useAppConfig();
  const { setUserActive, changeRole } = useUserActions();
  const teamStats = useTeamStats(users);
  const { presenceMap } = useOnlineUsers();
  const isViewOnly = currentUser?.role === 'view_only';
  const canEdit    = !isViewOnly;

  const [search,         setSearch]         = useState('');
  const [stateFilter,    setStateFilter]    = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [activeTab,      setActiveTab]      = useState<FilterTab>('all');
  const [editUser,       setEditUser]       = useState<User | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [confirmUser,      setConfirmUser]      = useState<User | null>(null);
  const [confirming,       setConfirming]       = useState(false);
  const [viewEngineer,     setViewEngineer]     = useState<User | null>(null);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    userId: string; userName: string; currentRole: UserRole; newRole: UserRole;
  } | null>(null);
  const [confirmingRole,   setConfirmingRole]   = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (activeTab === 'admin'           && u.role !== 'admin')           return false;
      if (activeTab === 'field'           && u.role !== 'field')           return false;
      if (activeTab === 'proposal'        && u.role !== 'proposal')        return false;
      if (activeTab === 'backend'         && u.role !== 'backend')         return false;
      if (activeTab === 'view_only'       && u.role !== 'view_only')       return false;
      if (activeTab === 'backend_manager' && u.role !== 'backend_manager') return false;
      if (activeTab === 'disabled' && u.active)           return false;
      if (activeTab !== 'disabled' && !u.active)          return false;
      if (stateFilter    && (u.state    ?? '') !== stateFilter)    return false;
      if (districtFilter && (u.district ?? '') !== districtFilter) return false;
      if (q) {
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, activeTab, search, stateFilter, districtFilter]);

  const counts = useMemo(() => ({
    all:             users.filter((u) => u.active).length,
    admin:           users.filter((u) => u.role === 'admin'           && u.active).length,
    field:           users.filter((u) => u.role === 'field'           && u.active).length,
    proposal:        users.filter((u) => u.role === 'proposal'        && u.active).length,
    backend:         users.filter((u) => u.role === 'backend'         && u.active).length,
    view_only:       users.filter((u) => u.role === 'view_only'       && u.active).length,
    backend_manager: users.filter((u) => u.role === 'backend_manager' && u.active).length,
    disabled:        users.filter((u) => !u.active).length,
  }), [users]);

  function requestToggleActive(user: User) { setConfirmUser(user); }

  async function confirmToggleActive() {
    if (!confirmUser || !currentUser) return;
    setConfirming(true);
    try {
      await setUserActive(confirmUser.id, !confirmUser.active, currentUser.uid);
    } finally {
      setConfirming(false);
      setConfirmUser(null);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-0.5">Team</h2>
          <p className="text-sm text-gray-500">
            {loading
              ? 'Loading…'
              : `${counts.all} active member${counts.all !== 1 ? 's' : ''}${counts.disabled ? `, ${counts.disabled} disabled` : ''}`
            }
          </p>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Button
            variant="outline"
            onClick={() => exportEngineersCsv(filtered)}
            className="flex items-center gap-1.5 flex-1 sm:flex-none h-11"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          {canEdit && (
            <Button
              onClick={() => setShowCreateUser(true)}
              className="flex items-center gap-1.5 flex-1 sm:flex-none h-11"
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          )}
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
        />
      </div>

      {Object.keys(config.districtsByState ?? {}).length > 0 && (activeTab === 'all' || activeTab === 'field') && (
        <div className="mb-3">
          <select
            value={stateFilter}
            onChange={(e) => {
              const v = e.target.value;
              setStateFilter(v);
              if (v && districtFilter && !(config.districtsByState?.[v] ?? []).includes(districtFilter)) {
                setDistrictFilter('');
              }
            }}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue text-gray-700 min-w-[160px]"
          >
            <option value="">All States</option>
            {Object.keys(config.districtsByState ?? {}).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {(stateFilter ? (config.districtsByState?.[stateFilter] ?? []) : (config.districts ?? [])).length > 0 && (activeTab === 'all' || activeTab === 'field') && (
        <div className="mb-3">
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue text-gray-700 min-w-[160px]"
          >
            <option value="">All Districts</option>
            {(stateFilter ? (config.districtsByState?.[stateFilter] ?? []) : (config.districts ?? [])).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors shrink-0',
              activeTab === key
                ? 'bg-brand-blue text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {label}
            <span className={cn(
              'ml-1.5 rounded-full px-1.5 py-px text-[10px]',
              activeTab === key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500',
            )}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search ? 'No users match your search.' : 'No users in this category.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              isSelf={user.id === currentUser?.uid}
              isSuperAdmin={user.id === config.superAdminUid}
              stats={teamStats[user.id]}
              isOnline={presenceMap[user.id]?.online ?? false}
              lastSeen={presenceMap[user.id]?.lastSeen ?? null}
              onEdit={canEdit ? setEditUser : undefined}
              onToggleActive={canEdit ? requestToggleActive : undefined}
              onView={(u) => setViewEngineer(u)}
              onChangeRole={canEdit && user.id !== currentUser?.uid
                ? (u, newRole) => {
                    setRoleChangeConfirm({
                      userId:      u.id,
                      userName:    u.name,
                      currentRole: u.role as UserRole,
                      newRole:     newRole as UserRole,
                    });
                  }
                : undefined}
            />
          ))}
        </div>
      )}

      <EngineerDetailDrawer
        engineer={viewEngineer}
        onClose={() => setViewEngineer(null)}
      />

      <CreateUserModal
        open={showCreateUser}
        onClose={() => setShowCreateUser(false)}
      />

      <EditUserModal
        user={editUser}
        onClose={() => setEditUser(null)}
      />

      <Dialog
        open={!!roleChangeConfirm}
        onOpenChange={(o) => { if (!o && !confirmingRole) setRoleChangeConfirm(null); }}
      >
        <DialogContent className="max-w-sm" aria-describedby="role-change-desc">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription id="role-change-desc">
              {roleChangeConfirm && (
                <>
                  Change <strong>{roleChangeConfirm.userName}</strong>'s role from{' '}
                  <strong>{roleChangeConfirm.currentRole}</strong> to{' '}
                  <strong>{roleChangeConfirm.newRole}</strong>? This will affect their access immediately.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setRoleChangeConfirm(null)}
              disabled={confirmingRole}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={async () => {
                if (!roleChangeConfirm) return;
                setConfirmingRole(true);
                try {
                  await changeRole(roleChangeConfirm.userId, roleChangeConfirm.currentRole, roleChangeConfirm.newRole, users);
                } finally {
                  setConfirmingRole(false);
                  setRoleChangeConfirm(null);
                }
              }}
              disabled={confirmingRole}
            >
              {confirmingRole ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Changing…
                </span>
              ) : (
                'Confirm'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmUser}
        onOpenChange={(o) => { if (!o && !confirming) setConfirmUser(null); }}
      >
        <DialogContent className="max-w-sm" aria-describedby="confirm-desc">
          <DialogHeader>
            <DialogTitle>
              {confirmUser?.active ? 'Disable Account' : 'Enable Account'}
            </DialogTitle>
            <DialogDescription id="confirm-desc">
              {confirmUser?.active
                ? `${confirmUser.name} will no longer be able to sign in.`
                : `${confirmUser?.name} will be able to sign in again.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmUser(null)}
              disabled={confirming}
            >
              Cancel
            </Button>
            <Button
              className={cn(
                'flex-1',
                confirmUser?.active
                  ? 'bg-red-600 hover:bg-red-700 text-white border-0'
                  : 'bg-green-600 hover:bg-green-700 text-white border-0',
              )}
              onClick={confirmToggleActive}
              disabled={confirming}
            >
              {confirming ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {confirmUser?.active ? 'Disabling…' : 'Enabling…'}
                </span>
              ) : (
                confirmUser?.active ? 'Disable' : 'Enable'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
