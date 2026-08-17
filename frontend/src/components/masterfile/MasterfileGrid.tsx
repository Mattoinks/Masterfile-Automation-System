import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  downloadMasterfile,
  fetchExcelLayout,
  fetchMasterfileRows,
  restoreRecords,
  softDeleteRecords,
  updateMasterfileRecord,
} from '@/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { cn } from '@/lib/utils';

const CASE_ID_HEADER = 'Case_ID';
const DN_HEADER = 'DN / Invoice No.';
const STATUS_HEADER = 'Status';

// Same set of fields the record-edit modal has always allowed — inline
// editing preserves that existing business rule rather than making every
// column (incl. Case_ID/Status, which have their own dedicated workflows)
// freely editable.
const EDITABLE_FIELD_KEYS = [
  'owner',
  'quantity',
  'device',
  'package',
  'case_title',
  'gf',
  'dc',
  'date_code',
  'rework_flow_procedure',
  'cause_owner',
];
const MULTILINE_FIELD_KEYS = new Set(['rework_flow_procedure']);

interface WorksheetRow {
  _row: number;
  [header: string]: unknown;
}

interface WorksheetData {
  worksheet: string;
  headers: { col: number; label: string }[];
  rows: WorksheetRow[];
  total: number;
  last_case_id: number;
}

type SortDir = 'asc' | 'desc';

export function MasterfileGrid() {
  const { can, isReadOnly } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<WorksheetData | null>(null);
  const [headerToFieldKey, setHeaderToFieldKey] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ header: string; dir: SortDir } | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ caseIds: string[]; dnNumbers: string[] } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null); // `${caseId}::${header}`
  // Escaping a cell edit closes the input, which the browser then also blurs
  // -- without this guard, that blur's onBlur handler would commit the
  // discarded text anyway, undoing the cancel.
  const skipNextBlurRef = useRef(false);
  const [dirty, setDirty] = useState<Record<string, Record<string, string>>>({}); // caseId -> { fieldKey: value }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const canEdit = can('edit') && !isReadOnly;
  const canDelete = can('delete') && !isReadOnly;
  const canRestore = can('restore') && !isReadOnly;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Sequential, not Promise.all: each of these opens the .xlsx file fresh
      // (no server-side caching), so firing them concurrently — especially on
      // top of AppContext's own simultaneous dashboard-refresh workbook read —
      // creates real file-access contention and multi-second stalls. Loading
      // the rows first also gets the grid on screen sooner; editability (which
      // needs the field-key mapping) comes in a beat later.
      const rows = await fetchMasterfileRows('', 5000);
      setData(rows);
      setLoading(false);
      const layout = await fetchExcelLayout();
      const reversed: Record<string, string> = {};
      Object.entries(layout.pdf_field_mapping).forEach(([fieldKey, header]) => {
        if (header) reversed[header] = fieldKey;
      });
      setHeaderToFieldKey(reversed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load masterfile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const editableHeaders = useMemo(() => {
    const set = new Set<string>();
    Object.entries(headerToFieldKey).forEach(([header, key]) => {
      if (EDITABLE_FIELD_KEYS.includes(key)) set.add(header);
    });
    return set;
  }, [headerToFieldKey]);

  const rowCaseId = (row: WorksheetRow) => String(row[CASE_ID_HEADER] ?? '');

  const visibleRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;

    if (!showDeleted) {
      rows = rows.filter((r) => String(r[STATUS_HEADER] ?? '').toLowerCase() !== 'deleted');
    }

    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v.trim());
    if (activeFilters.length) {
      rows = rows.filter((row) =>
        activeFilters.every(([header, value]) =>
          String(row[header] ?? '').toLowerCase().includes(value.trim().toLowerCase())
        )
      );
    }

    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) => data.headers.some((h) => String(row[h.label] ?? '').toLowerCase().includes(q)));
    }

    if (sort) {
      const { header, dir } = sort;
      rows = [...rows].sort((a, b) => {
        const av = a[header];
        const bv = b[header];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const aStr = String(av).trim();
        const bStr = String(bv).trim();
        const an = Number(av);
        const bn = Number(bv);
        let cmp: number;
        if (aStr !== '' && bStr !== '' && !Number.isNaN(an) && !Number.isNaN(bn)) {
          cmp = an - bn;
        } else {
          cmp = aStr.localeCompare(bStr, undefined, { sensitivity: 'base' });
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }

    return rows;
  }, [data, showDeleted, columnFilters, debouncedSearch, sort]);

  const toggleSort = (header: string) => {
    setSort((prev) => {
      if (!prev || prev.header !== header) return { header, dir: 'asc' };
      if (prev.dir === 'asc') return { header, dir: 'desc' };
      return null;
    });
  };

  const cellValue = (row: WorksheetRow, header: string): string => {
    const caseId = rowCaseId(row);
    const fieldKey = headerToFieldKey[header];
    if (fieldKey && dirty[caseId]?.[fieldKey] !== undefined) {
      return dirty[caseId][fieldKey];
    }
    return String(row[header] ?? '');
  };

  const commitCellEdit = (row: WorksheetRow, header: string, value: string) => {
    const caseId = rowCaseId(row);
    const fieldKey = headerToFieldKey[header];
    if (!fieldKey) return;
    const original = String(row[header] ?? '');
    setDirty((prev) => {
      const next = { ...prev };
      const rowDirty = { ...(next[caseId] || {}) };
      if (value === original) {
        delete rowDirty[fieldKey];
      } else {
        rowDirty[fieldKey] = value;
      }
      if (Object.keys(rowDirty).length === 0) {
        delete next[caseId];
      } else {
        next[caseId] = rowDirty;
      }
      return next;
    });
  };

  const dirtyCaseIds = Object.keys(dirty);

  const handleSaveChanges = async () => {
    setSaving(true);
    setSaveError('');
    const failed: string[] = [];
    const succeeded: Record<string, Record<string, string>> = {};
    for (const [caseId, fields] of Object.entries(dirty)) {
      try {
        await updateMasterfileRecord(caseId, fields);
        succeeded[caseId] = fields;
      } catch {
        failed.push(caseId);
      }
    }
    setSaving(false);

    // Merge saved values straight into local state instead of re-fetching the
    // whole workbook (which, per get_worksheet_rows opening the .xlsx fresh
    // every call, can take multiple seconds) -- avoids a multi-second window
    // where the grid flashes back to the pre-edit value right after a
    // successful save.
    if (Object.keys(succeeded).length) {
      const fieldKeyToHeader: Record<string, string> = {};
      Object.entries(headerToFieldKey).forEach(([header, key]) => {
        fieldKeyToHeader[key] = header;
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) => {
            const fields = succeeded[rowCaseId(row)];
            if (!fields) return row;
            const updated = { ...row };
            Object.entries(fields).forEach(([fieldKey, value]) => {
              const header = fieldKeyToHeader[fieldKey];
              if (header) updated[header] = value;
            });
            return updated;
          }),
        };
      });
    }

    if (failed.length) {
      setSaveError(`Failed to save: ${failed.join(', ')}. Other changes were saved.`);
      setDirty((prev) => {
        const next: Record<string, Record<string, string>> = {};
        failed.forEach((id) => {
          if (prev[id]) next[id] = prev[id];
        });
        return next;
      });
    } else {
      setDirty({});
    }
  };

  const handleDiscardChanges = () => {
    setDirty({});
    setSaveError('');
  };

  const toggleSelect = (caseId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  // Membership-based, not a size comparison -- a count match can be
  // coincidental once filters hide/reveal a different set of rows than what
  // was actually selected, which would make the "select all" checkbox lie
  // about its own state and toggle the wrong way.
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(rowCaseId(r)));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      visibleRows.forEach((r) => {
        if (allVisibleSelected) next.delete(rowCaseId(r));
        else next.add(rowCaseId(r));
      });
      return next;
    });
  };

  const deleteSelected = () => {
    const targets = visibleRows.filter((r) => selected.has(rowCaseId(r)));
    if (!targets.length) return;
    setDeleteTarget({
      caseIds: targets.map(rowCaseId),
      dnNumbers: targets.map((r) => String(r[DN_HEADER] ?? '')),
    });
  };

  // Mirrors handleSaveChanges: patch Status locally instead of re-fetching
  // the whole workbook, so the row doesn't sit showing its pre-action state
  // for several seconds after a delete/restore that already succeeded.
  const setLocalStatus = (caseIds: string[], status: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const idSet = new Set(caseIds);
      return {
        ...prev,
        rows: prev.rows.map((row) => (idSet.has(rowCaseId(row)) ? { ...row, [STATUS_HEADER]: status } : row)),
      };
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteRecords(deleteTarget.caseIds);
      setLocalStatus(deleteTarget.caseIds, 'Deleted');
      setDeleteTarget(null);
      setSelected(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async (caseId: string) => {
    try {
      await restoreRecords([caseId]);
      setLocalStatus([caseId], 'Active');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Restore failed');
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-24 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-500">Loading masterfile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }

  const headers = data?.headers || [];

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search all columns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Show deleted
        </label>

        <div className="ml-auto flex items-center gap-2">
          {canDelete && selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={deleteSelected}>
              <Trash2 className="h-4 w-4" /> Delete ({selected.size})
            </Button>
          )}
          {can('upload') && (
            <Button variant="outline" size="sm" onClick={() => navigate('/upload')}>
              <Upload className="h-4 w-4" /> Add Record
            </Button>
          )}
          {can('download') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadMasterfile().catch((e) => alert(String(e)))}
            >
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {visibleRows.length} of {data?.total ?? 0} rows shown · Last Case ID: {data?.last_case_id ?? '-'}
      </p>

      {/* Grid */}
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 w-10 border-b border-r border-slate-200 bg-brand-700 px-2 py-2 text-white dark:border-slate-700">
                {!isReadOnly && (
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                )}
              </th>
              <th className="sticky left-10 z-30 w-10 border-b border-r border-slate-200 bg-brand-700 px-2 py-2 text-right text-white dark:border-slate-700">
                #
              </th>
              {headers.map((h) => (
                <th
                  key={h.col}
                  onClick={() => toggleSort(h.label)}
                  className="cursor-pointer select-none whitespace-nowrap border-b border-r border-slate-200 bg-brand-700 px-3 py-2 text-left font-semibold text-white hover:bg-brand-800 dark:border-slate-700"
                >
                  <span className="flex items-center gap-1">
                    {h.label.replace(/\n/g, ' ')}
                    {sort?.header === h.label ? (
                      sort.dir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
              <th className="border-b border-slate-200 bg-brand-700 px-2 py-2 text-white dark:border-slate-700">
                Actions
              </th>
            </tr>
            <tr>
              <th className="sticky left-0 z-20 w-10 border-b border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" />
              <th className="sticky left-10 z-20 w-10 border-b border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" />
              {headers.map((h) => (
                <th
                  key={h.col}
                  className="border-b border-r border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
                >
                  <input
                    value={columnFilters[h.label] || ''}
                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, [h.label]: e.target.value }))}
                    placeholder="Filter..."
                    className="w-full min-w-[100px] rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-normal text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </th>
              ))}
              <th className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" />
            </tr>
          </thead>
          <tbody>
            {!visibleRows.length ? (
              <tr>
                <td colSpan={headers.length + 3} className="py-12 text-center text-slate-500">
                  No records found
                </td>
              </tr>
            ) : (
              visibleRows.map((row, i) => {
                const caseId = rowCaseId(row);
                const isDeleted = String(row[STATUS_HEADER] ?? '').toLowerCase() === 'deleted';
                const rowHasDirty = Boolean(dirty[caseId]);
                return (
                  <tr
                    key={`${caseId}-${row._row}`}
                    className={cn(isDeleted && 'opacity-50', rowHasDirty && 'bg-amber-50/40 dark:bg-amber-950/20')}
                  >
                    <td className="sticky left-0 z-10 w-10 border-b border-r border-slate-100 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                      {!isReadOnly && (
                        <input type="checkbox" checked={selected.has(caseId)} onChange={() => toggleSelect(caseId)} />
                      )}
                    </td>
                    <td className="sticky left-10 z-10 w-10 border-b border-r border-slate-100 bg-white px-2 py-1.5 text-right text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                      {i + 1}
                    </td>
                    {headers.map((h) => {
                      const isEditableCol = editableHeaders.has(h.label);
                      const cellKey = `${caseId}::${h.label}`;
                      const isEditing = editingKey === cellKey;
                      const value = cellValue(row, h.label);
                      const fieldKey = headerToFieldKey[h.label];
                      const isCellDirty = Boolean(fieldKey && dirty[caseId]?.[fieldKey] !== undefined);
                      const multiline = MULTILINE_FIELD_KEYS.has(fieldKey || '');

                      return (
                        <td
                          key={h.col}
                          onClick={() => {
                            if (canEdit && isEditableCol && !isDeleted) setEditingKey(cellKey);
                          }}
                          className={cn(
                            'max-w-[220px] whitespace-nowrap border-b border-r border-slate-100 px-3 py-1.5 dark:border-slate-800',
                            h.label === CASE_ID_HEADER && 'font-medium',
                            isEditableCol &&
                              canEdit &&
                              !isDeleted &&
                              'cursor-text hover:bg-brand-50/60 dark:hover:bg-brand-950/30',
                            isCellDirty && 'bg-amber-100/70 dark:bg-amber-900/30'
                          )}
                        >
                          {isEditing ? (
                            multiline ? (
                              <textarea
                                autoFocus
                                defaultValue={value}
                                rows={3}
                                className="w-full min-w-[200px] whitespace-pre-wrap rounded border border-brand-400 bg-white px-1.5 py-1 text-xs dark:bg-slate-900"
                                onBlur={(e) => {
                                  if (skipNextBlurRef.current) {
                                    skipNextBlurRef.current = false;
                                    return;
                                  }
                                  commitCellEdit(row, h.label, e.target.value);
                                  setEditingKey(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    skipNextBlurRef.current = true;
                                    setEditingKey(null);
                                  }
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
                                }}
                              />
                            ) : (
                              <input
                                autoFocus
                                defaultValue={value}
                                className="w-full min-w-[120px] rounded border border-brand-400 bg-white px-1.5 py-1 text-xs dark:bg-slate-900"
                                onBlur={(e) => {
                                  if (skipNextBlurRef.current) {
                                    skipNextBlurRef.current = false;
                                    return;
                                  }
                                  commitCellEdit(row, h.label, e.target.value);
                                  setEditingKey(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                  if (e.key === 'Escape') {
                                    skipNextBlurRef.current = true;
                                    setEditingKey(null);
                                  }
                                }}
                              />
                            )
                          ) : (
                            <span className="block truncate">{value || '—'}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-slate-100 px-2 py-1.5 dark:border-slate-800">
                      <div className="flex gap-1">
                        {isDeleted && canRestore && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleRestore(caseId)}
                            title="Restore"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!isDeleted && canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-500"
                            onClick={() =>
                              setDeleteTarget({ caseIds: [caseId], dnNumbers: [String(row[DN_HEADER] ?? '')] })
                            }
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Save / discard bar */}
      {dirtyCaseIds.length > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-wrap items-center gap-3 self-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-lg dark:border-amber-800 dark:bg-amber-950">
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {dirtyCaseIds.length} row{dirtyCaseIds.length === 1 ? '' : 's'} with unsaved changes
          </span>
          {saveError && <span className="text-xs text-red-600 dark:text-red-400">{saveError}</span>}
          <Button variant="outline" size="sm" onClick={handleDiscardChanges} disabled={saving}>
            <X className="h-4 w-4" /> Discard Changes
          </Button>
          <Button size="sm" onClick={handleSaveChanges} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          caseIds={deleteTarget.caseIds}
          dnNumbers={deleteTarget.dnNumbers}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
