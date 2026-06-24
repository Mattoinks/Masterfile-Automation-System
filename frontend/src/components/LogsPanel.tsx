import type { LogEntry } from '../api';

interface LogsPanelProps {
  logs: LogEntry[];
}

export function LogsPanel({ logs }: LogsPanelProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Processing Log</h2>
      {logs.length === 0 ? (
        <p className="text-slate-500 text-sm">No log entries yet.</p>
      ) : (
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Timestamp</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Filename</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">DN Number</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Action</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log, i) => (
                <tr key={`${log.timestamp}-${i}`}>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{log.timestamp}</td>
                  <td className="px-3 py-2 text-slate-600">{log.filename}</td>
                  <td className="px-3 py-2 text-slate-600">{log.dn_number}</td>
                  <td className="px-3 py-2 text-slate-600">{log.action}</td>
                  <td className="px-3 py-2 text-slate-600">{log.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
