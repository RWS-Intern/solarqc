import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTaskActions }    from '@/hooks/useTaskActions';
import { useFieldEngineers } from '@/hooks/useFieldEngineers';
import { useToast }          from '@/components/ui/toast';
import { DistrictCombobox }   from '@/components/ui/DistrictCombobox';
import { StateCombobox }      from '@/components/ui/StateCombobox';
import { LeadSourceCombobox } from '@/components/ui/LeadSourceCombobox';
import { EngineerCombobox }   from '@/components/ui/EngineerCombobox';
import { checkDuplicateConsumerMobile } from '@/utils/checkDuplicateMobile';

interface CreateTaskModalProps {
  open:    boolean;
  onClose: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

export function CreateTaskModal({ open, onClose }: CreateTaskModalProps) {
  const { createTask }          = useTaskActions();
  const { engineers, loading: engLoading } = useFieldEngineers();
  const { showToast }           = useToast();

  const [title,          setTitle]          = useState('');
  const [description,    setDescription]    = useState('');
  const [consumerMobile, setConsumerMobile] = useState('');
  const [state,                   setState]                   = useState('');
  const [district,                setDistrict]                = useState('');
  const [leadSource,              setLeadSource]              = useState('');
  const [leadSourceEmployeeName,  setLeadSourceEmployeeName]  = useState('');
  const [leadGeneratedByUid,      setLeadGeneratedByUid]      = useState<string | null>(null);
  const [leadGeneratedByNote,     setLeadGeneratedByNote]     = useState('');
  const [assigneeUid,    setAssigneeUid]    = useState('');
  const [dueDate,        setDueDate]        = useState('');
  const [submitting,     setSubmitting]     = useState(false);

  const consumerMobileError = consumerMobile.length > 0 && consumerMobile.length !== 10;

  function reset() {
    setTitle('');
    setDescription('');
    setConsumerMobile('');
    setState('');
    setDistrict('');
    setLeadSource('');
    setLeadSourceEmployeeName('');
    setLeadGeneratedByUid(null);
    setLeadGeneratedByNote('');
    setAssigneeUid('');
    setDueDate('');
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);

    const engineer = engineers.find((eng) => eng.uid === assigneeUid);

    try {
      let duplicate = null;
      try {
        duplicate = await checkDuplicateConsumerMobile(consumerMobile);
      } catch (checkErr) {
        console.error('[CreateTaskModal] duplicate check failed:', checkErr);
        showToast('Could not check for duplicate mobile numbers — check your connection and try again.', 'error');
        setSubmitting(false);
        return;
      }
      if (duplicate) {
        const confirmed = window.confirm(
          `This mobile number already exists on lead ${duplicate.taskNum} ` +
          `(${duplicate.title}, created ${duplicate.createdAt.toLocaleDateString('en-IN')}).\n\n` +
          `Continue creating a new lead with this same number anyway?`
        );
        if (!confirmed) {
          setSubmitting(false);
          return;
        }
      }
      const leadGenUid = leadSource === 'Field Engineer'
        ? (leadGeneratedByUid ?? engineer?.uid ?? null)
        : null;
      const leadGenName = leadSource === 'Field Engineer'
        ? (engineers.find((e) => e.uid === leadGenUid)?.displayName ?? '')
        : '';
      await createTask({
        title,
        description:             description || undefined,
        state:                   state       || undefined,
        district:                district    || undefined,
        leadSource:              leadSource  || undefined,
        leadSourceEmployeeName:  leadSource === 'Employee' ? leadSourceEmployeeName || undefined : undefined,
        leadGeneratedByUid:      leadSource === 'Field Engineer' ? leadGenUid : null,
        leadGeneratedByName:     leadSource === 'Field Engineer' ? leadGenName : undefined,
        leadGeneratedByNote:     leadSource === 'Field Engineer' ? leadGeneratedByNote || undefined : undefined,
        assignedTo:       engineer?.uid          ?? null,
        assignedToName:   engineer?.displayName  ?? '',
        assignedToCode:   engineer?.engineerCode ?? '',
        assignedToMobile: engineer?.mobileNumber ?? '',
        consumerMobile,
        dueDate: dueDate ? new Date(dueDate) : null,
      });
      reset();
      onClose();
    } catch {
      // toast shown inside createTask
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-title">
              Title <span className="text-brand-red">*</span>
            </Label>
            <Input
              id="ct-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rooftop panel inspection"
              required
              autoComplete="off"
              className="h-12"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-desc">Description</Label>
            <Textarea
              id="ct-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
              rows={2}
            />
          </div>

          {/* Consumer Mobile */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-mobile">
              Consumer Mobile Number <span className="text-brand-red">*</span>
            </Label>
            <Input
              id="ct-mobile"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={consumerMobile}
              onChange={(e) => setConsumerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              required
              autoComplete="off"
              className={`h-12 ${consumerMobileError ? 'border-brand-red focus-visible:ring-brand-red' : ''}`}
            />
            {consumerMobileError && (
              <p className="text-xs text-brand-red">Mobile number must be exactly 10 digits</p>
            )}
          </div>

          {/* State */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-state">State</Label>
            <StateCombobox
              id="ct-state"
              value={state}
              onChange={(val) => { setState(val); setDistrict(''); }}
            />
          </div>

          {/* District */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-district">District</Label>
            <DistrictCombobox id="ct-district" value={district} onChange={setDistrict} state={state} />
          </div>

          {/* Lead Source */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-lead-source">Lead Source</Label>
            <LeadSourceCombobox
              id="ct-lead-source"
              value={leadSource}
              onChange={(val) => {
                setLeadSource(val);
                setLeadSourceEmployeeName('');
                setLeadGeneratedByUid(null);
                setLeadGeneratedByNote('');
              }}
            />
          </div>

          {leadSource === 'Employee' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ct-ls-employee">Employee Name</Label>
              <Input
                id="ct-ls-employee"
                value={leadSourceEmployeeName}
                onChange={(e) => setLeadSourceEmployeeName(e.target.value)}
                placeholder="Name of the employee who generated this lead"
                className="h-12"
              />
            </div>
          )}

          {leadSource === 'Field Engineer' && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ct-ls-engineer">Lead Generated By (Engineer)</Label>
                <EngineerCombobox
                  engineers={engineers}
                  value={leadGeneratedByUid ?? assigneeUid}
                  onChange={(uid) => setLeadGeneratedByUid(uid || null)}
                  disabled={engLoading}
                  allowUnassigned
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ct-ls-note">Note (optional)</Label>
                <Input
                  id="ct-ls-note"
                  value={leadGeneratedByNote}
                  onChange={(e) => setLeadGeneratedByNote(e.target.value)}
                  placeholder="Additional note about this lead source"
                  className="h-12"
                />
              </div>
            </div>
          )}

          <div className="border-t border-gray-100" />

          {/* Assign to */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-assign">Assign to</Label>
            <EngineerCombobox
              engineers={engineers}
              value={assigneeUid}
              onChange={setAssigneeUid}
              disabled={engLoading}
              allowUnassigned
            />
          </div>

          {/* Due date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-due">Due date</Label>
            <Input
              id="ct-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={today()}
              className="h-12"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12 font-semibold"
              disabled={submitting || !title.trim() || consumerMobile.length !== 10}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating…
                </span>
              ) : (
                'Create Task'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
