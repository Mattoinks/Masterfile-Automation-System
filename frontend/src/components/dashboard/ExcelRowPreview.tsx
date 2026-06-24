import { useApp } from '@/context/AppContext';
import { SOURCE_LABELS } from '@/lib/utils';

const PREVIEW_COLUMNS = [
  { key: 'case_id', label: 'Case_ID' },
  { key: 'fy', label: 'FY' },
  { key: 'dn_date', label: 'Date Create' },
  { key: 'data_source', label: 'Data source' },
  { key: 'rma_number', label: 'QMR/SAP' },
  { key: 'store_received', label: 'STORE Received' },
  { key: 'dn_number', label: 'DN / Invoice' },
  { key: 'type_of_return', label: 'Type' },
  { key: 'device', label: 'Device' },
  { key: 'package', label: 'Package' },
  { key: 'gf', label: 'GF' },
  { key: 'date_code', label: 'Date code' },
  { key: 'quantity', label: 'Qty (pcs)' },
  { key: 'dc', label: 'DC' },
  { key: 'owner', label: 'Owner' },
  { key: 'case_title', label: 'Case Title' },
];

export function ExcelRowPreview() {
  const { records, selectedRecordId, lastCaseId, activeWorksheet, getRecordField } = useApp();
  const record = records.find((r) => r.record_id === selectedRecordId) || records[0];

  if (!record) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
        Process PDFs to preview the generated FY2526 row appearance.
      </div>
    );
  }

  const nextCaseId = lastCaseId + 1;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 shadow-sm dark:border-slate-600">
      <div className="bg-brand-700 px-4 py-2 text-white text-sm font-semibold flex justify-between">
        <span>Generated Row Preview — {activeWorksheet}</span>
        <span className="text-brand-100 text-xs">Last: {lastCaseId} → New: {nextCaseId}</span>
      </div>
      <div className="overflow-x-auto bg-white dark:bg-slate-900">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-brand-700 text-white">
              {PREVIEW_COLUMNS.map((col) => (
                <th key={col.key} className="border border-brand-800 px-2 py-2 text-left font-semibold whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              {PREVIEW_COLUMNS.map((col) => {
                let val = getRecordField(record, col.key);
                if (col.key === 'case_id') val = String(nextCaseId);
                if (col.key === 'fy') val = activeWorksheet;
                if (col.key === 'data_source' && !val) val = 'SAP DN';
                return (
                  <td key={col.key} className="border border-slate-200 dark:border-slate-700 px-2 py-2 whitespace-nowrap max-w-[200px] truncate">
                    {val || '—'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs text-slate-500 flex gap-4">
        <span>🟢 PDF</span>
        <span>🔵 {SOURCE_LABELS.history}</span>
        <span>🟡 Manual Input Required</span>
      </div>
    </div>
  );
}
