import Papa from 'papaparse';
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, runTransaction,
  updateDoc, arrayUnion,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { resolveDistrictCasing, toTitleCase } from '@/utils/districtUtils';
import { buildJobPayload, type CreateQcJobInput } from '@/hooks/useQcJobActions';
import type { QcJob, QcFieldDefinition } from '@/types/qc';

// ── Columns, exact per plan §5.6 ────────────────────────────────────────────
export const IMPORT_COLUMNS = [
  'customerName', 'mobile', 'altMobile', 'address', 'district', 'state',
  'pincode', 'salesRef', 'systemSizeKw', 'moduleMake', 'moduleWattage',
  'moduleCount', 'inverterMake', 'inverterModel', 'inverterSerial',
  'installationDate', 'installerCrew', 'systemType', 'inspectorCode',
  'scheduledDate',
] as const;

const SYSTEM_TYPES = ['ongrid', 'hybrid', 'offgrid'];
const MAX_ROWS = 500;

export interface CustomerImportRow {
  rowNum:  number; // 1-indexed data row (row 1 = first row after the header)
  raw:     Record<string, string>;
  errors:  string[];
  resolved?: CreateQcJobInput;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function isValidDateString(s: string): boolean {
  if (!s) return true; // optional field, empty is fine
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function nameSearchFields(name: string): { nameLower: string; nameWords: string[] } {
  const nameLower = name.toLowerCase();
  const nameWords = [...new Set(nameLower.split(/\s+/).filter(Boolean))];
  return { nameLower, nameWords };
}

export function useCustomerImport() {
  const { currentUser } = useAuthStore();
  const { users } = useUserStore();

  function downloadTemplateCsv(): void {
    const csv = Papa.unparse({ fields: [...IMPORT_COLUMNS], data: [] });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'qc_customer_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Step 1+2: parse, structurally validate, intra-file dedupe. All local
  // — no Firestore calls except ONE upfront read of districtsByState/
  // districts, done once for the whole file, not per row. ─────────────────
  async function parseAndValidate(file: File): Promise<CustomerImportRow[]> {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
    });

    const configSnap = await getDoc(doc(db, 'appConfig', 'global'));
    const existingDistrictsByState = (configSnap.data()?.['districtsByState'] as Record<string, string[]>) ?? {};
    const existingStates           = Object.keys(existingDistrictsByState);

    const activeInspectorsByCode = new Map(
      users
        .filter((u) => u.role === 'qc_inspector' && u.active && u.engineerCode)
        .map((u) => [u.engineerCode as string, u]),
    );

    if (parsed.data.length > MAX_ROWS) {
      throw new Error(`This file has ${parsed.data.length} rows — maximum ${MAX_ROWS} per upload. Split your file.`);
    }

    const seenMobiles = new Map<string, number>(); // mobile -> first rowNum seen
    const rows: CustomerImportRow[] = parsed.data.map((raw, i) => {
      const rowNum = i + 1;
      const errors: string[] = [];

      const customerName = str(raw['customerName']);
      if (!customerName) errors.push('customerName is required.');

      const mobileDigits = str(raw['mobile']).replace(/\D/g, '');
      if (mobileDigits.length !== 10) {
        errors.push(`mobile must be exactly 10 digits (got "${str(raw['mobile'])}").`);
      } else if (seenMobiles.has(mobileDigits)) {
        errors.push(`mobile ${mobileDigits} is duplicated in this file (first seen at row ${seenMobiles.get(mobileDigits)}).`);
      } else {
        seenMobiles.set(mobileDigits, rowNum);
      }

      const stateInput = str(raw['state']);
      const districtInput = str(raw['district']);
      if (!stateInput) errors.push('state is required.');
      if (!districtInput) errors.push('district is required.');

      const sizeKwRaw = str(raw['systemSizeKw']);
      const sizeKw = Number(sizeKwRaw);
      if (!sizeKwRaw || Number.isNaN(sizeKw) || sizeKw <= 0) {
        errors.push(`systemSizeKw must be a positive number (got "${sizeKwRaw}").`);
      }

      const systemTypeRaw = str(raw['systemType']).toLowerCase();
      if (systemTypeRaw && !SYSTEM_TYPES.includes(systemTypeRaw)) {
        errors.push(`systemType "${str(raw['systemType'])}" is not valid (expected ongrid, hybrid, or offgrid).`);
      }

      if (!isValidDateString(str(raw['installationDate']))) {
        errors.push(`installationDate "${str(raw['installationDate'])}" is not a valid date.`);
      }
      if (!isValidDateString(str(raw['scheduledDate']))) {
        errors.push(`scheduledDate "${str(raw['scheduledDate'])}" is not a valid date.`);
      }

      let inspector: CreateQcJobInput['inspector'] = null;
      const inspectorCode = str(raw['inspectorCode']);
      if (inspectorCode) {
        const match = activeInspectorsByCode.get(inspectorCode);
        if (!match) {
          errors.push(`inspectorCode "${inspectorCode}" does not match any active QC inspector.`);
        } else {
          inspector = {
            uid: match.id, name: match.name,
            code: match.engineerCode ?? '', mobile: match.mobileNumber ?? '',
          };
        }
      }

      if (errors.length > 0) {
        return { rowNum, raw, errors };
      }

      const resolvedState    = resolveDistrictCasing(stateInput, existingStates);
      const districtsForState = existingDistrictsByState[resolvedState] ?? [];
      const resolvedDistrict = resolveDistrictCasing(districtInput, districtsForState);
      const { nameLower, nameWords } = nameSearchFields(customerName);

      const customer: QcJob['customer'] = {
        name: customerName, nameLower, nameWords,
        mobile: mobileDigits,
        altMobile: str(raw['altMobile']) || undefined,
        address: str(raw['address']),
        district: resolvedDistrict,
        state: resolvedState,
        pincode: str(raw['pincode']) || undefined,
        salesRef: str(raw['salesRef']) || undefined,
      };

      const system: QcJob['system'] = {
        sizeKw,
        moduleMake:       str(raw['moduleMake']) || undefined,
        moduleWattage:    str(raw['moduleWattage']) ? Number(raw['moduleWattage']) : undefined,
        moduleCount:      str(raw['moduleCount']) ? Number(raw['moduleCount']) : undefined,
        inverterMake:     str(raw['inverterMake']) || undefined,
        inverterModel:    str(raw['inverterModel']) || undefined,
        inverterSerial:   str(raw['inverterSerial']) || undefined,
        installationDate: str(raw['installationDate']) || undefined,
        installerCrew:    str(raw['installerCrew']) || undefined,
        systemType:       (systemTypeRaw as QcJob['system']['systemType']) || undefined,
      };

      const scheduledDateStr = str(raw['scheduledDate']);

      return {
        rowNum, raw, errors: [],
        resolved: {
          customer, system, inspector,
          scheduledDate: scheduledDateStr ? new Date(scheduledDateStr) : null,
        },
      };
    });

    // ── Step 3: cross-database dedupe, chunked — only against rows that are
    // otherwise valid; no point checking a row against the database that's
    // already rejected for a different reason. ──────────────────────────────
    const candidateMobiles = rows.filter((r) => r.errors.length === 0).map((r) => r.resolved!.customer.mobile);
    if (candidateMobiles.length > 0) {
      const existingMobiles = await findExistingMobiles(candidateMobiles);
      for (const row of rows) {
        if (row.errors.length === 0 && existingMobiles.has(row.resolved!.customer.mobile)) {
          row.errors.push(`mobile ${row.resolved!.customer.mobile} already exists on an existing job.`);
          delete row.resolved;
        }
      }
    }

    return rows;
  }

  async function findExistingMobiles(mobiles: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    const CHUNK = 10; // Firestore 'in' operator limit
    for (let i = 0; i < mobiles.length; i += CHUNK) {
      const chunk = mobiles.slice(i, i + CHUNK);
      const snap = await getDocs(query(
        collection(db, 'qcJobs'),
        where('archived', '==', false),
        where('customer.mobile', 'in', chunk),
      ));
      snap.docs.forEach((d) => found.add((d.data()['customer'] as { mobile: string }).mobile));
    }
    return found;
  }

  // ── Step 4: reserve a contiguous number block in ONE transaction, then
  // batch-write. Never one transaction per row — see plan-prompt §2.3. ─────
  async function commitImport(rows: CustomerImportRow[]): Promise<{ succeeded: number; failed: number }> {
    if (!currentUser) throw new Error('Not authenticated');
    const validRows = rows.filter((r) => r.errors.length === 0 && r.resolved);
    if (validRows.length === 0) return { succeeded: 0, failed: rows.length };
    if (validRows.length > MAX_ROWS) throw new Error(`Maximum ${MAX_ROWS} rows per upload. Split your file.`);

    const configRef = doc(db, 'appConfig', 'global');
    let startNum = 0;
    let template: QcFieldDefinition[] = [];
    let templateVersion = 1;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(configRef);
      const data = snap.data();
      startNum        = (data?.['qcNumCounter']       as number | undefined) ?? 0;
      template         = (data?.['qcTemplate']          as QcFieldDefinition[] | undefined) ?? [];
      templateVersion  = (data?.['qcTemplateVersion']   as number | undefined) ?? 1;
      tx.update(configRef, { qcNumCounter: startNum + validRows.length });
    });

    const CHUNK = 400; // stay under Firestore's 500-op batch limit
    let succeeded = 0;
    for (let i = 0; i < validRows.length; i += CHUNK) {
      const chunk = validRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      chunk.forEach((row, j) => {
        const num   = startNum + i + j + 1;
        const qcNum = `QC-${String(num).padStart(6, '0')}`;
        const ref   = doc(collection(db, 'qcJobs'));
        batch.set(ref, buildJobPayload(row.resolved!, qcNum, currentUser.uid, template, templateVersion));
      });
      await batch.commit();
      succeeded += chunk.length;
    }

    // Persist any new states/districts discovered across the whole file —
    // ONE write, not one per row.
    await persistNewDistricts(validRows);

    return { succeeded, failed: rows.length - validRows.length };
  }

  async function persistNewDistricts(validRows: CustomerImportRow[]): Promise<void> {
    const configRef = doc(db, 'appConfig', 'global');
    const snap = await getDoc(configRef);
    const existingDistrictsByState = (snap.data()?.['districtsByState'] as Record<string, string[]>) ?? {};
    const existingFlatDistricts    = (snap.data()?.['districts'] as string[] | undefined) ?? [];

    const updates: Record<string, unknown> = {};
    const newFlatDistricts = new Set<string>();

    for (const row of validRows) {
      const { state, district } = row.resolved!.customer;
      if (!state) continue;
      if (!existingDistrictsByState[state] && !(`districtsByState.${state}` in updates)) {
        updates[`districtsByState.${state}`] = [];
      }
      if (district) {
        const existingForState = existingDistrictsByState[state] ?? [];
        const alreadyKnown = existingForState.some((d) => d.toLowerCase() === district.toLowerCase());
        if (!alreadyKnown) {
          updates[`districtsByState.${state}`] = arrayUnion(district);
        }
        const alreadyFlat = existingFlatDistricts.some((d) => d.toLowerCase() === district.toLowerCase());
        if (!alreadyFlat) newFlatDistricts.add(district);
      }
    }
    if (newFlatDistricts.size > 0) {
      updates['districts'] = arrayUnion(...newFlatDistricts);
    }
    if (Object.keys(updates).length > 0) {
      await updateDoc(configRef, updates).catch((err) =>
        console.error('[useCustomerImport] persistNewDistricts failed:', err));
    }
  }

  // ── Step 5: errors CSV — same column order as the template, plus a
  // trailing `error` column, for just the rows that failed. ────────────────
  function exportErrorsCsv(rows: CustomerImportRow[]): void {
    const errorRows = rows.filter((r) => r.errors.length > 0);
    if (errorRows.length === 0) return;
    const data = errorRows.map((r) => {
      const record: Record<string, string> = {};
      for (const col of IMPORT_COLUMNS) record[col] = r.raw[col] ?? '';
      record['error'] = r.errors.join(' | ');
      return record;
    });
    const csv = Papa.unparse({ fields: [...IMPORT_COLUMNS, 'error'], data });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `qc_customer_import_errors_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { downloadTemplateCsv, parseAndValidate, commitImport, exportErrorsCsv };
}

// Exported for reuse by CustomerForm's single-entry path, which computes the
// same search-index fields without going through the whole import pipeline.
export { nameSearchFields, toTitleCase };
