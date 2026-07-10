import { useMemo } from 'react';
import { useUserStore } from '@/store/userStore';

export interface FieldEngineer {
  uid:          string;
  displayName:  string;
  engineerCode: string | undefined;
  mobileNumber: string | undefined;
  email:        string;
}

export function useFieldEngineers(): { engineers: FieldEngineer[]; loading: boolean } {
  const { users, loading } = useUserStore();

  const engineers = useMemo(
    () =>
      users
        .filter((u) => u.role === 'field' && u.active !== false && !u.deletedAt)
        .map((u) => ({
          uid:          u.id,
          displayName:  u.name,
          engineerCode: u.engineerCode,
          mobileNumber: u.mobileNumber,
          email:        u.email,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [users],
  );

  return { engineers, loading };
}
