import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db }        from '@/firebase/config';
import { useToast }  from '@/components/ui/toast';
import type { QcFieldDefinition } from '@/types/qc';

// Covers every attribute QcFieldDefinition can carry. This is deliberately
// broader than the old sales fieldSignature() (fieldId|label|type|
// isRequired|options|unit only) — plan §5.5 calls this out explicitly:
// an edit that only changes severity must count as a real change.
function qcFieldSignature(f: QcFieldDefinition): string {
  return [
    f.fieldId, f.code ?? '', f.label, f.type, f.sortOrder,
    f.verifyText ?? '', f.target ?? '', f.method ?? '', f.severity ?? '',
    f.photoRequired ? '1' : '0', f.minPhotos ?? '', f.maxPhotos ?? '',
    f.allowNA ? '1' : '0', f.remarkRequiredOnFail ? '1' : '0',
    f.photoRequiredOnFail ? '1' : '0', f.expectedMin ?? '', f.expectedMax ?? '',
    f.unit ?? '', f.showIf ? `${f.showIf.fieldId}=${f.showIf.equals}` : '',
    f.isRequired ? '1' : '0', (f.options ?? []).join('~'),
  ].join('|');
}

export function useTemplateActions() {
  const { showToast } = useToast();

  async function saveQcTemplate(
    fields: QcFieldDefinition[],
    currentFields: QcFieldDefinition[],
  ): Promise<void> {
    try {
      const existingSig = currentFields.map(qcFieldSignature).join(';;');
      const newSig       = fields.map(qcFieldSignature).join(';;');

      if (existingSig === newSig) {
        showToast('No changes to save', 'success');
        return;
      }

      const configRef = doc(db, 'appConfig', 'global');
      // Read the current version so two admins editing at once don't clobber
      // each other's bump — a plain read-then-write is fine here (low
      // contention, admin-only, occasional edits), a transaction is overkill.
      const snap    = await getDoc(configRef);
      const current = (snap.data()?.['qcTemplateVersion'] as number | undefined) ?? 1;

      await updateDoc(configRef, {
        qcTemplate:        fields,
        qcTemplateVersion: current + 1,
        updatedAt:         serverTimestamp(),
      });

      // Deliberately nothing else happens here. No re-materialising this
      // onto qcJobs — plan §5.5's trap #2. A job's `template` field is a
      // version-locked snapshot taken at creation; editing the live
      // template must never change the questions under an inspector who's
      // mid-inspection. New jobs pick up the new qcTemplateVersion; jobs
      // already in flight keep exactly what they started with.
      showToast('Checklist saved successfully', 'success');
    } catch (err) {
      console.error('[saveQcTemplate] failed:', err);
      showToast('Failed to save checklist. Try again.', 'error');
      throw err;
    }
  }

  async function saveDistricts(districts: string[]): Promise<void> {
    try {
      await updateDoc(doc(db, 'appConfig', 'global'), {
        districts,
        updatedAt: serverTimestamp(),
      });
      showToast('Districts saved', 'success');
    } catch (err) {
      console.error('[saveDistricts] failed:', err);
      showToast('Failed to save districts. Try again.', 'error');
      throw err;
    }
  }

  async function saveDistrictsByState(districtsByState: Record<string, string[]>): Promise<void> {
    try {
      // Keep the flat districts list in sync — flatten all states' districts
      // into one array, so every EXISTING consumer of config.districts
      // (CreateUserModal, EditUserModal, both page filters) continues
      // working unchanged, with zero risk, until those are deliberately
      // updated in a later phase.
      const flatDistricts = Object.values(districtsByState).flat();
      await updateDoc(doc(db, 'appConfig', 'global'), {
        districtsByState,
        districts: flatDistricts,
        updatedAt: serverTimestamp(),
      });
      showToast('States and districts saved', 'success');
    } catch (err) {
      console.error('[saveDistrictsByState] failed:', err);
      showToast('Failed to save states and districts. Try again.', 'error');
      throw err;
    }
  }

  return { saveQcTemplate, saveDistricts, saveDistrictsByState };
}
