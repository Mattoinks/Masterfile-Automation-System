import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import {
  fetchDuplicateHistory,
  clearLogs,
  deleteLogEntry,
  clearDuplicateHistory,
  deleteDuplicateHistoryEntry,
  type DuplicateHistoryEntry,
} from '@/api';

export function HistoryPage() {
  const { logs, refreshDashboard } = useApp();
  const { can } = useAuth();
  const [dupHistory, setDupHistory] = useState<DuplicateHistoryEntry[]>([]);

  const loadDupHistory = () => {
    fetchDuplicateHistory(50).then(setDupHistory).catch(() => setDupHistory([]));
  };

  useEffect(() => {
    loadDupHistory();
  }, [logs]);

  const onClearLogs = async () => {
    if (!confirm('Clear the entire activity log? This cannot be undone.')) return;
    await clearLogs();
    await refreshDashboard();
  };

  const onDeleteLog = async (id: number) => {
    await deleteLogEntry(id);
    await refreshDashboard();
  };

  const onClearDupHistory = async () => {
    if (!confirm('Clear the entire duplicate resolution history? This cannot be undone.')) return;
    await clearDuplicateHistory();
    loadDupHistory();
  };

  const onDeleteDupEntry = async (id: number) => {
    await deleteDuplicateHistoryEntry(id);
    loadDupHistory();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Audit Trail</h2>
        <p className="text-sm text-slate-500">Upload, edit, replace, insert, and duplicate resolution history</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Activity Log</CardTitle>
          {can('delete') && logs.length > 0 && (
            <Button variant="outline" size="sm" onClick={onClearLogs}>
              <Trash2 className="h-4 w-4" /> Clear All
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead>DN</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Details</TableHead>
                {can('delete') && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs">{log.timestamp}</TableCell>
                  <TableCell>{log.filename}</TableCell>
                  <TableCell>{log.dn_number}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.status}</TableCell>
                  <TableCell className="text-xs">{log.user || 'System'}</TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">{log.details}</TableCell>
                  {can('delete') && (
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => onDeleteLog(log.id)} title="Delete entry">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!logs.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500">No history yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Duplicate Resolution History</CardTitle>
          {can('delete') && dupHistory.length > 0 && (
            <Button variant="outline" size="sm" onClick={onClearDupHistory}>
              <Trash2 className="h-4 w-4" /> Clear All
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Case</TableHead>
                <TableHead>DN</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Changes</TableHead>
                {can('delete') && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dupHistory.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs whitespace-nowrap">{entry.date}</TableCell>
                  <TableCell>{entry.case_id}</TableCell>
                  <TableCell>{entry.dn_number}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.user}</TableCell>
                  <TableCell className="text-xs">
                    {Object.entries(entry.field_changes).map(([field, ch]) => (
                      <div key={field}>{field}: {ch.existing} → {ch.new}</div>
                    ))}
                    {!Object.keys(entry.field_changes).length && '—'}
                  </TableCell>
                  {can('delete') && (
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => onDeleteDupEntry(entry.id)} title="Delete entry">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!dupHistory.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">No duplicate resolutions yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
