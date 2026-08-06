import {
  doc, setDoc, getDoc, updateDoc,
  getDocs, query, collection, where, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { computeSaleClosedEvidence } from '@/utils/computeSaleClosed';
import type { JourneyStepDefinition, SaleClosedConfig } from '@/types';

const FULL_TEMPLATE = [
  {
    fieldId:    'field_default_1',
    label:      'Installation Type',
    type:       'select',
    isRequired: true,
    options:    ['Residential', 'C&I (Commercial & Industrial)', 'RWA (Housing Society)', 'Multiple'],
    sortOrder:  0,
  },
  {
    fieldId:    'field_default_2',
    label:      'Stage',
    type:       'select',
    isRequired: true,
    options:    ['Site Visit Scheduled', 'Site Survey Done', 'Proposal Sent', 'Order Confirmed'],
    sortOrder:  1,
  },
  {
    fieldId:    'field_default_3',
    label:      'Survey Done Date',
    type:       'date',
    isRequired: false,
    options:    [],
    sortOrder:  2,
  },
  {
    fieldId:    'field_default_4',
    label:      'Portal Registry Date',
    type:       'date',
    isRequired: false,
    options:    [],
    sortOrder:  3,
  },
  {
    fieldId:    'field_default_5',
    label:      'Customer Consent',
    type:       'yesno',
    isRequired: true,
    options:    [],
    sortOrder:  4,
  },
  {
    fieldId:    'field_default_6',
    label:      'System Size (kW)',
    type:       'number',
    isRequired: false,
    options:    [],
    sortOrder:  5,
  },
  {
    fieldId:    'field_default_7',
    label:      'Financing Type',
    type:       'select',
    isRequired: false,
    options:    ['Cash', 'Loan', 'Subsidy', 'Mixed', 'Not Decided'],
    sortOrder:  6,
  },
  {
    fieldId:    'field_default_8',
    label:      'Subsidy Status',
    type:       'select',
    isRequired: false,
    options:    ['Not Applicable', 'Applied', 'Approved', 'Pending', 'Rejected'],
    sortOrder:  7,
  },
  {
    fieldId:    'field_default_9',
    label:      'Estimated Cost (₹)',
    type:       'number',
    isRequired: false,
    options:    [],
    sortOrder:  8,
  },
  {
    fieldId:    'field_default_10',
    label:      'Subsidy Amount (₹)',
    type:       'number',
    isRequired: false,
    options:    [],
    sortOrder:  9,
  },
  {
    fieldId:    'field_default_11',
    label:      'Net Cost (₹)',
    type:       'number',
    isRequired: false,
    options:    [],
    sortOrder:  10,
  },
  {
    fieldId:    'field_default_12',
    label:      'Field Notes',
    type:       'text',
    isRequired: false,
    options:    [],
    sortOrder:  11,
  },
  {
    fieldId:    'field_default_13',
    label:      'Site Photos',
    type:       'photo_only',
    isRequired: false,
    options:    [],
    sortOrder:  12,
  },
];

const DEFAULT_CASH_STEPS: JourneyStepDefinition[] = [
  { stepId: 'cash_1',  label: 'Sales Order Creation done?',                                      type: 'yesno', sortOrder: 0  },
  { stepId: 'cash_2',  label: 'Create PI of 10%?',                                               type: 'yesno', sortOrder: 1  },
  { stepId: 'cash_3',  label: 'Consumer Registration',                                           type: 'yesno', sortOrder: 2  },
  { stepId: 'cash_4',  label: 'Application Submission',                                          type: 'yesno', sortOrder: 3  },
  { stepId: 'cash_5',  label: 'Feasibility Approval (Through MSEDCL)',                           type: 'yesno', sortOrder: 4  },
  { stepId: 'cash_6',  label: 'Vendor Selection',                                                type: 'yesno', sortOrder: 5  },
  { stepId: 'cash_7',  label: 'Upload vendor consent agreement',                                 type: 'yesno', sortOrder: 6  },
  { stepId: 'cash_8',  label: 'Create Delivery Challan for Installation',                        type: 'yesno', sortOrder: 7  },
  { stepId: 'cash_9',  label: 'Remaining Payment Done?',                                         type: 'yesno', sortOrder: 8  },
  { stepId: 'cash_10', label: 'Shipment',                                                        type: 'yesno', sortOrder: 9  },
  { stepId: 'cash_11', label: 'Images of Installed Solar Panels',                                type: 'photo', sortOrder: 10 },
  { stepId: 'cash_12', label: 'Upload installation details on RTS portal of MSEDCL',             type: 'yesno', sortOrder: 11 },
  { stepId: 'cash_13', label: 'Apply for net meter',                                             type: 'yesno', sortOrder: 12 },
  { stepId: 'cash_14', label: 'Check for commissioning certificate',                             type: 'yesno', sortOrder: 13 },
  { stepId: 'cash_15', label: 'Raise subsidy redeem request',                                    type: 'yesno', sortOrder: 14 },
  { stepId: 'cash_16', label: 'Approve subsidy redeem request and final disbursement',           type: 'yesno', sortOrder: 15 },
];

const DEFAULT_LOAN_STEPS: JourneyStepDefinition[] = [
  { stepId: 'loan_1',  label: 'Sales Order Creation done?',                                      type: 'yesno', sortOrder: 0  },
  { stepId: 'loan_2',  label: 'Create PI of 10%?',                                               type: 'yesno', sortOrder: 1  },
  { stepId: 'loan_3',  label: 'Consumer Registration',                                           type: 'yesno', sortOrder: 2  },
  { stepId: 'loan_4',  label: 'Application Submission',                                          type: 'yesno', sortOrder: 3  },
  { stepId: 'loan_5',  label: 'Feasibility Approval (Through MSEDCL)',                           type: 'yesno', sortOrder: 4  },
  { stepId: 'loan_6',  label: 'Vendor Selection',                                                type: 'yesno', sortOrder: 5  },
  { stepId: 'loan_7',  label: 'Upload vendor consent agreement',                                 type: 'yesno', sortOrder: 6  },
  { stepId: 'loan_8',  label: 'Apply for loan on PM Jan Samarth portal',                         type: 'yesno', sortOrder: 7  },
  { stepId: 'loan_9',  label: 'Digital approval / loan sanctioned',                              type: 'yesno', sortOrder: 8  },
  { stepId: 'loan_10', label: 'Create Delivery Challan for Installation',                        type: 'yesno', sortOrder: 9  },
  { stepId: 'loan_11', label: 'Remaining Payment Done?',                                         type: 'yesno', sortOrder: 10 },
  { stepId: 'loan_12', label: 'Shipment',                                                        type: 'yesno', sortOrder: 11 },
  { stepId: 'loan_13', label: 'Images of Installed Solar Panels',                                type: 'photo', sortOrder: 12 },
  { stepId: 'loan_14', label: 'Upload installation details on RTS portal of MSEDCL',             type: 'yesno', sortOrder: 13 },
  { stepId: 'loan_15', label: 'Apply for net meter',                                             type: 'yesno', sortOrder: 14 },
  { stepId: 'loan_16', label: 'Check for commissioning certificate',                             type: 'yesno', sortOrder: 15 },
  { stepId: 'loan_17', label: 'Raise subsidy redeem request',                                    type: 'yesno', sortOrder: 16 },
  { stepId: 'loan_18', label: 'Approve subsidy redeem request and final disbursement',           type: 'yesno', sortOrder: 17 },
];

export async function initAppConfig() {
  const ref  = doc(db, 'appConfig', 'global');
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return;
  }

  await setDoc(ref, {
    orgName:                 'Rite Solar',
    taskNumCounter:          0,
    engineerNumCounter:      0,
    proposalNumCounter:      0,
    backendNumCounter:       0,
    taskTemplate:            FULL_TEMPLATE,
    documentTemplate:        [],
    backendChecklistTemplate: [],
    backendCashSteps:         DEFAULT_CASH_STEPS,
    backendLoanSteps:         DEFAULT_LOAN_STEPS,
    pipelineCounts: {
      survey:              0,
      proposal:            0,
      field_review:        0,
      documents:           0,
      backend:             0,
      completed:           0,
      dropped:             0,
      unassigned_proposal: 0,
      unassigned_backend:  0,
      total_active:        0,
    },
    memberCounts: {},
    engineerCounts:   {},
    districtCounts:   {},
    districts:        [],
    leadSources:      [],
    districtsByState: {},
  });

}


export async function migratePipelineStages(): Promise<void> {
  try {
    const snap = await getDocs(query(
      collection(db, 'tasks'),
      where('archived', '==', false),
    ));

    const toMigrate = snap.docs.filter((d) => !d.data()['pipelineStage']);
    if (toMigrate.length === 0) {
      return;
    }

    const CHUNK = 499;
    for (let i = 0; i < toMigrate.length; i += CHUNK) {
      const batch = writeBatch(db);
      toMigrate.slice(i, i + CHUNK).forEach((d) => {
        batch.update(d.ref, { pipelineStage: 'survey' });
      });
      await batch.commit();
    }

  } catch (err) {
    console.error('[migratePipelineStages] failed:', err);
  }
}

export async function syncUserTaskCodes(): Promise<void> {
  try {
    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('role', '==', 'field')),
    );

    for (const userDoc of usersSnap.docs) {
      const userData     = userDoc.data();
      const uid          = userDoc.id;
      const engineerCode = userData['engineerCode'] as string;
      const name         = userData['name']         as string;

      if (!engineerCode) continue;

      const tasksSnap = await getDocs(query(
        collection(db, 'tasks'),
        where('assignedTo', '==', uid),
      ));

      if (tasksSnap.empty) continue;

      const staleTasks = tasksSnap.docs.filter((d) => {
        const data = d.data();
        return data['assignedToCode'] !== engineerCode ||
               data['assignedToName'] !== name;
      });

      if (staleTasks.length === 0) continue;

      const batch = writeBatch(db);
      staleTasks.forEach((d) => {
        batch.update(d.ref, {
          assignedToCode: engineerCode,
          assignedToName: name,
          updatedAt:      serverTimestamp(),
        });
      });
      await batch.commit();
      console.warn(
        `[syncUserTaskCodes] Fixed ${staleTasks.length} stale tasks for ${name} (${engineerCode})`,
      );
    }
  } catch (err) {
    console.error('[syncUserTaskCodes] failed:', err);
  }
}

export async function backfillPipelineAssignments(): Promise<void> {
  try {
    const usersSnap = await getDocs(query(
      collection(db, 'users'),
      where('active', '==', true),
    ));

    const roleMap: Record<string, { uid: string; name: string }> = {};
    usersSnap.docs.forEach((d) => {
      const role = d.data()['role'] as string;
      const name = d.data()['name'] as string;
      if (['proposal', 'backend', 'logistics', 'installation'].includes(role)) {
        roleMap[role] = { uid: d.id, name };
      }
    });

    if (Object.keys(roleMap).length === 0) return;

    const stageToField: Record<string, {
      stage: string;
      uidField: string;
      nameField: string;
    }> = {
      proposal:     { stage: 'proposal',     uidField: 'proposalAssignedTo',     nameField: 'proposalAssignedToName'     },
      backend:      { stage: 'backend',       uidField: 'backendAssignedTo',      nameField: 'backendAssignedToName'      },
      logistics:    { stage: 'logistics',     uidField: 'logisticsAssignedTo',    nameField: 'logisticsAssignedToName'    },
      installation: { stage: 'installation',  uidField: 'installationAssignedTo', nameField: 'installationAssignedToName' },
    };

    for (const [role, { uid, name }] of Object.entries(roleMap)) {
      const { stage, uidField, nameField } = stageToField[role];
      const tasksSnap = await getDocs(query(
        collection(db, 'tasks'),
        where('pipelineStage', '==', stage),
        where('archived', '==', false),
      ));

      const unassigned = tasksSnap.docs.filter(
        (d) => !d.data()[uidField],
      );

      if (unassigned.length === 0) continue;

      const CHUNK = 499;
      for (let i = 0; i < unassigned.length; i += CHUNK) {
        const batch = writeBatch(db);
        unassigned.slice(i, i + CHUNK).forEach((d) => {
          batch.update(d.ref, {
            [uidField]:  uid,
            [nameField]: name,
            updatedAt:   serverTimestamp(),
          });
        });
        await batch.commit();
      }
      console.warn(
        `[backfillPipelineAssignments] Assigned ${unassigned.length} ${stage} tasks to ${name}`,
      );
    }
  } catch (err) {
    console.error('[backfillPipelineAssignments] failed:', err);
  }
}

export async function initBackendJourneySteps(): Promise<void> {
  try {
    const ref  = doc(db, 'appConfig', 'global');
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();

    const updates: Record<string, unknown> = {};
    if (!data['backendCashSteps'] || (data['backendCashSteps'] as unknown[]).length === 0) {
      updates['backendCashSteps'] = DEFAULT_CASH_STEPS;
    }
    if (!data['backendLoanSteps'] || (data['backendLoanSteps'] as unknown[]).length === 0) {
      updates['backendLoanSteps'] = DEFAULT_LOAN_STEPS;
    }
    if (Object.keys(updates).length === 0) return;

    await updateDoc(ref, updates);
    console.warn('[initBackendJourneySteps] Seeded default journey steps');
  } catch (err) {
    console.error('[initBackendJourneySteps] failed:', err);
  }
}

export async function backfillJourneyCompleted(): Promise<void> {
  try {
    const snap = await getDocs(query(
      collection(db, 'tasks'),
      where('pipelineStage', '==', 'backend'),
      where('archived', '==', false),
    ));

    const toFix = snap.docs.filter((d) => {
      const data             = d.data();
      const steps            = (data['applicationJourneySteps'] ?? []) as Array<{ status: string }>;
      const journeyCompleted = data['journeyCompleted'] as boolean;
      return (
        steps.length > 0 &&
        steps.every((s) => s.status === 'done') &&
        !journeyCompleted
      );
    });

    if (toFix.length === 0) return;

    const CHUNK = 499;
    for (let i = 0; i < toFix.length; i += CHUNK) {
      const batch = writeBatch(db);
      toFix.slice(i, i + CHUNK).forEach((d) => {
        batch.update(d.ref, {
          journeyCompleted: true,
          updatedAt:        serverTimestamp(),
        });
      });
      await batch.commit();
    }
    console.warn(
      `[backfillJourneyCompleted] Fixed ${toFix.length} tasks`,
    );
  } catch (err) {
    console.error('[backfillJourneyCompleted] failed:', err);
  }
}

export async function migrateLogisticsToBackend(): Promise<void> {
  try {
    const snap = await getDocs(query(
      collection(db, 'tasks'),
      where('pipelineStage', 'in', ['logistics', 'installation']),
      where('archived', '==', false),
    ));

    if (snap.empty) return;

    const CHUNK = 499;
    const docs  = snap.docs;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const batch = writeBatch(db);
      docs.slice(i, i + CHUNK).forEach((d) => {
        batch.update(d.ref, {
          pipelineStage: 'backend',
          updatedAt:     serverTimestamp(),
        });
      });
      await batch.commit();
    }
    console.warn(
      `[migrateLogisticsToBackend] Migrated ${docs.length} tasks`
    );
  } catch (err) {
    console.error('[migrateLogisticsToBackend] failed:', err);
  }
}

export async function backfillPipelineCounts(): Promise<void> {
  try {
    const snap = await getDocs(query(
      collection(db, 'tasks'),
      where('archived', '==', false),
    ));

    const counts = {
      survey:              0,
      proposal:            0,
      field_review:        0,
      documents:           0,
      backend:             0,
      completed:           0,
      dropped:             0,
      unassigned_proposal: 0,
      unassigned_backend:  0,
      total_active:        0,
    };

    snap.docs.forEach((d) => {
      const data  = d.data();
      const stage = (data['pipelineStage'] as string) ?? 'survey';
      if (stage in counts) {
        counts[stage as keyof typeof counts]++;
      }
      counts.total_active++;
      if (stage === 'proposal' && !data['proposalAssignedTo']) {
        counts.unassigned_proposal++;
      }
      if (stage === 'backend' && !data['backendAssignedTo']) {
        counts.unassigned_backend++;
      }
      if (stage === 'completed' || stage === 'dropped') {
        counts.total_active--;
      }
    });

    await updateDoc(
      doc(db, 'appConfig', 'global'),
      { pipelineCounts: counts },
    );
    console.warn('[backfillPipelineCounts] Done:', counts);
  } catch (err) {
    console.error('[backfillPipelineCounts] failed:', err);
  }
}

export async function backfillEngineerDistrictCounts(): Promise<void> {
  try {
    const snap = await getDocs(query(
      collection(db, 'tasks'),
      where('archived', '==', false),
    ));

    const engineerCounts: Record<string, { assigned: number; completed: number; name: string }> = {};
    const districtCounts: Record<string, { total: number; completed: number }> = {};

    snap.docs.forEach((d) => {
      const data     = d.data();
      const stage    = (data['pipelineStage']  as string)       ?? 'survey';
      const uid      = data['assignedTo']       as string | null;
      const name     = (data['assignedToName'] as string)        || '';
      const district = (data['district']       as string | null) ?? null;

      if (uid) {
        if (!engineerCounts[uid]) engineerCounts[uid] = { assigned: 0, completed: 0, name };
        engineerCounts[uid].assigned++;
        if (stage === 'completed') engineerCounts[uid].completed++;
      }
      if (district) {
        if (!districtCounts[district]) districtCounts[district] = { total: 0, completed: 0 };
        districtCounts[district].total++;
        if (stage === 'completed') districtCounts[district].completed++;
      }
    });

    await updateDoc(
      doc(db, 'appConfig', 'global'),
      { engineerCounts, districtCounts },
    );
    console.warn('[backfillEngineerDistrictCounts] Done');
  } catch (err) {
    console.error('[backfillEngineerDistrictCounts] failed:', err);
  }
}

export async function backfillTitleLower(): Promise<void> {
  try {
    const snap = await getDocs(query(
      collection(db, 'tasks'),
    ));

    const CHUNK = 499;
    const toFix = snap.docs.filter(
      (d) => !d.data()['titleLower']
    );

    if (toFix.length === 0) {
      console.warn('[backfillTitleLower] Nothing to fix');
      return;
    }

    for (let i = 0; i < toFix.length; i += CHUNK) {
      const batch = writeBatch(db);
      toFix.slice(i, i + CHUNK).forEach((d) => {
        const title = (d.data()['title'] as string) ?? '';
        batch.update(d.ref, {
          titleLower: title.toLowerCase(),
          updatedAt:  serverTimestamp(),
        });
      });
      await batch.commit();
    }
    console.warn(`[backfillTitleLower] Fixed ${toFix.length} tasks`);
  } catch (err) {
    console.error('[backfillTitleLower] failed:', err);
  }
}

export async function backfillMemberCounts(): Promise<void> {
  try {
    const [proposalSnap, backendSnap] = await Promise.all([
      getDocs(query(
        collection(db, 'users'),
        where('role',   '==', 'proposal'),
        where('active', '==', true),
      )),
      getDocs(query(
        collection(db, 'users'),
        where('role',   '==', 'backend'),
        where('active', '==', true),
      )),
    ]);

    const memberCounts: Record<string, number> = {};

    [...proposalSnap.docs, ...backendSnap.docs].forEach((d) => {
      memberCounts[d.id] = 0;
    });

    const proposalTasksSnap = await getDocs(query(
      collection(db, 'tasks'),
      where('pipelineStage', '==', 'proposal'),
      where('archived',      '==', false),
    ));
    proposalTasksSnap.docs.forEach((d) => {
      const uid = d.data()['proposalAssignedTo'] as string | null;
      if (uid && uid in memberCounts) {
        memberCounts[uid] = (memberCounts[uid] ?? 0) + 1;
      }
    });

    const backendTasksSnap = await getDocs(query(
      collection(db, 'tasks'),
      where('pipelineStage', '==', 'backend'),
      where('archived',      '==', false),
    ));
    backendTasksSnap.docs.forEach((d) => {
      const uid = d.data()['backendAssignedTo'] as string | null;
      if (uid && uid in memberCounts) {
        memberCounts[uid] = (memberCounts[uid] ?? 0) + 1;
      }
    });

    await updateDoc(
      doc(db, 'appConfig', 'global'),
      { memberCounts },
    );
    console.warn('[backfillMemberCounts] Done:', memberCounts);
  } catch (err) {
    console.error('[backfillMemberCounts] failed:', err);
  }
}

export async function initMemberInCounts(
  uid:  string,
  role: string,
): Promise<void> {
  if (role !== 'proposal' && role !== 'backend') return;
  try {
    const configSnap = await getDoc(doc(db, 'appConfig', 'global'));
    if (!configSnap.exists()) return;
    const existing = (configSnap.data()['memberCounts'] ?? {}) as Record<string, number>;
    if (!(uid in existing)) {
      await updateDoc(doc(db, 'appConfig', 'global'), {
        [`memberCounts.${uid}`]: 0,
      });
      console.warn(`[initMemberInCounts] Added ${uid} (${role}) with count 0`);
    }
  } catch (err) {
    console.error('[initMemberInCounts] failed:', err);
  }
}

export async function reconcilePipelineCounts(): Promise<void> {
  try {
    const configSnap = await getDoc(doc(db, 'appConfig', 'global'));
    if (!configSnap.exists()) return;

    const current = configSnap.data()['pipelineCounts'] as Record<string, number> | undefined;
    if (!current) {
      await backfillPipelineCounts();
      return;
    }

    const hasNegative = Object.values(current).some((v) => v < 0);
    if (hasNegative) {
      console.warn('[reconcile] Negative counts found — running backfill');
      await backfillPipelineCounts();
      return;
    }

    const EXPECTED_PIPELINE_COUNT_KEYS = [
      'survey',
      'proposal',
      'field_review',
      'documents',
      'backend',
      'completed',
      'dropped',
      'unassigned_proposal',
      'unassigned_backend',
      'total_active',
    ];
    const hasMissingKey = EXPECTED_PIPELINE_COUNT_KEYS.some((key) => !(key in current));
    if (hasMissingKey) {
      console.warn('[reconcile] Missing pipelineCounts key(s) found — running backfill');
      await backfillPipelineCounts();
    }
  } catch (err) {
    console.error('[reconcilePipelineCounts] failed:', err);
  }
}

export async function backfillCreatedBy(adminUid: string): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, 'tasks')));

    const toFix = snap.docs.filter((d) => !d.data()['createdBy']);

    if (toFix.length === 0) {
      console.warn('[backfillCreatedBy] Nothing to fix');
      return;
    }

    const CHUNK = 499;
    for (let i = 0; i < toFix.length; i += CHUNK) {
      const batch = writeBatch(db);
      toFix.slice(i, i + CHUNK).forEach((d) => {
        batch.update(d.ref, {
          createdBy: adminUid,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
    console.warn(`[backfillCreatedBy] Fixed ${toFix.length} tasks`);
  } catch (err) {
    console.error('[backfillCreatedBy] failed:', err);
  }
}

export async function reconcileSaleClosed(): Promise<{
  totalScanned:  number;
  updated:       number;
  skippedManual: number;
}> {
  const configSnap = await getDoc(doc(db, 'appConfig', 'global'));
  const saleClosedConfig = configSnap.data()?.['saleClosedConfig'] as SaleClosedConfig | undefined;

  const snap = await getDocs(query(
    collection(db, 'tasks'),
    where('archived', '==', false),
  ));

  let skippedManual = 0;
  const toUpdate: { id: string; saleClosed: boolean }[] = [];

  snap.docs.forEach((d) => {
    const data   = d.data();
    const source = data['saleClosedSource'] as 'auto' | 'manual' | null | undefined;

    // Never touch a lead an admin manually marked/unmarked.
    if (source === 'manual') {
      skippedManual++;
      return;
    }

    const computed = computeSaleClosedEvidence(
      {
        fieldAnswers:    data['fieldAnswers'],
        fieldPhotos:     data['fieldPhotos'],
        documentAnswers: data['documentAnswers'],
        documentPhotos:  data['documentPhotos'],
      },
      saleClosedConfig,
    );
    const current = (data['saleClosed'] as boolean | undefined) ?? false;

    // Only stage a write if the computed value actually differs.
    if (computed !== current) {
      toUpdate.push({ id: d.id, saleClosed: computed });
    }
  });

  const CHUNK = 499;
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const batch = writeBatch(db);
    toUpdate.slice(i, i + CHUNK).forEach(({ id, saleClosed }) => {
      batch.update(doc(db, 'tasks', id), {
        saleClosed,
        saleClosedSource: 'auto',
        updatedAt:        serverTimestamp(),
      });
    });
    await batch.commit();
  }

  const summary = {
    totalScanned: snap.docs.length,
    updated:      toUpdate.length,
    skippedManual,
  };
  console.warn('[reconcileSaleClosed] Done:', summary);
  return summary;
}

export async function ensureSuperAdmin(uid: string): Promise<void> {
  const ref  = doc(db, 'appConfig', 'global');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  // Only set once — never overwrite an existing super admin
  if (!data['superAdminUid']) {
    await updateDoc(ref, { superAdminUid: uid });
  }
}
