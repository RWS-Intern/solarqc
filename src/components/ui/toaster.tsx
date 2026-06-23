import { useState, useEffect } from 'react';
import { Toast, _subscribeToast } from '@/components/ui/toast';
import type { ToastType } from '@/components/ui/toast';

export function Toaster() {
  const [toast, setToast] = useState<{
    message: string;
    type: ToastType;
  } | null>(null);

  useEffect(() => {
    return _subscribeToast((message, type) => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3500);
    });
  }, []);

  if (!toast) return null;

  return (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  );
}
