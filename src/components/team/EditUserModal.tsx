import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { useUserActions }    from '@/hooks/useUserActions';
import { DistrictCombobox }  from '@/components/ui/DistrictCombobox';
import { StateCombobox }     from '@/components/ui/StateCombobox';
import type { User } from '@/types';

interface EditUserModalProps {
  user:    User | null;
  onClose: () => void;
}

export function EditUserModal({ user, onClose }: EditUserModalProps) {
  const { updateUserName, updateUserDistrict, updateUserMobile } = useUserActions();

  const [name,         setName]         = useState('');
  const [state,        setState]        = useState('');
  const [district,     setDistrict]     = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [nameError,    setNameError]    = useState('');

  const mobileError = mobileNumber.length > 0 && mobileNumber.length !== 10;

  useEffect(() => {
    if (user) {
      setName(user.name);
      setState(user.state ?? '');
      setDistrict(user.district ?? '');
      setMobileNumber(user.mobileNumber ?? '');
      setNameError('');
    }
  }, [user]);

  async function handleSave() {
    if (!user) return;
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    if (mobileError) return;
    setSaving(true);
    try {
      await updateUserName(user.id, name, user.role);
      if (user.role === 'field') {
        await updateUserDistrict(user.id, district, state);
      }
      // Only sync tasks when mobile actually changed (avoids spurious batch-writes)
      if (mobileNumber.trim() !== (user?.mobileNumber ?? '')) {
        await updateUserMobile(user.id, mobileNumber.trim());
      }
      onClose();
    } catch {
      // Error toast already shown
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!user}
      onOpenChange={(isOpen) => { if (!isOpen && !saving) onClose(); }}
    >
      <DialogContent
        className="max-w-sm"
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              placeholder="Full name"
              disabled={saving}
              className={nameError ? 'border-brand-red focus-visible:ring-brand-red' : ''}
            />
            {nameError && (
              <p className="text-xs text-brand-red">{nameError}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-email" className="text-gray-500">
              Email
            </Label>
            <Input
              id="edit-email"
              value={user?.email ?? ''}
              readOnly
              disabled
              className="bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-role" className="text-gray-500">
              Role
            </Label>
            <Input
              id="edit-role"
              value={
                user?.role === 'admin'           ? 'Admin' :
                user?.role === 'field'           ? 'Field Engineer' :
                user?.role === 'proposal'        ? 'Proposal Engineer' :
                user?.role === 'backend'         ? 'Backend Engineer' :
                user?.role === 'view_only'       ? 'View Only' :
                user?.role === 'backend_manager' ? 'Backend Manager' :
                user?.role ?? ''
              }
              readOnly
              disabled
              className="bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>

          {user?.role === 'field' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>State (optional)</Label>
                <StateCombobox
                  value={state}
                  onChange={(val) => { setState(val); setDistrict(''); }}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>District (optional)</Label>
                <DistrictCombobox
                  value={district}
                  onChange={setDistrict}
                  state={state}
                  placeholder="Select or type district..."
                  disabled={saving}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-mobile">Mobile Number <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input
              id="edit-mobile"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              disabled={saving}
              className={mobileError ? 'border-brand-red focus-visible:ring-brand-red' : ''}
            />
            {mobileError && (
              <p className="text-xs text-brand-red">Mobile number must be exactly 10 digits</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || mobileError}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving…
                </span>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
