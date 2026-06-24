import { useCallback, useEffect, useState } from 'react';
import { Eye, Pencil, Trash2, Search } from 'lucide-react';
import { fastSearch, softDeleteRecords, type IndexedRecord } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { RecordViewModal } from './RecordViewModal';
import { RecordEditModal } from './RecordEditModal';

export function MasterfileRecordsManager() {
  const { can, isReadOnly } = useAuth();
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState<IndexedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<IndexedRecord[] | null>(null);
  const [viewRecord, setViewRecord] = useState<IndexedRecord | null>(null);
  const [editRecord, setEditRecord] = useState<IndexedRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fastSearch(q, 200);
      setRecords(res.results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 200);
    return () => clearTimeout(t);
  }, [search, load]);

  const toggleSelect = (caseId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === records.length) setSelected(new Set());
    else setSelected(new Set(records.map((r) => r.case_id)));
  };

  const handleDelete = async () => {
    if (!deleteTarget?.length) return;
    setDeleting(true);
    try {
      await softDeleteRecords(
        deleteTarget.map((r) => r.case_id)
      );
      setDeleteTarget(null);
      setSelected(new Set());
      await load(search);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const deleteSelected = () => {
    const targets = records.filter((r) => selected.has(r.case_id));
    if (targets.length) setDeleteTarget(targets);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Masterfile Records</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              {records.length} active records · instant search via SQLite index
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search DN, Case ID, Device..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {can('delete') && !isReadOnly && selected.size > 0 && (
              <Button variant="destructive" size="sm" onClick={deleteSelected}>
                <Trash2 className="h-4 w-4" /> Delete ({selected.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-brand-700 hover:bg-brand-700">
                  <TableHead className="text-white w-10">
                    {!isReadOnly && (
                      <input type="checkbox" checked={records.length > 0 && selected.size === records.length} onChange={toggleAll} />
                    )}
                  </TableHead>
                  <TableHead className="text-white">Case_ID</TableHead>
                  <TableHead className="text-white">DN</TableHead>
                  <TableHead className="text-white">Device</TableHead>
                  <TableHead className="text-white">Owner</TableHead>
                  <TableHead className="text-white">Qty</TableHead>
                  <TableHead className="text-white">SAP</TableHead>
                  <TableHead className="text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">Searching...</TableCell></TableRow>
                ) : !records.length ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No records found</TableCell></TableRow>
                ) : records.map((row) => (
                  <TableRow key={row.case_id}>
                    <TableCell>
                      {!isReadOnly && (
                        <input type="checkbox" checked={selected.has(row.case_id)} onChange={() => toggleSelect(row.case_id)} />
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{row.case_id}</TableCell>
                    <TableCell className="text-xs">{row.dn_number}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate">{row.device}</TableCell>
                    <TableCell className="text-xs">{row.owner}</TableCell>
                    <TableCell className="text-xs">{row.quantity}</TableCell>
                    <TableCell className="text-xs">{row.rma_number}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewRecord(row)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {can('edit') && !isReadOnly && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditRecord(row)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {can('delete') && !isReadOnly && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget([row])}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {deleteTarget && (
        <DeleteConfirmModal
          caseIds={deleteTarget.map((r) => r.case_id)}
          dnNumbers={deleteTarget.map((r) => r.dn_number)}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {viewRecord && (
        <RecordViewModal record={viewRecord} onClose={() => setViewRecord(null)} />
      )}

      {editRecord && (
        <RecordEditModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => { setEditRecord(null); load(search); }}
        />
      )}
    </>
  );
}
