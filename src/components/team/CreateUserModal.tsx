import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useUserActions }   from '@/hooks/useUserActions';
import { DistrictCombobox } from '@/components/ui/DistrictCombobox';
import { StateCombobox }    from '@/components/ui/StateCombobox';
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
import type { UserRole } from '@/types';

interface CreateUserModalProps {
  open:    boolean;
  onClose: () => void;
}

export function CreateUserModal({ open, onClose }: CreateUserModalProps) {
  const { createUser } = useUserActions();

  const [name,          setName]          = useState('');
  const [email,         setEmail]         = useState('');
  const [role,          setRole]          = useState<UserRole>('field');
  const [state,         setState]         = useState('');
  const [district,      setDistrict]      = useState('');
  const [mobileNumber,  setMobileNumber]  = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [createdEmail,  setCreatedEmail]  = useState<string | null>(null);

  const mobileError = mobileNumber.length > 0 && mobileNumber.length !== 10;

  function reset() {
    setName('');
    setEmail('');
    setRole('field');
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
    if (!name.trim() || !email.trim() || mobileError) return;
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
                  <SelectItem value="field">Field Engineer</SelectItem>
                  <SelectItem value="proposal">Proposal Engineer</SelectItem>
                  <SelectItem value="backend">Backend Engineer</SelectItem>
                  <SelectItem value="view_only">View Only</SelectItem>
                  <SelectItem value="backend_manager">Backend Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {role === 'field' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cu-state">State</Label>
                  <StateCombobox id="cu-state" value={state} onChange={(val) => { setState(val); setDistrict(''); }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cu-district">District</Label>
                  <DistrictCombobox id="cu-district" value={district} onChange={setDistrict} state={state} />
                </div>
              </>
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
                disabled={submitting || !name.trim() || !email.trim() || mobileError}
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
