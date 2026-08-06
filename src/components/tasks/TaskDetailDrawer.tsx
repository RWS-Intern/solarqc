import React, { useState, useEffect } from 'react';
import {
  collection, query, orderBy, getDocs, doc, getDoc,
} from 'firebase/firestore';
import {
  MapPin, Calendar, User, Archive, ArchiveRestore, ChevronDown, ChevronUp, ExternalLink, Pencil,
} from 'lucide-react';
import { db } from '@/firebase/config';
import { useAuthStore }       from '@/store/authStore';
import { useTaskActions }     from '@/hooks/useTaskActions';
import { useFieldEngineers }  from '@/hooks/useFieldEngineers';
import { usePipelineActions } from '@/hooks/usePipelineActions';
import { useUserStore }       from '@/store/userStore';
import { useToast }           from '@/components/ui/toast';
import { useAppConfig }       from '@/hooks/useAppConfig';
import { useDrawerBackButton } from '@/hooks/useDrawerBackButton';
import { checkDuplicateConsumerMobile } from '@/utils/checkDuplicateMobile';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import { PipelineTracker } from '@/components/pipeline/PipelineTracker';
import { getProposalDocuments }  from '@/utils/proposalDocuments';
import { ProposalDocumentList }  from '@/components/pipeline/ProposalDocumentList';
import { getProposalNoteRecipientLabel } from '@/utils/proposalNoteLabel';
import { EngineerCombobox }      from '@/components/ui/EngineerCombobox';
import { DistrictCombobox }      from '@/components/ui/DistrictCombobox';
import { StateCombobox }         from '@/components/ui/StateCombobox';
import { LeadSourceCombobox }    from '@/components/ui/LeadSourceCombobox';
import type { Task, TaskStatus, TaskUpdate, DocumentsStageData, ProposalStageData, FieldDefinition } from '@/types';

// ─── Inline Title Edit ────────────────────────────────────────────────────────

function InlineTitleEdit({ task }: { task: Task }) {
  const { updateTaskTitle } = useTaskActions();
  const { currentUser }     = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(task.title);
  const [saving,  setSaving]  = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin || task.archived) return (
    <SheetTitle className="text-base leading-snug line-clamp-2 text-white">
      {task.title}
    </SheetTitle>
  );

  if (!editing) return (
    <div className="flex items-start gap-2 group">
      <SheetTitle className="text-base leading-snug text-white flex-1">
        {task.title}
      </SheetTitle>
      <button
        type="button"
        onClick={() => { setValue(task.title); setEditing(true); }}
        className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-1 text-white/50 hover:text-white hover:bg-white/10 transition-all mt-0.5"
        title="Edit title"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        autoFocus
        className="w-full rounded-lg border border-white/30 bg-white/10 text-white px-3 py-2 text-sm font-semibold resize-none focus:outline-none focus:ring-2 focus:ring-white/40 placeholder:text-white/40"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            if (!value.trim() || value.trim() === task.title) { setEditing(false); return; }
            setSaving(true);
            try {
              await updateTaskTitle(task.id, value.trim());
              setEditing(false);
            } catch {
              // handled in hook
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || !value.trim()}
          className="flex-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-semibold py-1.5 text-xs disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex-1 rounded-lg border border-white/20 bg-transparent text-white/70 font-medium py-1.5 text-xs disabled:opacity-50 transition-colors hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Inline Due Date Edit ────────────────────────────────────────────────────

function InlineDueDateEdit({ task }: { task: Task }) {
  const { updateTaskDueDate } = useTaskActions();
  const { currentUser }       = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin && !task.dueDate) return null;

  if (!isAdmin || task.archived) return (
    task.dueDate ? (
      <div className="flex items-center gap-2 text-gray-600">
        <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
        <span>Due {formatDate(task.dueDate)}</span>
      </div>
    ) : null
  );

  if (!editing) return (
    <div className="flex items-center gap-2 group text-gray-600">
      <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
      {task.dueDate ? (
        <span>Due {formatDate(task.dueDate)}</span>
      ) : (
        <span className="text-gray-400 italic text-sm">No due date</span>
      )}
      <button
        type="button"
        onClick={() => {
          if (task.dueDate) {
            const d  = task.dueDate;
            const y  = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            setValue(`${y}-${mo}-${dd}`);
          } else {
            setValue('');
          }
          setEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
        title="Edit due date"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
      />
      <button
        type="button"
        onClick={async () => {
          setSaving(true);
          try {
            const newDate = value ? new Date(value + 'T00:00:00') : null;
            await updateTaskDueDate(task.id, newDate);
            setEditing(false);
          } catch {
            // handled in hook
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving}
        className="rounded px-2 py-1 bg-brand-blue text-white text-xs font-medium disabled:opacity-50 transition-colors hover:bg-brand-blue/90"
      >
        {saving ? '…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="rounded px-2 py-1 border border-gray-200 text-gray-500 text-xs disabled:opacity-50 hover:bg-gray-50 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ─── Inline Description Edit ─────────────────────────────────────────────────

function InlineDescriptionEdit({ task }: { task: Task }) {
  const { updateTaskDescription } = useTaskActions();
  const { currentUser }           = useAuthStore();
  const [editing, setEditing]     = useState(false);
  const [value,   setValue]       = useState(task.description ?? '');
  const [saving,  setSaving]      = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin && !task.description) return null;

  if (!isAdmin || task.archived) return (
    task.description ? (
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
      </div>
    ) : null
  );

  if (!editing) return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</p>
        <button
          type="button"
          onClick={() => { setValue(task.description ?? ''); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          title="Edit description"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>
      {task.description ? (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">No description</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Add a description…"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await updateTaskDescription(task.id, value);
              setEditing(false);
            } catch {
              // handled in hook
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          className="flex-1 rounded-lg bg-brand-blue hover:bg-brand-blue/90 text-white font-semibold py-1.5 text-xs disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex-1 rounded-lg border border-gray-200 bg-transparent text-gray-500 font-medium py-1.5 text-xs disabled:opacity-50 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Inline Consumer Mobile Edit ─────────────────────────────────────────────

function InlineConsumerMobileEdit({ task }: { task: Task }) {
  const { updateTaskConsumerMobile } = useTaskActions();
  const { currentUser }              = useAuthStore();
  const { showToast }                = useToast();
  const [editing, setEditing]        = useState(false);
  const [value,   setValue]          = useState(task.consumerMobile ?? '');
  const [saving,  setSaving]         = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  const mobileError = value.length > 0 && value.length !== 10;

  if (!isAdmin && !task.consumerMobile) return null;

  if (!isAdmin || task.archived) return (
    task.consumerMobile ? (
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Consumer Mobile</p>
        <p className="text-sm text-gray-700 font-mono">{task.consumerMobile}</p>
      </div>
    ) : null
  );

  if (!editing) return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Consumer Mobile</p>
        <button
          type="button"
          onClick={() => { setValue(task.consumerMobile ?? ''); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          title="Edit consumer mobile"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>
      {task.consumerMobile ? (
        <p className="text-sm text-gray-700 font-mono">{task.consumerMobile}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">No consumer mobile</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Consumer Mobile</p>
      <input
        type="tel"
        inputMode="numeric"
        maxLength={10}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 10))}
        autoFocus
        placeholder="10-digit mobile number"
        className={cn(
          'w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2',
          mobileError
            ? 'border-red-400 bg-red-50 focus:ring-red-300'
            : 'border-gray-300 bg-white focus:ring-brand-blue/30',
        )}
      />
      {mobileError && (
        <p className="text-xs text-red-500">Mobile number must be exactly 10 digits</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              let duplicate = null;
              try {
                duplicate = await checkDuplicateConsumerMobile(value, task.id);
              } catch (checkErr) {
                console.error('[InlineConsumerMobileEdit] duplicate check failed:', checkErr);
                showToast('Could not check for duplicate mobile numbers — check your connection and try again.', 'error');
                setSaving(false);
                return;
              }
              if (duplicate) {
                const confirmed = window.confirm(
                  `This mobile number already exists on lead ${duplicate.taskNum} ` +
                  `(${duplicate.title}).\n\nContinue anyway?`
                );
                if (!confirmed) {
                  setSaving(false);
                  return;
                }
              }
              await updateTaskConsumerMobile(task.id, value);
              setEditing(false);
            } catch {
              // handled in hook
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || value.length !== 10}
          className="flex-1 rounded-lg bg-brand-blue hover:bg-brand-blue/90 text-white font-semibold py-1.5 text-xs disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex-1 rounded-lg border border-gray-200 bg-transparent text-gray-500 font-medium py-1.5 text-xs disabled:opacity-50 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Inline District Edit ────────────────────────────────────────────────────

function InlineDistrictEdit({ task }: { task: Task }) {
  const { updateTaskDistrict } = useTaskActions();
  const { currentUser }        = useAuthStore();
  const [editing,     setEditing]    = useState(false);
  const [value,       setValue]      = useState(task.district ?? '');
  const [stateValue,  setStateValue] = useState(task.state ?? '');
  const [saving,      setSaving]     = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin && !task.district && !task.state) return null;

  if (!isAdmin || task.archived) return (
    (task.district || task.state) ? (
      <div className="flex items-center gap-2 text-xs flex-wrap">
        {task.state && (
          <>
            <span className="text-gray-500">State:</span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
              {task.state}
            </span>
          </>
        )}
        {task.district && (
          <>
            <span className="text-gray-500">District:</span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
              {task.district}
            </span>
          </>
        )}
      </div>
    ) : null
  );

  if (!editing) return (
    <div className="group flex items-center gap-2 text-xs flex-wrap">
      {task.state && (
        <>
          <span className="text-gray-500">State:</span>
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
            {task.state}
          </span>
        </>
      )}
      {task.district ? (
        <>
          <span className="text-gray-500">District:</span>
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
            {task.district}
          </span>
        </>
      ) : (
        <span className="text-gray-400 italic">No district</span>
      )}
      <button
        type="button"
        onClick={() => { setValue(task.district ?? ''); setStateValue(task.state ?? ''); setEditing(true); }}
        className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
        title="Edit location"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</p>
      <StateCombobox value={stateValue} onChange={(v) => { setStateValue(v); setValue(''); }} />
      <DistrictCombobox value={value} onChange={setValue} state={stateValue} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await updateTaskDistrict(task.id, value, stateValue);
              setEditing(false);
            } catch {
              // handled in hook
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          className="flex-1 rounded-lg bg-brand-blue hover:bg-brand-blue/90 text-white font-semibold py-1.5 text-xs disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex-1 rounded-lg border border-gray-200 bg-transparent text-gray-500 font-medium py-1.5 text-xs disabled:opacity-50 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function InlineLeadSourceEdit({ task }: { task: Task }) {
  const { updateTaskLeadSource } = useTaskActions();
  const { currentUser }          = useAuthStore();
  const { engineers }            = useFieldEngineers();
  const [editing,  setEditing]   = useState(false);
  const [value,    setValue]     = useState(task.leadSource ?? '');
  const [empName,  setEmpName]   = useState(task.leadSourceEmployeeName ?? '');
  const [engUid,   setEngUid]    = useState<string>(task.leadGeneratedByUid ?? '');
  const [note,     setNote]      = useState(task.leadGeneratedByNote ?? '');
  const [saving,   setSaving]    = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin && !task.leadSource) return null;

  if (!isAdmin || task.archived) return (
    task.leadSource ? (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Lead Source:</span>
          <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
            {task.leadSource}
          </span>
        </div>
        {task.leadSource === 'Employee' && task.leadSourceEmployeeName && (
          <span className="text-gray-400 ml-4">({task.leadSourceEmployeeName})</span>
        )}
        {task.leadSource === 'Field Engineer' && task.leadGeneratedByName && (
          <span className="text-gray-400 ml-4">— {task.leadGeneratedByName}</span>
        )}
      </div>
    ) : null
  );

  if (!editing) return (
    <div className="group flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Lead Source:</span>
        {task.leadSource ? (
          <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
            {task.leadSource}
          </span>
        ) : (
          <span className="text-gray-400 italic">No lead source</span>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(task.leadSource ?? '');
            setEmpName(task.leadSourceEmployeeName ?? '');
            setEngUid(task.leadGeneratedByUid ?? '');
            setNote(task.leadGeneratedByNote ?? '');
            setEditing(true);
          }}
          className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          title="Edit lead source"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>
      {task.leadSource === 'Employee' && task.leadSourceEmployeeName && (
        <span className="text-gray-400 ml-4">({task.leadSourceEmployeeName})</span>
      )}
      {task.leadSource === 'Field Engineer' && task.leadGeneratedByName && (
        <span className="text-gray-400 ml-4">— {task.leadGeneratedByName}</span>
      )}
      {task.leadGeneratedByNote && (
        <span className="text-gray-400 ml-4 italic">{task.leadGeneratedByNote}</span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Source</p>
      <LeadSourceCombobox
        value={value}
        onChange={(val) => {
          setValue(val);
          setEmpName('');
          setEngUid('');
          setNote('');
        }}
      />
      {value === 'Employee' && (
        <input
          type="text"
          value={empName}
          onChange={(e) => setEmpName(e.target.value)}
          placeholder="Employee name"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
      {value === 'Field Engineer' && (
        <>
          <EngineerCombobox
            engineers={engineers}
            value={engUid}
            onChange={(uid) => setEngUid(uid)}
            allowUnassigned
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              const eng = engineers.find((e) => e.uid === engUid);
              await updateTaskLeadSource(task.id, value, {
                leadSourceEmployeeName: value === 'Employee'       ? empName : undefined,
                leadGeneratedByUid:     value === 'Field Engineer' ? (engUid || null) : null,
                leadGeneratedByName:    value === 'Field Engineer' ? (eng?.displayName ?? '') : undefined,
                leadGeneratedByNote:    value === 'Field Engineer' ? note : undefined,
              });
              setEditing(false);
            } catch {
              // handled in hook
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          className="flex-1 rounded-lg bg-brand-blue hover:bg-brand-blue/90 text-white font-semibold py-1.5 text-xs disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex-1 rounded-lg border border-gray-200 bg-transparent text-gray-500 font-medium py-1.5 text-xs disabled:opacity-50 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  pending:     { label: 'Pending',     className: 'bg-gray-100 text-gray-600'   },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700' },
  completed:   { label: 'Completed',   className: 'bg-green-100 text-green-700' },
  blocked:     { label: 'Blocked',     className: 'bg-red-100 text-brand-red'   },
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, className } = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}>
      {label}
    </span>
  );
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

function daysInStage(task: Task): number | null {
  if (!task.pipelineStage || task.pipelineStage === 'survey') return null;
  if (task.pipelineStage === 'completed' || task.pipelineStage === 'dropped') return null;
  if (!task.stageHistory || task.stageHistory.length === 0) return null;
  const lastEntry = [...task.stageHistory]
    .reverse()
    .find((e) => e.toStage === task.pipelineStage);
  if (!lastEntry?.timestamp) return null;
  const enteredAt = lastEntry.timestamp instanceof Date
    ? lastEntry.timestamp
    : new Date((lastEntry.timestamp as unknown as { toDate?: () => Date })?.toDate?.() ?? lastEntry.timestamp);
  const diffMs = Date.now() - enteredAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Photo grid ───────────────────────────────────────────────────────────────

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().includes('.pdf') ||
         url.toLowerCase().includes('/raw/upload/');
}

function getFilename(url: string): string {
  try {
    const parts = url.split('/');
    const last  = parts[parts.length - 1];
    return decodeURIComponent(last.split('?')[0]);
  } catch {
    return 'document.pdf';
  }
}

function PhotoGrid({ urls, label }: { urls: string[]; label: string }) {
  if (!urls.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {urls.map((url, i) =>
          isPdfUrl(url) ? (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors p-2 text-center no-underline min-h-[72px]"
            >
              <span className="text-2xl">📄</span>
              <span className="text-[9px] text-red-700 font-medium leading-tight line-clamp-2">
                {getFilename(url)}
              </span>
              <span className="text-[9px] text-red-400">Tap to open</span>
            </a>
          ) : (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity"
              style={{ paddingBottom: '100%' }}
            >
              <img src={url} alt={`${label} ${i + 1}`}
                className="absolute inset-0 h-full w-full object-cover" />
              <ExternalLink className="absolute right-1 top-1 h-3 w-3 text-white drop-shadow" />
            </a>
          )
        )}
      </div>
    </div>
  );
}

// ─── History entry ────────────────────────────────────────────────────────────

function HistoryEntry({ update, fields }: { update: TaskUpdate; fields: FieldDefinition[] }) {
  const [open, setOpen] = useState(false);
  const answerCount = Object.keys(update.fieldAnswers).length;
  const fieldLabel = (fid: string) => fields.find((f) => f.fieldId === fid)?.label ?? fid;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={update.status} />
          <span className="text-xs text-gray-500 truncate">{update.submittedByName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">{formatDateTime(update.submittedAt)}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 py-3 flex flex-col gap-2">
          {update.blockedReason && (
            <p className="text-xs text-brand-red">
              <span className="font-semibold">Blocked: </span>{update.blockedReason}
            </p>
          )}
          {update.location && (
            <p className="text-xs text-gray-500">
              GPS: {update.location.lat.toFixed(5)}, {update.location.lng.toFixed(5)}
            </p>
          )}
          {answerCount > 0 && (
            <div className="flex flex-col gap-1">
              {Object.entries(update.fieldAnswers).map(([fid, ans]) => (
                <p key={fid} className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">{fieldLabel(fid)}:</span> {ans.value}
                </p>
              ))}
            </div>
          )}
          {Object.values(update.fieldPhotos).flat().length > 0 && (
            <PhotoGrid urls={Object.values(update.fieldPhotos).flat()} label="Field photos" />
          )}
          {update.completionPhotos.length > 0 && (
            <PhotoGrid urls={update.completionPhotos} label="Completion photos" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── History section ──────────────────────────────────────────────────────────

function HistorySection({
  history,
  historyLoading,
  fields,
}: {
  history:        TaskUpdate[];
  historyLoading: boolean;
  fields:         FieldDefinition[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const PREVIEW = 3;
  const shown   = expanded ? history : history.slice(0, PREVIEW);
  const hasMore = history.length > PREVIEW;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Submission History
          {history.length > 0 && (
            <span className="ml-1 text-gray-400">({history.length})</span>
          )}
        </p>
        {hasMore && !historyLoading && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
          >
            {expanded ? (
              <>Show less <ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <>Show all {history.length} <ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </button>
        )}
      </div>

      {historyLoading ? (
        <div className="h-10 animate-pulse rounded-lg bg-gray-200" />
      ) : history.length === 0 ? (
        <p className="text-xs text-gray-400">No submissions yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((u) => <HistoryEntry key={u.id} update={u} fields={fields} />)}
          {hasMore && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-gray-400 hover:text-brand-blue text-center py-1 hover:underline"
            >
              + {history.length - PREVIEW} more submissions
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Proposal assign section ─────────────────────────────────────────────────

function ProposalAssignSection({ task }: { task: Task }) {
  const { users }                  = useUserStore();
  const { assignStageTeamMember }  = usePipelineActions();
  const { config }                 = useAppConfig();
  const memberCounts               = config.memberCounts ?? {};
  const [assigning, setAssigning]  = useState(false);

  const proposalUsers = users.filter((u) => u.role === 'proposal' && u.active);
  const isEditable = task.pipelineStage === 'proposal';

  async function handleAssign(uid: string, name: string) {
    setAssigning(true);
    try {
      await assignStageTeamMember(task.id, 'proposal', uid, name);
    } finally {
      setAssigning(false);
    }
  }

  if (!isEditable) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Proposal Assignment
        </p>
        {task.proposalAssignedTo ? (
          <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2">
            <p className="text-[10px] text-purple-500 uppercase tracking-wide font-semibold">Handled by</p>
            <p className="text-sm font-medium text-gray-800">{task.proposalAssignedToName}</p>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">No proposal member assigned</p>
        )}
      </div>
    );
  }

  if (proposalUsers.length === 0) {
    return (
      <div className="px-5 py-3 rounded-lg bg-yellow-50 border border-yellow-200">
        <p className="text-xs text-yellow-700">
          No proposal team members found. Add a user with Proposal Team role first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Proposal Assignment
      </p>
      {task.proposalAssignedTo ? (
        <div className="flex items-center justify-between rounded-lg bg-purple-50 border border-purple-200 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-gray-800">{task.proposalAssignedToName}</p>
            <p className="text-xs text-purple-600">Assigned</p>
          </div>
          <button
            type="button"
            onClick={() => handleAssign('', '')}
            className="text-xs text-gray-400 hover:text-red-500"
            disabled={assigning}
          >
            Unassign
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-gray-400">Select proposal team member:</p>
          <div className="flex flex-col gap-1">
            {proposalUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleAssign(u.id, u.name)}
                disabled={assigning}
                className="text-left rounded-lg border border-gray-200 bg-white hover:bg-purple-50 hover:border-purple-300 px-3 py-2 text-sm text-gray-700 transition-colors"
              >
                {u.name}
                <span className="ml-1.5 text-xs text-gray-400">
                  ({memberCounts[u.id] ?? 0} active)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Backend assign dropdown ─────────────────────────────────────────────────

function BackendAssignDropdown({ task }: { task: Task }) {
  const { assignStageTeamMember } = usePipelineActions();
  const { users }                 = useUserStore();
  const { config }                = useAppConfig();
  const memberCounts              = config.memberCounts ?? {};
  const [saving, setSaving]       = useState(false);

  const backendUsers = users.filter((u) => u.role === 'backend' && u.active);

  if (backendUsers.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        No backend team members found. Add a user with Backend Team role first.
      </p>
    );
  }

  async function handleAssign(uid: string) {
    const user = backendUsers.find((u) => u.id === uid);
    if (!user) return;
    setSaving(true);
    try {
      await assignStageTeamMember(task.id, 'backend', uid, user.name);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
      value={task.backendAssignedTo ?? ''}
      onChange={(e) => handleAssign(e.target.value)}
      disabled={saving}
    >
      <option value="">
        {saving ? 'Assigning...' : 'Assign backend team member...'}
      </option>
      {backendUsers.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({memberCounts[u.id] ?? 0} active)
        </option>
      ))}
    </select>
  );
}

// ─── Re-engage button ─────────────────────────────────────────────────────────

function ReEngageButton({ task }: { task: Task }) {
  const { reEngageLead }      = usePipelineActions();
  const [loading, setLoading] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote]       = useState('');

  async function handleReEngage() {
    setLoading(true);
    try {
      await reEngageLead(task.id, note);
      setShowNote(false);
      setNote('');
    } catch {
      // handled in hook
    } finally {
      setLoading(false);
    }
  }

  if (!showNote) {
    return (
      <button
        type="button"
        onClick={() => setShowNote(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-3 text-sm transition-all"
      >
        🔄 Re-engage Lead
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
      <p className="text-sm font-semibold text-blue-700">
        Re-engage this dropped lead?
      </p>
      <p className="text-xs text-blue-600">
        This will move the lead back to Proposal stage.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)..."
        rows={2}
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleReEngage}
          disabled={loading}
          className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 text-sm disabled:opacity-50 transition-all"
        >
          {loading ? 'Re-engaging...' : 'Confirm Re-engage'}
        </button>
        <button
          type="button"
          onClick={() => { setShowNote(false); setNote(''); }}
          disabled={loading}
          className="flex-1 rounded-lg border border-blue-200 bg-white text-blue-600 font-medium py-2 text-sm disabled:opacity-50 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Admin Stage Override ─────────────────────────────────────────────────────

function AdminStageOverride({ task }: { task: Task }) {
  const { adminOverrideStage } = usePipelineActions();
  const [open,    setOpen]    = useState(false);
  const [stage,   setStage]   = useState<string>('');
  const [note,    setNote]    = useState('');
  const [loading, setLoading] = useState(false);

  const STAGES = [
    { value: 'survey',       label: 'Survey'       },
    { value: 'proposal',     label: 'Proposal'     },
    { value: 'field_review', label: 'Field Review' },
    { value: 'documents',    label: 'Documents'    },
    { value: 'backend',      label: 'Backend'      },
    { value: 'completed',    label: 'Converted'    },
    { value: 'dropped',      label: 'Dropped'      },
  ];

  async function handleOverride(isCorrection: boolean) {
    if (!stage || stage === task.pipelineStage) return;
    const msg = isCorrection
      ? `Send this lead back to "${stage}" for correction? It will auto-return to "${task.pipelineStage}" once the step is resubmitted.`
      : `Move this lead from "${task.pipelineStage}" to "${stage}"? This is a full override — downstream progress will not be preserved.`;
    if (!window.confirm(msg)) return;
    setLoading(true);
    try {
      await adminOverrideStage(task.id, stage as import('@/types').PipelineStage, note, isCorrection);
      setOpen(false);
      setStage('');
      setNote('');
    } catch {
      // handled in hook
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
      >
        🔧 Override Pipeline Stage
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-700">
        ⚠️ Admin Override — Change Pipeline Stage
      </p>
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value)}
        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
      >
        <option value="">Select new stage...</option>
        {STAGES.filter((s) => s.value !== task.pipelineStage).map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason for override (optional)..."
        rows={2}
        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm resize-none"
      />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleOverride(true)}
            disabled={!stage || loading}
            className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 text-sm disabled:opacity-50"
          >
            {loading ? 'Moving...' : '↩ Quick Correction'}
          </button>
          <button
            type="button"
            onClick={() => handleOverride(false)}
            disabled={!stage || loading}
            className="flex-1 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-100 font-semibold py-2 text-sm disabled:opacity-50"
          >
            Full Restart
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setStage(''); setNote(''); }}
          className="w-full rounded-lg border border-amber-200 bg-white text-amber-700 font-medium py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Sale Closed Control ──────────────────────────────────────────────────────

function SaleClosedControl({ task, onChanged }: { task: Task; onChanged?: () => void }) {
  const { currentUser } = useAuthStore();
  const { setSaleClosedManual, resetSaleClosedToAuto } = useTaskActions();
  const [loading, setLoading] = useState(false);

  if (currentUser?.role !== 'admin') return null;

  async function handleToggle() {
    setLoading(true);
    try {
      await setSaleClosedManual(task.id, !task.saleClosed);
      onChanged?.();
    } catch {
      // handled in hook
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    setLoading(true);
    try {
      await resetSaleClosedToAuto(task.id);
      onChanged?.();
    } catch {
      // handled in hook
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
            task.saleClosed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600',
          )}>
            {task.saleClosed ? '✅ Sales Closed' : 'Not Sales Closed'}
          </span>
          <p className="text-xs text-gray-400 mt-1">
            {task.saleClosedSource === 'manual' ? '(manually set)' : '(auto-detected)'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors',
            task.saleClosed
              ? 'border border-gray-300 text-gray-600 hover:bg-gray-100'
              : 'bg-green-600 hover:bg-green-700 text-white',
          )}
        >
          {loading ? '…' : task.saleClosed ? 'Unmark as Sales Closed' : 'Mark as Sales Closed'}
        </button>
      </div>
      {task.saleClosedSource === 'manual' && (
        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          className="self-start text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50 transition-colors"
        >
          Reset to automatic
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TaskDetailDrawerProps {
  task:                 Task | null;
  onClose:              () => void;
  onUpdate?:            (task: Task) => void;
  onAdminUpdate?:       (task: Task) => void;
  onSaleClosedChange?:  () => void;
}

export function TaskDetailDrawer({ task, onClose, onUpdate, onAdminUpdate, onSaleClosedChange }: TaskDetailDrawerProps) {
  const { currentUser }                    = useAuthStore();
  const { assignTask, archiveTask, unarchiveTask } = useTaskActions();
  const { updateBackendRemark, updateProposalRemark } = usePipelineActions();
  const { engineers }                      = useFieldEngineers();
  const { showToast }                      = useToast();
  const { config }                         = useAppConfig();
  const [history, setHistory]              = useState<TaskUpdate[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archiving,          setArchiving]          = useState(false);
  const [unarchiving,        setUnarchiving]        = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [proposalDoc, setProposalDoc] = useState<ProposalStageData | null>(null);
  const [documentsData, setDocumentsData] = useState<DocumentsStageData | null>(null);
  const [backendRemark,         setBackendRemark]         = useState('');
  const [backendRemarkSaving,   setBackendRemarkSaving]   = useState(false);
  const [editingBackendRemark,  setEditingBackendRemark]  = useState(false);
  const [proposalRemark,        setProposalRemark]        = useState('');
  const [proposalRemarkSaving,  setProposalRemarkSaving]  = useState(false);
  const [editingProposalRemark, setEditingProposalRemark] = useState(false);

  const isAdmin    = currentUser?.role === 'admin';
  const isViewOnly = currentUser?.role === 'view_only';
  const canEdit    = isAdmin;
  const canEditIfActive = isAdmin && !task?.archived;

  useEffect(() => {
    setShowArchiveConfirm(false);
    setEditingBackendRemark(false);
    setBackendRemark(task?.backendRemark ?? '');
    setEditingProposalRemark(false);
    setProposalRemark(task?.proposalRemark ?? '');
    if (!task) { setProposalDoc(null); return; }
    getDoc(doc(db, 'tasks', task.id, 'stages', 'proposal')).then((snap) => {
      if (snap.exists()) {
        setProposalDoc(snap.data() as ProposalStageData);
      } else {
        setProposalDoc(null);
      }
    }).catch(() => setProposalDoc(null));
  }, [task?.id, task?.pipelineStage]);

  useEffect(() => {
    if (!task) { setDocumentsData(null); return; }
    getDoc(doc(db, 'tasks', task.id, 'stages', 'documents'))
      .then((snap) => {
        if (snap.exists()) setDocumentsData(snap.data() as DocumentsStageData);
        else setDocumentsData(null);
      })
      .catch(() => setDocumentsData(null));
  }, [task?.id, task?.pipelineStage]);

  useEffect(() => {
    if (!task) { setHistory([]); return; }
    setHistoryLoading(true);
    getDocs(
      query(
        collection(db, 'tasks', task.id, 'updates'),
        orderBy('submittedAt', 'desc'),
      )
    ).then((snap) => {
      setHistory(snap.docs.map((d) => {
        const data = d.data();
        return {
          id:               d.id,
          submittedBy:      data['submittedBy']     ?? '',
          submittedByName:  data['submittedByName'] ?? '',
          submittedAt:      data['submittedAt']?.toDate?.() ?? new Date(),
          status:           data['status']          ?? 'pending',
          location:         data['location']        ?? null,
          blockedReason:    data['blockedReason']   ?? null,
          fieldAnswers:     data['fieldAnswers']    ?? {},
          fieldPhotos:      data['fieldPhotos']     ?? {},
          completionPhotos: data['completionPhotos'] ?? [],
          taskNum:          data['taskNum']         ?? '',
          title:            data['title']           ?? '',
        } as TaskUpdate;
      }));
      setHistoryLoading(false);
    }).catch((err) => {
      console.error('[TaskDetailDrawer] history fetch error:', err);
      setHistoryLoading(false);
    });
  }, [task?.id]);

  useDrawerBackButton(!!task, onClose);

  async function handleArchive() {
    if (!task) return;
    setArchiving(true);
    try {
      await archiveTask(task.id);
      onClose();
    } finally {
      setArchiving(false);
    }
  }

  async function handleUnarchive() {
    if (!task) return;
    setUnarchiving(true);
    try {
      await unarchiveTask(task.id);
      onClose();
    } finally {
      setUnarchiving(false);
    }
  }

  async function handleAssign(uid: string) {
    if (!task) return;
    const eng = engineers.find((e) => e.uid === uid);
    if (!eng) return;
    try {
      await assignTask(task.id, eng);
    } finally {
      setShowAssignPicker(false);
    }
  }

  if (!task) return null;

  return (
    <Sheet open={!!task} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex flex-col p-0 w-full sm:max-w-lg">
        {/* ── Header ── */}
        <SheetHeader className="border-b border-white/10 px-5 py-4 shrink-0 bg-gradient-to-r from-brand-navy to-brand-blue pr-12">
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(task.taskNum);
                    showToast(`Copied ${task.taskNum}`, 'success');
                  }}
                  className="font-mono text-xs text-white/60 hover:text-white transition-colors flex items-center gap-1 group"
                  title="Copy task number"
                >
                  {task.taskNum}
                  <svg
                    className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <StatusBadge status={task.status} />
                {isViewOnly && (
                  <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wide">
                    View Only
                  </span>
                )}
              </div>
              <InlineTitleEdit task={task} />
            </div>
          </div>
        </SheetHeader>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Correction summary — visible to all when task is sent back */}
          {task.correctionReturnTo && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">↩ Sent back for correction</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Will automatically return to {task.correctionReturnTo.replace('_', ' ')} once resubmitted.
                {task.correctionNote && ` Reason: "${task.correctionNote}"`}
              </p>
            </div>
          )}

          {/* Sales Closed status (admin only) */}
          <SaleClosedControl task={task} onChanged={onSaleClosedChange} />

          {/* Meta */}
          <div className="flex flex-col gap-2 text-sm">
            {/* Assigned */}
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              {task.assignedTo ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-700">
                    {task.assignedToName}
                    {task.assignedToCode && (
                      <span className="ml-1 font-mono text-xs text-gray-400">({task.assignedToCode})</span>
                    )}
                    {task.assignedToMobile && task.assignedToMobile.trim() !== '' && (
                      <a
                        href={`tel:${task.assignedToMobile}`}
                        className="ml-2 text-xs text-blue-600 hover:underline font-normal"
                      >
                        {task.assignedToMobile}
                      </a>
                    )}
                  </span>
                  {canEditIfActive && !showAssignPicker && (
                    <button
                      type="button"
                      onClick={() => setShowAssignPicker(true)}
                      className="text-xs font-medium text-brand-blue hover:underline"
                    >
                      Reassign
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 italic">Unassigned</span>
                  {canEditIfActive && !showAssignPicker && (
                    <button
                      type="button"
                      onClick={() => setShowAssignPicker(true)}
                      className="text-xs font-medium text-brand-blue hover:underline"
                    >
                      Assign
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Inline assign picker */}
            {canEditIfActive && showAssignPicker && (
              <div className="flex items-center gap-2 ml-6">
                <EngineerCombobox
                  engineers={engineers}
                  value=""
                  onChange={(uid) => { if (uid) handleAssign(uid); }}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowAssignPicker(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Due date */}
            <InlineDueDateEdit task={task} />

            {/* Follow-up date */}
            {task.followUpDate && (
              <div className="flex items-center gap-2 text-gray-600">
                <Calendar className="h-4 w-4 text-orange-400 shrink-0" />
                <span className="text-orange-600 font-medium text-sm">
                  Follow-up: {formatDate(task.followUpDate)}
                </span>
              </div>
            )}

            {/* District */}
            <InlineDistrictEdit task={task} />

            {/* Lead Source */}
            <InlineLeadSourceEdit task={task} />

            {/* Created */}
            <div className="flex items-center gap-2 text-gray-400 text-xs">
              <span>Created {formatDateTime(task.createdAt)}</span>
            </div>
          </div>

          {/* Description */}
          <InlineDescriptionEdit task={task} />

          {/* Consumer Mobile */}
          <InlineConsumerMobileEdit task={task} />

          {/* Blocked reason */}
          {task.status === 'blocked' && task.blockedReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-semibold text-brand-red mb-0.5">Blocked reason</p>
              <p className="text-sm text-red-800">{task.blockedReason}</p>
            </div>
          )}

          {/* Field answers */}
          {task.fields.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Form Fields</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {task.fields.map((field) => {
                  if (field.type === 'section_header') {
                    return (
                      <div key={field.fieldId} className="col-span-full pt-2 pb-1">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
                            {field.label}
                          </span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      </div>
                    );
                  }

                  const ans    = task.fieldAnswers[field.fieldId];
                  const photos = task.fieldPhotos[field.fieldId] ?? [];
                  const answered = !!(ans?.value) || photos.length > 0;
                  return (
                    <div key={field.fieldId} className={cn(
                      'rounded-lg bg-gray-50 px-3 py-2 border-l-4',
                      answered ? 'border-l-brand-green' : 'border-l-gray-200',
                    )}>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-semibold text-gray-800 flex-1">{field.label}</p>
                        <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-gray-200 text-gray-500 uppercase">
                          {field.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {ans?.value ? (
                        <p className="text-sm text-gray-700">{ans.value}</p>
                      ) : photos.length === 0 ? (
                        <p className="text-sm text-gray-300">—</p>
                      ) : null}
                      {photos.length > 0 && (
                        <div className="mt-2">
                          <PhotoGrid urls={photos} label={field.label} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completion photos */}
          {task.completionPhotos.length > 0 && (
            <PhotoGrid urls={task.completionPhotos} label="Completion Photos" />
          )}

          {/* GPS */}
          {task.location && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Location</p>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-brand-blue shrink-0" />
                <span className="text-sm text-gray-700 font-mono">
                  {task.location.lat.toFixed(5)}, {task.location.lng.toFixed(5)}
                </span>
                <a
                  href={`https://www.google.com/maps?q=${task.location.lat},${task.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand-blue hover:underline flex items-center gap-0.5"
                >
                  Open in Maps <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}

          {/* Pipeline status */}
          {task.pipelineStage && (
            <div className="flex flex-col gap-2 pt-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline Status</p>
              <PipelineTracker
                pipelineStage={task.pipelineStage}
                stageHistory={task.stageHistory ?? []}
                droppedReason={task.droppedReason}
              />
              {task.pipelineStage &&
               task.pipelineStage !== 'survey' &&
               task.pipelineStage !== 'completed' &&
               task.pipelineStage !== 'dropped' &&
               (() => {
                 const days = daysInStage(task);
                 if (days === null) return null;
                 const color = days > 14 ? 'text-red-600 bg-red-50 border-red-200' :
                               days > 7  ? 'text-orange-600 bg-orange-50 border-orange-200' :
                               'text-gray-600 bg-gray-50 border-gray-200';
                 return (
                   <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${color}`}>
                     ⏱ {days} day{days !== 1 ? 's' : ''} in current stage
                   </div>
                 );
               })()}
              {/* FIX 4: journey progress mini-bar under tracker */}
              {task.pipelineStage === 'backend' &&
               task.applicationJourneySteps &&
               task.applicationJourneySteps.length > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 rounded-full bg-gray-100">
                    <div
                      className="h-1 rounded-full bg-orange-400 transition-all"
                      style={{
                        width: `${(task.applicationJourneySteps.filter(
                          (s) => s.status === 'done').length /
                          task.applicationJourneySteps.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">
                    {task.applicationJourneySteps.filter((s) => s.status === 'done').length}/
                    {task.applicationJourneySteps.length} steps
                    {task.paymentType && ` · ${task.paymentType === 'cash' ? '💵 Cash' : '🏦 Loan'}`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Proposal Remark — shown at proposal stage, or any stage when a remark exists */}
          {(task.pipelineStage === 'proposal' || !!task.proposalRemark) && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold text-purple-700 uppercase tracking-wide">
                    Proposal Remark
                  </p>
                  {task.pipelineStage !== 'proposal' && !!task.proposalRemark && (
                    <span className="text-[10px] text-gray-400 italic">(from earlier stage)</span>
                  )}
                </div>
                {isAdmin && !editingProposalRemark && task.pipelineStage === 'proposal' && !task.archived && (
                  <button
                    type="button"
                    onClick={() => { setProposalRemark(task.proposalRemark ?? ''); setEditingProposalRemark(true); }}
                    className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 transition-colors"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>
              {editingProposalRemark ? (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={proposalRemark}
                    onChange={(e) => setProposalRemark(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="Add an internal remark..."
                    className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 placeholder:text-gray-300"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={proposalRemarkSaving}
                      onClick={async () => {
                        setProposalRemarkSaving(true);
                        try {
                          await updateProposalRemark(task.id, proposalRemark);
                          setEditingProposalRemark(false);
                        } catch {
                          // error toast in hook
                        } finally {
                          setProposalRemarkSaving(false);
                        }
                      }}
                      className="rounded-lg bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 transition-all"
                    >
                      {proposalRemarkSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProposalRemark(false)}
                      className="rounded-lg border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : task.proposalRemark ? (
                <>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.proposalRemark}</p>
                  {task.proposalRemarkUpdatedBy && (
                    <p className="text-[10px] text-purple-600 mt-0.5">
                      {task.proposalRemarkUpdatedBy}
                      {task.proposalRemarkUpdatedAt && ` · ${task.proposalRemarkUpdatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">No remark yet.</p>
              )}
            </div>
          )}

          {/* Backend Remark — shown at backend stage, or any stage when a remark exists */}
          {(task.pipelineStage === 'backend' || !!task.backendRemark) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                    Backend Remark
                  </p>
                  {task.pipelineStage !== 'backend' && !!task.backendRemark && (
                    <span className="text-[10px] text-gray-400 italic">(from earlier stage)</span>
                  )}
                </div>
                {isAdmin && !editingBackendRemark && task.pipelineStage === 'backend' && !task.archived && (
                  <button
                    type="button"
                    onClick={() => { setBackendRemark(task.backendRemark ?? ''); setEditingBackendRemark(true); }}
                    className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800 transition-colors"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>
              {editingBackendRemark ? (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={backendRemark}
                    onChange={(e) => setBackendRemark(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="Add a remark..."
                    className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 placeholder:text-gray-300"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={backendRemarkSaving}
                      onClick={async () => {
                        setBackendRemarkSaving(true);
                        try {
                          await updateBackendRemark(task.id, backendRemark);
                          setEditingBackendRemark(false);
                        } catch {
                          // error toast in hook
                        } finally {
                          setBackendRemarkSaving(false);
                        }
                      }}
                      className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 transition-all"
                    >
                      {backendRemarkSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBackendRemark(false)}
                      className="rounded-lg border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : task.backendRemark ? (
                <>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.backendRemark}</p>
                  {task.backendRemarkUpdatedBy && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      {task.backendRemarkUpdatedBy}
                      {task.backendRemarkUpdatedAt && ` · ${task.backendRemarkUpdatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">No remark yet.</p>
              )}
            </div>
          )}

          {/* Application Journey */}
          {task.applicationJourneySteps && task.applicationJourneySteps.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Application Journey
                </p>
                <span className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  task.paymentType === 'cash'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700',
                )}>
                  {task.paymentType === 'cash' ? '💵 Cash' : '🏦 Loan'} ·{' '}
                  {task.applicationJourneySteps.filter((s) => s.status === 'done').length}/
                  {task.applicationJourneySteps.length} steps done
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-1.5 rounded-full bg-orange-400 transition-all"
                  style={{
                    width: `${(task.applicationJourneySteps.filter(
                      (s) => s.status === 'done').length /
                      task.applicationJourneySteps.length) * 100}%`,
                  }}
                />
              </div>

              {/* Steps list */}
              <div className="flex flex-col gap-1.5 mt-1">
                {task.applicationJourneySteps.map((step, idx) => (
                  <div
                    key={step.stepId}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg px-3 py-2 border',
                      step.status === 'done'
                        ? 'border-green-200 bg-green-50'
                        : idx === task.currentStepIndex
                        ? 'border-orange-300 bg-orange-50'
                        : 'border-gray-100 bg-white opacity-60',
                    )}
                  >
                    <div className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5',
                      step.status === 'done'
                        ? 'bg-green-500 text-white'
                        : idx === task.currentStepIndex
                        ? 'bg-orange-400 text-white'
                        : 'bg-gray-200 text-gray-400',
                    )}>
                      {step.status === 'done' ? '✓' : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-xs font-medium',
                        step.status === 'done' ? 'text-gray-800' : 'text-gray-500',
                      )}>
                        {step.label}
                      </p>
                      {step.status === 'done' && step.realDate && (
                        <p className="text-[10px] text-green-600 mt-0.5">
                          {new Date(step.realDate).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                          {step.recordedBy && ` · ${step.recordedBy}`}
                          {step.recordedAt && (() => {
                            const raw = step.recordedAt as unknown as { toDate?: () => Date };
                            const recordedDate = step.recordedAt instanceof Date
                              ? step.recordedAt
                              : raw?.toDate?.() ?? null;
                            if (!recordedDate) return null;
                            return ` · recorded ${recordedDate.toLocaleTimeString('en-IN', {
                              hour: '2-digit', minute: '2-digit',
                              timeZone: 'Asia/Kolkata',
                            })}`;
                          })()}
                        </p>
                      )}
                      {idx === task.currentStepIndex && step.status !== 'done' && (
                        <p className="text-[10px] text-orange-500 mt-0.5">
                          ▶ Current step
                        </p>
                      )}
                      {(step.remarks ?? []).length > 0 && (
                        <div className="mt-1 flex flex-col gap-0.5">
                          {[...(step.remarks ?? [])].reverse().map((r, ri) => {
                            const ts = r.createdAt as unknown as { toDate?: () => Date };
                            const d = r.createdAt instanceof Date ? r.createdAt : ts?.toDate?.() ?? null;
                            return (
                              <p key={ri} className="text-[10px] text-gray-500">
                                💬 {r.text}
                                <span className="text-gray-400 ml-1">
                                  — {r.authorName}{d ? `, ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                                </span>
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Converted banner */}
          {task.pipelineStage === 'completed' && (
            <div className="rounded-xl border-2 border-green-500 bg-green-50 px-4 py-4 text-center">
              <p className="text-2xl font-bold text-green-700">✅ Lead Converted!</p>
              <p className="text-sm text-green-600 mt-1">
                All pipeline stages and journey steps completed successfully.
              </p>
              {task.applicationJourneySteps && task.applicationJourneySteps.length > 0 && (
                <p className="text-xs text-green-500 mt-1">
                  {task.applicationJourneySteps.length} steps completed ·{' '}
                  {task.paymentType === 'cash' ? '💵 Cash' : '🏦 Loan'}
                </p>
              )}
            </div>
          )}

          {/* Proposal document — shown whenever data exists, even if task was reverted */}
          {getProposalDocuments(proposalDoc).length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Proposal Document
                </p>
                {!['field_review', 'documents', 'backend', 'completed', 'dropped'].includes(task.pipelineStage ?? '') && (
                  <span className="text-[10px] text-gray-400 italic">(from earlier stage)</span>
                )}
              </div>
              <ProposalDocumentList documents={getProposalDocuments(proposalDoc)} />
            </div>
          )}

          {/* Proposal note for field engineer — independent of document existence */}
          {proposalDoc?.proposalNote && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
              <p className="text-xs text-blue-700">
                📝 {getProposalNoteRecipientLabel(proposalDoc?.submittedToStage)}: {proposalDoc.proposalNote}
              </p>
            </div>
          )}

          {/* Proposal Revision History — admin read-only, newest first */}
          {(proposalDoc?.revisions?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Proposal Revision History
                <span className="ml-1 text-gray-400">({proposalDoc!.revisions.length})</span>
              </p>
              <div className="flex flex-col gap-2">
                {[...proposalDoc!.revisions].reverse().map((rev, revIdx) => {
                  const docs = rev.documents?.length
                    ? rev.documents
                    : rev.documentUrl
                    ? [{ url: rev.documentUrl, name: rev.documentName ?? 'Document' }]
                    : [];
                  const uploadedAt = rev.uploadedAt as unknown as { toDate?: () => Date } | Date | null;
                  const uploadDate = uploadedAt
                    ? (typeof (uploadedAt as any).toDate === 'function'
                        ? (uploadedAt as any).toDate()
                        : uploadedAt as Date)
                    : null;
                  // Original chronological label: newest item (revIdx=0) gets the highest number
                  const revisionLabel = proposalDoc!.revisions.length - revIdx;
                  return (
                    <div key={revIdx} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-gray-700">
                          Revision {revisionLabel}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {rev.uploadedByName ?? ''}
                          {uploadDate ? ` · ${uploadDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                        </p>
                      </div>
                      {docs.length > 0 && <ProposalDocumentList documents={docs} />}
                      {rev.revisionNote && (
                        <p className="text-xs text-gray-500 italic mt-1">💬 {rev.revisionNote}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Submitted documents — shown whenever docs were ever submitted, even if task was reverted */}
          {(task.documentsCompleted === true || Object.keys(task.documentAnswers ?? {}).length > 0 || documentsData !== null) && (() => {
            const answers    = documentsData?.documentAnswers ?? {};
            const photos     = documentsData?.documentPhotos  ?? {};
            const template   = config.documentTemplate ?? [];
            const hasAnswers = Object.keys(answers).length > 0;
            const hasPhotos  = Object.values(photos).flat().length > 0;
            const isHistorical = !['backend', 'completed', 'dropped'].includes(task.pipelineStage ?? '');
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Submitted Documents
                  </p>
                  {isHistorical && (
                    <span className="text-[10px] text-gray-400 italic">(from earlier stage)</span>
                  )}
                </div>
                {!hasAnswers && !hasPhotos ? (
                  <p className="text-sm text-gray-400 italic">No documents were collected for this lead.</p>
                ) : (
                  <>
                    {hasAnswers && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {template
                          .filter((f) => f.type !== 'section_header' && f.type !== 'photo_only')
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map((field) => {
                            const val = answers[field.fieldId];
                            if (!val) return null;
                            return (
                              <div key={field.fieldId} className="rounded-lg bg-gray-50 px-3 py-2 border-l-4 border-l-brand-green">
                                <p className="text-xs font-semibold text-gray-800">{field.label}</p>
                                <p className="text-sm text-gray-700">
                                  {field.type === 'yesno'
                                    ? val === 'yes' ? '✅ Yes' : '❌ No'
                                    : val}
                                </p>
                              </div>
                            );
                          })}
                      </div>
                    )}
                    {hasPhotos && (
                      <PhotoGrid urls={Object.values(photos).flat()} label="Documents" />
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* Proposal assignment (admin only, any stage past survey) */}
          {canEditIfActive && task.pipelineStage && task.pipelineStage !== 'survey' && (
            <ProposalAssignSection task={task} />
          )}

          {/* Backend assignment (admin only, backend stage) */}
          {canEditIfActive && task.pipelineStage === 'backend' && (
            <div className="flex flex-col gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                Backend Team Assignment
              </p>
              {task.backendAssignedTo ? (
                <div className="flex items-center gap-2">
                  <span className="text-orange-500">⚙️</span>
                  <p className="text-sm font-medium text-gray-800">
                    {task.backendAssignedToName}
                  </p>
                  <span className="text-xs text-gray-400">(assigned)</span>
                </div>
              ) : (
                <p className="text-xs text-red-500 font-medium">
                  ⚠️ No backend team member assigned yet
                </p>
              )}
              <BackendAssignDropdown task={task} />
            </div>
          )}

          {/* Submission history */}
          <HistorySection history={history} historyLoading={historyLoading} fields={task.fields} />
        </div>

        {/* ── Footer ── */}
        {(currentUser?.role === 'field' && onUpdate || canEdit) && (
          <div className="border-t border-gray-100 px-5 py-4 shrink-0 flex flex-col gap-2">
            {currentUser?.role === 'field' && onUpdate && (
              <Button
                className="w-full"
                onClick={() => onUpdate(task)}
              >
                Update Task
              </Button>
            )}
            {canEditIfActive && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-gray-500 border-gray-200 hover:text-gray-700 gap-1.5"
                  onClick={() => onAdminUpdate && onAdminUpdate(task)}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              </div>
            )}
            {canEditIfActive && task.pipelineStage === 'dropped' && (
              <ReEngageButton task={task} />
            )}
            {canEditIfActive && (
              <AdminStageOverride task={task} />
            )}
            {canEdit && (
              task.archived ? (
                <Button
                  variant="outline"
                  className="w-full text-green-600 border-green-200 hover:bg-green-50"
                  onClick={handleUnarchive}
                  disabled={unarchiving}
                >
                  {unarchiving ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                      Restoring…
                    </span>
                  ) : (
                    <>
                      <ArchiveRestore className="h-4 w-4 mr-2" />
                      Restore Task
                    </>
                  )}
                </Button>
              ) : showArchiveConfirm ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowArchiveConfirm(false); handleArchive(); }}
                    disabled={archiving}
                    className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {archiving ? 'Archiving…' : 'Yes, Archive'}
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowArchiveConfirm(true)}
                  disabled={archiving}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Task
                </Button>
              )
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
