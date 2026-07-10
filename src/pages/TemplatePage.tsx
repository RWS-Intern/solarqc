import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Plus, Trash2, ChevronUp, ChevronDown, Save, Check, X, ChevronRight, Pencil, Route, FileText } from 'lucide-react';
import { useAppConfig }       from '@/hooks/useAppConfig';
import { useTemplateActions } from '@/hooks/useTemplateActions';
import { _emitToast }         from '@/components/ui/toast';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { cn }      from '@/lib/utils';
import type { FieldDefinition, FieldType, JourneyStepDefinition } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  yesno:          'Yes / No',
  text:           'Text',
  mobile:         'Mobile Number (10 digits)',
  number:         'Number',
  select:         'Select (options)',
  photo_only:     'Photo only',
  date:           'Date (calendar)',
  measurement:    'Measurement (number + unit)',
  age:            'Age (years + months)',
  section_header: 'Section Header (divider)',
};

const FIELD_TYPE_COLOURS: Partial<Record<FieldType, string>> = {
  yesno:          'bg-green-100 text-green-700',
  text:           'bg-sky-100 text-sky-700',
  mobile:         'bg-cyan-100 text-cyan-700',
  number:         'bg-violet-100 text-violet-700',
  select:         'bg-amber-100 text-amber-700',
  photo_only:     'bg-pink-100 text-pink-700',
  date:           'bg-teal-100 text-teal-700',
  measurement:    'bg-orange-100 text-orange-700',
  age:            'bg-indigo-100 text-indigo-700',
  section_header: 'bg-gray-100 text-gray-500',
};

function newFieldId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeEmptyField(sortOrder: number): FieldDefinition {
  return {
    fieldId:    newFieldId(),
    label:      '',
    type:       'yesno',
    isRequired: true,
    options:    [],
    sortOrder,
    unit:       '',
  };
}

// ─── AddOptionInput ───────────────────────────────────────────────────────────

function AddOptionInput({ onAdd }: { onAdd: (opt: string) => void }) {
  const [val, setVal] = useState('');

  function commit() {
    const trimmed = val.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setVal('');
  }

  return (
    <div className="flex gap-2 mt-1">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        placeholder="Type an option…"
        className="h-9 text-sm flex-1"
      />
      <button
        type="button"
        onClick={commit}
        disabled={!val.trim()}
        className="flex items-center gap-1 rounded-md border border-brand-blue bg-brand-blue/5 px-3 text-xs font-semibold text-brand-blue hover:bg-brand-blue/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </button>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field:        FieldDefinition;
  index:        number;
  total:        number;
  expanded:     boolean;
  onExpand:     (i: number) => void;
  onChange:     (index: number, patch: Partial<FieldDefinition>) => void;
  onDelete:     (index: number) => void;
  onMoveUp:     (index: number) => void;
  onMoveDown:   (index: number) => void;
}

function FieldRow({
  field, index, total, expanded, onExpand, onChange, onDelete, onMoveUp, onMoveDown,
}: FieldRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeBadge = FIELD_TYPE_COLOURS[field.type] ?? 'bg-gray-100 text-gray-500';
  const typeLabel = FIELD_TYPE_LABELS[field.type];

  // ── Collapsed section_header ─────────────────────────────────────────────
  if (!expanded && field.type === 'section_header') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-gray-200" />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {field.label || 'Untitled Section'}
          </span>
          <button
            type="button"
            onClick={() => onExpand(index)}
            className="rounded p-0.5 text-gray-300 hover:text-brand-blue"
            aria-label="Edit section"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    );
  }

  // ── Collapsed regular field ───────────────────────────────────────────────
  if (!expanded) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 cursor-pointer hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors group"
        onClick={() => onExpand(index)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onExpand(index); }}
        aria-label={`Edit field: ${field.label || 'Untitled field'}`}
      >
        <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue text-[10px] font-bold">
          {index + 1}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
          {field.label || <span className="text-gray-400 italic">Untitled field</span>}
          {field.isRequired && <span className="text-brand-red ml-0.5 text-xs" aria-hidden>*</span>}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', typeBadge)}>
          {typeLabel}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-brand-blue shrink-0" />
      </div>
    );
  }

  // ── Expanded edit form ────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-brand-blue/30 bg-white shadow-sm p-4 flex flex-col gap-3">
      {/* Row header */}
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue text-xs font-bold">
          {index + 1}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', typeBadge)}>
          {typeLabel}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={index === total - 1}
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1 ml-1">
              <span className="text-xs text-red-600 font-medium">Delete?</span>
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="rounded px-2 py-0.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1 text-gray-300 hover:text-red-500"
              aria-label="Delete field"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onExpand(-1)}
            className="rounded p-1 text-brand-blue hover:text-brand-navy ml-1"
            aria-label="Collapse"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Label */}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`label-${field.fieldId}`} className="text-xs">Label</Label>
        <Input
          id={`label-${field.fieldId}`}
          value={field.label}
          onChange={(e) => onChange(index, { label: e.target.value })}
          placeholder="e.g. Panel Condition"
          className="h-11 text-sm"
          autoFocus
        />
      </div>

      {/* Type + Required row */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <Label htmlFor={`type-${field.fieldId}`} className="text-xs">Field type</Label>
          <select
            id={`type-${field.fieldId}`}
            value={field.type}
            onChange={(e) => onChange(index, { type: e.target.value as FieldType, options: [] })}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {(Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {field.type !== 'section_header' && (
          <div className="flex items-center gap-2 pb-1.5">
            <input
              type="checkbox"
              id={`req-${field.fieldId}`}
              checked={field.isRequired}
              onChange={(e) => onChange(index, { isRequired: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-blue accent-brand-blue"
            />
            <Label htmlFor={`req-${field.fieldId}`} className="text-xs cursor-pointer">Required</Label>
          </div>
        )}
      </div>

      {/* Options — only for select type */}
      {field.type === 'select' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Options</Label>
          {field.options.length > 0 && (
            <div className="flex flex-col gap-1 mb-1">
              {field.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5">
                  <span className="flex-1 text-sm text-gray-700">{opt}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = field.options.filter((_, j) => j !== oi);
                      onChange(index, { options: next });
                    }}
                    className="text-gray-300 hover:text-red-500"
                    aria-label={`Remove option ${opt}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <AddOptionInput
            onAdd={(opt) => {
              if (!field.options.includes(opt)) {
                onChange(index, { options: [...field.options, opt] });
              }
            }}
          />
        </div>
      )}

      {/* Unit — for measurement type */}
      {field.type === 'measurement' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Unit label</Label>
          <Input
            value={field.unit ?? ''}
            onChange={(e) => onChange(index, { unit: e.target.value })}
            placeholder="e.g. mtr, sq.mtr, KW, KVA"
            className="h-9 text-sm"
          />
          <p className="text-xs text-gray-400">
            Shown next to the number input on the engineer&apos;s form
          </p>
        </div>
      )}

      {/* Subtitle — for section_header type */}
      {field.type === 'section_header' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Subtitle (optional)</Label>
          <Input
            value={field.unit ?? ''}
            onChange={(e) => onChange(index, { unit: e.target.value })}
            placeholder="Optional subtitle text below the divider"
            className="h-9 text-sm"
          />
        </div>
      )}

      {/* Collapse button */}
      <button
        type="button"
        onClick={() => onExpand(-1)}
        className="self-end flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline mt-1"
      >
        <Check className="h-3.5 w-3.5" />
        Done
      </button>
    </div>
  );
}

// ─── Application Journey Editor ───────────────────────────────────────────────

function newStepId() {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function ApplicationJourneyEditor() {
  const { config, loading }          = useAppConfig();
  const { saveBackendJourneySteps }  = useTemplateActions();

  const [journeyTab,  setJourneyTab]  = useState<'cash' | 'loan'>('cash');
  const [cashFields,  setCashFields]  = useState<JourneyStepDefinition[]>([]);
  const [loanFields,  setLoanFields]  = useState<JourneyStepDefinition[]>([]);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (!loading) {
      setCashFields([...(config.backendCashSteps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
      setLoanFields([...(config.backendLoanSteps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.backendCashSteps?.length, config.backendLoanSteps?.length, loading]);

  function handleStepLabelChange(idx: number, value: string, isLoan: boolean) {
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => { const next = [...prev]; next[idx] = { ...next[idx], label: value }; return next; });
    setDirty(true);
  }

  function handleMoveStepUp(idx: number, isLoan: boolean) {
    if (idx === 0) return;
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => { const next = [...prev]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next; });
    setDirty(true);
  }

  function handleMoveStepDown(idx: number, isLoan: boolean) {
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next;
    });
    setDirty(true);
  }

  function handleDeleteStep(idx: number, isLoan: boolean) {
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  function handleAddStep(isLoan: boolean) {
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => [
      ...prev,
      { stepId: newStepId(), label: '', type: 'yesno', sortOrder: prev.length },
    ]);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveBackendJourneySteps(
        cashFields.map((f, i) => ({ ...f, sortOrder: i })),
        loanFields.map((f, i) => ({ ...f, sortOrder: i })),
      );
      setDirty(false);
    } catch {
      // error toasted in saveBackendJourneySteps
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    );
  }

  const fields   = journeyTab === 'loan' ? loanFields : cashFields;
  const isLoan   = journeyTab === 'loan';

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-sm text-gray-500 flex-1">
          Define the step-by-step journey shown to the backend team for each payment type.
        </p>
        <Button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 h-11"
        >
          {saving ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
          ) : (
            <><Save className="h-4 w-4" />Save</>
          )}
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit mb-4">
        <button
          type="button"
          onClick={() => setJourneyTab('cash')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
            journeyTab === 'cash'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          💵 Cash ({cashFields.length} steps)
        </button>
        <button
          type="button"
          onClick={() => setJourneyTab('loan')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
            journeyTab === 'loan'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          🏦 Loan ({loanFields.length} steps)
        </button>
      </div>

      {/* Step list */}
      {fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400 mb-4">
          <p className="mb-1 font-medium">No steps yet</p>
          <p>Add steps to build the {isLoan ? 'loan' : 'cash'} journey.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {fields.map((step, idx) => (
            <div
              key={step.stepId}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
            >
              <span className="text-xs font-mono text-gray-400 w-6 shrink-0">
                {idx + 1}.
              </span>
              <input
                type="text"
                value={step.label}
                onChange={(e) => handleStepLabelChange(idx, e.target.value, isLoan)}
                className="flex-1 text-sm text-gray-800 bg-transparent border-none outline-none min-w-0"
                placeholder="Step label..."
              />
              <span className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                step.type === 'photo'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200',
              )}>
                {step.type === 'photo' ? '📷 Photo + Date' : '✓ Yes/No + Date'}
              </span>
              <button
                type="button"
                onClick={() => handleMoveStepUp(idx, isLoan)}
                disabled={idx === 0}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                aria-label="Move up"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleMoveStepDown(idx, isLoan)}
                disabled={idx === fields.length - 1}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                aria-label="Move down"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStep(idx, isLoan)}
                className="text-red-400 hover:text-red-600"
                aria-label="Delete step"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        onClick={() => handleAddStep(isLoan)}
        className="w-full flex items-center gap-2 border-dashed"
      >
        <Plus className="h-4 w-4" />
        Add Step
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TemplatePage() {
  const { config, loading }  = useAppConfig();
  const { saveTemplate, saveDocumentTemplate, saveDistricts } = useTemplateActions();

  const [activeTab, setActiveTab] = useState<'survey' | 'documents' | 'backend'>('survey');

  const [fields,      setFields]      = useState<FieldDefinition[]>([]);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const [docFields,      setDocFields]      = useState<FieldDefinition[]>([]);
  const [docDirty,       setDocDirty]       = useState(false);
  const [docSaving,      setDocSaving]      = useState(false);
  const [docExpandedIdx, setDocExpandedIdx] = useState<number | null>(null);

  const [districts,       setDistricts]       = useState<string[]>([]);
  const [newDistrict,     setNewDistrict]      = useState('');
  const [districtsDirty,  setDistrictsDirty]  = useState(false);
  const [savingDistricts, setSavingDistricts]  = useState(false);

  useEffect(() => {
    if (!loading && !districtsDirty) {
      setDistricts(config.districts ?? []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.districts, loading]);

  function handleAddDistrict() {
    const val = newDistrict.trim();
    if (!val || districts.includes(val)) return;
    setDistricts((prev) => [...prev, val]);
    setNewDistrict('');
    setDistrictsDirty(true);
  }

  function handleRemoveDistrict(d: string) {
    setDistricts((prev) => prev.filter((x) => x !== d));
    setDistrictsDirty(true);
  }

  async function handleSaveDistricts() {
    setSavingDistricts(true);
    try {
      await saveDistricts(districts);
      setDistrictsDirty(false);
    } catch {
      // toast shown by saveDistricts
    } finally {
      setSavingDistricts(false);
    }
  }

  useEffect(() => {
    if (!loading && !dirty) {
      setFields(
        [...config.taskTemplate].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.taskTemplate, loading]);

  const handleChange = useCallback((index: number, patch: Partial<FieldDefinition>) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setDirty(true);
  }, []);

  function handleExpand(i: number) {
    setExpandedIdx(i === -1 ? null : i);
  }

  function handleAddField() {
    setFields((prev) => {
      const newIdx = prev.length;
      setExpandedIdx(newIdx);
      return [...prev, makeEmptyField(newIdx)];
    });
    setDirty(true);
  }

  function handleDelete(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
    setExpandedIdx(null);
    setDirty(true);
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setFields((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    if (expandedIdx === index)          setExpandedIdx(index - 1);
    else if (expandedIdx === index - 1) setExpandedIdx(index);
    setDirty(true);
  }

  function handleMoveDown(index: number) {
    setFields((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    if (expandedIdx === index)          setExpandedIdx(index + 1);
    else if (expandedIdx === index + 1) setExpandedIdx(index);
    setDirty(true);
  }

  async function handleSave() {
    setExpandedIdx(null);
    const normalised = fields.map((f, i) => ({ ...f, sortOrder: i }));
    setSaving(true);
    try {
      await saveTemplate(normalised);
      setDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Config not found')) {
        _emitToast('Template config not found. Please refresh.', 'error');
      }
      // other errors already toasted by saveTemplate
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!loading && !docDirty) {
      setDocFields(
        [...(config.documentTemplate ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.documentTemplate, loading]);

  const handleDocChange = useCallback((index: number, patch: Partial<FieldDefinition>) => {
    setDocFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setDocDirty(true);
  }, []);

  function handleDocExpand(i: number) {
    setDocExpandedIdx(i === -1 ? null : i);
  }

  function handleDocAddField() {
    setDocFields((prev) => {
      const newIdx = prev.length;
      setDocExpandedIdx(newIdx);
      return [...prev, makeEmptyField(newIdx)];
    });
    setDocDirty(true);
  }

  function handleDocDelete(index: number) {
    setDocFields((prev) => prev.filter((_, i) => i !== index));
    setDocExpandedIdx(null);
    setDocDirty(true);
  }

  function handleDocMoveUp(index: number) {
    if (index === 0) return;
    setDocFields((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    if (docExpandedIdx === index)          setDocExpandedIdx(index - 1);
    else if (docExpandedIdx === index - 1) setDocExpandedIdx(index);
    setDocDirty(true);
  }

  function handleDocMoveDown(index: number) {
    setDocFields((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    if (docExpandedIdx === index)          setDocExpandedIdx(index + 1);
    else if (docExpandedIdx === index + 1) setDocExpandedIdx(index);
    setDocDirty(true);
  }

  async function handleSaveDocuments() {
    setDocExpandedIdx(null);
    const normalised = docFields.map((f, i) => ({ ...f, sortOrder: i }));
    setDocSaving(true);
    try {
      await saveDocumentTemplate(normalised);
      setDocDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Config not found')) {
        _emitToast('Template config not found. Please refresh.', 'error');
      }
      // other errors already toasted by saveDocumentTemplate
    } finally {
      setDocSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Template</h1>
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Page header */}
      <h1 className="text-xl font-bold text-gray-900 mb-4">Template</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 mb-5">
        <button
          type="button"
          onClick={() => setActiveTab('survey')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
            activeTab === 'survey'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          Survey Checklist
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
            activeTab === 'documents'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <FileText className="h-4 w-4" />
          Documents
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('backend')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
            activeTab === 'backend'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <Route className="h-4 w-4" />
          Application Journey
        </button>
      </div>

      {/* Survey tab */}
      {activeTab === 'survey' && (
        <>
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
            <p className="text-sm text-gray-500">
              {fields.length} field{fields.length !== 1 ? 's' : ''} — applied to all new tasks
            </p>
            <Button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-1.5 h-11"
            >
              {saving ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
              ) : (
                <><Save className="h-4 w-4" />Save</>
              )}
            </Button>
          </div>

          {/* Warning banner */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-5 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Saving updates all <strong>active tasks</strong> (pending, in progress, blocked) automatically. Completed tasks are never changed.
            </span>
          </div>

          {/* Field list */}
          {fields.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400 mb-4">
              <p className="mb-1 font-medium">No fields yet</p>
              <p>Add the first field below to start building the template.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {fields.map((field, index) => (
                <FieldRow
                  key={field.fieldId}
                  field={field}
                  index={index}
                  total={fields.length}
                  expanded={expandedIdx === index}
                  onExpand={handleExpand}
                  onChange={handleChange}
                  onDelete={handleDelete}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              ))}
            </div>
          )}

          <Button
            variant="outline"
            onClick={handleAddField}
            className="w-full flex items-center gap-2 border-dashed"
          >
            <Plus className="h-4 w-4" />
            Add Field
          </Button>
        </>
      )}

      {/* Documents tab */}
      {activeTab === 'documents' && (
        <>
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
            <p className="text-sm text-gray-500">
              {docFields.length} field{docFields.length !== 1 ? 's' : ''} — collected during the Documents stage
            </p>
            <Button
              onClick={handleSaveDocuments}
              disabled={!docDirty || docSaving}
              className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-1.5 h-11"
            >
              {docSaving ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
              ) : (
                <><Save className="h-4 w-4" />Save</>
              )}
            </Button>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mb-5 text-sm text-blue-800">
            <FileText className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
            <span>
              This is the Document Collection template used during the Documents pipeline stage. Saving does not modify tasks already in progress.
            </span>
          </div>

          {/* Field list */}
          {docFields.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400 mb-4">
              <p className="mb-1 font-medium">No fields yet</p>
              <p>Add the first field below to start building the Document Collection template.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {docFields.map((field, index) => (
                <FieldRow
                  key={field.fieldId}
                  field={field}
                  index={index}
                  total={docFields.length}
                  expanded={docExpandedIdx === index}
                  onExpand={handleDocExpand}
                  onChange={handleDocChange}
                  onDelete={handleDocDelete}
                  onMoveUp={handleDocMoveUp}
                  onMoveDown={handleDocMoveDown}
                />
              ))}
            </div>
          )}

          <Button
            variant="outline"
            onClick={handleDocAddField}
            className="w-full flex items-center gap-2 border-dashed"
          >
            <Plus className="h-4 w-4" />
            Add Field
          </Button>
        </>
      )}

      {/* Application journey tab */}
      {activeTab === 'backend' && <ApplicationJourneyEditor />}

      {/* Districts */}
      <div className="mt-8 border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Districts</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage district options for tasks and engineers</p>
          </div>
          {districtsDirty && (
            <Button
              size="sm"
              onClick={handleSaveDistricts}
              disabled={savingDistricts}
              className="flex items-center gap-1.5"
            >
              {savingDistricts ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Districts
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
          {districts.length === 0 ? (
            <p className="text-sm text-gray-400">No districts added yet.</p>
          ) : (
            districts.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
              >
                {d}
                <button
                  type="button"
                  onClick={() => handleRemoveDistrict(d)}
                  className="ml-0.5 rounded-full hover:bg-blue-100 p-0.5"
                  aria-label={`Remove ${d}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newDistrict}
            onChange={(e) => setNewDistrict(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDistrict(); } }}
            placeholder="New district name…"
            className="flex-1 h-9 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddDistrict}
            disabled={!newDistrict.trim()}
            className="h-9 flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

    </div>
  );
}
