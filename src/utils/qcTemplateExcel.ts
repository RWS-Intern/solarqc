import * as XLSX from 'xlsx';
import type { QcFieldDefinition, QcFieldType, Severity } from '@/types/qc';

// One row per QcFieldDefinition, one column per attribute. This is the
// checklist DEFINITION — 54(ish) rows describing check points — not job
// data. Do not confuse with the job-results Excel export (Phase 8).

const VALID_TYPES: QcFieldType[] = [
  'passfail', 'measurement', 'number', 'text', 'longtext', 'select',
  'date', 'photo_only', 'signature', 'section_header',
];
const VALID_SEVERITIES: Severity[] = ['critical', 'major', 'minor'];

const COLUMNS = [
  'fieldId', 'code', 'label', 'type', 'sortOrder', 'verifyText', 'target',
  'method', 'severity', 'photoRequired', 'minPhotos', 'maxPhotos', 'allowNA',
  'remarkRequiredOnFail', 'photoRequiredOnFail', 'expectedMin', 'expectedMax',
  'unit', 'showIfFieldId', 'showIfEquals', 'isRequired', 'options',
] as const;

function boolCell(v: boolean | undefined): string {
  return v ? 'TRUE' : 'FALSE';
}

export function exportQcTemplateToExcel(fields: QcFieldDefinition[]): void {
  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);

  const rows = sorted.map((f) => ({
    fieldId:              f.fieldId,
    code:                 f.code ?? '',
    label:                f.label,
    type:                 f.type,
    sortOrder:            f.sortOrder,
    verifyText:           f.verifyText ?? '',
    target:               f.target ?? '',
    method:               f.method ?? '',
    severity:             f.severity ?? '',
    photoRequired:        boolCell(f.photoRequired),
    minPhotos:            f.minPhotos ?? '',
    maxPhotos:            f.maxPhotos ?? '',
    allowNA:              boolCell(f.allowNA),
    remarkRequiredOnFail: boolCell(f.remarkRequiredOnFail),
    photoRequiredOnFail:  boolCell(f.photoRequiredOnFail),
    expectedMin:          f.expectedMin ?? '',
    expectedMax:          f.expectedMax ?? '',
    unit:                 f.unit ?? '',
    showIfFieldId:        f.showIf?.fieldId ?? '',
    showIfEquals:         f.showIf?.equals ?? '',
    isRequired:           boolCell(f.isRequired),
    options:              (f.options ?? []).join(', '),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...COLUMNS] });
  ws['!cols'] = [
    { wch: 16 }, { wch: 8 }, { wch: 30 }, { wch: 14 }, { wch: 10 },
    { wch: 50 }, { wch: 24 }, { wch: 20 }, { wch: 10 }, { wch: 13 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 16 },
    { wch: 11 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'QC Checklist');

  const filename = `solarqc_checklist_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export type QcTemplateImportResult =
  | { ok: true; fields: QcFieldDefinition[] }
  | { ok: false; errors: string[] };

function cellToBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  return String(v ?? '').trim().toUpperCase() === 'TRUE';
}

function cellToStr(v: unknown): string {
  return String(v ?? '').trim();
}

export async function parseQcTemplateExcel(file: File): Promise<QcTemplateImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { ok: false, errors: ['The file has no sheets.'] };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length === 0) return { ok: false, errors: ['The sheet has no data rows.'] };

  const errors: string[] = [];
  const seenFieldIds = new Set<string>();
  const fields: QcFieldDefinition[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // header is row 1

    const fieldId = cellToStr(row['fieldId']);
    if (!fieldId) {
      errors.push(`Row ${rowNum}: fieldId is missing.`);
    } else if (seenFieldIds.has(fieldId)) {
      errors.push(`Row ${rowNum}: fieldId "${fieldId}" is duplicated elsewhere in the file.`);
    } else {
      seenFieldIds.add(fieldId);
    }

    const type = cellToStr(row['type']) as QcFieldType;
    if (!VALID_TYPES.includes(type)) {
      errors.push(`Row ${rowNum}: "${cellToStr(row['type'])}" is not a valid type (expected one of ${VALID_TYPES.join(', ')}).`);
    }

    const sortOrderRaw = row['sortOrder'];
    const sortOrder = Number(sortOrderRaw);
    if (sortOrderRaw === '' || Number.isNaN(sortOrder)) {
      errors.push(`Row ${rowNum}: sortOrder "${cellToStr(sortOrderRaw)}" is not a number.`);
    }

    const severityRaw = cellToStr(row['severity']).toLowerCase();
    const severity = severityRaw ? (severityRaw as Severity) : undefined;
    if (severityRaw && !VALID_SEVERITIES.includes(severityRaw as Severity)) {
      errors.push(`Row ${rowNum}: "${cellToStr(row['severity'])}" is not a valid severity (expected critical, major, or minor).`);
    }

    const label = cellToStr(row['label']);
    if (!label) {
      errors.push(`Row ${rowNum}: label is missing.`);
    }

    // Only build the field object if this row is otherwise well-formed —
    // no point constructing garbage when we're rejecting the whole import.
    const showIfFieldId = cellToStr(row['showIfFieldId']);
    const minPhotosRaw = cellToStr(row['minPhotos']);
    const maxPhotosRaw = cellToStr(row['maxPhotos']);
    const expectedMinRaw = cellToStr(row['expectedMin']);
    const expectedMaxRaw = cellToStr(row['expectedMax']);
    const optionsRaw = cellToStr(row['options']);

    fields.push({
      fieldId,
      code: cellToStr(row['code']) || undefined,
      label,
      type,
      sortOrder: Number.isNaN(sortOrder) ? i : sortOrder,
      verifyText: cellToStr(row['verifyText']) || undefined,
      target: cellToStr(row['target']) || undefined,
      method: cellToStr(row['method']) || undefined,
      severity,
      photoRequired: cellToBool(row['photoRequired']),
      minPhotos: minPhotosRaw === '' ? undefined : Number(minPhotosRaw),
      maxPhotos: maxPhotosRaw === '' ? undefined : Number(maxPhotosRaw),
      allowNA: cellToBool(row['allowNA']),
      remarkRequiredOnFail: cellToBool(row['remarkRequiredOnFail']),
      photoRequiredOnFail: cellToBool(row['photoRequiredOnFail']),
      expectedMin: expectedMinRaw === '' ? undefined : Number(expectedMinRaw),
      expectedMax: expectedMaxRaw === '' ? undefined : Number(expectedMaxRaw),
      unit: cellToStr(row['unit']) || undefined,
      showIf: showIfFieldId ? { fieldId: showIfFieldId, equals: cellToStr(row['showIfEquals']) } : undefined,
      isRequired: cellToBool(row['isRequired']),
      options: optionsRaw ? optionsRaw.split(',').map((o) => o.trim()).filter(Boolean) : [],
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, fields };
}
