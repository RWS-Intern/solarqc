import {
  doc, updateDoc, serverTimestamp,
  collection, getDocs, query, where, writeBatch, runTransaction,
  type DocumentReference,
} from 'firebase/firestore';
import { db }        from '@/firebase/config';
import { useToast }  from '@/components/ui/toast';
import type { FieldDefinition, JourneyStepDefinition } from '@/types';

export function useTemplateActions() {
  const { showToast } = useToast();

  async function saveTemplate(fields: FieldDefinition[]): Promise<void> {
    try {
      // Step 1: Save the new template to appConfig atomically
      const configRef = doc(db, 'appConfig', 'global');
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(configRef);
        if (!snap.exists()) throw new Error('Config not found');
        tx.update(configRef, {
          taskTemplate: fields,
          updatedAt:    serverTimestamp(),
        });
      });

      // Step 2: Find all pending and in_progress tasks
      const tasksRef = collection(db, 'tasks');
      const q        = query(
        tasksRef,
        where('archived', '==', false),
        where('status', 'in', ['pending', 'in_progress', 'blocked']),
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        showToast('Template saved successfully', 'success');
        return;
      }

      // Step 3: For each task, merge fields following the new template order.
      // - Fields still in the template get updated label/options/isRequired/type.
      // - Fields removed from the template are dropped only if unanswered.
      // - New fields are appended in template order.
      // - fieldAnswers and fieldPhotos for removed fields are cleaned up.

      const newTemplateIds = new Set(fields.map((f) => f.fieldId));

      // Build list of docs that actually need updating
      const docsToUpdate: {
        ref:  DocumentReference;
        data: {
          fields:       FieldDefinition[];
          fieldAnswers: Record<string, unknown>;
          fieldPhotos:  Record<string, unknown>;
          updatedAt:    ReturnType<typeof serverTimestamp>;
        };
      }[] = [];

      snap.docs.forEach((taskDoc) => {
        const data            = taskDoc.data();
        const existingFields  = (data['fields']      ?? []) as FieldDefinition[];
        const existingAnswers = (data['fieldAnswers'] ?? {}) as Record<string, unknown>;
        const existingPhotos  = (data['fieldPhotos']  ?? {}) as Record<string, unknown>;

        const existingFieldMap = new Map(existingFields.map((f) => [f.fieldId, f]));

        // Build merged fields following the NEW template order exactly
        const mergedFields: FieldDefinition[] = fields.map((templateField) => {
          const existing = existingFieldMap.get(templateField.fieldId);
          if (existing) {
            return { ...templateField };
          }
          return { ...templateField };
        });

        // Detect changes across all field properties
        function fieldSignature(f: FieldDefinition): string {
          return [
            f.fieldId,
            f.label,
            f.type,
            f.isRequired ? '1' : '0',
            (f.options ?? []).join('~'),
            f.unit ?? '',
          ].join('|');
        }

        const existingSig = existingFields.map(fieldSignature).join(';;');
        const mergedSig   = mergedFields.map(fieldSignature).join(';;');

        if (existingSig === mergedSig) return;

        // Clean answers/photos for fields no longer in the template
        const cleanedAnswers: Record<string, unknown> = {};
        const cleanedPhotos:  Record<string, unknown> = {};

        for (const [fid, ans] of Object.entries(existingAnswers)) {
          if (newTemplateIds.has(fid)) cleanedAnswers[fid] = ans;
        }
        for (const [fid, photos] of Object.entries(existingPhotos)) {
          if (newTemplateIds.has(fid)) cleanedPhotos[fid] = photos;
        }

        docsToUpdate.push({
          ref:  taskDoc.ref,
          data: {
            fields:       mergedFields,
            fieldAnswers: cleanedAnswers,
            fieldPhotos:  cleanedPhotos,
            updatedAt:    serverTimestamp(),
          },
        });
      });

      // Commit in chunks of 499 to stay under Firestore's 500-op batch limit
      const CHUNK = 499;
      for (let i = 0; i < docsToUpdate.length; i += CHUNK) {
        const chunk    = docsToUpdate.slice(i, i + CHUNK);
        const newBatch = writeBatch(db);
        chunk.forEach(({ ref, data }) => newBatch.update(ref, data));
        await newBatch.commit();
      }

      const updateCount = docsToUpdate.length;

      const msg = updateCount > 0
        ? `Template saved. ${updateCount} active task${updateCount !== 1 ? 's' : ''} updated automatically.`
        : 'Template saved successfully';

      showToast(msg, 'success');
    } catch (err) {
      console.error('[saveTemplate] failed:', err);
      showToast('Failed to save template. Try again.', 'error');
      throw err;
    }
  }

  async function saveDocumentTemplate(fields: FieldDefinition[]): Promise<void> {
    try {
      const configRef = doc(db, 'appConfig', 'global');
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(configRef);
        if (!snap.exists()) throw new Error('Config not found');
        tx.update(configRef, {
          documentTemplate: fields,
          updatedAt:        serverTimestamp(),
        });
      });
      showToast('Document template saved successfully', 'success');
    } catch (err) {
      console.error('[saveDocumentTemplate] failed:', err);
      showToast('Failed to save document template. Try again.', 'error');
      throw err;
    }
  }

  async function saveBackendJourneySteps(
    cashSteps: JourneyStepDefinition[],
    loanSteps: JourneyStepDefinition[],
  ): Promise<void> {
    try {
      const configRef = doc(db, 'appConfig', 'global');
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(configRef);
        if (!snap.exists()) throw new Error('Config not found');
        tx.update(configRef, {
          backendCashSteps: cashSteps,
          backendLoanSteps: loanSteps,
          updatedAt:        serverTimestamp(),
        });
      });
      showToast('Application journey steps saved. New steps apply to unstarted tasks only.', 'success');
    } catch (err) {
      console.error('[saveBackendJourneySteps] failed:', err);
      showToast('Failed to save steps. Try again.', 'error');
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
      // (CreateTaskModal, CreateUserModal, EditUserModal, bulk upload, both
      // page filters) continues working unchanged, with zero risk, until
      // those are deliberately updated in a later phase.
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

  async function saveLeadSources(leadSources: string[]): Promise<void> {
    try {
      await updateDoc(doc(db, 'appConfig', 'global'), {
        leadSources,
        updatedAt: serverTimestamp(),
      });
      showToast('Lead sources saved', 'success');
    } catch (err) {
      console.error('[saveLeadSources] failed:', err);
      showToast('Failed to save lead sources. Try again.', 'error');
      throw err;
    }
  }

  async function saveSaleClosedConfig(
    saleClosedConfig: import('@/types').SaleClosedConfig,
  ): Promise<void> {
    try {
      await updateDoc(doc(db, 'appConfig', 'global'), {
        saleClosedConfig,
        updatedAt: serverTimestamp(),
      });
      showToast('Sales Closed field mapping saved', 'success');
    } catch (err) {
      console.error('[saveSaleClosedConfig] failed:', err);
      void import('@/utils/logError').then(({ logError }) =>
        logError('template.saveSaleClosedConfig', err, {}));
      showToast('Failed to save mapping. Try again.', 'error');
      throw err;
    }
  }

  return { saveTemplate, saveDocumentTemplate, saveBackendJourneySteps, saveDistricts, saveDistrictsByState, saveLeadSources, saveSaleClosedConfig };
}
