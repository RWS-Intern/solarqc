import { useRef, useState, useEffect } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { uploadToCloudinary } from '@/utils/uploadToCloudinary';
import { _emitToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface PhotoZoneProps {
  label:                string;
  photos:               string[];
  onPhotosChange:       (urls: string[]) => void;
  onUploadingChange?:   (uploading: boolean) => void;
  required?:            boolean;
  maxPhotos?:           number;
  disabled?:            boolean;
  taskNum?:             string;
  taskId?:              string;
  fieldId?:             string;
  photoType?:           'field' | 'completion';
  engineerCode?:        string;
  engineerName?:        string;
  fieldLabel?:          string;
  uploadType?:          'documents';
}

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

interface PendingUpload {
  tempId:     string;
  progress:   number;
  previewUrl: string;
  isPdf:      boolean;
}

let _uid = 0;
function nextTempId() { return `pp-${++_uid}`; }

export function PhotoZone({
  label,
  photos,
  onPhotosChange,
  onUploadingChange,
  required   = false,
  maxPhotos  = 5,
  disabled   = false,
  taskNum,
  taskId,
  fieldId,
  photoType,
  engineerCode,
  engineerName,
  fieldLabel,
  uploadType,
}: PhotoZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

  const latestPhotosRef       = useRef<string[]>(photos);
  const onChangeRef           = useRef(onPhotosChange);
  const onUploadingChangeRef  = useRef(onUploadingChange);
  const pendingRef            = useRef<PendingUpload[]>([]);

  useEffect(() => {
    // Only sync from props when no upload is in flight.
    // During an upload, latestPhotosRef is the source of truth
    // to prevent Firestore real-time updates from clobbering local changes.
    if (pendingUploads.length === 0) {
      latestPhotosRef.current = photos;
    }
  }, [photos, pendingUploads.length]);
  useEffect(() => { onChangeRef.current          = onPhotosChange; },         [onPhotosChange]);
  useEffect(() => { onUploadingChangeRef.current = onUploadingChange; },      [onUploadingChange]);
  useEffect(() => { pendingRef.current           = pendingUploads; },         [pendingUploads]);

  // Signal to parent whenever upload count transitions between 0 and >0.
  useEffect(() => {
    onUploadingChangeRef.current?.(pendingUploads.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUploads.length]);

  useEffect(() => () => {
    pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  }, []);

  const totalShown = photos.length + pendingUploads.length;
  const canAdd     = !disabled && totalShown < maxPhotos;
  const isEmpty    = totalShown === 0;
  const showError  = required && isEmpty;

  function removePhoto(url: string) {
    if (disabled) return;
    const updated = latestPhotosRef.current.filter((u) => u !== url);
    latestPhotosRef.current = updated;
    onChangeRef.current(updated);
  }

  function startUpload(file: File, index = 0) {
    const tempId     = nextTempId();
    const previewUrl = URL.createObjectURL(file);

    const fileIsPdf = file.type === 'application/pdf' ||
                      file.name.toLowerCase().endsWith('.pdf');
    setPendingUploads((prev) => [
      ...prev,
      { tempId, progress: 0, previewUrl, isPdf: fileIsPdf },
    ]);

    uploadToCloudinary(file, {
      onProgress: (pct) => {
        setPendingUploads((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, progress: pct } : p)),
        );
      },
      taskNum,
      taskId,
      fieldId,
      photoType,
      index,
      engineerCode,
      engineerName,
      fieldLabel,
      uploadType,
    })
      .then(({ url }) => {
        setPendingUploads((prev) => prev.filter((p) => p.tempId !== tempId));
        URL.revokeObjectURL(previewUrl);
        const updated = [...latestPhotosRef.current, url];
        latestPhotosRef.current = updated;
        onChangeRef.current(updated);
      })
      .catch(() => {
        setPendingUploads((prev) => prev.filter((p) => p.tempId !== tempId));
        URL.revokeObjectURL(previewUrl);
        if (!navigator.onLine) {
          // Offline: convert to base64 so the offline queue can
          // upload it after reconnect — base64 survives tab close,
          // unlike a blob URL which becomes invalid immediately.
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            const updated = [...latestPhotosRef.current, base64];
            latestPhotosRef.current = updated;
            onChangeRef.current(updated);
          };
          reader.onerror = () => {
            // FileReader failed — nothing we can do, just warn
            _emitToast('Could not save photo offline. Please retake when reconnected.', 'error');
          };
          reader.readAsDataURL(file);
          _emitToast('Saved locally — will upload when reconnected', 'success');
        } else {
          // Online but upload failed: show clear error so engineer retries
          _emitToast('Upload failed. Please try uploading the photo again.', 'error');
        }
      });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const oversized = files.filter((f) => {
      const limitMb = f.type === 'application/pdf' ||
                      f.name.toLowerCase().endsWith('.pdf')
        ? 20 * 1024 * 1024
        : 10 * 1024 * 1024;
      return f.size > limitMb;
    });
    oversized.forEach((f) => {
      const isPdf = f.type === 'application/pdf' ||
                    f.name.toLowerCase().endsWith('.pdf');
      _emitToast(
        `"${f.name}" exceeds the ${isPdf ? '20' : '10'} MB limit.`,
        'error',
      );
    });
    const valid = files.filter((f) => {
      const limitMb = f.type === 'application/pdf' ||
                      f.name.toLowerCase().endsWith('.pdf')
        ? 20 * 1024 * 1024
        : 10 * 1024 * 1024;
      return f.size <= limitMb;
    });
    if (valid.length === 0) return;

    const remaining = maxPhotos - (latestPhotosRef.current.length + pendingUploads.length);
    if (remaining <= 0) {
      _emitToast(`Maximum ${maxPhotos} photo${maxPhotos !== 1 ? 's' : ''} allowed.`, 'warning');
      return;
    }
    if (valid.length > remaining) {
      _emitToast(`Only ${remaining} more photo${remaining !== 1 ? 's' : ''} can be added.`, 'warning');
    }

    const baseIndex = latestPhotosRef.current.length + pendingRef.current.length;
    valid.slice(0, remaining).forEach((f, i) => startUpload(f, baseIndex + i));
  }

  return (
    <div className="space-y-2">
      {!isEmpty && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url, i) => (
            <div key={url} className="relative">
              <div
                className="relative rounded-lg overflow-hidden bg-gray-100"
                style={{ paddingBottom: '100%' }}
              >
                {isPdfUrl(url) ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50 hover:bg-red-100 transition-colors no-underline p-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-2xl">📄</span>
                    <span className="text-[9px] text-red-700 font-medium text-center leading-tight line-clamp-2 px-1">
                      {getFilename(url)}
                    </span>
                    <span className="text-[9px] text-red-500">PDF</span>
                  </a>
                ) : (
                  <img
                    src={url}
                    alt={`${label} ${i + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removePhoto(url)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 transition-colors hover:bg-black/80"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              )}
            </div>
          ))}

          {pendingUploads.map((p) => (
            <div key={p.tempId} className="relative">
              <div
                className="relative rounded-lg overflow-hidden bg-gray-200"
                style={{ paddingBottom: '100%' }}
              >
                {!p.isPdf ? (
                  <img
                    src={p.previewUrl}
                    alt="Uploading…"
                    className="absolute inset-0 h-full w-full object-cover opacity-40"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-50/60">
                    <span className="text-2xl opacity-50">📄</span>
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                  <span className="text-xs font-semibold text-gray-700">{p.progress}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div
          className={cn(
            'rounded-lg border-2 transition-colors',
            isEmpty ? 'border-dashed' : 'border-solid',
            showError
              ? 'border-red-300 bg-red-50'
              : 'border-gray-200 bg-gray-50 hover:border-gray-300',
          )}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-0.5 py-3 text-brand-blue hover:text-brand-blue/80 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Camera className="h-4 w-4" />
              {isEmpty ? 'Tap to add photo' : 'Add More'}
            </span>
            {isEmpty && (
              <span className="text-[10px] text-gray-400 font-normal">Camera, Gallery or PDF</span>
            )}
          </button>
        </div>
      )}

      {!disabled && !canAdd && totalShown >= maxPhotos && (
        <p className="text-center text-xs text-gray-400">
          Maximum {maxPhotos} photo{maxPhotos !== 1 ? 's' : ''} reached
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
