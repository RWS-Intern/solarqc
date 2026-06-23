import {
  doc, setDoc, updateDoc, serverTimestamp, runTransaction, getDoc,
  getDocs, query, collection, where, writeBatch,
} from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as secondarySignOut,
} from 'firebase/auth';
import { db, firebaseConfig } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useToast }     from '@/components/ui/toast';
import type { UserRole, User } from '@/types';

const secondaryApp =
  getApps().find((a) => a.name === 'secondary') ??
  initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

export function useUserActions() {
  const { currentUser } = useAuthStore();
  const { showToast }   = useToast();

  // Reads superAdminUid fresh from Firestore — never stale from a cached hook
  async function getSuperAdminUid(): Promise<string> {
    const snap = await getDoc(doc(db, 'appConfig', 'global'));
    return (snap.data()?.['superAdminUid'] as string) ?? '';
  }

  async function createUser(
    name: string, email: string, role: UserRole,
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

      if (role === 'field') {
        await runTransaction(db, async (tx) => {
          const configSnap = await tx.get(configRef);
          const next = ((configSnap.data()?.['engineerNumCounter'] as number | undefined) ?? 0) + 1;
          engineerCode = `ENG-${String(next).padStart(3, '0')}`;
          tx.update(configRef, { engineerNumCounter: next });
        });
      }

      await setDoc(doc(db, 'users', uid), {
        name:              name.trim(),
        email:             email.toLowerCase().trim(),
        role,
        active:            true,
        engineerCode:      role === 'field' ? engineerCode : null,
        createdAt:         serverTimestamp(),
        createdBy:         currentUser?.uid ?? '',
        fcmToken:          null,
        fcmTokenUpdatedAt: null,
        photoURL:          null,
      });

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

  async function updateUserName(userId: string, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) { showToast('Name cannot be empty', 'error'); return; }
    try {
      await updateDoc(doc(db, 'users', userId), {
        name: trimmed, updatedAt: serverTimestamp(),
      });
      // Sync denormalized name in all assigned tasks
      await syncTasksForUser(userId, { assignedToName: trimmed });
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
    if (targetCurrentRole === 'admin' && newRole === 'field') {
      const activeAdmins = allUsers.filter(
        (u) => u.role === 'admin' && u.active && !u.deletedAt,
      );
      if (activeAdmins.length <= 1) {
        showToast('Cannot demote the last admin. Promote another user first.', 'error');
        return;
      }
    }

    try {
      const configRef = doc(db, 'appConfig', 'global');
      const userRef   = doc(db, 'users', targetUserId);

      if (newRole === 'field' && targetCurrentRole === 'admin') {
        // Admin → Field: assign a new engineerCode atomically
        let engineerCode = '';
        await runTransaction(db, async (tx) => {
          const configSnap = await tx.get(configRef);
          const next =
            ((configSnap.data()?.['engineerNumCounter'] as number) ?? 0) + 1;
          engineerCode = `ENG-${String(next).padStart(3, '0')}`;
          tx.update(configRef, { engineerNumCounter: next });
          tx.update(userRef, {
            role:         'field',
            engineerCode: engineerCode,
            updatedAt:    serverTimestamp(),
          });
        });
        // Sync new engineerCode to all tasks assigned to this user
        await syncTasksForUser(targetUserId, { assignedToCode: engineerCode });
        showToast(
          `Role changed to Field Engineer. Assigned ${engineerCode}. User must log out and back in.`,
          'success',
        );
      } else if (newRole === 'admin' && targetCurrentRole === 'field') {
        // Field → Admin: keep engineerCode for history
        await updateDoc(userRef, {
          role:      'admin',
          updatedAt: serverTimestamp(),
        });
        showToast(
          'Role changed to Admin. User must log out and back in for full effect.',
          'success',
        );
      }
    } catch (err) {
      console.error('[changeRole] failed:', err);
      showToast('Failed to change role. Try again.', 'error');
      throw err;
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

  async function syncTasksForUser(
    userId:  string,
    updates: { assignedToName?: string; assignedToCode?: string },
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

  return {
    createUser, updateUserName, setUserActive,
    changeRole, transferSuperAdmin,
  };
}
