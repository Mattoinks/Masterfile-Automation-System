import { useApp } from '@/context/AppContext';
import { SOURCE_LABELS } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Maximize2 } from 'lucide-react';

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

export function ExcelRowPreview({ onExpand }: { onExpand?: () => void }) {
  const { records, selectedRecordId, lastCaseId, activeWorksheet, getRecordField } = useApp();
  const record = records.find((r) => r.record_id === selectedRecordId) || records[0];

  if (!record) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
        Process PDFs to preview the generated FY2526 row appearance.
      </div>
    );
  }

  const recordIndex = Math.max(
    0,
    records.findIndex((r) => r.record_id === record.record_id)
  );
  const assignedCaseId = lastCaseId + 1 + recordIndex;
  const totalInBatch = records.length;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 shadow-sm dark:border-slate-600">
      <div className="bg-brand-700 px-4 py-2 text-white text-sm font-semibold flex flex-wrap justify-between items-center gap-2">
        <span>Generated Row Preview — {activeWorksheet}</span>
        <div className="flex items-center gap-2">
          <span className="text-brand-100 text-xs">
            {totalInBatch > 1
              ? `Record ${recordIndex + 1} of ${totalInBatch} → Case_ID ${assignedCaseId}`
              : `Last: ${lastCaseId} → New: ${assignedCaseId}`}
          </span>
          {onExpand && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onExpand}
              className="h-7 text-white hover:bg-brand-600 hover:text-white"
              title="Open full view"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
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
                if (col.key === 'case_id') val = String(assignedCaseId);
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
