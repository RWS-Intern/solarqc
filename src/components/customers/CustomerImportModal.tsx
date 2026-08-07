import { useRef, useState } from 'react';
import { CheckCircle2, Download, Upload, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCustomerImport, type CustomerImportRow } from '@/hooks/useCustomerImport';
import { useToast } from '@/components/ui/toast';

interface CustomerImportModalProps {
  open:    boolean;
  onClose: () => void;
}

export function CustomerImportModal({ open, onClose }: CustomerImportModalProps) {
  const { downloadTemplateCsv, parseAndValidate, commitImport, exportErrorsCsv } = useCustomerImport();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows,       setRows]       = useState<CustomerImportRow[] | null>(null);
  const [parsing,    setParsing]    = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragOver,   setDragOver]   = useState(false);
  const [result,     setResult]     = useState<{ succeeded: number; failed: number } | null>(null);

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const errorCount = rows?.filter((r) => r.errors.length > 0).length ?? 0;

  function reset() {
    setRows(null); setParsing(false); setCommitting(false); setDragOver(false); setResult(null);
  }

  function handleClose() {
    if (!parsing && !committing) { reset(); onClose(); }
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('Please upload a .csv file.', 'error');
      return;
    }
    setParsing(true);
    setResult(null);
    try {
      const parsed = await parseAndValidate(file);
      setRows(parsed);
    } catch (err) {
      console.error('[CustomerImportModal] parse failed:', err);
      showToast(err instanceof Error ? err.message : 'Failed to parse file.', 'error');
    } finally {
      setParsing(false);
    }
  }

  async function handleCreate() {
    if (!rows || validCount === 0) return;
    setCommitting(true);
    try {
      const res = await commitImport(rows);
      setResult(res);
      showToast(`Created ${res.succeeded} job${res.succeeded !== 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      console.error('[CustomerImportModal] commit failed:', err);
      showToast(err instanceof Error ? err.message : 'Failed to create jobs.', 'error');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Import Customers</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center gap-4 mt-2 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <p className="text-base font-semibold text-gray-800">
                Created {result.succeeded} job{result.succeeded !== 1 ? 's' : ''}
              </p>
              {result.failed > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {result.failed} row{result.failed !== 1 ? 's' : ''} were not imported (see errors below before closing, or re-open to export them again).
                </p>
              )}
            </div>
            {errorCount > 0 && rows && (
              <Button variant="outline" onClick={() => exportErrorsCsv(rows)} className="flex items-center gap-1.5">
                <Download className="h-4 w-4" />Export error rows
              </Button>
            )}
            <Button onClick={handleClose} className="w-full mt-1">Done</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                Columns: customerName, mobile, district, state, systemSizeKw are required; the rest are optional.
              </p>
              <Button variant="outline" size="sm" onClick={downloadTemplateCsv} className="shrink-0 flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />Template
              </Button>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 cursor-pointer transition-colors',
                dragOver ? 'border-brand-blue bg-blue-50' : 'border-gray-200 hover:border-brand-blue/40 hover:bg-blue-50/30',
              )}
            >
              <Upload className="h-8 w-8 text-gray-400" />
              <p className="text-sm text-gray-600 font-medium">
                {parsing ? 'Parsing…' : 'Click or drag a .csv file here'}
              </p>
              <input
                ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
              />
            </div>

            {rows && (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />{validCount} valid
                  </span>
                  {errorCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" />{errorCount} error{errorCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <Button variant="outline" size="sm" onClick={() => exportErrorsCsv(rows)} className="flex items-center gap-1.5 ml-auto">
                      <Download className="h-3.5 w-3.5" />Export errors
                    </Button>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Row</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Customer</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Mobile</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((row) => (
                          <tr key={row.rowNum} className={row.errors.length > 0 ? 'bg-red-50/50' : ''}>
                            <td className="px-3 py-2 text-gray-400 font-mono">{row.rowNum}</td>
                            <td className="px-3 py-2 text-gray-700">{row.raw['customerName'] || '—'}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono">{row.raw['mobile'] || '—'}</td>
                            <td className="px-3 py-2">
                              {row.errors.length === 0 ? (
                                <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                                  <CheckCircle2 className="h-3.5 w-3.5" />Valid
                                </span>
                              ) : (
                                <span className="text-red-600">{row.errors.join('; ')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={committing}>
                Cancel
              </Button>
              <Button
                type="button" className="flex-1 flex items-center justify-center gap-1.5"
                onClick={handleCreate} disabled={!rows || validCount === 0 || committing}
              >
                {committing ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Creating…</>
                ) : (
                  <><FileSpreadsheet className="h-4 w-4" />Create {validCount} Job{validCount !== 1 ? 's' : ''}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
