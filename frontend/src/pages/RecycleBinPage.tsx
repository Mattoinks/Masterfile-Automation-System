import { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import {
  getRecycleBin,
  restoreRecords,
  permanentDeleteRecords,
  type IndexedRecord,
} from '@/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DeleteConfirmModal } from '@/components/masterfile/DeleteConfirmModal';

export function RecycleBinPage() {
  const { can, role } = useAuth();
  const [records, setRecords] = useState<IndexedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [permanentTarget, setPermanentTarget] = useState<IndexedRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRecycleBin();
      setRecords(res.records);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (caseId: string) => {
    setBusy(true);
    try {
      await restoreRecords([caseId]);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentTarget) return;
    setBusy(true);
    try {
      await permanentDeleteRecords([permanentTarget.case_id]);
      setPermanentTarget(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Recycle Bin</h2>
        <p className="text-sm text-slate-500">Soft-deleted records — restore or permanently remove (Admin)</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deleted Records ({records.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case_ID</TableHead>
                <TableHead>DN</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : !records.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Recycle bin is empty</TableCell></TableRow>
              ) : records.map((row) => (
                <TableRow key={row.case_id}>
                  <TableCell>{row.case_id}</TableCell>
                  <TableCell>{row.dn_number}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{row.device}</TableCell>
                  <TableCell>{row.owner}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.updated_at?.slice(0, 10) || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {can('restore') && (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => handleRestore(row.case_id)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </Button>
                      )}
                      {can('delete') && role === 'admin' && (
                        <Button variant="destructive" size="sm" disabled={busy} onClick={() => setPermanentTarget(row)}>
                          <Trash2 className="h-3.5 w-3.5" /> Permanent
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {permanentTarget && (
        <DeleteConfirmModal
          caseIds={[permanentTarget.case_id]}
          dnNumbers={[permanentTarget.dn_number]}
          permanent
          loading={busy}
          onConfirm={handlePermanentDelete}
          onCancel={() => setPermanentTarget(null)}
        />
      )}
    </div>
  );
}
