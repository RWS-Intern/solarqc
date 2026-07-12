import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { User, Task } from '@/types';

export interface UserStats {
  tasks:   Task[];
  loading: boolean;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function docToPartialTask(id: string, data: Record<string, unknown>): Task {
  const rawDue     = data['dueDate'];
  const rawCreated = data['createdAt'];
  return {
    id,
    title:         (data['title']         ?? '') as string,
    taskNum:       (data['taskNum']        ?? '') as string,
    status:        (data['status']         ?? 'pending') as Task['status'],
    archived:      (data['archived']       ?? false)     as boolean,
    pipelineStage: (data['pipelineStage']  ?? 'survey')  as Task['pipelineStage'],
    dueDate:       rawDue     instanceof Timestamp ? rawDue.toDate()     : null,
    createdAt:     rawCreated instanceof Timestamp ? rawCreated.toDate() : new Date(),
    proposalRevisionCount: (data['proposalRevisionCount'] as number | undefined) ?? 0,
  } as Task;
}

export function useTeamStats(users: User[]): Record<string, UserStats> {
  const [statsMap, setStatsMap] = useState<Record<string, UserStats>>({});

  useEffect(() => {
    const nonAdmins = users.filter((u) => u.role !== 'admin' && u.active);
    if (nonAdmins.length === 0) { setStatsMap({}); return; }

    // Mark all non-admin users as loading
    const initial: Record<string, UserStats> = {};
    nonAdmins.forEach((u) => { initial[u.id] = { tasks: [], loading: true }; });
    setStatsMap(initial);

    const fieldUids    = nonAdmins.filter((u) => u.role !== 'proposal' && u.role !== 'backend').map((u) => u.id);
    const proposalUids = nonAdmins.filter((u) => u.role === 'proposal').map((u) => u.id);
    const backendUids  = nonAdmins.filter((u) => u.role === 'backend').map((u) => u.id);

    async function fetchGroup(
      uids:  string[],
      field: 'assignedTo' | 'proposalAssignedTo' | 'backendAssignedTo',
    ): Promise<Array<{ uid: string; task: Task }>> {
      const results: Array<{ uid: string; task: Task }> = [];
      for (const batch of chunk(uids, 30)) {
        const q = query(
          collection(db, 'tasks'),
          where(field,      'in',  batch),
          where('archived', '==',  false),
        );
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          const data = d.data();
          const uid  = (data[field] as string | null) ?? '';
          if (uid) results.push({ uid, task: docToPartialTask(d.id, data) });
        }
      }
      return results;
    }

    async function load() {
      try {
        const [fieldResults, proposalResults, backendResults] = await Promise.all([
          fieldUids.length    > 0 ? fetchGroup(fieldUids,    'assignedTo')           : Promise.resolve([]),
          proposalUids.length > 0 ? fetchGroup(proposalUids, 'proposalAssignedTo')   : Promise.resolve([]),
          backendUids.length  > 0 ? fetchGroup(backendUids,  'backendAssignedTo')    : Promise.resolve([]),
        ]);

        const allResults = [...fieldResults, ...proposalResults, ...backendResults];

        const next: Record<string, UserStats> = {};
        nonAdmins.forEach((u) => { next[u.id] = { tasks: [], loading: false }; });
        for (const { uid, task } of allResults) {
          if (next[uid]) next[uid].tasks.push(task);
        }

        setStatsMap(next);
      } catch (err) {
        console.error('[useTeamStats] fetch failed:', err);
        const fallback: Record<string, UserStats> = {};
        nonAdmins.forEach((u) => { fallback[u.id] = { tasks: [], loading: false }; });
        setStatsMap(fallback);
      }
    }

    void load();
    // users array from Zustand is stable by reference unless user list changes
  }, [users]);

  return statsMap;
}
