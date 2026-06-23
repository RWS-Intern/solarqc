import { WifiOff, Clock } from 'lucide-react';
import { useNetworkStatus }    from '@/hooks/useNetworkStatus';
import { useTaskOfflineQueue } from '@/hooks/useTaskOfflineQueue';

export function OfflineBanner() {
  const isOnline       = useNetworkStatus();
  const { queueCount } = useTaskOfflineQueue();

  if (isOnline && queueCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 text-sm font-medium">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">You&apos;re offline — updates will sync when connection is restored</span>
        {queueCount > 0 && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
            {queueCount} pending
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-brand-blue/10 border-b border-brand-blue/20 text-brand-navy px-4 py-2 text-sm">
      <Clock className="h-4 w-4 shrink-0 text-brand-blue animate-spin" />
      <span>Syncing {queueCount} offline update{queueCount !== 1 ? 's' : ''}…</span>
    </div>
  );
}
