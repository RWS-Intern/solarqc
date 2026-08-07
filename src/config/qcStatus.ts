// The authoritative `QcStatus` type lives in `src/types/qc.ts`, created in
// Phase 1. This file exists now only so nav/badge code has something to
// import. When Phase 1 lands, delete the local union below and import
// `QcStatus` from '@/types/qc' instead — the string values are identical,
// this is a sequencing shim, not a design decision.

export type QcStatusPlaceholder =
  | 'unassigned' | 'assigned' | 'in_progress'
  | 'pending_approval' | 'approved' | 'rework' | 'cancelled';

export const QC_STATUS_LABELS: Record<QcStatusPlaceholder, string> = {
  unassigned:       'Unassigned',
  assigned:         'Assigned',
  in_progress:      'In Progress',
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  rework:           'Rework',
  cancelled:        'Cancelled',
};

export const QC_STATUS_COLOR: Record<QcStatusPlaceholder, { bg: string; text: string }> = {
  unassigned:       { bg: 'bg-gray-100',   text: 'text-gray-600'   },
  assigned:         { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  in_progress:      { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  pending_approval: { bg: 'bg-purple-100', text: 'text-purple-700' },
  approved:         { bg: 'bg-green-100',  text: 'text-green-700'  },
  rework:           { bg: 'bg-red-100',    text: 'text-red-700'    },
  cancelled:        { bg: 'bg-gray-200',   text: 'text-gray-500'   },
};
