import { useEffect, useRef } from 'react';
import { ref, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { rtdb, auth } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';

export function usePresence() {
  const { currentUser } = useAuthStore();
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    // Fall back to auth.currentUser so presence fires immediately after
    // Firebase Auth restores the session, even before Zustand store is
    // populated from Firestore (avoids the timing gap on page refresh).
    const uid  = currentUser?.uid  ?? auth.currentUser?.uid;
    const name = currentUser?.name ?? '';
    const role = currentUser?.role ?? '';

    if (!uid) return;

    lastUidRef.current = uid;

    const presenceRef = ref(rtdb, `presence/${uid}`);

    // None of these are awaited — presence is a best-effort side signal,
    // never something any other code path waits on. Still catch failures
    // explicitly so a denied/offline write surfaces as a logged error
    // instead of an uncaught promise rejection.
    set(presenceRef, {
      online:   true,
      lastSeen: Date.now(),
      name,
      role,
    }).catch((err) => console.error('[usePresence] online write failed:', err));

    onDisconnect(presenceRef).set({
      online:   false,
      lastSeen: serverTimestamp(),
      name,
      role,
    }).catch((err) => console.error('[usePresence] onDisconnect registration failed:', err));

    return () => {
      // Use the stored ref so the write succeeds even if currentUser is
      // already null by the time this cleanup runs (explicit logout path).
      const uidToUse = lastUidRef.current;
      if (!uidToUse) return;
      const offlineRef = ref(rtdb, `presence/${uidToUse}`);
      set(offlineRef, {
        online:   false,
        lastSeen: serverTimestamp(),
        name:     '',
        role:     '',
      }).catch((err) => console.error('[usePresence] offline cleanup write failed:', err));
    };
  }, [currentUser?.uid]);
}
