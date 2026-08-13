import type { QcStatus } from '@/types/qc';

// The canonical status list for org-wide breakdowns (DashboardPage's
// OrgSection, CustomersPage's stage chips) — one shared array so every
// consumer's counts stay in lockstep rather than drifting if each page
// defined its own subset/ordering.
export const ALL_STATUSES: QcStatus[] = [
  'unassigned', 'assigned', 'in_progress', 'pending_approval', 'approved', 'rework', 'cancelled',
];

export const QC_STATUS_LABELS: Record<QcStatus, string> = {
  unassigned:       'Unassigned',
  assigned:         'Assigned',
  in_progress:      'In Progress',
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  rework:           'Rework',
  cancelled:        'Cancelled',
};

export const QC_STATUS_COLOR: Record<QcStatus, { bg: string; text: string }> = {
  unassigned:       { bg: 'bg-gray-100',   text: 'text-gray-600'   },
  assigned:         { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  in_progress:      { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  pending_approval: { bg: 'bg-purple-100', text: 'text-purple-700' },
  approved:         { bg: 'bg-green-100',  text: 'text-green-700'  },
  rework:           { bg: 'bg-red-100',    text: 'text-red-700'    },
  cancelled:        { bg: 'bg-gray-200',   text: 'text-gray-500'   },
};
