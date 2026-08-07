import {
  collection, doc, updateDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import type { QcJob, QcFieldDefinition } from '@/types/qc';

export interface CreateQcJobInput {
  customer: QcJob['customer'];   // caller resolves nameLower/nameWords first
  system:   QcJob['system'];
  inspector?: { uid: string; name: string; code: string; mobile: string } | null;
  scheduledDate?: Date | null;
}

function emptyTally(): QcJob['tally'] {
  return {
    total: 0, answered: 0, pass: 0, fail: 0, na: 0,
    criticalFail: 0, majorFail: 0, minorFail: 0, suggestedVerdict: 'pass',
  };
}

// Shared by single-job creation and the bulk-import path (useCustomerImport.ts)
// so the job shape is defined exactly once. Snapshots the CURRENT
// qcTemplate/qcTemplateVersion onto the job — version-locked per Phase 2's
// own rule, a job's template must never change after creation.
export function buildJobPayload(
  input:           CreateQcJobInput,
  qcNum:           string,
  currentUserUid:  string,
  template:        QcFieldDefinition[],
  templateVersion: number,
) {
  return {
    qcNum,
    status:      input.inspector ? 'assigned' as const : 'unassigned' as const,
    reworkRound: 0,

    customer: input.customer,
    system:   input.system,

    inspectorUid:    input.inspector?.uid    ?? null,
    inspectorName:   input.inspector?.name   ?? '',
    inspectorCode:   input.inspector?.code   ?? '',
    inspectorMobile: input.inspector?.mobile ?? '',
    approverUid:     null,
    approverName:    '',

    scheduledDate: input.scheduledDate ?? null,
    dueDate:       null,

    template,
    templateVersion,
    answers: {},

    tally: emptyTally(),

    location:   null,
    locationAt: null,

    inspectorSignOff: null,
    customerSignOff:  null,
    approverSignOff:  null,

    verdict:          null,
    verdictNote:      '',
    conditions:       '',
    rejectionReason:  '',
    reworkPointIds:   [],
    approverComments: {},

    submittedAt: null,
    reviewedAt:  null,
    completedAt: null,

    reportUrl:  null,
    reportedAt: null,

    createdBy: currentUserUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    archived:  false,
    archivedAt: null,
    cancelReason: null,
  };
}

export function useQcJobActions() {
  const { currentUser } = useAuthStore();

  async function createQcJob(input: CreateQcJobInput): Promise<string> {
    if (!currentUser) throw new Error('Not authenticated');
    const configRef = doc(db, 'appConfig', 'global');
    const jobRef    = doc(collection(db, 'qcJobs'));

    let qcNum = '';
    await runTransaction(db, async (tx) => {
      const configSnap = await tx.get(configRef);
      const data        = configSnap.data();
      const next         = ((data?.['qcNumCounter']       as number | undefined) ?? 0) + 1;
      const template      = (data?.['qcTemplate']          as QcFieldDefinition[] | undefined) ?? [];
      const templateVersion = (data?.['qcTemplateVersion'] as number | undefined) ?? 1;
      qcNum = `QC-${String(next).padStart(6, '0')}`;
      tx.update(configRef, { qcNumCounter: next });
      tx.set(jobRef, buildJobPayload(input, qcNum, currentUser.uid, template, templateVersion));
    });

    return jobRef.id;
  }

  async function assignQcJob(
    jobId: string,
    inspector: { uid: string; name: string; code: string; mobile: string },
  ): Promise<void> {
    await updateDoc(doc(db, 'qcJobs', jobId), {
      inspectorUid:    inspector.uid,
      inspectorName:   inspector.name,
      inspectorCode:   inspector.code,
      inspectorMobile: inspector.mobile,
      status:          'assigned',
      updatedAt:       serverTimestamp(),
    });
  }

  async function unassignQcJob(jobId: string): Promise<void> {
    await updateDoc(doc(db, 'qcJobs', jobId), {
      inspectorUid: null, inspectorName: '', inspectorCode: '', inspectorMobile: '',
      status: 'unassigned', updatedAt: serverTimestamp(),
    });
  }

  // NOTE: not wired to any UI action in Phase 3. The current firestore.rules
  // (§2.1's fix) only lets admin/qc_manager move status to 'unassigned' or
  // 'assigned' — cancelling a job needs its own narrowly-scoped rule
  // (admin-only, an explicit precondition, an audited event), which is
  // deliberately not built here so this phase doesn't loosen the rule that
  // was just tightened. Calling this today will fail with permission-denied
  // until that rule exists.
  async function cancelQcJob(jobId: string, reason: string): Promise<void> {
    await updateDoc(doc(db, 'qcJobs', jobId), {
      status: 'cancelled', cancelReason: reason, updatedAt: serverTimestamp(),
    });
  }

  async function archiveQcJob(jobId: string): Promise<void> {
    // Never touches `status` — allowed under managerFields() regardless of
    // the status-transition restriction, which only gates the 'status' key.
    await updateDoc(doc(db, 'qcJobs', jobId), {
      archived: true, archivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }

  return { createQcJob, assignQcJob, unassignQcJob, cancelQcJob, archiveQcJob };
}
