import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Save, Check, ChevronRight, Pencil,
  Upload, Download, AlertTriangle, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn }       from '@/lib/utils';
import { exportQcTemplateToExcel, parseQcTemplateExcel } from '@/utils/qcTemplateExcel';
import type { QcFieldDefinition, QcFieldType, Severity } from '@/types/qc';

// ─── Constants ────────────────────────────────────────────────────────────────

const QC_FIELD_TYPE_LABELS: Record<QcFieldType, string> = {
  passfail:       'Pass / Fail / N/A',
  measurement:    'Measurement (number + unit)',
  number:         'Number',
  text:           'Text',
  longtext:       'Long text',
  select:         'Select (options)',
  date:           'Date (calendar)',
  photo_only:     'Photo only',
  signature:      'Signature',
  section_header: 'Section Header (divider)',
};

const QC_FIELD_TYPE_COLOURS: Record<QcFieldType, string> = {
  passfail:       'bg-green-100 text-green-700',
  measurement:    'bg-orange-100 text-orange-700',
  number:         'bg-violet-100 text-violet-700',
  text:           'bg-sky-100 text-sky-700',
  longtext:       'bg-sky-100 text-sky-700',
  select:         'bg-amber-100 text-amber-700',
  date:           'bg-teal-100 text-teal-700',
  photo_only:     'bg-pink-100 text-pink-700',
  signature:      'bg-indigo-100 text-indigo-700',
  section_header: 'bg-gray-100 text-gray-500',
};

const SEVERITY_STYLE: Record<Severity, { active: string; idle: string; label: string }> = {
  critical: { active: 'bg-red-600 text-white',    idle: 'bg-red-50 text-red-600 border border-red-200',       label: 'Critical' },
  major:    { active: 'bg-amber-600 text-white',  idle: 'bg-amber-50 text-amber-700 border border-amber-200', label: 'Major'    },
  minor:    { active: 'bg-gray-500 text-white',   idle: 'bg-gray-50 text-gray-600 border border-gray-200',    label: 'Minor'    },
};

const PHOTO_BEARING_TYPES: QcFieldType[] = ['passfail', 'measurement', 'photo_only'];
const FAIL_AWARE_TYPES: QcFieldType[] = ['passfail', 'measurement'];

function newFieldId(): string {
  return `qc_field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeEmptyField(sortOrder: number): QcFieldDefinition {
  return {
    fieldId: newFieldId(),
    label: '',
    type: 'passfail',
    sortOrder,
    isRequired: true,
    options: [],
    allowNA: true,
    remarkRequiredOnFail: true,
    photoRequiredOnFail: true,
  };
}

function makeEmptySection(sortOrder: number): QcFieldDefinition {
  return {
    fieldId: newFieldId(),
    label: 'New Section',
    type: 'section_header',
    sortOrder,
    isRequired: false,
    options: [],
  };
}

function renumber(fields: QcFieldDefinition[]): QcFieldDefinition[] {
  return fields.map((f, i) => ({ ...f, sortOrder: i }));
}

// ─── Options tag-list input (for `select` type) ────────────────────────────────

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (next: string[]) => void }) {
  const [val, setVal] = useState('');

  function commit() {
    const trimmed = val.trim();
    if (!trimmed || options.includes(trimmed)) return;
    onChange([...options, trimmed]);
    setVal('');
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">Options</Label>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {options.map((opt) => (
            <span key={opt} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              {opt}
              <button type="button" onClick={() => onChange(options.filter((o) => o !== opt))} className="text-amber-400 hover:text-red-500" aria-label={`Remove ${opt}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          placeholder="Type an option…" className="h-9 text-sm flex-1" />
        <button type="button" onClick={commit} disabled={!val.trim()}
          className="flex items-center gap-1 rounded-md border border-brand-blue bg-brand-blue/5 px-3 text-xs font-semibold text-brand-blue hover:bg-brand-blue/10 disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="h-3.5 w-3.5" />Add
        </button>
      </div>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field:      QcFieldDefinition;
  index:      number;
  total:      number;
  otherFields: QcFieldDefinition[];
  expanded:   boolean;
  onExpand:   (fieldId: string | null) => void;
  onChange:   (fieldId: string, patch: Partial<QcFieldDefinition>) => void;
  onDelete:   (fieldId: string) => void;
  onMoveUp:   (index: number) => void;
  onMoveDown: (index: number) => void;
}

function QcFieldRow({ field, index, total, otherFields, expanded, onExpand, onChange, onDelete, onMoveUp, onMoveDown }: FieldRowProps) {
  const typeBadge = QC_FIELD_TYPE_COLOURS[field.type];
  const typeLabel = QC_FIELD_TYPE_LABELS[field.type];
  const isSection = field.type === 'section_header';
  const showsPhotoFields = PHOTO_BEARING_TYPES.includes(field.type);
  const showsFailFields  = FAIL_AWARE_TYPES.includes(field.type);

  if (isSection && !expanded) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-gray-200" />
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onMoveUp(index)} disabled={index === 0} className="rounded p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20" aria-label="Move up">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => onMoveDown(index)} disabled={index === total - 1} className="rounded p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20" aria-label="Move down">
            <ChevronDown className="h-3 w-3" />
          </button>
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">
            {field.label || 'Untitled Section'}
          </span>
          <button type="button" onClick={() => onExpand(field.fieldId)} className="rounded p-0.5 text-gray-300 hover:text-brand-blue" aria-label="Edit section">
            <Pencil className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    );
  }

  if (!expanded) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 cursor-pointer hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors group"
        onClick={() => onExpand(field.fieldId)}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onExpand(field.fieldId); }}
        aria-label={`Edit field: ${field.label || 'Untitled field'}`}
      >
        {field.code && (
          <span className="flex-shrink-0 font-mono text-[10px] text-gray-400 w-8">{field.code}</span>
        )}
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
          {field.label || <span className="text-gray-400 italic">Untitled field</span>}
          {field.isRequired && <span className="text-brand-red ml-0.5 text-xs" aria-hidden>*</span>}
        </span>
        {field.severity && (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', SEVERITY_STYLE[field.severity].idle)}>
            {SEVERITY_STYLE[field.severity].label}
          </span>
        )}
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', typeBadge)}>
          {typeLabel}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-brand-blue shrink-0" />
      </div>
    );
  }

  // ── Expanded edit form ──────────────────────────────────────────────────
  return (
    <div className={cn('rounded-xl border bg-white shadow-sm p-4 flex flex-col gap-3', isSection ? 'border-gray-300' : 'border-brand-blue/30')}>
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue text-xs font-bold">
          {index + 1}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', typeBadge)}>
          {typeLabel}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <button type="button" onClick={() => onMoveUp(index)} disabled={index === 0} className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMoveDown(index)} disabled={index === total - 1} className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDelete(field.fieldId)} className="rounded p-1 text-gray-300 hover:text-red-500" aria-label="Delete field">
            <Trash2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onExpand(null)} className="rounded p-1 text-brand-blue hover:text-brand-navy ml-1" aria-label="Collapse">
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`label-${field.fieldId}`} className="text-xs">Label</Label>
        <Input id={`label-${field.fieldId}`} value={field.label}
          onChange={(e) => onChange(field.fieldId, { label: e.target.value })}
          placeholder={isSection ? 'e.g. 1. Structural & Mounting Integrity' : 'e.g. Structural material'}
          className="h-11 text-sm" autoFocus />
      </div>

      {isSection ? (
        <button type="button" onClick={() => onExpand(null)} className="self-end flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline mt-1">
          <Check className="h-3.5 w-3.5" />Done
        </button>
      ) : (
        <>
          <div className="flex gap-3 flex-wrap">
            <div className="flex flex-col gap-1 w-24">
              <Label htmlFor={`code-${field.fieldId}`} className="text-xs">Code</Label>
              <Input id={`code-${field.fieldId}`} value={field.code ?? ''} onChange={(e) => onChange(field.fieldId, { code: e.target.value })} placeholder="1.1" className="h-10 text-sm" />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <Label htmlFor={`type-${field.fieldId}`} className="text-xs">Field type</Label>
              <select id={`type-${field.fieldId}`} value={field.type}
                onChange={(e) => onChange(field.fieldId, { type: e.target.value as QcFieldType })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {(Object.entries(QC_FIELD_TYPE_LABELS) as [QcFieldType, string][])
                  .filter(([val]) => val !== 'section_header')
                  .map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-1.5">
              <input type="checkbox" id={`req-${field.fieldId}`} checked={field.isRequired}
                onChange={(e) => onChange(field.fieldId, { isRequired: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand-blue accent-brand-blue" />
              <Label htmlFor={`req-${field.fieldId}`} className="text-xs cursor-pointer">Required</Label>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`verify-${field.fieldId}`} className="text-xs">Verify text (shown to the inspector under the label)</Label>
            <Textarea id={`verify-${field.fieldId}`} value={field.verifyText ?? ''} onChange={(e) => onChange(field.fieldId, { verifyText: e.target.value })}
              placeholder="e.g. Mounting structure is HDGI or aluminium — not painted mild steel" className="text-sm min-h-[60px]" />
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <Label htmlFor={`target-${field.fieldId}`} className="text-xs">Target</Label>
              <Input id={`target-${field.fieldId}`} value={field.target ?? ''} onChange={(e) => onChange(field.fieldId, { target: e.target.value })} placeholder="e.g. HDGI / Aluminium" className="h-10 text-sm" />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <Label htmlFor={`method-${field.fieldId}`} className="text-xs">Method</Label>
              <Input id={`method-${field.fieldId}`} value={field.method ?? ''} onChange={(e) => onChange(field.fieldId, { method: e.target.value })} placeholder="e.g. Visual + material cert" className="h-10 text-sm" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Severity</Label>
            <div className="flex gap-2">
              {(Object.keys(SEVERITY_STYLE) as Severity[]).map((sev) => (
                <button key={sev} type="button"
                  onClick={() => onChange(field.fieldId, { severity: field.severity === sev ? undefined : sev })}
                  className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', field.severity === sev ? SEVERITY_STYLE[sev].active : SEVERITY_STYLE[sev].idle)}>
                  {SEVERITY_STYLE[sev].label}
                </button>
              ))}
            </div>
          </div>

          {field.type === 'select' && (
            <OptionsEditor options={field.options ?? []} onChange={(next) => onChange(field.fieldId, { options: next })} />
          )}

          {field.type === 'measurement' && (
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1 w-24">
                <Label className="text-xs">Unit</Label>
                <Input value={field.unit ?? ''} onChange={(e) => onChange(field.fieldId, { unit: e.target.value })} placeholder="Ω, V, A…" className="h-10 text-sm" />
              </div>
              <div className="flex flex-col gap-1 w-28">
                <Label className="text-xs">Expected min</Label>
                <Input type="number" value={field.expectedMin ?? ''} onChange={(e) => onChange(field.fieldId, { expectedMin: e.target.value === '' ? undefined : Number(e.target.value) })} className="h-10 text-sm" />
              </div>
              <div className="flex flex-col gap-1 w-28">
                <Label className="text-xs">Expected max</Label>
                <Input type="number" value={field.expectedMax ?? ''} onChange={(e) => onChange(field.fieldId, { expectedMax: e.target.value === '' ? undefined : Number(e.target.value) })} className="h-10 text-sm" />
              </div>
            </div>
          )}

          {showsPhotoFields && (
            <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" id={`photoreq-${field.fieldId}`} checked={field.photoRequired ?? false}
                  onChange={(e) => onChange(field.fieldId, { photoRequired: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-blue accent-brand-blue" />
                <Label htmlFor={`photoreq-${field.fieldId}`} className="text-xs cursor-pointer">Photo required even to PASS</Label>
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 w-24">
                  <Label className="text-xs">Min photos</Label>
                  <Input type="number" min={0} value={field.minPhotos ?? 0} onChange={(e) => onChange(field.fieldId, { minPhotos: Number(e.target.value) })} className="h-9 text-sm" />
                </div>
                <div className="flex flex-col gap-1 w-24">
                  <Label className="text-xs">Max photos</Label>
                  <Input type="number" min={0} value={field.maxPhotos ?? 5} onChange={(e) => onChange(field.fieldId, { maxPhotos: Number(e.target.value) })} className="h-9 text-sm" />
                </div>
              </div>
            </div>
          )}

          {showsFailFields && (
            <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" id={`na-${field.fieldId}`} checked={field.allowNA ?? false}
                  onChange={(e) => onChange(field.fieldId, { allowNA: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-blue accent-brand-blue" />
                <Label htmlFor={`na-${field.fieldId}`} className="text-xs cursor-pointer">Allow N/A</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id={`remarkfail-${field.fieldId}`} checked={field.remarkRequiredOnFail ?? false}
                  onChange={(e) => onChange(field.fieldId, { remarkRequiredOnFail: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-blue accent-brand-blue" />
                <Label htmlFor={`remarkfail-${field.fieldId}`} className="text-xs cursor-pointer">Remark required on Fail</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id={`photofail-${field.fieldId}`} checked={field.photoRequiredOnFail ?? false}
                  onChange={(e) => onChange(field.fieldId, { photoRequiredOnFail: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-blue accent-brand-blue" />
                <Label htmlFor={`photofail-${field.fieldId}`} className="text-xs cursor-pointer">Photo required on Fail</Label>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Show only if (optional)</Label>
            <div className="flex gap-2">
              <select value={field.showIf?.fieldId ?? ''}
                onChange={(e) => onChange(field.fieldId, {
                  showIf: e.target.value ? { fieldId: e.target.value, equals: field.showIf?.equals ?? '' } : undefined,
                })}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">— No condition —</option>
                {otherFields.filter((f) => f.type !== 'section_header' && f.fieldId !== field.fieldId).map((f) => (
                  <option key={f.fieldId} value={f.fieldId}>{f.code ? `${f.code} — ${f.label}` : f.label}</option>
                ))}
              </select>
              {field.showIf && (
                <Input value={field.showIf.equals} onChange={(e) => onChange(field.fieldId, { showIf: { fieldId: field.showIf!.fieldId, equals: e.target.value } })}
                  placeholder="equals…" className="h-9 text-sm w-32" />
              )}
            </div>
          </div>

          <button type="button" onClick={() => onExpand(null)} className="self-end flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline mt-1">
            <Check className="h-3.5 w-3.5" />Done
          </button>
        </>
      )}
    </div>
  );
}

// ─── TemplateEditor ─────────────────────────────────────────────────────────────

interface TemplateEditorProps {
  template: QcFieldDefinition[];
  onSave:   (fields: QcFieldDefinition[]) => Promise<void>;
}

export function TemplateEditor({ template, onSave }: TemplateEditorProps) {
  const [fields,      setFields]      = useState<QcFieldDefinition[]>([]);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QcFieldDefinition | null>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dirty) {
      setFields([...template].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, dirty]);

  const handleChange = useCallback((fieldId: string, patch: Partial<QcFieldDefinition>) => {
    setFields((prev) => prev.map((f) => (f.fieldId === fieldId ? { ...f, ...patch } : f)));
    setDirty(true);
  }, []);

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setFields((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return renumber(next);
    });
    setDirty(true);
  }

  function handleMoveDown(index: number) {
    setFields((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return renumber(next);
    });
    setDirty(true);
  }

  function handleAddFieldToSection(sectionIndex: number) {
    setFields((prev) => {
      // Insert right before the next section_header after sectionIndex, or at the end.
      let insertAt = prev.length;
      for (let i = sectionIndex + 1; i < prev.length; i++) {
        if (prev[i].type === 'section_header') { insertAt = i; break; }
      }
      const next = [...prev];
      const newField = makeEmptyField(insertAt);
      next.splice(insertAt, 0, newField);
      setExpandedId(newField.fieldId);
      return renumber(next);
    });
    setDirty(true);
  }

  function handleAddSection() {
    setFields((prev) => {
      const newSection = makeEmptySection(prev.length);
      setExpandedId(newSection.fieldId);
      return renumber([...prev, newSection]);
    });
    setDirty(true);
  }

  function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setFields((prev) => renumber(prev.filter((f) => f.fieldId !== deleteTarget.fieldId)));
    setExpandedId(null);
    setDeleteTarget(null);
    setDirty(true);
  }

  async function handleSaveClick() {
    setExpandedId(null);
    setSaving(true);
    try {
      const normalised = renumber(fields);
      await onSave(normalised);
      setFields(normalised);
      setDirty(false);
    } catch {
      // error already toasted by onSave
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    exportQcTemplateToExcel(fields);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await parseQcTemplateExcel(file);
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    setImportErrors(null);
    setFields(renumber(result.fields));
    setExpandedId(null);
    setDirty(true);
  }

  // Build the list of section start indices, for per-section "Add field" buttons.
  const sectionIndices = fields.reduce<number[]>((acc, f, i) => {
    if (f.type === 'section_header') acc.push(i);
    return acc;
  }, []);

  const totalPoints = fields.filter((f) => f.type !== 'section_header').length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
        <p className="text-sm text-gray-500">
          {totalPoints} check point{totalPoints !== 1 ? 's' : ''} across {sectionIndices.length} section{sectionIndices.length !== 1 ? 's' : ''}
          {dirty && <span className="ml-2 text-amber-600 font-medium">• Unsaved changes</span>}
        </p>
        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
          <Button type="button" variant="outline" onClick={handleExport} className="flex items-center gap-1.5 h-11">
            <Download className="h-4 w-4" />Export
          </Button>
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 h-11">
            <Upload className="h-4 w-4" />Import
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
          <Button onClick={handleSaveClick} disabled={!dirty || saving} className="flex items-center justify-center gap-1.5 h-11">
            {saving ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
            ) : (
              <><Save className="h-4 w-4" />Save</>
            )}
          </Button>
        </div>
      </div>

      {importErrors && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4 text-sm text-red-800">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Import rejected — nothing was applied
            </span>
            <button type="button" onClick={() => setImportErrors(null)} className="text-red-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {importErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400 mb-4">
          <p className="mb-1 font-medium">No checklist points yet</p>
          <p>Add a section to start building the checklist.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-2">
          {fields.map((field, index) => {
            const isLastInSection = field.type === 'section_header'
              || index === fields.length - 1
              || fields[index + 1].type === 'section_header';
            return (
              <div key={field.fieldId}>
                <QcFieldRow
                  field={field}
                  index={index}
                  total={fields.length}
                  otherFields={fields}
                  expanded={expandedId === field.fieldId}
                  onExpand={setExpandedId}
                  onChange={handleChange}
                  onDelete={(fieldId) => setDeleteTarget(fields.find((f) => f.fieldId === fieldId) ?? null)}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
                {isLastInSection && field.type !== 'section_header' && (
                  <button
                    type="button"
                    onClick={() => handleAddFieldToSection(sectionIndices.filter((si) => si <= index).pop() ?? 0)}
                    className="w-full mt-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 py-2 text-xs font-medium text-gray-500 hover:border-brand-blue/40 hover:text-brand-blue transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />Add point to this section
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button variant="outline" onClick={handleAddSection} className="w-full flex items-center gap-2 border-dashed mt-3">
        <Plus className="h-4 w-4" />Add Section
      </Button>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm" aria-describedby="delete-field-desc">
          <DialogHeader>
            <DialogTitle>Delete this {deleteTarget?.type === 'section_header' ? 'section' : 'check point'}?</DialogTitle>
            <DialogDescription id="delete-field-desc">
              &ldquo;{deleteTarget?.label || 'Untitled'}&rdquo; will be removed from the checklist. This only affects
              new jobs created after saving — any job already in progress keeps its own snapshot of the
              checklist as it was when the job was created.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0" onClick={handleDeleteConfirmed}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
