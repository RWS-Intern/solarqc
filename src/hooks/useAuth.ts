import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import type { AppUser, UserRole } from '@/types';

export function useAuth() {
  const { setCurrentUser, setLoading, setAuthError } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setError(null);

      if (!firebaseUser) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      try {
        // No forced refresh: nothing in this codebase ever sets a custom
        // claim (no Cloud Function does it, and there's no `role` claim to
        // freshen), so force-refreshing bought nothing but a mandatory
        // network round trip on every single app load — which fails
        // outright offline (auth/network-request-failed) and signs the
        // user out of the UI even though Auth's own local persistence has
        // a perfectly good cached user. The unforced call still refreshes
        // normally against the network whenever the cached token has
        // actually expired and a connection exists.
        const tokenResult = await firebaseUser.getIdTokenResult();
        const role = (tokenResult.claims['role'] as UserRole) ?? null;

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        let userSnap = await getDoc(userDocRef);

        if (!userSnap.exists()) {
          await new Promise((r) => setTimeout(r, 1000));
          const retrySnap = await getDoc(userDocRef);
          if (!retrySnap.exists()) {
            await signOut(auth);
            setCurrentUser(null);
            setLoading(false);
            setError('Account setup incomplete. Contact your administrator.');
            return;
          }
          userSnap = retrySnap;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const data = userSnap.data()!;

        if (data['active'] === false) {
          await signOut(auth);
          setCurrentUser(null);
          setLoading(false);
          setAuthError('Account disabled. Contact your administrator.');
          return;
        }

        const appUser: AppUser = {
          uid:         firebaseUser.uid,
          email:       firebaseUser.email ?? data['email'] ?? '',
          name:        data['name']       ?? '',
          role:        (role ?? data['role']) as UserRole,
          active:      data['active']     ?? true,
          createdAt:   data['createdAt']?.toDate?.() ?? new Date(),
          deletedAt:   data['deletedAt'] ?? null,
          photoURL:    data['photoURL']  ?? firebaseUser.photoURL ?? undefined,
          createdBy:   data['createdBy'] ?? undefined,
          engineerCode: data['engineerCode'] ?? undefined,
        };

        setCurrentUser(appUser);
      } catch (err) {
        console.error('Auth state error:', err);
        setCurrentUser(null);
        setError('Authentication error. Please try again.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { error };
}
