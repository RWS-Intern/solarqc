import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useToast } from '@/components/ui/toast';
import type { AppConfig, FieldDefinition, JourneyStepDefinition } from '@/types';

const DEFAULT_CONFIG: AppConfig = {
  orgName:            '',
  taskNumCounter:     0,
  engineerNumCounter: 0,
  taskTemplate:       [],
  backendCashSteps:   [],
  backendLoanSteps:   [],
  superAdminUid:      '',
  pipelineCounts:     undefined,
  memberCounts:       undefined,
  engineerCounts:     {},
  districtCounts:     {},
};

export function useAppConfig() {
  const [config, setConfig]   = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'appConfig', 'global'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            orgName:                  data['orgName']                   ?? DEFAULT_CONFIG.orgName,
            taskNumCounter:           data['taskNumCounter']            ?? 0,
            engineerNumCounter:       data['engineerNumCounter']        ?? 0,
            taskTemplate:             (data['taskTemplate']             ?? []) as FieldDefinition[],
            documentTemplate:         (data['documentTemplate']         ?? []) as FieldDefinition[],
            backendChecklistTemplate: (data['backendChecklistTemplate'] ?? []) as FieldDefinition[],
            backendCashSteps:         (data['backendCashSteps']         ?? []) as JourneyStepDefinition[],
            backendLoanSteps:         (data['backendLoanSteps']         ?? []) as JourneyStepDefinition[],
            superAdminUid:            (data['superAdminUid']            as string) ?? '',
            pipelineCounts:           data['pipelineCounts'] as AppConfig['pipelineCounts'] ?? undefined,
            memberCounts:             data['memberCounts'] as Record<string, number> | undefined,
            districts:                (data['districts']    ?? []) as string[],
            leadSources:              (data['leadSources']  ?? []) as string[],
            districtsByState:         (data['districtsByState'] ?? {}) as Record<string, string[]>,
            engineerCounts:           (data['engineerCounts'] as AppConfig['engineerCounts']) ?? {},
            districtCounts:           (data['districtCounts'] as AppConfig['districtCounts']) ?? {},
            saleClosedConfig:         data['saleClosedConfig'] as import('@/types').SaleClosedConfig | undefined,
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error('[useAppConfig] error:', err);
        showToast('Failed to load app configuration. Please refresh.', 'error');
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  return { config, loading };
}
