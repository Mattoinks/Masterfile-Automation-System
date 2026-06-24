import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApp } from '@/context/AppContext';
import { fetchDuplicateHistory, type DuplicateHistoryEntry } from '@/api';

export function HistoryPage() {
  const { logs } = useApp();
  const [dupHistory, setDupHistory] = useState<DuplicateHistoryEntry[]>([]);

  useEffect(() => {
    fetchDuplicateHistory(50).then(setDupHistory).catch(() => setDupHistory([]));
  }, [logs]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Audit Trail</h2>
        <p className="text-sm text-slate-500">Upload, edit, replace, insert, and duplicate resolution history</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-xs">{log.timestamp}</TableCell>
                  <TableCell>{log.filename}</TableCell>
                  <TableCell>{log.dn_number}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.status}</TableCell>
                  <TableCell className="text-xs">{log.user || 'System'}</TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">{log.details}</TableCell>
                </TableRow>
              ))}
              {!logs.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">No history yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate Resolution History</CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {dupHistory.map((entry, i) => (
                <TableRow key={i}>
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
                </TableRow>
              ))}
              {!dupHistory.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">No duplicate resolutions yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
