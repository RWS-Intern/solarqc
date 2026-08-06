import { useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useUserStore } from '@/store/userStore';
import type { User } from '@/types';

export function useUsers() {
  const { setUsers, setLoading } = useUserStore();

  useEffect(() => {
    setLoading(true);
    // No orderBy — docs without createdAt (manually created admins) are included.
    // Sort client-side so the query never needs a Firestore index on createdAt.
    const q = query(collection(db, 'users'));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const users: User[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id:               d.id,
            name:             data['name']               ?? '',
            email:            data['email']              ?? '',
            role:             data['role']               ?? 'field',
            active:           data['active']             ?? true,
            createdAt:        data['createdAt']?.toDate?.()  ?? new Date(0),
            createdBy:        data['createdBy']          ?? undefined,
            deletedAt:        data['deletedAt']?.toDate?.()  ?? null,
            photoURL:         data['photoURL']           ?? undefined,
            fcmToken:         data['fcmToken']           ?? undefined,
            fcmTokenUpdatedAt: data['fcmTokenUpdatedAt']?.toDate?.() ?? undefined,
            engineerCode:     data['engineerCode']       ?? undefined,
            mobileNumber:     (data['mobileNumber'] as string | undefined) ?? undefined,
            district:         (data['district'] as string | undefined) ?? undefined,
            state:            (data['state']    as string | undefined) ?? undefined,
          };
        });

        const sorted = [...users].sort(
          (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
        );

        setUsers(sorted);
        setLoading(false);
      },
      (err) => {
        console.error('[useUsers] snapshot error:', err);
        setLoading(false);
      },
    );

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
