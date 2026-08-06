import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';

interface ErrorLog {
  id:           string;
  action:       string;
  errorMessage: string;
  errorCode:    string | null;
  userName:     string;
  userRole:     string;
  online:       boolean;
  createdAt:    { toDate?: () => Date } | null;
}

export function ErrorLogsPage() {
  const [logs,      setLogs]      = useState<ErrorLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'errorLogs'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    getDocs(q)
      .then((snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ErrorLog)));
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Error Logs</h1>
        <p className="text-xs text-gray-400 mt-0.5">Last 100 application errors (admin only)</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-16">No errors logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Online</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => {
                const date = log.createdAt?.toDate?.();
                return (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                      {date ? date.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{log.userName}</td>
                    <td className="px-4 py-3 text-gray-500">{log.userRole}</td>
                    <td className="px-4 py-3 font-mono text-xs text-brand-blue">{log.action}</td>
                    <td className="px-4 py-3 text-red-600 max-w-xs truncate" title={log.errorMessage}>
                      {log.errorMessage}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{log.errorCode ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={log.online ? 'text-green-600' : 'text-red-400'}>
                        {log.online ? 'yes' : 'no'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
