export interface UploadResult {
  url:      string;
  publicId: string;
}

export async function uploadToCloudinary(
  file:     File,
  options?: {
    onProgress?:   (percent: number) => void;
    taskId?:       string;
    taskNum?:      string;
    fieldId?:      string;
    photoType?:    'field' | 'completion';
    index?:        number;
    engineerCode?: string;
    engineerName?: string;
    fieldLabel?:   string;
    uploadType?:   'proposal' | 'documents';
  },
): Promise<UploadResult> {
  const cloudName    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME    as string;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

  if (!cloudName || !uploadPreset) throw new Error('Cloudinary env vars not set');

  const { onProgress, taskNum } = options ?? {};

  const engineerSegment = (options?.engineerCode && options?.engineerName)
    ? `${options.engineerCode}_${options.engineerName.replace(/\s+/g, '_')}`
    : 'unassigned';

  const folder = options?.uploadType === 'proposal' && taskNum
    ? `solarops/${taskNum}/proposal`
    : options?.uploadType === 'documents' && taskNum
    ? `solarops/${taskNum}/documents`
    : taskNum
    ? `solarops/${taskNum}/${engineerSegment}`
    : 'solarops';

  const isPdf = file.type === 'application/pdf' ||
                file.name.toLowerCase().endsWith('.pdf');

  let compressed: File;
  if (isPdf) {
    // Rename PDF so Cloudinary doesn't use original filename
    compressed = new File([file], `document_${Date.now()}.pdf`,
      { type: file.type });
  } else {
    compressed = await compressImage(file);
  }

  const formData   = new FormData();
  formData.append('file',          compressed);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder',        folder);
  if (isPdf)    formData.append('resource_type', 'raw');

  return uploadWithRetry(formData, cloudName, isPdf, onProgress);
}

async function uploadWithRetry(
  formData:    FormData,
  cloudName:   string,
  isPdf:       boolean,
  onProgress?: (percent: number) => void,
  attempt      = 1,
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr    = new XMLHttpRequest();
    xhr.timeout  = 60_000;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        resolve({ url: data.secure_url as string, publicId: data.public_id as string });
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });
    xhr.addEventListener('error',   () => reject(new Error('Upload network error')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

    const endpoint = isPdf
      ? `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`
      : `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
    xhr.open('POST', endpoint);
    xhr.send(formData);
  }).catch(async (err: Error) => {
    if (attempt < 2) {
      console.warn(`Upload attempt ${attempt} failed (${err.message}), retrying…`);
      await new Promise<void>((r) => setTimeout(r, 2000));
      return uploadWithRetry(formData, cloudName, isPdf, onProgress, attempt + 1);
    }
    throw err;
  });
}

async function compressImage(file: File): Promise<File> {
  if (file.size > 10 * 1024 * 1024) throw new Error('File too large. Maximum size is 10MB.');

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1200;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round((height / width) * MAX_DIM); width = MAX_DIM; }
        else                { width  = Math.round((width / height) * MAX_DIM); height = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }));
        },
        'image/jpeg', 0.8,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}
