import { useMemo, useState } from 'react';
import type { DuplicateAction, ExtractedRecord } from '../api';

const EDITABLE_FIELDS = [
  'dn_number', 'dn_date', 'device', 'package', 'quantity', 'rma_number',
  'owner', 'gf', 'type_of_return', 'dc', 'date_code', 'dc_bau', 'test_bau',
  'case_title', 'rework_flow_procedure', 'store_lot_qty', 'recd_lw', 'recd_mth',
  'store_received',
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

const REVIEW_FIELDS: { key: EditableField | 'store_received'; label: string }[] = [
  { key: 'dn_number', label: 'DN Number' },
  { key: 'device', label: 'Device' },
  { key: 'package', label: 'Package' },
  { key: 'owner', label: 'Owner' },
  { key: 'gf', label: 'GF' },
  { key: 'type_of_return', label: 'Type' },
  { key: 'dc', label: 'DC' },
  { key: 'store_received', label: 'STORE Received' },
  { key: 'recd_mth', label: 'Recd Mth' },
  { key: 'recd_lw', label: 'Recd LW' },
  { key: 'date_code', label: 'Date Code' },
  { key: 'dc_bau', label: 'DC Bau' },
  { key: 'test_bau', label: 'Test Bau' },
  { key: 'case_title', label: 'Case Title' },
  { key: 'rework_flow_procedure', label: 'Rework Flow' },
  { key: 'quantity', label: 'Qty' },
];

const SOURCE_STYLES: Record<string, string> = {
  pdf: 'border-l-4 border-emerald-500 bg-emerald-50',
  history: 'border-l-4 border-blue-500 bg-blue-50',
  lookup: 'border-l-4 border-blue-500 bg-blue-50',
  derived: 'border-l-4 border-blue-500 bg-blue-50',
  default: 'border-l-4 border-blue-500 bg-blue-50',
  manual: 'border-l-4 border-violet-500 bg-violet-50',
  required: 'border-l-4 border-amber-400 bg-amber-50',
};

const SOURCE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  history: 'Historical',
  lookup: 'Lookup',
  derived: 'Derived',
  default: 'Default',
  manual: 'Manual',
  required: 'Required',
};

interface PreviewTableProps {
  records: ExtractedRecord[];
  duplicateActions: Record<string, DuplicateAction>;
  onDuplicateActionChange: (recordId: string, action: DuplicateAction) => void;
  edits: Record<string, Record<string, string>>;
  onEditChange: (recordId: string, field: EditableField, value: string) => void;
}

function StatusBadge({ status, errors }: { status: string; errors: string[] }) {
  const colors: Record<string, string> = {
    New: 'bg-emerald-100 text-emerald-700',
    Duplicate: 'bg-amber-100 text-amber-700',
    Invalid: 'bg-red-100 text-red-700',
    Inserted: 'bg-blue-100 text-blue-700',
    Skipped: 'bg-slate-100 text-slate-600',
    Replaced: 'bg-violet-100 text-violet-700',
  };

  return (
    <div>
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-slate-100'}`}>
        {status}
      </span>
      {errors.length > 0 && <p className="text-xs text-red-500 mt-1">{errors.join('; ')}</p>}
    </div>
  );
}

function getFieldValue(
  record: ExtractedRecord,
  field: string,
  edits: Record<string, Record<string, string>>
): string {
  const id = record.record_id || '';
  if (edits[id]?.[field] !== undefined) return edits[id][field];
  const val = record[field as keyof ExtractedRecord];
  return val === undefined || val === null ? '' : String(val);
}

function getFieldSource(record: ExtractedRecord, field: string, edits: Record<string, Record<string, string>>): string {
  const id = record.record_id || '';
  if (edits[id]?.[field] !== undefined) return 'manual';
  return record.field_sources?.[field] || (getFieldValue(record, field, edits) ? 'default' : 'required');
}

export function PreviewTable({
  records,
  duplicateActions,
  onDuplicateActionChange,
  edits,
  onEditChange,
}: PreviewTableProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      const id = r.record_id || '';
      const dn = edits[id]?.dn_number ?? r.dn_number;
      const device = edits[id]?.device ?? r.device;
      return (
        dn.toLowerCase().includes(q) ||
        device.toLowerCase().includes(q) ||
        r.filename.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });
  }, [records, search, edits]);

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Review</h2>
        <p className="text-slate-500 text-sm">Process PDFs to see extracted and auto-filled data here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Review ({filtered.length} records)</h2>
          <div className="flex flex-wrap gap-3 mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200" /> PDF</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200" /> Auto-filled</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200" /> Needs input</span>
          </div>
        </div>
        <input
          type="search"
          placeholder="Search DN, device..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full sm:w-72"
        />
      </div>

      <div className="space-y-4">
        {filtered.map((record) => {
          const id = record.record_id || record.filename;
          const isOpen = expanded[id] ?? true;
          const canEdit = record.status === 'New' || record.status === 'Duplicate';

          return (
            <div key={id} className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                onClick={() => setExpanded((p) => ({ ...p, [id]: !isOpen }))}
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-medium text-slate-800">{getFieldValue(record, 'dn_number', edits) || 'No DN'}</span>
                  <span className="text-sm text-slate-500">{getFieldValue(record, 'device', edits)}</span>
                  <StatusBadge status={record.status} errors={record.validation_errors} />
                  {record.matched_historical_dn && (
                    <span className="text-xs text-blue-600">Matched DN {record.matched_historical_dn}</span>
                  )}
                </div>
                <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {REVIEW_FIELDS.map(({ key, label }) => {
                    const source = getFieldSource(record, key, edits);
                    const value = getFieldValue(record, key, edits);
                    return (
                      <label key={key} className={`block rounded-lg p-3 ${SOURCE_STYLES[source] || ''}`}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-medium text-slate-600">{label}</span>
                          <span className="text-xs text-slate-400">{SOURCE_LABELS[source] || source}</span>
                        </div>
                        <input
                          type="text"
                          value={value}
                          disabled={!canEdit}
                          onChange={(e) => onEditChange(id, key as EditableField, e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-white/80 disabled:bg-slate-50"
                        />
                      </label>
                    );
                  })}

                  {record.status === 'Duplicate' && record.record_id && (
                    <div className="md:col-span-2 xl:col-span-3 flex items-center gap-2 pt-2">
                      <span className="text-sm text-slate-600">Duplicate action:</span>
                      <select
                        value={duplicateActions[record.record_id] || 'skip'}
                        onChange={(e) =>
                          onDuplicateActionChange(record.record_id!, e.target.value as DuplicateAction)
                        }
                        className="text-sm border border-slate-300 rounded px-2 py-1"
                      >
                        <option value="skip">Skip</option>
                        <option value="replace">Replace</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { EDITABLE_FIELDS };
export type { EditableField };
