import {
  doc, setDoc, getDoc, updateDoc,
  getDocs, query, collection, where, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

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

export async function initAppConfig() {
  const ref  = doc(db, 'appConfig', 'global');
  const snap = await getDoc(ref);

  if (snap.exists()) {
    console.log('appConfig/global already exists — skipping init');
    return;
  }

  await setDoc(ref, {
    orgName:            'Rite Solar',
    taskNumCounter:     0,
    engineerNumCounter: 0,
    taskTemplate:       FULL_TEMPLATE,
  });

  console.log('appConfig/global initialised successfully');
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

export async function ensureSuperAdmin(uid: string): Promise<void> {
  const ref  = doc(db, 'appConfig', 'global');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  // Only set once — never overwrite an existing super admin
  if (!data['superAdminUid']) {
    await updateDoc(ref, { superAdminUid: uid });
    console.log('Super admin set:', uid);
  }
}
