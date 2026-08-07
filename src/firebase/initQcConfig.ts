import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { DEFAULT_QC_TEMPLATE, QC_TEMPLATE_VERSION, DECLARATIONS } from './qcTemplateSeed';

/**
 * Idempotent. Safe to call on every admin dashboard load. Creates
 * appConfig/global if it doesn't exist yet (it doesn't, on a fresh
 * project — nothing else creates it anymore after Phase 0 removed the
 * old initAppConfig() bootstrap chain), and only ever ADDS missing QC
 * keys — never overwrites a template an admin has already edited.
 */
export async function initQcConfig(): Promise<void> {
  try {
    const ref  = doc(db, 'appConfig', 'global');
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};

    const updates: Record<string, unknown> = {};

    if (!data['qcTemplate'] || (data['qcTemplate'] as unknown[]).length === 0) {
      updates['qcTemplate']        = DEFAULT_QC_TEMPLATE;
      updates['qcTemplateVersion'] = QC_TEMPLATE_VERSION;
    }
    if (data['qcNumCounter'] === undefined) {
      updates['qcNumCounter'] = 0;
    }
    if (!data['declarationTexts']) {
      updates['declarationTexts'] = DECLARATIONS;
    }
    if (!data['orgName']) {
      updates['orgName'] = 'Rite Solar';
    }

    if (Object.keys(updates).length === 0) return;

    // setDoc + merge, NOT updateDoc — updateDoc throws when the doc is
    // missing entirely, which is exactly the state this project is in.
    await setDoc(ref, updates, { merge: true });
    console.warn('[initQcConfig] Seeded:', Object.keys(updates));
  } catch (err) {
    console.error('[initQcConfig] failed:', err);
  }
}
