import { useEffect } from 'react';
import { processOfflineQueue } from '@/utils/offlineQueueReplay';

const RETRY_INTERVAL_MS = 30_000;

// Mounted once, globally (Layout.tsx) — not scoped to QcFillPage, because
// an inspector can queue a photo, navigate away, and regain connectivity
// on a completely different screen. The queue must still drain regardless
// of what's currently mounted. Three triggers: once at mount (in case the
// app loads already-online with leftover items from a previous session),
// the 'online' event, and a periodic safety net — 'online'/'offline'
// aren't fully reliable (a captive portal can report "online" while
// nothing actually reaches the internet).
export function useOfflineQueueProcessor(): void {
  useEffect(() => {
    void processOfflineQueue();
    window.addEventListener('online', processOfflineQueue);
    const interval = setInterval(() => { void processOfflineQueue(); }, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', processOfflineQueue);
      clearInterval(interval);
    };
  }, []);
}
