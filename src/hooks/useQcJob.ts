import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { QcJob, SignOff } from '@/types/qc';

function toDate(v: unknown): Date | null {
  return (v as { toDate?: () => Date } | null)?.toDate?.() ?? null;
}

// A naive cast of the raw Firestore map leaves `signedAt` as a Timestamp,
// not the `Date` the SignOff type promises — harmless until a real
// signature exists to reload, which is exactly what Phase 5 adds.
function toSignOff(raw: unknown): SignOff | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    role:         r['role'] as SignOff['role'],
    name:         (r['name'] as string) ?? '',
    designation:  r['designation'] as string | undefined,
    uid:          (r['uid'] as string | null) ?? null,
    signatureUrl: (r['signatureUrl'] as string) ?? '',
    signedAt:     toDate(r['signedAt']) ?? new Date(0),
    location:     (r['location'] as SignOff['location']) ?? null,
    deviceInfo:   (r['deviceInfo'] as string) ?? '',
    declaration:  (r['declaration'] as string) ?? '',
  };
}

function docToQcJob(id: string, data: Record<string, unknown>): QcJob {
  return {
    id,
    qcNum:         (data['qcNum']       as string) ?? '',
    status:        (data['status']      as QcJob['status']) ?? 'unassigned',
    reworkRound:   (data['reworkRound'] as number) ?? 0,

    customer: (data['customer'] as QcJob['customer']) ?? {
      name: '', nameLower: '', nameWords: [], mobile: '', address: '', district: '', state: '',
    },
    system: (data['system'] as QcJob['system']) ?? { sizeKw: 0 },

    inspectorUid:    (data['inspectorUid']    as string | null) ?? null,
    inspectorName:   (data['inspectorName']   as string) ?? '',
    inspectorCode:   (data['inspectorCode']   as string) ?? '',
    inspectorMobile: (data['inspectorMobile'] as string) ?? '',
    approverUid:     (data['approverUid']     as string | null) ?? null,
    approverName:    (data['approverName']    as string) ?? '',

    scheduledDate: toDate(data['scheduledDate']),
    dueDate:       toDate(data['dueDate']),

    template:        (data['template']        as QcJob['template']) ?? [],
    templateVersion: (data['templateVersion'] as number) ?? 1,
    answers:         (data['answers']         as QcJob['answers']) ?? {},

    tally: (data['tally'] as QcJob['tally']) ?? {
      total: 0, answered: 0, pass: 0, fail: 0, na: 0,
      criticalFail: 0, majorFail: 0, minorFail: 0, suggestedVerdict: 'pass',
    },

    location:   (data['location'] as QcJob['location']) ?? null,
    locationAt: toDate(data['locationAt']),

    inspectorSignOff: toSignOff(data['inspectorSignOff']),
    customerSignOff:  toSignOff(data['customerSignOff']),
    approverSignOff:  toSignOff(data['approverSignOff']),

    verdict:          (data['verdict']          as QcJob['verdict']) ?? null,
    verdictNote:      (data['verdictNote']      as string) ?? '',
    conditions:       (data['conditions']       as string) ?? '',
    rejectionReason:  (data['rejectionReason']  as string) ?? '',
    reworkPointIds:   (data['reworkPointIds']   as string[]) ?? [],
    approverComments: (data['approverComments'] as Record<string, string>) ?? {},

    submittedAt: toDate(data['submittedAt']),
    reviewedAt:  toDate(data['reviewedAt']),
    completedAt: toDate(data['completedAt']),

    reportUrl:  (data['reportUrl'] as string | null) ?? null,
    reportedAt: toDate(data['reportedAt']),

    createdBy:    (data['createdBy'] as string) ?? '',
    createdAt:    toDate(data['createdAt']) ?? new Date(0),
    updatedAt:    toDate(data['updatedAt']) ?? new Date(0),
    archived:     (data['archived'] as boolean) ?? false,
    archivedAt:   toDate(data['archivedAt']),
    cancelReason: (data['cancelReason'] as string | null) ?? null,
  };
}

export function useQcJob(jobId: string | null | undefined) {
  const [job,     setJob]     = useState<QcJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) { setJob(null); setLoading(false); return; }
    setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      doc(db, 'qcJobs', jobId),
      (snap) => {
        setJob(snap.exists() ? docToQcJob(snap.id, snap.data()) : null);
        setLoading(false);
      },
      (err) => {
        console.error('[useQcJob] snapshot error:', err);
        setError('Failed to load job.');
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [jobId]);

  return { job, loading, error };
}
