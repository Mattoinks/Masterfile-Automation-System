import { X, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import {
  REVIEW_FIELDS,
  DROPDOWN_OPTIONS,
  SOURCE_STYLES,
  SOURCE_LABELS,
  resolveFieldSource,
} from '@/lib/reviewFields';
import { SOURCE_LABELS as UTIL_SOURCE_LABELS } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ExtractedRecord } from '@/api';

const EXCEL_COLUMNS = [
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

interface RecordFullViewModalProps {
  record: ExtractedRecord;
  assignedCaseId: number;
  activeWorksheet: string;
  onClose: () => void;
}

export function RecordFullViewModal({
  record,
  assignedCaseId,
  activeWorksheet,
  onClose,
}: RecordFullViewModalProps) {
  const {
    getRecordField,
    getFieldSource,
    getPdfValue,
    getSuggestedValue,
    getReviewStatus,
    setFieldValue,
    setRecordEdits,
    recordEdits,
  } = useApp();

  const id = record.record_id!;
  const canEdit = record.status === 'New' || record.status === 'Duplicate';
  const reworkFlow = getRecordField(record, 'rework_flow_procedure').trim();
  const reviewStatus = getReviewStatus(record);

  const handleFieldChange = (field: string, value: string) => {
    if (field === 'rework_flow_procedure') {
      setFieldValue(id, field, value);
      return;
    }
    setRecordEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-6xl max-h-[96vh] rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 px-5 py-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Maximize2 className="h-5 w-5 text-brand-700" />
              <h2 className="text-lg font-bold">Full Record View</h2>
              <Badge variant="outline">DN {getRecordField(record, 'dn_number')}</Badge>
              <Badge variant="secondary">Case_ID {assignedCaseId}</Badge>
              <Badge variant={reviewStatus === 'Ready to Insert' ? 'success' : 'required'}>
                {reviewStatus}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1 break-all">{record.filename}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Excel Row Preview — {activeWorksheet}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-brand-700 text-white">
                    {EXCEL_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="border border-brand-800 px-3 py-2 text-left font-semibold whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    {EXCEL_COLUMNS.map((col) => {
                      let val = getRecordField(record, col.key);
                      if (col.key === 'case_id') val = String(assignedCaseId);
                      if (col.key === 'fy') val = activeWorksheet;
                      if (col.key === 'data_source' && !val) val = 'SAP DN';
                      return (
                        <td
                          key={col.key}
                          className="border border-slate-200 dark:border-slate-700 px-3 py-2 align-top whitespace-normal break-words min-w-[100px] max-w-[280px]"
                        >
                          {val || '—'}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              All Fields
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {REVIEW_FIELDS.map((field) => {
                if (field.key === 'cause_owner' && !reworkFlow) return null;
                const value = getRecordField(record, field.key);
                const hasEdit = recordEdits[id]?.[field.key] !== undefined;
                const source = resolveFieldSource(field.key, record, hasEdit, value);
                const diag = record.field_diagnostics?.[field.key];

                return (
                  <div
                    key={field.key}
                    className={cn('rounded-lg border p-3', SOURCE_STYLES[source])}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase">{field.label}</span>
                      <span className="text-[10px] text-slate-500">{SOURCE_LABELS[source]}</span>
                    </div>
                    {diag && !value.trim() && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                        {diag.reason}
                        {diag.suggested_value && ` · Suggested: ${diag.suggested_value}`}
                      </p>
                    )}
                    {'dropdown' in field && field.dropdown && DROPDOWN_OPTIONS[field.key] ? (
                      <select
                        value={value}
                        disabled={!canEdit}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full rounded border px-2 py-1.5 text-sm dark:bg-slate-900"
                      >
                        <option value="">—</option>
                        {DROPDOWN_OPTIONS[field.key].map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        value={value}
                        disabled={!canEdit}
                        rows={field.key === 'rework_flow_procedure' || field.key === 'case_title' ? 3 : 2}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full rounded border px-2 py-1.5 text-sm dark:bg-slate-900 resize-y min-h-[2.5rem]"
                        placeholder={field.key === 'cause_owner' ? 'Engineer name' : undefined}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              PDF vs Suggested vs Final
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800">
                    <th className="px-3 py-2 text-left font-semibold">Field</th>
                    <th className="px-3 py-2 text-left font-semibold">PDF</th>
                    <th className="px-3 py-2 text-left font-semibold">Suggested</th>
                    <th className="px-3 py-2 text-left font-semibold">Final</th>
                    <th className="px-3 py-2 text-left font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {REVIEW_FIELDS.map((field) => {
                    if (field.key === 'cause_owner' && !reworkFlow) return null;
                    const finalVal = getRecordField(record, field.key);
                    const pdfVal = getPdfValue(record, field.key);
                    const suggested = getSuggestedValue(record, field.key);
                    const source = getFieldSource(record, field.key);
                    return (
                      <tr key={field.key} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{field.label}</td>
                        <td className="px-3 py-2 align-top break-words max-w-xs">{pdfVal || '—'}</td>
                        <td className="px-3 py-2 align-top break-words max-w-xs">{suggested || '—'}</td>
                        <td className="px-3 py-2 align-top break-words max-w-xs font-semibold">
                          {finalVal || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">
                            {UTIL_SOURCE_LABELS[source] || source}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-3 flex justify-end shrink-0">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
