import { useState, useRef } from 'react';
import Papa from 'papaparse';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button }  from '@/components/ui/button';
import { cn }      from '@/lib/utils';
import { Download, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { useFieldEngineers }   from '@/hooks/useFieldEngineers';
import { useBulkTaskActions }  from '@/hooks/useBulkTaskActions';
import { useToast }            from '@/components/ui/toast';
import type { BulkTaskRow }    from '@/hooks/useBulkTaskActions';
import { checkDuplicateConsumerMobile } from '@/utils/checkDuplicateMobile';
import { useAppConfig }                 from '@/hooks/useAppConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowNum:                 number;
  title:                  string;
  description:            string;
  consumerMobile:         string;
  engineerCode:           string;
  dueDate:                string;
  state:                  string;
  district:               string;
  leadSource:             string;
  leadSourceEmployeeName: string;
  leadGeneratedByCode:    string;
  valid:                  boolean;
  error:                  string;
  resolved:               BulkTaskRow | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadTemplate() {
  const csv = [
    'title,description,consumerMobile,engineerCode,dueDate,state,district,leadSource,leadSourceEmployeeName,leadGeneratedByCode',
    '"Rooftop inspection - Site A","Check panel condition","9876543210","ENG-001","2026-07-01","Maharashtra","Nagpur","Field Engineer","","ENG-001"',
    '"Site survey - Kothrud","","9000011111","","","Maharashtra","","Employee","Ravi Kumar",""',
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'solarops_tasks_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isValidDate(str: string): boolean {
  if (!str.trim()) return true; // optional
  return /^\d{4}-\d{2}-\d{2}$/.test(str.trim()) && !isNaN(new Date(str.trim()).getTime());
}

// ─── Component ────────────────────────────────────────────────────────────────

interface BulkTaskModalProps {
  open:    boolean;
  onClose: () => void;
}

export function BulkTaskModal({ open, onClose }: BulkTaskModalProps) {
  const { engineers }        = useFieldEngineers();
  const { createBulkTasks }  = useBulkTaskActions();
  const { showToast }        = useToast();
  const { config }           = useAppConfig();
  const fileInputRef         = useRef<HTMLInputElement>(null);

  const [rows,       setRows]       = useState<ParsedRow[]>([]);
  const [creating,   setCreating]   = useState(false);
  const [progress,   setProgress]   = useState({ current: 0, total: 0 });
  const [fileName,   setFileName]   = useState('');

  function reset() {
    setRows([]);
    setCreating(false);
    setProgress({ current: 0, total: 0 });
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    if (creating) return;
    reset();
    onClose();
  }

  function parseFile(file: File) {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header:          true,
      skipEmptyLines:  true,
      complete: async (results) => {
        const parsed: ParsedRow[] = await Promise.all(results.data.map(async (raw, i) => {
          const rowNum         = i + 2; // 1-indexed, header is row 1
          const title                  = (raw['title']                  ?? '').trim();
          const description            = (raw['description']            ?? '').trim();
          const consumerMobile         = (raw['consumerMobile']         ?? '').replace(/\D/g, '').trim();
          const engineerCode           = (raw['engineerCode']           ?? '').trim();
          const dueDate                = (raw['dueDate']                ?? '').trim();
          const state                  = (raw['state']                  ?? '').trim();
          const district               = (raw['district']               ?? '').trim();
          const leadSource             = (raw['leadSource']             ?? '').trim();
          const leadSourceEmployeeName = (raw['leadSourceEmployeeName'] ?? '').trim();
          const leadGeneratedByCode    = (raw['leadGeneratedByCode']    ?? '').trim();

          const baseRow = { rowNum, title, description, consumerMobile, engineerCode, dueDate, state, district, leadSource, leadSourceEmployeeName, leadGeneratedByCode };

          // Validate
          if (!title) {
            return { ...baseRow, valid: false, error: 'Title is required', resolved: null };
          }

          if (!/^\d{10}$/.test(consumerMobile)) {
            return { ...baseRow, valid: false, error: 'Consumer mobile number is required and must be exactly 10 digits', resolved: null };
          }

          let engineer = null;
          if (engineerCode) {
            const found = engineers.find((e) => e.engineerCode === engineerCode);
            if (!found) {
              return { ...baseRow, valid: false, error: `Engineer "${engineerCode}" not found`, resolved: null };
            }
            engineer = found;
          }

          if (dueDate && !isValidDate(dueDate)) {
            return { ...baseRow, valid: false, error: 'Due date must be YYYY-MM-DD', resolved: null };
          }

          if (state && district) {
            const validDistricts = config.districtsByState?.[state] ?? [];
            if (validDistricts.length > 0 && !validDistricts.includes(district)) {
              return { ...baseRow, valid: false, error: 'District does not belong to the selected state', resolved: null };
            }
          }

          let leadGeneratedByUid: string | null = null;
          let leadGeneratedByName: string = '';
          if (leadSource.toLowerCase() === 'field engineer' && leadGeneratedByCode) {
            const found = engineers.find((e) => e.engineerCode === leadGeneratedByCode);
            if (!found) {
              return { ...baseRow, valid: false, error: `Lead generated by engineer "${leadGeneratedByCode}" not found`, resolved: null };
            }
            leadGeneratedByUid  = found.uid;
            leadGeneratedByName = found.displayName;
          }

          let duplicate = null;
          try {
            duplicate = await checkDuplicateConsumerMobile(consumerMobile);
          } catch (checkErr) {
            console.error(`[BulkTaskModal] duplicate check failed for row ${rowNum}:`, checkErr);
            return {
              ...baseRow,
              valid: false,
              error: 'Could not verify this row against existing leads — check your connection and re-upload.',
              resolved: null,
            };
          }
          if (duplicate) {
            return {
              ...baseRow,
              valid: false,
              error: `Duplicate: this mobile number already exists on lead ${duplicate.taskNum} (${duplicate.title})`,
              resolved: null,
            };
          }

          const resolved: BulkTaskRow = {
            title,
            description,
            consumerMobile,
            state:                   state                 || undefined,
            district:                district              || undefined,
            leadSource:              leadSource            || undefined,
            leadSourceEmployeeName:  leadSourceEmployeeName || undefined,
            leadGeneratedByUid:      leadGeneratedByUid,
            leadGeneratedByName:     leadGeneratedByName   || undefined,
            engineer,
            dueDate: dueDate ? new Date(dueDate) : null,
          };

          return { ...baseRow, valid: true, error: '', resolved };
        }));

        const seenMobiles = new Map<string, number>();
        const finalRows = parsed.map((row) => {
          if (!row.valid || !row.resolved) return row;
          const mobile = row.consumerMobile;
          if (seenMobiles.has(mobile)) {
            return {
              ...row,
              valid: false,
              error: `Duplicate: same mobile number also appears in row ${seenMobiles.get(mobile)} of this file`,
              resolved: null,
            };
          }
          seenMobiles.set(mobile, row.rowNum);
          return row;
        });

        setRows(finalRows);
      },
      error: () => {
        showToast('Failed to parse CSV file.', 'error');
      },
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  const validRows  = rows.filter((r) => r.valid);
  const errorRows  = rows.filter((r) => !r.valid);

  async function handleCreate() {
    if (validRows.length === 0) return;
    setCreating(true);
    setProgress({ current: 0, total: validRows.length });

    const validResolved = validRows.map((r) => r.resolved!);

    let succeeded = 0, failed = 0;
    try {
      ({ succeeded, failed } = await createBulkTasks(validResolved, (current, total) => {
        setProgress({ current, total });
      }));
    } catch (err) {
      setCreating(false);
      showToast(err instanceof Error ? err.message : 'Upload failed. Try again.', 'error');
      return;
    }

    setCreating(false);
    if (succeeded > 0) {
      showToast(`${succeeded} task${succeeded !== 1 ? 's' : ''} created successfully`, 'success');
    }
    if (failed > 0) {
      showToast(`${failed} task${failed !== 1 ? 's' : ''} failed to create`, 'error');
    }
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Bulk Task Upload</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">

          {/* A. Download template */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Download Template</p>
              <p className="text-xs text-gray-500 mt-0.5">CSV format: title, description, consumerMobile, engineerCode, dueDate, state, district, leadSource, leadSourceEmployeeName, leadGeneratedByCode</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="flex items-center gap-1.5 shrink-0">
              <Download className="h-3.5 w-3.5" />
              Template
            </Button>
          </div>

          {/* B. File upload */}
          <div
            className={cn(
              'rounded-xl border-2 border-dashed transition-colors cursor-pointer',
              fileName ? 'border-brand-blue/40 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300',
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
              <Upload className={cn('h-8 w-8', fileName ? 'text-brand-blue' : 'text-gray-300')} />
              {fileName ? (
                <p className="text-sm font-medium text-brand-blue">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-600">Click to upload CSV</p>
                  <p className="text-xs text-gray-400">Accepts .csv files only</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* C/D. Preview table */}
          {rows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-800">Preview</p>
                <p className="text-xs text-gray-500">
                  <span className="text-green-600 font-medium">{validRows.length} valid</span>
                  {errorRows.length > 0 && (
                    <span className="text-brand-red font-medium">, {errorRows.length} error{errorRows.length !== 1 ? 's' : ''}</span>
                  )}
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 w-10">#</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 max-w-[160px]">Title</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 max-w-[160px]">Description</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Consumer Mobile</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Engineer</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Due Date</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">State</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">District</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Lead Source</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNum} className={cn(
                        'border-b border-gray-50 last:border-0',
                        !row.valid && 'bg-red-50/50',
                      )}>
                        <td className="px-3 py-2 text-gray-400">{row.rowNum}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px]">
                          <span className="block truncate" title={row.title || ''}>{row.title || '—'}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[160px]">
                          <span className="block truncate" title={row.description || ''}>{row.description || '—'}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 font-mono">{row.consumerMobile || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.engineerCode || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.dueDate || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.state || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.district || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.leadSource || '—'}</td>
                        <td className="px-3 py-2">
                          {row.valid ? (
                            <span className="flex items-center gap-1 text-green-600 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                            </span>
                          ) : (
                            <span className="flex items-start gap-1 text-brand-red font-medium">
                              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span className="leading-tight">{row.error}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* F. Progress */}
          {creating && (
            <div className="rounded-xl border border-brand-blue/20 bg-blue-50 px-4 py-3 text-sm text-brand-blue font-medium text-center">
              Creating tasks… ({progress.current} of {progress.total})
            </div>
          )}

          {/* E. Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={creating || validRows.length === 0}
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating…
                </span>
              ) : (
                `Create ${validRows.length} Valid Task${validRows.length !== 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
