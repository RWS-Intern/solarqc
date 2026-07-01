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
import { DistrictCombobox }  from '@/components/ui/DistrictCombobox';

interface CreateTaskModalProps {
  open:    boolean;
  onClose: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

export function CreateTaskModal({ open, onClose }: CreateTaskModalProps) {
  const { createTask }          = useTaskActions();
  const { engineers, loading: engLoading } = useFieldEngineers();

  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [district,    setDistrict]    = useState('');
  const [assigneeUid, setAssigneeUid] = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  function reset() {
    setTitle('');
    setDescription('');
    setDistrict('');
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
      await createTask({
        title,
        description: description || undefined,
        district:    district || undefined,
        assignedTo:     engineer?.uid     ?? null,
        assignedToName: engineer?.displayName  ?? '',
        assignedToCode: engineer?.engineerCode ?? '',
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
        className="sm:max-w-md"
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
              rows={3}
            />
          </div>

          {/* District */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-district">District</Label>
            <DistrictCombobox id="ct-district" value={district} onChange={setDistrict} />
          </div>

          <div className="border-t border-gray-100" />

          {/* Assign to */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-assign">Assign to</Label>
            <select
              id="ct-assign"
              value={assigneeUid}
              onChange={(e) => setAssigneeUid(e.target.value)}
              disabled={engLoading}
              className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— Unassigned —</option>
              {engineers.map((eng) => (
                <option key={eng.uid} value={eng.uid}>
                  {eng.displayName}{eng.engineerCode ? ` — ${eng.engineerCode}` : ''}
                </option>
              ))}
            </select>
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
              disabled={submitting || !title.trim()}
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
