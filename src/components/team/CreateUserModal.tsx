import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useUserActions }   from '@/hooks/useUserActions';
import { ALL_ROLES, roleLabel } from '@/config/roles';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StateCombobox }    from '@/components/ui/StateCombobox';
import { DistrictCombobox } from '@/components/ui/DistrictCombobox';
import type { UserRole } from '@/types';

interface CreateUserModalProps {
  open:    boolean;
  onClose: () => void;
}

export function CreateUserModal({ open, onClose }: CreateUserModalProps) {
  const { createUser } = useUserActions();

  const [name,          setName]          = useState('');
  const [email,         setEmail]         = useState('');
  const [role,          setRole]          = useState<UserRole>('qc_inspector');
  const [state,         setState]         = useState('');
  const [district,      setDistrict]      = useState('');
  const [mobileNumber,  setMobileNumber]  = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [createdEmail,  setCreatedEmail]  = useState<string | null>(null);

  const mobileError = mobileNumber.length > 0 && mobileNumber.length !== 10;
  // Inspectors are the role whose numbers grow and need to stay findable by
  // geography (Team page's own filters already expect this) — every other
  // role keeps district/state genuinely optional, matching the schema.
  const locationRequired = role === 'qc_inspector';
  const locationError = locationRequired && (!state.trim() || !district.trim());

  function reset() {
    setName('');
    setEmail('');
    setRole('qc_inspector');
    setState('');
    setDistrict('');
    setMobileNumber('');
    setSubmitting(false);
    setCreatedEmail(null);
  }

  function handleClose() {
    if (!submitting) { reset(); onClose(); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || mobileError || locationError) return;
    setSubmitting(true);
    try {
      await createUser(name.trim(), email.trim(), role, district || undefined, mobileNumber || undefined, state || undefined);
      setCreatedEmail(email.trim());
    } catch {
      // Error toast already shown inside createUser
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent
        className="sm:max-w-md"
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
        </DialogHeader>

        {!createdEmail ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-name">
                Full Name <span className="text-brand-red">*</span>
              </Label>
              <Input
                id="cu-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-email">
                Email <span className="text-brand-red">*</span>
              </Label>
              <Input
                id="cu-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@ritesolar.com"
                required
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Role <span className="text-brand-red">*</span></Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>
                  State {locationRequired && <span className="text-brand-red">*</span>}
                  {!locationRequired && <span className="text-gray-400 font-normal"> (optional)</span>}
                </Label>
                <StateCombobox value={state} onChange={(v) => { setState(v); setDistrict(''); }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>
                  District {locationRequired && <span className="text-brand-red">*</span>}
                  {!locationRequired && <span className="text-gray-400 font-normal"> (optional)</span>}
                </Label>
                <DistrictCombobox value={district} onChange={setDistrict} state={state} />
              </div>
            </div>
            {locationError && (
              <p className="text-xs text-brand-red -mt-2">State and district are required for inspectors</p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-mobile">Mobile Number <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                id="cu-mobile"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                autoComplete="off"
                className={mobileError ? 'border-brand-red focus-visible:ring-brand-red' : ''}
              />
              {mobileError && (
                <p className="text-xs text-brand-red">Mobile number must be exactly 10 digits</p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={submitting || !name.trim() || !email.trim() || mobileError || locationError}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Creating…
                  </span>
                ) : (
                  'Create Account'
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-4 mt-2 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-gray-800">
                Account created successfully!
              </p>
              <p className="text-sm text-gray-500">
                A password setup email has been sent to{' '}
                <span className="font-medium text-gray-700">{createdEmail}</span>.
                They can log in after setting their password.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full mt-1">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
