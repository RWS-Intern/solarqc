import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { SingleSignOff } from '@/components/qc/SingleSignOff';
import { uploadToCloudinary } from '@/utils/uploadToCloudinary';
import { enqueuePhoto, type QueuedPhoto } from '@/utils/offlinePhotoQueue';
import { isConnectivityFailure } from '@/utils/offlineQueueReplay';
import { useQueuedSignature } from '@/hooks/useOfflineQueue';
import { useAppConfig } from '@/hooks/useAppConfig';
import { _emitToast } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import type { AppUser } from '@/types';
import type { SignOff } from '@/types/qc';

// Same memoized-blob-preview shape as SingleSignOff's — kept local here
// since the customer sign-off's confirmed/pending views are already
// bespoke in this file, not routed through SingleSignOff.
function QueuedCustomerSignaturePreview({ item }: { item: QueuedPhoto }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objUrl = URL.createObjectURL(item.blob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [item]);

  return (
    <div className="flex items-center gap-3">
      {url && (
        <img src={url} alt="Customer signature (pending sync)" className="h-16 rounded border border-gray-200 bg-white object-contain opacity-70" />
      )}
      <div>
        <p className="text-sm font-medium text-gray-900">{item.signOffPayload?.name}</p>
        <p className="text-xs font-medium text-amber-600">Signed — pending sync</p>
      </div>
    </div>
  );
}

function captureFreshLocation(): Promise<SignOff['location']> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      // Best-effort, non-blocking — same as the job-level capture. A denied
      // or unavailable reading just means this specific SignOff has no
      // location, never an error state.
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

function formatSignedAt(d: Date): string {
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface SignOffBlockProps {
  jobId:            string;
  qcNum:            string;
  currentUser:      AppUser;
  inspectorSignOff: SignOff | null;
  customerSignOff:  SignOff | null;
  onInspectorSign:  (signOff: Omit<SignOff, 'signedAt'>) => void;
  onCustomerSign:   (signOff: Omit<SignOff, 'signedAt'> | null) => void;
  disabled?:        boolean;
}

export function SignOffBlock({
  jobId, qcNum, currentUser, inspectorSignOff, customerSignOff, onInspectorSign, onCustomerSign, disabled,
}: SignOffBlockProps) {
  const { config } = useAppConfig();
  const [customerExpanded, setCustomerExpanded] = useState(!!customerSignOff);
  const [customerName,     setCustomerName]     = useState(customerSignOff?.name ?? '');
  const queuedCustomerSig = useQueuedSignature(jobId, 'customer');

  const inspectorDeclaration = config.declarationTexts?.inspector ?? 'I certify the above inspection was carried out by me at this site on the date shown.';
  const customerDeclaration  = config.declarationTexts?.customer  ?? 'I confirm the above installation was inspected in my presence.';

  async function handleCustomerConfirm(blob: Blob) {
    if (!customerName.trim()) {
      _emitToast('Enter the customer’s name before signing.', 'error');
      return;
    }
    const file = new File([blob], `customer-signature-${Date.now()}.png`, { type: 'image/png' });
    const locationPromise = captureFreshLocation();
    try {
      const [{ url }, location] = await Promise.all([
        uploadToCloudinary(file, { qcNum, fieldId: 'customer', uploadType: 'signature', skipCompression: true }),
        locationPromise,
      ]);
      onCustomerSign({
        role: 'customer',
        name: customerName.trim(),
        uid: null,
        signatureUrl: url,
        location,
        deviceInfo: navigator.userAgent,
        declaration: customerDeclaration,
      });
    } catch (err) {
      if (isConnectivityFailure(err)) {
        try {
          const location = await locationPromise;
          await enqueuePhoto({
            kind: 'signature', jobId, qcNum, fieldId: 'customer',
            blob, mimeType: 'image/png',
            signOffPayload: {
              role: 'customer', name: customerName.trim(), uid: null,
              location, deviceInfo: navigator.userAgent, declaration: customerDeclaration,
            },
          });
          _emitToast("Offline — customer signature saved on this device and will sync once you're back online.", 'success');
          return;
        } catch (queueErr) {
          console.error('[SignOffBlock] enqueue failed:', queueErr);
        }
      }
      console.error('[SignOffBlock] customer signature upload failed:', err);
      _emitToast('Could not save signature. Please try again.', 'error');
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-4">
      <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Sign-off</p>

      {/* ── Inspector (mandatory) ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-gray-900">
          Inspector: {currentUser.name} ({currentUser.engineerCode ?? '—'})
        </p>
        <SingleSignOff
          role="inspector"
          name={currentUser.name}
          uid={currentUser.uid}
          designation={currentUser.role}
          declaration={inspectorDeclaration}
          existing={inspectorSignOff}
          onSign={onInspectorSign}
          qcNum={qcNum}
          jobId={jobId}
          disabled={disabled}
        />
      </div>

      {/* ── Customer (optional) ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
        {!customerExpanded && !customerSignOff && !queuedCustomerSig ? (
          <button
            type="button"
            onClick={() => setCustomerExpanded(true)}
            disabled={disabled}
            className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline self-start disabled:opacity-50"
          >
            Add customer sign-off <ChevronDown className="h-3.5 w-3.5" />
          </button>
        ) : customerSignOff ? (
          <div className="flex items-center gap-3">
            <img
              src={customerSignOff.signatureUrl}
              alt="Customer signature"
              className="h-16 rounded border border-gray-200 bg-white object-contain"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">{customerSignOff.name}</p>
              <p className="text-xs text-gray-500">Signed {formatSignedAt(customerSignOff.signedAt)}</p>
            </div>
          </div>
        ) : queuedCustomerSig ? (
          <QueuedCustomerSignaturePreview item={queuedCustomerSig} />
        ) : (
          <>
            <p className="text-xs font-medium text-gray-500">Customer sign-off (optional)</p>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer's full name"
              disabled={disabled}
              className="h-10 text-sm max-w-xs"
            />
            <SignaturePad onConfirm={handleCustomerConfirm} disabled={disabled} />
            <p className="text-xs text-gray-500">{customerDeclaration}</p>
          </>
        )}
      </div>
    </div>
  );
}
