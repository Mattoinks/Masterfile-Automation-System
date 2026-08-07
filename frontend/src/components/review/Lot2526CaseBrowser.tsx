import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { sanitizeQtyInput } from '@/lib/utils';
import {
  fetchLot2526Cases,
  fetchLot2526CaseDetail,
  appendLot2526Entry,
  updateLot2526RowLotCreation,
  type Lot2526CaseSummary,
  type Lot2526CaseDetail,
  type Lot2526LotCreationEntry,
} from '@/api';

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_ENTRY: Lot2526LotCreationEntry = {
  created_lot_no: '',
  date_created: TODAY,
  created_date_code: '',
  physical_lot_qty: '',
  lot_code: '',
};

function rowToEntry(row: Lot2526CaseDetail['rows'][number]): Lot2526LotCreationEntry {
  return {
    created_lot_no: row.created_lot_no || row.suggested_created_lot_no,
    date_created: row.date_created || TODAY,
    created_date_code: row.created_date_code || row.date_code,
    physical_lot_qty: row.physical_lot_qty,
    lot_code: row.lot_code,
  };
}

export function Lot2526CaseBrowser() {
  const { can } = useAuth();
  const [cases, setCases] = useState<Lot2526CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCaseNo, setSelectedCaseNo] = useState<number | null>(null);
  const [detail, setDetail] = useState<Lot2526CaseDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rowEdits, setRowEdits] = useState<Record<number, Lot2526LotCreationEntry>>({});
  const [savingRow, setSavingRow] = useState<number | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowEntry, setNewRowEntry] = useState(EMPTY_ENTRY);
  const [savingNewRow, setSavingNewRow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCases = async () => {
    setLoading(true);
    try {
      const result = await fetchLot2526Cases();
      setCases(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  const applyDetail = (result: Lot2526CaseDetail) => {
    setDetail(result);
    setRowEdits(Object.fromEntries(result.rows.map((row) => [row.row_index, rowToEntry(row)])));
  };

  const openCase = async (caseNo: number) => {
    setSelectedCaseNo(caseNo);
    setLoadingDetail(true);
    setError(null);
    setShowAddRow(false);
    setNewRowEntry(EMPTY_ENTRY);
    try {
      const result = await fetchLot2526CaseDetail(caseNo);
      applyDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case');
    } finally {
      setLoadingDetail(false);
    }
  };

  const onSaveRow = async (rowIndex: number) => {
    if (selectedCaseNo == null) return;
    const entry = rowEdits[rowIndex];
    if (!entry) return;
    setSavingRow(rowIndex);
    setError(null);
    try {
      const updated = await updateLot2526RowLotCreation(selectedCaseNo, rowIndex, entry);
      applyDetail(updated);
      await loadCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save row');
    } finally {
      setSavingRow(null);
    }
  };

  const onAddRow = async () => {
    if (selectedCaseNo == null) return;
    setSavingNewRow(true);
    setError(null);
    try {
      const updated = await appendLot2526Entry(selectedCaseNo, newRowEntry);
      applyDetail(updated);
      setNewRowEntry(EMPTY_ENTRY);
      setShowAddRow(false);
      await loadCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add row');
    } finally {
      setSavingNewRow(false);
    }
  };

  const filteredCases = cases.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return String(c.case_no).includes(q) || c.test_bau.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">2526 Cases</h3>
        <p className="text-sm text-slate-500">
          Created Lot#, Date Created, and Date Code are generated automatically at intake. Edit them here if
          needed, then fill in Physical Lot Qty and Lot Code once the physical sorting/testing happens.
        </p>
      </div>

      {error && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-6 text-sm text-red-600">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search case No. or Test Bau"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-1 overflow-y-auto">
                {filteredCases.map((c) => (
                  <button
                    key={c.case_no}
                    onClick={() => openCase(c.case_no)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      selectedCaseNo === c.case_no
                        ? 'border-brand-700 bg-brand-50 dark:bg-brand-950/30'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span>No. {c.case_no}</span>
                      <span className="text-xs text-slate-500">{c.total_return_qty}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.test_bau || '—'} · {c.lot_line_count} lot line(s) · {c.lot_creation_count} created
                    </div>
                  </button>
                ))}
                {!filteredCases.length && (
                  <p className="py-6 text-center text-sm text-slate-400">No cases found.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{detail ? `Case No. ${detail.case_no}` : 'Select a case'}</CardTitle>
            <CardDescription>
              {detail ? `Test Bau: ${detail.test_bau || '—'}` : 'Choose a case from the list to view and edit its rows.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingDetail && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}

            {!loadingDetail && detail && (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Original Label Lot no.</TableHead>
                        <TableHead>Date code</TableHead>
                        <TableHead>Return Qty from DC</TableHead>
                        <TableHead>Created Lot#</TableHead>
                        <TableHead>Date Created</TableHead>
                        <TableHead>Created Date Code</TableHead>
                        <TableHead>Physical Lot Qty</TableHead>
                        <TableHead>Lot Code</TableHead>
                        {can('insert') && <TableHead />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.rows.map((row) => {
                        const entry = rowEdits[row.row_index] ?? rowToEntry(row);
                        const isSuggested = !row.created_lot_no && !!row.suggested_created_lot_no;
                        const setField = (field: keyof Lot2526LotCreationEntry, value: string) =>
                          setRowEdits((prev) => ({ ...prev, [row.row_index]: { ...entry, [field]: value } }));
                        return (
                          <TableRow key={row.row_index}>
                            <TableCell>{row.original_label_lot_no}</TableCell>
                            <TableCell>{row.date_code}</TableCell>
                            <TableCell>{row.return_qty_from_dc}</TableCell>
                            <TableCell>
                              <Input
                                className={isSuggested ? 'text-slate-400' : undefined}
                                value={entry.created_lot_no}
                                disabled={!can('insert')}
                                onChange={(e) => setField('created_lot_no', e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                value={entry.date_created}
                                disabled={!can('insert')}
                                onChange={(e) => setField('date_created', e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={entry.created_date_code}
                                disabled={!can('insert')}
                                onChange={(e) => setField('created_date_code', e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                inputMode="numeric"
                                value={entry.physical_lot_qty}
                                disabled={!can('insert')}
                                onChange={(e) => setField('physical_lot_qty', sanitizeQtyInput(e.target.value))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={entry.lot_code}
                                disabled={!can('insert')}
                                onChange={(e) => setField('lot_code', e.target.value)}
                              />
                            </TableCell>
                            {can('insert') && (
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onSaveRow(row.row_index)}
                                  disabled={savingRow === row.row_index}
                                >
                                  {savingRow === row.row_index ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {can('insert') && (
                  <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                    {!showAddRow ? (
                      <Button variant="outline" size="sm" onClick={() => setShowAddRow(true)}>
                        <Plus className="h-4 w-4" />
                        Add extra row
                      </Button>
                    ) : (
                      <>
                        <h4 className="text-sm font-semibold">Add extra row</h4>
                        <p className="text-xs text-slate-500">
                          For a case that needs more lot-creation entries than its original lot lines (e.g. a
                          merged-wafer split).
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500">Created Lot#</label>
                            <Input
                              value={newRowEntry.created_lot_no}
                              onChange={(e) => setNewRowEntry({ ...newRowEntry, created_lot_no: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500">Date Created</label>
                            <Input
                              type="date"
                              value={newRowEntry.date_created}
                              onChange={(e) => setNewRowEntry({ ...newRowEntry, date_created: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500">Date Code</label>
                            <Input
                              value={newRowEntry.created_date_code}
                              onChange={(e) => setNewRowEntry({ ...newRowEntry, created_date_code: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500">Physical Lot Qty</label>
                            <Input
                              inputMode="numeric"
                              value={newRowEntry.physical_lot_qty}
                              onChange={(e) =>
                                setNewRowEntry({ ...newRowEntry, physical_lot_qty: sanitizeQtyInput(e.target.value) })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500">Lot Code</label>
                            <Input
                              value={newRowEntry.lot_code}
                              onChange={(e) => setNewRowEntry({ ...newRowEntry, lot_code: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={onAddRow} disabled={savingNewRow}>
                            {savingNewRow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {savingNewRow ? 'Saving…' : 'Add Row'}
                          </Button>
                          <Button variant="ghost" onClick={() => setShowAddRow(false)} disabled={savingNewRow}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {!loadingDetail && !detail && (
              <p className="py-12 text-center text-sm text-slate-400">
                Select a case from the list on the left.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
