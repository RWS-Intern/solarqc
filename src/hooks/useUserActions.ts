import {
  doc, setDoc, updateDoc, serverTimestamp, runTransaction, getDoc,
  getDocs, query, collection, where, writeBatch, deleteField,
} from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { initMemberInCounts } from '@/firebase/initAppConfig';
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as secondarySignOut,
} from 'firebase/auth';
import { db, firebaseConfig } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useToast }     from '@/components/ui/toast';
import { resolveAndAutoAddStateDistrict } from '@/utils/districtUtils';
import type { UserRole, User } from '@/types';

const secondaryApp =
  getApps().find((a) => a.name === 'secondary') ??
  initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

// Scans the users collection for the highest existing code with the given
// prefix BEFORE entering a transaction, so the transaction itself only needs
// tx.get() (the only read allowed inside runTransaction in Firebase 10).
async function resolveActualMax(prefix: string): Promise<number> {
  const usersSnap = await getDocs(query(
    collection(db, 'users'),
    where('engineerCode', '>=', `${prefix}-000`),
    where('engineerCode', '<=', `${prefix}-999`),
  ));
  let actualMax = 0;
  usersSnap.forEach((d) => {
    const code = d.data()['engineerCode'] as string | undefined;
    if (code && code.startsWith(`${prefix}-`)) {
      const num = parseInt(code.split('-')[1], 10);
      if (!Number.isNaN(num) && num > actualMax) actualMax = num;
    }
  });
  return actualMax;
}

export function useUserActions() {
  const { currentUser } = useAuthStore();
  const { showToast }   = useToast();

  // Reads superAdminUid fresh from Firestore — never stale from a cached hook
  async function getSuperAdminUid(): Promise<string> {
    const snap = await getDoc(doc(db, 'appConfig', 'global'));
    return (snap.data()?.['superAdminUid'] as string) ?? '';
  }

  async function createUser(
    name: string, email: string, role: UserRole, district?: string, mobileNumber?: string, state?: string,
  ): Promise<void> {
    const tempPassword =
      Math.random().toString(36).slice(-10) +
      Math.random().toString(36).slice(-10) + 'Aa1!';

    try {
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth, email.toLowerCase().trim(), tempPassword,
      );
      const uid = credential.user.uid;
      await secondarySignOut(secondaryAuth);

      const configRef = doc(db, 'appConfig', 'global');
      let engineerCode: string | null = null;

      const roleCodeMap: Record<string, { prefix: string; counterKey: string }> = {
        field:        { prefix: 'ENG',  counterKey: 'engineerNumCounter'  },
        proposal:     { prefix: 'PROP', counterKey: 'proposalNumCounter'  },
        backend:      { prefix: 'BACK', counterKey: 'backendNumCounter'   },
        logistics:    { prefix: 'LOG',  counterKey: 'logisticsNumCounter' },
        installation: { prefix: 'INST', counterKey: 'installationNumCounter' },
      };

      if (roleCodeMap[role]) {
        const { prefix, counterKey } = roleCodeMap[role];
        const actualMax = await resolveActualMax(prefix);
        await runTransaction(db, async (tx) => {
          const configSnap    = await tx.get(configRef);
          const storedCounter = (configSnap.data()?.[counterKey] as number | undefined) ?? 0;
          const next          = Math.max(storedCounter, actualMax) + 1;
          engineerCode        = `${prefix}-${String(next).padStart(3, '0')}`;
          tx.update(configRef, { [counterKey]: next });
        });
      }

      const { resolvedState, resolvedDistrict } =
        (state || district)
          ? await resolveAndAutoAddStateDistrict(db, state ?? '', district ?? '')
          : { resolvedState: '', resolvedDistrict: '' };

      await setDoc(doc(db, 'users', uid), {
        name:              name.trim(),
        email:             email.toLowerCase().trim(),
        role,
        active:            true,
        engineerCode:      roleCodeMap[role] ? engineerCode : null,
        mobileNumber:      mobileNumber?.trim() || null,
        createdAt:         serverTimestamp(),
        createdBy:         currentUser?.uid ?? '',
        state:             resolvedState    || null,
        district:          resolvedDistrict || null,
        fcmToken:          null,
        fcmTokenUpdatedAt: null,
        photoURL:          null,
      });

      // Initialize member in counts if proposal/backend
      if (role === 'proposal' || role === 'backend') {
        initMemberInCounts(uid, role).catch(
          (err) => console.error('[createUser] initMemberInCounts failed:', err)
        );
      }

      await sendPasswordResetEmail(secondaryAuth, email.toLowerCase().trim());
      showToast(`Account created. Password setup email sent to ${email}.`, 'success');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('[createUser] error:', err);
      if (err.code === 'auth/email-already-in-use') {
        showToast('An account with this email already exists.', 'error');
      } else if (err.code === 'auth/invalid-email') {
        showToast('Invalid email address.', 'error');
      } else {
        showToast('Failed to create account. Try again.', 'error');
      }
      throw err;
    }
  }

  async function updateUserName(userId: string, newName: string, role: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) { showToast('Name cannot be empty', 'error'); return; }
    try {
      await updateDoc(doc(db, 'users', userId), {
        name: trimmed, updatedAt: serverTimestamp(),
      });
      // Sync denormalized name in field engineer slot (assignedTo)
      await syncTasksForUser(userId, { assignedToName: trimmed });
      // Sync proposal/backend role slots if applicable
      if (role === 'proposal') {
        await syncRoleAssignedName(userId, 'proposalAssignedTo', 'proposalAssignedToName', trimmed);
      } else if (role === 'backend') {
        await syncRoleAssignedName(userId, 'backendAssignedTo', 'backendAssignedToName', trimmed);
      }
      // Sync engineerCounts.{userId}.name if entry exists — guard with getDoc to avoid
      // creating a partial entry (name-only, no assigned/completed) for users who have
      // never had a task assigned to them.
      try {
        const configSnap = await getDoc(doc(db, 'appConfig', 'global'));
        const ec = configSnap.data()?.['engineerCounts'] as Record<string, unknown> | undefined;
        if (ec && userId in ec) {
          await updateDoc(doc(db, 'appConfig', 'global'), {
            [`engineerCounts.${userId}.name`]: trimmed,
          });
        }
      } catch (err) {
        console.error('[updateUserName] engineerCounts name sync failed:', err);
      }
      showToast('Name updated', 'success');
    } catch (err) {
      console.error('[updateUserName] failed:', err);
      showToast('Failed to update name. Try again.', 'error');
      throw err;
    }
  }

  async function setUserActive(
    userId: string, active: boolean, currentUserId: string,
  ): Promise<void> {
    if (userId === currentUserId) {
      showToast('You cannot disable your own account', 'error');
      return;
    }
    // Super admin protection — read fresh from Firestore
    const superAdminUid = await getSuperAdminUid();
    if (superAdminUid && userId === superAdminUid) {
      showToast('This account is protected and cannot be disabled.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', userId), {
        active,
        updatedAt: serverTimestamp(),
        deletedAt: active ? null : serverTimestamp(),
      });
      showToast(active ? 'Account enabled' : 'Account disabled', 'success');
    } catch (err) {
      console.error('[setUserActive] failed:', err);
      showToast('Failed to update account. Try again.', 'error');
      throw err;
    }

    // Recount member tasks when re-enabling a proposal/backend user
    try {
      const userSnap = await getDoc(doc(db, 'users', userId));
      const role = userSnap.data()?.['role'] as string;

      if (active && (role === 'proposal' || role === 'backend')) {
        const field = role === 'proposal' ? 'proposalAssignedTo' : 'backendAssignedTo';
        const stage = role === 'proposal' ? 'proposal' : 'backend';

        const taskSnap = await getDocs(query(
          collection(db, 'tasks'),
          where(field,            '==', userId),
          where('pipelineStage',  '==', stage),
          where('archived',       '==', false),
        ));

        await updateDoc(doc(db, 'appConfig', 'global'), {
          [`memberCounts.${userId}`]: taskSnap.size,
        });
      }
    } catch (err) {
      console.error('[setUserActive] memberCounts recount failed:', err);
    }
  }

  async function changeRole(
    targetUserId:      string,
    targetCurrentRole: UserRole,
    newRole:           UserRole,
    allUsers:          User[],
  ): Promise<void> {
    // Guard 1: Cannot change own role
    if (targetUserId === currentUser?.uid) {
      showToast('You cannot change your own role.', 'error');
      return;
    }

    // Guard 2: Super admin is untouchable — read FRESH from Firestore
    const superAdminUid = await getSuperAdminUid();
    if (superAdminUid && targetUserId === superAdminUid) {
      showToast('This account is protected and cannot be changed.', 'error');
      return;
    }

    // Guard 3: Cannot demote the last admin
    if (targetCurrentRole === 'admin' && newRole !== 'admin') {
      const activeAdmins = allUsers.filter(
        (u) => u.role === 'admin' && u.active && !u.deletedAt,
      );
      if (activeAdmins.length <= 1) {
        showToast('Cannot demote the last admin. Promote another user first.', 'error');
        return;
      }
    }

    const roleCodeMap: Record<string, { prefix: string; counterKey: string; label: string }> = {
      field:        { prefix: 'ENG',  counterKey: 'engineerNumCounter',     label: 'Field Engineer'        },
      proposal:     { prefix: 'PROP', counterKey: 'proposalNumCounter',     label: 'Proposal Engineer'     },
      backend:      { prefix: 'BACK', counterKey: 'backendNumCounter',      label: 'Backend Engineer'      },
      logistics:    { prefix: 'LOG',  counterKey: 'logisticsNumCounter',    label: 'Logistics'             },
      installation: { prefix: 'INST', counterKey: 'installationNumCounter', label: 'Installation Engineer' },
    };

    try {
      const configRef = doc(db, 'appConfig', 'global');
      const userRef   = doc(db, 'users', targetUserId);

      if (newRole === 'admin') {
        // Any role → Admin: keep engineerCode for history
        await updateDoc(userRef, {
          role:      'admin',
          updatedAt: serverTimestamp(),
        });
        showToast(
          'Role changed to Admin. User must log out and back in for full effect.',
          'success',
        );
      } else if (roleCodeMap[newRole]) {
        // Admin or any role → code-bearing role: assign role-specific code atomically
        const { prefix, counterKey, label } = roleCodeMap[newRole];
        const actualMax = await resolveActualMax(prefix);
        let engineerCode = '';
        await runTransaction(db, async (tx) => {
          const configSnap    = await tx.get(configRef);
          const storedCounter = (configSnap.data()?.[counterKey] as number) ?? 0;
          const next          = Math.max(storedCounter, actualMax) + 1;
          engineerCode        = `${prefix}-${String(next).padStart(3, '0')}`;
          tx.update(configRef, { [counterKey]: next });
          tx.update(userRef, {
            role:         newRole,
            engineerCode: engineerCode,
            updatedAt:    serverTimestamp(),
          });
        });
        await syncTasksForUser(targetUserId, { assignedToCode: engineerCode });
        showToast(
          `Role changed to ${label}. Assigned ${engineerCode}. User must log out and back in.`,
          'success',
        );
      } else {
        // Roles with no code (view_only, backend_manager): update role only
        await updateDoc(userRef, {
          role:      newRole,
          updatedAt: serverTimestamp(),
        });
        showToast('Role changed. User must log out and back in for full effect.', 'success');
      }
    } catch (err) {
      console.error('[changeRole] failed:', err);
      showToast('Failed to change role. Try again.', 'error');
      throw err;
    }

    // Update memberCounts when role changes
    try {
      const appConfigRef = doc(db, 'appConfig', 'global');
      const updates: Record<string, unknown> = {};

      // Remove from memberCounts if leaving proposal/backend
      if (targetCurrentRole === 'proposal' || targetCurrentRole === 'backend') {
        updates[`memberCounts.${targetUserId}`] = deleteField();
      }

      // Add to memberCounts if joining proposal/backend
      if (newRole === 'proposal' || newRole === 'backend') {
        const configSnap = await getDoc(appConfigRef);
        const existing = (configSnap.data()?.['memberCounts'] ?? {}) as Record<string, number>;
        if (!(targetUserId in existing)) {
          updates[`memberCounts.${targetUserId}`] = 0;
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(appConfigRef, updates);
      }
    } catch (err) {
      console.error('[changeRole] memberCounts update failed:', err);
    }
  }

  async function transferSuperAdmin(newUid: string): Promise<void> {
    const superAdminUid = await getSuperAdminUid();
    if (currentUser?.uid !== superAdminUid) {
      showToast('Only the super admin can transfer this role.', 'error');
      return;
    }
    if (newUid === superAdminUid) {
      showToast('This user is already the super admin.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'appConfig', 'global'), {
        superAdminUid: newUid,
        updatedAt:     serverTimestamp(),
      });
      showToast('Super admin transferred. Please inform the new super admin.', 'success');
    } catch (err) {
      console.error('[transferSuperAdmin] failed:', err);
      showToast('Transfer failed. Try again.', 'error');
      throw err;
    }
  }

  async function syncRoleAssignedName(
    userId:    string,
    uidField:  string,
    nameField: string,
    newName:   string,
  ): Promise<void> {
    try {
      const snap = await getDocs(query(
        collection(db, 'tasks'),
        where(uidField,   '==', userId),
        where('archived', '==', false),
      ));
      if (snap.empty) return;
      const CHUNK = 499;
      const docs  = snap.docs;
      for (let i = 0; i < docs.length; i += CHUNK) {
        const batch = writeBatch(db);
        docs.slice(i, i + CHUNK).forEach((d) => {
          batch.update(d.ref, { [nameField]: newName, updatedAt: serverTimestamp() });
        });
        await batch.commit();
      }
      console.warn(`[syncRoleAssignedName] Updated ${docs.length} tasks — ${nameField}`);
    } catch (err) {
      console.error('[syncRoleAssignedName] failed:', err);
    }
  }

  async function syncTasksForUser(
    userId:  string,
    updates: { assignedToName?: string; assignedToCode?: string; assignedToMobile?: string },
  ): Promise<void> {
    try {
      const snap = await getDocs(query(
        collection(db, 'tasks'),
        where('assignedTo', '==', userId),
      ));
      if (snap.empty) return;

      const CHUNK = 499;
      const docs  = snap.docs;
      for (let i = 0; i < docs.length; i += CHUNK) {
        const batch = writeBatch(db);
        docs.slice(i, i + CHUNK).forEach((d) => {
          batch.update(d.ref, { ...updates, updatedAt: serverTimestamp() });
        });
        await batch.commit();
      }
      console.warn(
        `[syncTasksForUser] Updated ${docs.length} tasks for user ${userId}`,
      );
    } catch (err) {
      // Non-critical — log but don't throw
      console.error('[syncTasksForUser] failed:', err);
    }
  }

  async function updateUserMobile(userId: string, mobileNumber: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'users', userId), {
        mobileNumber: mobileNumber || null,
        updatedAt: serverTimestamp(),
      });
      await syncTasksForUser(userId, { assignedToMobile: mobileNumber });
    } catch (err) {
      console.error('[updateUserMobile] failed:', err);
      showToast('Failed to update mobile number. Try again.', 'error');
      throw err;
    }
  }

  async function updateUserDistrict(userId: string, district: string, state: string): Promise<void> {
    try {
      const { resolvedState, resolvedDistrict } =
        await resolveAndAutoAddStateDistrict(db, state, district);
      await updateDoc(doc(db, 'users', userId), {
        state:     resolvedState    || null,
        district:  resolvedDistrict || null,
        updatedAt: serverTimestamp(),
      });
      showToast('Location updated', 'success');
    } catch (err) {
      console.error('[updateUserDistrict] failed:', err);
      showToast('Failed to update location. Try again.', 'error');
      throw err;
    }
  }

  return {
    createUser, updateUserName, updateUserDistrict, updateUserMobile,
    setUserActive, changeRole, transferSuperAdmin, syncTasksForUser,
  };
}
