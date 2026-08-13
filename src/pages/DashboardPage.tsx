import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';
import { useQcStatusCounts, useQcCriticalFailCount } from '@/hooks/useQcStatusCounts';
import { ensureSuperAdmin } from '@/firebase/initAppConfig';
import { initQcConfig } from '@/firebase/initQcConfig';
import { can, roleLabel } from '@/config/roles';
import { QC_STATUS_LABELS, QC_STATUS_COLOR, ALL_STATUSES } from '@/config/qcStatus';
import { CountCard } from '@/components/qc/CountCard';
import type { QcStatus } from '@/types/qc';

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

const INSPECTOR_STATUSES: QcStatus[] = ['assigned', 'in_progress', 'rework'];

function InspectorSection({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const { counts, loading } = useQcStatusCounts(INSPECTOR_STATUSES, uid);

  return (
    <div className="mt-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">My jobs</p>
      <div className="grid grid-cols-3 gap-2">
        {INSPECTOR_STATUSES.map((status) => (
          <CountCard
            key={status}
            label={QC_STATUS_LABELS[status]}
            count={counts[status]}
            loading={loading}
            color={QC_STATUS_COLOR[status]}
            onClick={() => navigate('/my-jobs')}
          />
        ))}
      </div>
    </div>
  );
}

function ApproverSection() {
  const navigate = useNavigate();
  // Mirrors ApprovalsPage's own pending query shape (status ==
  // 'pending_approval', org-wide, no approverUid filter) rather than
  // inventing a second way to count the same queue. Unlike that page's
  // own onSnapshot(...limit(50)) list, this is a real server-side count
  // with no cap.
  const { counts, loading } = useQcStatusCounts(['pending_approval']);

  return (
    <div className="mt-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Approvals</p>
      <div className="grid grid-cols-2 gap-2 max-w-xs">
        <CountCard
          label="Pending review"
          count={counts.pending_approval}
          loading={loading}
          color={QC_STATUS_COLOR.pending_approval}
          onClick={() => navigate('/approvals')}
        />
      </div>
    </div>
  );
}

function OrgSection() {
  const navigate = useNavigate();
  const { counts, loading } = useQcStatusCounts(ALL_STATUSES);
  const criticalFailCount = useQcCriticalFailCount();

  return (
    <div className="mt-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">All jobs</p>
      <div className="grid grid-cols-3 gap-2">
        {ALL_STATUSES.map((status) => (
          <CountCard
            key={status}
            label={QC_STATUS_LABELS[status]}
            count={counts[status]}
            loading={loading}
            color={QC_STATUS_COLOR[status]}
            onClick={() => navigate('/jobs')}
          />
        ))}
        <CountCard
          label="Jobs with critical fails on record"
          count={criticalFailCount ?? undefined}
          loading={criticalFailCount === null}
          color={QC_STATUS_COLOR.rework}
          onClick={() => navigate('/jobs')}
        />
      </div>
    </div>
  );
}

// TODO(Phase 9): per-inspector and per-district stats, throughput,
// turnaround time, critical-fail rate over time — none of that exists
// yet, this phase is the real counts each role's own scope actually
// needs today, not a full analytics rebuild.
export function DashboardPage() {
  const { currentUser } = useAuthStore();
  const { onlineUsers, onlineCount } = useOnlineUsers();

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      ensureSuperAdmin(currentUser.uid);
      initQcConfig();
    }
  }, [currentUser?.role, currentUser?.uid]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <p className="text-xs font-medium text-gray-400 mb-0.5">
        {currentUser ? greeting(currentUser.name) : 'Welcome'}
      </p>
      <h1 className="text-xl font-bold text-gray-900 mb-0.5">Dashboard</h1>
      <p className="text-sm text-gray-400 mb-5">{formatFullDate(new Date())}</p>

      {currentUser?.role === 'qc_inspector' && <InspectorSection uid={currentUser.uid} />}
      {currentUser?.role === 'approver' && <ApproverSection />}
      {currentUser && ['admin', 'qc_manager', 'viewer'].includes(currentUser.role) && <OrgSection />}

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

      <p className="text-xs text-gray-400 mt-4">
        Signed in as {currentUser?.name} — {roleLabel(currentUser?.role)}.
      </p>
    </div>
  );
}
