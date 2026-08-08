import { useState, useEffect } from 'react';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { uploadToCloudinary } from '@/utils/uploadToCloudinary';
import { enqueuePhoto, type QueuedPhoto } from '@/utils/offlinePhotoQueue';
import { isConnectivityFailure } from '@/utils/offlineQueueReplay';
import { useQueuedSignature } from '@/hooks/useOfflineQueue';
import { _emitToast } from '@/components/ui/toast';
import type { SignOff } from '@/types/qc';

// A queued-but-unconfirmed signature's local blob preview — its own
// memoized object URL, revoked on unmount/change (a fresh IndexedDB read
// hands back a new Blob reference on every queue-change poll).
function QueuedSignaturePreview({ item, role }: { item: QueuedPhoto; role: 'inspector' | 'approver' }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objUrl = URL.createObjectURL(item.blob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [item]);

  return (
    <div className="flex items-center gap-3">
      {url && (
        <img
          src={url}
          alt={`${role === 'inspector' ? 'Inspector' : 'Approver'} signature (pending sync)`}
          className="h-16 rounded border border-gray-200 bg-white object-contain opacity-70"
        />
      )}
      <div>
        <p className="text-xs font-medium text-amber-600">Signed — pending sync</p>
        <p className="text-xs text-gray-400">Will upload once you're back online.</p>
      </div>
    </div>
  );
}

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
  jobId:        string;   // offline queueing needs the Firestore doc id, not just qcNum
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
export function SingleSignOff({ role, name, uid, designation, declaration, existing, onSign, qcNum, jobId, disabled }: SingleSignOffProps) {
  const [declarationChecked, setDeclarationChecked] = useState(!!existing);
  const [confirming, setConfirming] = useState(false);
  // Offline queueing only ever resolves for 'inspector': the inspector's
  // sign-off is written to Firestore in isolation the moment it's signed
  // (useQcFill.onInspectorSign), so a queued replay of just that one field
  // is a write the rules already allow. The approver's signature is
  // different — VerdictForm holds it in local state only and it's never
  // written to Firestore until the full verdict batch (submitVerdict)
  // commits, so an isolated approverSignOff-only replay write would be
  // rejected by the rules' own status-transition precondition every time,
  // permanently, while still re-uploading to Cloudinary on each retry.
  // Queueing it would trade one silent-loss bug for a slow-motion one.
  const queued = useQueuedSignature(role === 'inspector' ? jobId : undefined, role);

  async function handleConfirm(blob: Blob) {
    if (!declarationChecked) {
      _emitToast('Please check the declaration before signing.', 'error');
      return;
    }
    setConfirming(true);
    try {
      const file = new File([blob], `${role}-signature-${Date.now()}.png`, { type: 'image/png' });
      const locationPromise = captureFreshLocation();
      try {
        const [{ url }, location] = await Promise.all([
          uploadToCloudinary(file, { qcNum, fieldId: role, uploadType: 'signature', skipCompression: true }),
          locationPromise,
        ]);
        onSign({
          role, name, uid, designation,
          signatureUrl: url, location,
          deviceInfo: navigator.userAgent,
          declaration,
        });
      } catch (uploadErr) {
        if (role !== 'inspector' || !isConnectivityFailure(uploadErr)) throw uploadErr;
        const location = await locationPromise;
        await enqueuePhoto({
          kind: 'signature', jobId, qcNum, fieldId: role,
          blob, mimeType: 'image/png',
          signOffPayload: { role, name, uid, designation, location, deviceInfo: navigator.userAgent, declaration },
        });
        _emitToast("Offline — signature saved on this device and will sync once you're back online.", 'success');
      }
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

  if (queued) {
    return <QueuedSignaturePreview item={queued} role={role} />;
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
