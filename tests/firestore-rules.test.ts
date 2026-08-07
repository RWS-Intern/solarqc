import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

let testEnv: RulesTestEnvironment;

const ADMIN_UID           = 'admin-1';
const QC_MANAGER_UID      = 'manager-1';
const INSPECTOR_UID       = 'inspector-1';
const APPROVER_UID        = 'approver-1';
const VIEWER_UID          = 'viewer-1';
const OTHER_INSPECTOR_UID = 'inspector-2';
const DISABLED_INSPECTOR_UID = 'inspector-disabled';

const emptyTally = {
  total: 0, answered: 0, pass: 0, fail: 0, na: 0,
  criticalFail: 0, majorFail: 0, minorFail: 0, suggestedVerdict: 'pass',
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'solarqc-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(() => testEnv.cleanup());

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed fixture users + in-flight jobs, bypassing rules entirely — this
  // is fixture setup, not the thing under test.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ADMIN_UID),      { role: 'admin',        active: true, name: 'Admin' });
    await setDoc(doc(db, 'users', QC_MANAGER_UID), { role: 'qc_manager',   active: true, name: 'Manager' });
    await setDoc(doc(db, 'users', INSPECTOR_UID),  { role: 'qc_inspector', active: true, name: 'Inspector' });
    await setDoc(doc(db, 'users', APPROVER_UID),   { role: 'approver',     active: true, name: 'Approver' });
    await setDoc(doc(db, 'users', VIEWER_UID),     { role: 'viewer',       active: true, name: 'Viewer' });
    await setDoc(doc(db, 'users', OTHER_INSPECTOR_UID),    { role: 'qc_inspector', active: true,  name: 'Other' });
    await setDoc(doc(db, 'users', DISABLED_INSPECTOR_UID), { role: 'qc_inspector', active: false, name: 'Disabled' });

    await setDoc(doc(db, 'qcJobs', 'job-1'), {
      qcNum: 'QC-000001', status: 'in_progress', reworkRound: 0,
      inspectorUid: INSPECTOR_UID, approverUid: APPROVER_UID,
      answers: {}, tally: emptyTally,
      verdict: null, verdictNote: '', rejectionReason: '',
      createdBy: ADMIN_UID, updatedAt: new Date(),
    });

    await setDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      qcNum: 'QC-000002', status: 'pending_approval', reworkRound: 0,
      inspectorUid: INSPECTOR_UID, approverUid: APPROVER_UID,
      answers: {}, tally: emptyTally,
      verdict: null, verdictNote: '', rejectionReason: '',
      createdBy: ADMIN_UID, updatedAt: new Date(),
    });

    await setDoc(doc(db, 'qcJobs', 'job-3-assigned'), {
      qcNum: 'QC-000003', status: 'assigned', reworkRound: 0,
      inspectorUid: INSPECTOR_UID, approverUid: APPROVER_UID,
      answers: {}, tally: emptyTally,
      verdict: null, verdictNote: '', rejectionReason: '',
      createdBy: ADMIN_UID, updatedAt: new Date(),
    });
  });
});

describe('property 1 — inspector cannot write approver fields', () => {
  it('rejects an inspector setting a verdict on their own job', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1'), { verdict: 'pass' }));
  });

  it('rejects an inspector forcing status straight to approved', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1'), { status: 'approved' }));
  });

  it('allows an inspector to save answers and move to pending_approval', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'qcJobs', 'job-1'), {
      answers: { qc_1_1: { fieldId: 'qc_1_1', status: 'pass', remark: '', photoUrls: [], answeredAt: new Date(), answeredBy: INSPECTOR_UID, round: 0 } },
      updatedAt: new Date(),
    }));
  });

  it('rejects an inspector editing a job that is not theirs', async () => {
    const db = testEnv.authenticatedContext(OTHER_INSPECTOR_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1'), { updatedAt: new Date() }));
  });

  it('allows the assigned inspector to start a job (assigned -> in_progress)', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'qcJobs', 'job-3-assigned'), {
      status: 'in_progress', updatedAt: new Date(),
    }));
  });

  it('rejects an inspector updating a job that is already pending_approval', async () => {
    // status not in ['assigned','in_progress','rework'] — the job has left
    // the inspector's hands until the approver acts on it.
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      answers: { x: { fieldId: 'x', status: 'pass', remark: '', photoUrls: [], answeredAt: new Date(), answeredBy: INSPECTOR_UID, round: 0 } },
    }));
  });

  it('rejects a disabled inspector, even on their own job', async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'qcJobs', 'job-1'), { inspectorUid: DISABLED_INSPECTOR_UID }),
    );
    const db = testEnv.authenticatedContext(DISABLED_INSPECTOR_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1'), { updatedAt: new Date() }));
  });
});

describe('property 2 — approver cannot edit answers', () => {
  it('rejects an approver writing to answers', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      answers: { qc_1_1: { fieldId: 'qc_1_1', status: 'pass', remark: 'tampered', photoUrls: [], answeredAt: new Date(), answeredBy: APPROVER_UID, round: 0 } },
    }));
  });

  it('rejects an approver acting on a job that is not yet pending_approval', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1'), {
      status: 'approved', verdict: 'pass', verdictNote: 'looks fine',
    }));
  });
});

describe('property 3 — verdict and rejection reason are mandatory', () => {
  it('rejects an approval with no verdictNote', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      status: 'approved', verdict: 'pass', verdictNote: '',
    }));
  });

  it('rejects a rework decision with an empty rejectionReason', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      status: 'rework', verdict: 'reject', verdictNote: 'not good enough', rejectionReason: '',
    }));
  });

  it('allows an approval with a verdictNote', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      status: 'approved', verdict: 'pass', verdictNote: 'All points checked, looks good.',
    }));
  });

  it('allows a rework decision with a populated rejectionReason', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      status: 'rework', verdict: 'reject', verdictNote: 'Sent back for rework.',
      rejectionReason: 'Earth resistance out of range on point 3.3.',
    }));
  });

  it('rejects an approver trying to set status to something other than approved/rework', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      status: 'cancelled', verdict: 'pass', verdictNote: 'irrelevant',
    }));
  });
});

describe('property 4 — events are immutable to everyone, including admin', () => {
  it('lets any active user create an event they authored', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'qcJobs', 'job-1', 'events', 'evt-1'), {
        type: 'draft_saved', actorUid: INSPECTOR_UID, actorName: 'Inspector',
        actorRole: 'qc_inspector', at: serverTimestamp(), round: 0,
      }),
    );
  });

  it('rejects creating an event with someone else as the actor', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'qcJobs', 'job-1', 'events', 'evt-spoofed'), {
        type: 'draft_saved', actorUid: APPROVER_UID, actorName: 'Approver',
        actorRole: 'approver', at: serverTimestamp(), round: 0,
      }),
    );
  });

  it('rejects an admin updating an existing event', async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'qcJobs', 'job-1', 'events', 'evt-1'), {
        type: 'draft_saved', actorUid: INSPECTOR_UID, actorRole: 'qc_inspector',
        actorName: 'Inspector', at: new Date(), round: 0,
      }),
    );
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1', 'events', 'evt-1'), { note: 'edited' }));
  });

  it('rejects deleting an event, even as admin', async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'qcJobs', 'job-1', 'events', 'evt-2'), {
        type: 'started', actorUid: INSPECTOR_UID, actorRole: 'qc_inspector',
        actorName: 'Inspector', at: new Date(), round: 0,
      }),
    );
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'qcJobs', 'job-1', 'events', 'evt-2')));
  });
});

describe('rounds — written only by approver/admin, on rejection', () => {
  it('allows an approver to freeze a round', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'qcJobs', 'job-2-pending', 'rounds', '0'), {
      round: 0, frozenAt: serverTimestamp(), answers: {}, tally: emptyTally,
      template: [], templateVersion: 1, inspectorSignOff: null, customerSignOff: null,
    }));
  });

  it('rejects a viewer freezing a round', async () => {
    const db = testEnv.authenticatedContext(VIEWER_UID).firestore();
    await assertFails(setDoc(doc(db, 'qcJobs', 'job-2-pending', 'rounds', '0'), {
      round: 0, frozenAt: serverTimestamp(),
    }));
  });

  it('rejects updating a round once frozen', async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'qcJobs', 'job-2-pending', 'rounds', '0'), { round: 0 }),
    );
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-2-pending', 'rounds', '0'), { round: 1 }));
  });
});

describe('viewer — read-only, no writes anywhere', () => {
  it('can read a job', async () => {
    const db = testEnv.authenticatedContext(VIEWER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'qcJobs', 'job-1')));
  });
  it('cannot update a job', async () => {
    const db = testEnv.authenticatedContext(VIEWER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1'), { updatedAt: new Date() }));
  });
  it('cannot create a job', async () => {
    const db = testEnv.authenticatedContext(VIEWER_UID).firestore();
    await assertFails(setDoc(doc(db, 'qcJobs', 'job-new'), {
      qcNum: 'QC-000099', status: 'unassigned', reworkRound: 0, answers: {}, tally: emptyTally,
    }));
  });
  it('cannot delete a job', async () => {
    const db = testEnv.authenticatedContext(VIEWER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'qcJobs', 'job-1')));
  });
});

describe('qcJobs read isolation', () => {
  it('lets an inspector read their own job', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'qcJobs', 'job-1')));
  });
  it('blocks an inspector from reading a job that is not theirs', async () => {
    const db = testEnv.authenticatedContext(OTHER_INSPECTOR_UID).firestore();
    await assertFails(getDoc(doc(db, 'qcJobs', 'job-1')));
  });
  it('lets admin, qc_manager, and approver read any job', async () => {
    for (const uid of [ADMIN_UID, QC_MANAGER_UID, APPROVER_UID]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(db, 'qcJobs', 'job-1')));
    }
  });
  it('blocks a signed-out client from reading anything', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'qcJobs', 'job-1')));
  });
});

describe('qcJobs create/delete — admin only', () => {
  it('allows admin to create a job', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'qcJobs', 'job-new'), {
      qcNum: 'QC-000099', status: 'unassigned', reworkRound: 0,
      answers: {}, tally: emptyTally, createdBy: ADMIN_UID, updatedAt: new Date(),
    }));
  });
  it('rejects qc_manager creating a job', async () => {
    const db = testEnv.authenticatedContext(QC_MANAGER_UID).firestore();
    await assertFails(setDoc(doc(db, 'qcJobs', 'job-new'), {
      qcNum: 'QC-000099', status: 'unassigned', reworkRound: 0, answers: {}, tally: emptyTally,
    }));
  });
  it('allows admin to delete a job', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'qcJobs', 'job-1')));
  });
  it('rejects approver deleting a job', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'qcJobs', 'job-1')));
  });
});

describe('manager assignment — admin/qc_manager can reassign, never touch content', () => {
  it('allows admin to reassign a job', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'qcJobs', 'job-1'), {
      inspectorUid: OTHER_INSPECTOR_UID, inspectorName: 'Other', updatedAt: new Date(),
    }));
  });
  it('allows qc_manager to reassign a job', async () => {
    const db = testEnv.authenticatedContext(QC_MANAGER_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'qcJobs', 'job-1'), {
      inspectorUid: OTHER_INSPECTOR_UID, inspectorName: 'Other', updatedAt: new Date(),
    }));
  });
  it('rejects admin writing directly to answers', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1'), {
      answers: { qc_1_1: { fieldId: 'qc_1_1', status: 'pass', remark: '', photoUrls: [], answeredAt: new Date(), answeredBy: ADMIN_UID, round: 0 } },
    }));
  });
  it('rejects qc_manager writing a verdict', async () => {
    const db = testEnv.authenticatedContext(QC_MANAGER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-2-pending'), {
      verdict: 'pass', verdictNote: 'trying to sneak an approval',
    }));
  });
  it('rejects approver reassigning a job (not their function)', async () => {
    const db = testEnv.authenticatedContext(APPROVER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'qcJobs', 'job-1'), {
      inspectorUid: OTHER_INSPECTOR_UID, inspectorName: 'Other',
    }));
  });
});

describe('appConfig — read by anyone signed in, write by admin only', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'appConfig', 'global'), { orgName: 'Rite Solar' }),
    );
  });

  it('lets a viewer read appConfig', async () => {
    const db = testEnv.authenticatedContext(VIEWER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'appConfig', 'global')));
  });
  it('blocks an unauthenticated read of appConfig', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'appConfig', 'global')));
  });
  it('lets admin write appConfig', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'appConfig', 'global'), { qcNumCounter: 1 }));
  });
  it('rejects qc_manager writing appConfig — closes the old field/proposal/backend write hole', async () => {
    const db = testEnv.authenticatedContext(QC_MANAGER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'appConfig', 'global'), { qcNumCounter: 1 }));
  });
  it('rejects a disabled admin writing appConfig', async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'users', ADMIN_UID), { active: false }),
    );
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(updateDoc(doc(db, 'appConfig', 'global'), { qcNumCounter: 1 }));
  });
});

describe('users/{uid} — the §11.6 signup fix', () => {
  it('lets a brand-new authenticated user create their own doc', async () => {
    const db = testEnv.authenticatedContext('brand-new-uid').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'brand-new-uid'), {
      name: 'New User', email: 'new@test.com', role: 'qc_inspector', active: true,
    }));
  });
  it('rejects a user creating a doc for someone else', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', 'someone-else'), {
      name: 'X', role: 'admin', active: true,
    }));
  });
  it('rejects a non-admin trying to change their own role', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertFails(updateDoc(doc(db, 'users', INSPECTOR_UID), { role: 'admin' }));
  });
  it('lets a user update their own fcmToken', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', INSPECTOR_UID), { fcmToken: 'tok-123' }));
  });
  it('lets admin change another user\'s role', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', INSPECTOR_UID), { role: 'approver' }));
  });
  it('rejects a viewer reading another user\'s doc', async () => {
    const db = testEnv.authenticatedContext(VIEWER_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', INSPECTOR_UID)));
  });
  it('lets qc_manager read another user\'s doc (team visibility)', async () => {
    const db = testEnv.authenticatedContext(QC_MANAGER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', INSPECTOR_UID)));
  });
  it('lets any signed-in user read their own doc', async () => {
    const db = testEnv.authenticatedContext(INSPECTOR_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', INSPECTOR_UID)));
  });
  it('rejects deleting a user doc, even as admin', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'users', INSPECTOR_UID)));
  });
});

// §3's explicit compatibility check: the 5 bootstrap accounts created by
// hand in Phase 0 (role + active + name, nothing else load-bearing) must
// still be able to complete useAuth.ts's post-login read of their own doc
// under these new rules.
describe('Phase 0 bootstrap-account compatibility', () => {
  const BOOTSTRAP_ROLES: Array<[string, string]> = [
    [ADMIN_UID, 'admin'],
    [QC_MANAGER_UID, 'qc_manager'],
    [INSPECTOR_UID, 'qc_inspector'],
    [APPROVER_UID, 'approver'],
    [VIEWER_UID, 'viewer'],
  ];

  it.each(BOOTSTRAP_ROLES)('lets the bootstrap %s account read its own users/{uid} doc', async (uid) => {
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', uid)));
  });
});
