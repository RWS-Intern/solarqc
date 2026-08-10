import * as XLSX from 'xlsx';
import { QC_STATUS_LABELS } from '@/config/qcStatus';
import type { QcJob } from '@/types/qc';

// Job records, not the checklist definition — see qcTemplateExcel.ts for
// that. One row per QC job, scoped to whatever's currently filtered/
// visible on ReportsPage, not an unconditional full-database export.

function dateStr(d: Date | null): string {
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}

function verdictLabel(v: QcJob['verdict']): string {
  if (!v) return '';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

// A single source of truth for header, value, and width together — the
// plan's own note on the old export's Sheet 1 applies here too: a
// hand-maintained parallel !cols array drifts out of sync with the row
// keys the moment one changes without the other. Keeping them paired
// makes that impossible.
const COLUMNS: Array<{ header: string; width: number; getValue: (j: QcJob) => string | number }> = [
  { header: 'QC #',           width: 12, getValue: (j) => j.qcNum },
  { header: 'Customer',       width: 28, getValue: (j) => j.customer.name },
  { header: 'District',       width: 16, getValue: (j) => j.customer.district },
  { header: 'State',          width: 14, getValue: (j) => j.customer.state },
  { header: 'Status',         width: 16, getValue: (j) => QC_STATUS_LABELS[j.status] },
  { header: 'Verdict',        width: 14, getValue: (j) => verdictLabel(j.verdict) },
  { header: 'Round',          width: 8,  getValue: (j) => j.reworkRound + 1 },
  { header: 'Inspector',      width: 20, getValue: (j) => j.inspectorName },
  { header: 'Approver',       width: 20, getValue: (j) => j.approverName },
  { header: 'Total Points',   width: 12, getValue: (j) => j.tally.total },
  { header: 'Answered',       width: 10, getValue: (j) => j.tally.answered },
  { header: 'Pass',           width: 8,  getValue: (j) => j.tally.pass },
  { header: 'Fail',           width: 8,  getValue: (j) => j.tally.fail },
  { header: 'N/A',            width: 8,  getValue: (j) => j.tally.na },
  { header: 'Critical Fails', width: 14, getValue: (j) => j.tally.criticalFail },
  { header: 'Major Fails',    width: 14, getValue: (j) => j.tally.majorFail },
  { header: 'Minor Fails',    width: 14, getValue: (j) => j.tally.minorFail },
  { header: 'Submitted',      width: 14, getValue: (j) => dateStr(j.submittedAt) },
  { header: 'Reviewed',       width: 14, getValue: (j) => dateStr(j.reviewedAt) },
  { header: 'Completed',      width: 14, getValue: (j) => dateStr(j.completedAt) },
  { header: 'Report',         width: 16, getValue: (j) => (j.reportUrl ? 'Generated' : 'Not generated') },
  { header: 'Report URL',     width: 50, getValue: (j) => j.reportUrl ?? '' },
];

export function exportQcJobsToExcel(jobs: QcJob[]): void {
  const sorted = [...jobs].sort((a, b) => a.qcNum.localeCompare(b.qcNum));

  const rows = sorted.map((j) => {
    const row: Record<string, string | number> = {};
    for (const col of COLUMNS) row[col.header] = col.getValue(j);
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}], {
    header: COLUMNS.map((c) => c.header),
  });

  // Make the Report URL column a clickable hyperlink, same convention as
  // exportTasksToExcel.ts.
  const reportUrlColIndex = COLUMNS.findIndex((c) => c.header === 'Report URL');
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: reportUrlColIndex });
    const cell = ws[addr];
    if (cell && typeof cell.v === 'string' && cell.v.startsWith('http')) {
      cell.l = { Target: cell.v, Tooltip: 'Open certificate' };
    }
  }

  ws['!cols'] = COLUMNS.map((c) => ({ wch: c.width }));
  XLSX.utils.book_append_sheet(wb, ws, 'QC Jobs');

  const filename = `solarqc_jobs_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
