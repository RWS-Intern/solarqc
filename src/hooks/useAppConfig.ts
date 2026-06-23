import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { AppConfig, FieldDefinition } from '@/types';

const DEFAULT_CONFIG: AppConfig = {
  orgName:            '',
  taskNumCounter:     0,
  engineerNumCounter: 0,
  taskTemplate:       [],
  superAdminUid:      '',
};

export function useAppConfig() {
  const [config, setConfig]   = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'appConfig', 'global'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            orgName:            data['orgName']            ?? DEFAULT_CONFIG.orgName,
            taskNumCounter:     data['taskNumCounter']     ?? 0,
            engineerNumCounter: data['engineerNumCounter'] ?? 0,
            taskTemplate:       (data['taskTemplate']      ?? []) as FieldDefinition[],
            superAdminUid:      (data['superAdminUid']     as string) ?? '',
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error('[useAppConfig] error:', err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  return { config, loading };
}
