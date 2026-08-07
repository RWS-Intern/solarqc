import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { can } from '@/config/roles';

export interface PresenceEntry {
  uid:      string;
  online:   boolean;
  lastSeen: number | null;
  name:     string;
  role:     string;
}

export function useOnlineUsers() {
  const { currentUser } = useAuthStore();
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceEntry>>({});

  useEffect(() => {
    if (!can(currentUser?.role, 'viewPresence')) return;

    const presenceRef = ref(rtdb, 'presence');

    const unsubscribe = onValue(presenceRef, (snapshot) => {
      const data = snapshot.val() ?? {};
      const entries: Record<string, PresenceEntry> = {};
      Object.entries(data).forEach(([uid, val]: [string, unknown]) => {
        const v = val as { online?: boolean; lastSeen?: number | null; name?: string; role?: string };
        entries[uid] = {
          uid,
          online:   v.online   ?? false,
          lastSeen: v.lastSeen ?? null,
          name:     v.name     ?? '',
          role:     v.role     ?? '',
        };
      });
      setPresenceMap(entries);
    });

    return () => { unsubscribe(); };
  }, [currentUser?.role]);

  const onlineUsers = Object.values(presenceMap).filter(u => u.online);
  const onlineCount = onlineUsers.length;

  return { presenceMap, onlineUsers, onlineCount };
}
