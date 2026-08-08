import { useState } from 'react';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { uploadToCloudinary } from '@/utils/uploadToCloudinary';
import { _emitToast } from '@/components/ui/toast';
import type { SignOff } from '@/types/qc';

function captureFreshLocation(): Promise<SignOff['location']> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      // Best-effort, non-blocking — a denied or unavailable reading just
      // means this specific SignOff has no location, never an error state.
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

function formatSignedAt(d: Date): string {
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface SingleSignOffProps {
  role:         'inspector' | 'approver';
  name:         string;
  uid:          string;
  designation?: string;
  declaration:  string;
  existing:     SignOff | null;
  onSign:       (signOff: Omit<SignOff, 'signedAt'>) => void;
  qcNum:        string;   // folder shape needs it: ritesolar-qc/{qcNum}/signatures/{role}
  disabled?:    boolean;
}

// The single-signer mechanic shared by the inspector's mandatory sign-off
// (Phase 5) and the approver's mandatory sign-off (Phase 6): fresh GPS at
// signing time, Cloudinary upload (never through the JPEG pipeline —
// skipCompression), a declaration checkbox that gates Confirm, and a
// locked, static confirmed view once signed. Not used for the customer's
// optional sign-off, which is nameable and genuinely optional — bespoke
// enough to stay in SignOffBlock.tsx rather than forcing a third shape
// through this component.
export function SingleSignOff({ role, name, uid, designation, declaration, existing, onSign, qcNum, disabled }: SingleSignOffProps) {
  const [declarationChecked, setDeclarationChecked] = useState(!!existing);
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm(blob: Blob) {
    if (!declarationChecked) {
      _emitToast('Please check the declaration before signing.', 'error');
      return;
    }
    setConfirming(true);
    try {
      const file = new File([blob], `${role}-signature-${Date.now()}.png`, { type: 'image/png' });
      const [{ url }, location] = await Promise.all([
        uploadToCloudinary(file, { qcNum, fieldId: role, uploadType: 'signature', skipCompression: true }),
        captureFreshLocation(),
      ]);
      onSign({
        role, name, uid, designation,
        signatureUrl: url, location,
        deviceInfo: navigator.userAgent,
        declaration,
      });
    } catch (err) {
      console.error(`[SingleSignOff] ${role} signature upload failed:`, err);
      _emitToast('Could not save signature. Please try again.', 'error');
    } finally {
      setConfirming(false);
    }
  }

  if (existing) {
    return (
      <div className="flex items-center gap-3">
        <img
          src={existing.signatureUrl}
          alt={`${role === 'inspector' ? 'Inspector' : 'Approver'} signature`}
          className="h-16 rounded border border-gray-200 bg-white object-contain"
        />
        <div>
          <p className="text-xs text-gray-500">Signed {formatSignedAt(existing.signedAt)}</p>
          {existing.location && <p className="text-xs text-gray-400">GPS captured</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">Date: {formatSignedAt(new Date())}</p>
      <SignaturePad onConfirm={handleConfirm} disabled={disabled || confirming} />
      <label className="flex items-start gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={declarationChecked}
          onChange={(e) => setDeclarationChecked(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-blue accent-brand-blue"
        />
        <span>{declaration}</span>
      </label>
    </div>
  );
}
