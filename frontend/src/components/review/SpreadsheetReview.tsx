import { useRef, type KeyboardEvent } from 'react';
import {
  REVIEW_FIELDS,
  DROPDOWN_OPTIONS,
  SOURCE_STYLES,
  SOURCE_LABELS,
  resolveFieldSource,
  type ReviewStatusType,
} from '@/lib/reviewFields';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DUPLICATE_STATUS_COLORS } from '@/api';
import { cn } from '@/lib/utils';
import { Trash2, Maximize2 } from 'lucide-react';

interface SpreadsheetReviewProps {
  onExpandRecord?: (recordId: string) => void;
}

export function SpreadsheetReview({ onExpandRecord }: SpreadsheetReviewProps) {
  const {
    records,
    selectedRecordId,
    setSelectedRecordId,
    selectedRowIds,
    toggleRowSelection,
    toggleAllRows,
    getRecordField,
    setFieldValue,
    getReviewStatus,
    activeCell,
    setActiveCell,
    recordEdits,
    openDuplicateModal,
    duplicateActions,
    removeReviewRecords,
  } = useApp();

  const cellRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  if (!records.length) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-sm text-slate-500">
        No records in review. Upload and process DN PDFs first.
      </div>
    );
  }

  const focusCell = (recordId: string, field: string) => {
    setActiveCell({ recordId, field });
    const key = `${recordId}:${field}`;
    cellRefs.current[key]?.focus();
  };

  const moveCell = (recordId: string, field: string, direction: 'next' | 'down') => {
    const recordIdx = records.findIndex((r) => r.record_id === recordId);
    const fieldIdx = REVIEW_FIELDS.findIndex((f) => f.key === field);
    if (direction === 'next' && fieldIdx < REVIEW_FIELDS.length - 1) {
      focusCell(recordId, REVIEW_FIELDS[fieldIdx + 1].key);
    } else if (direction === 'next' && recordIdx < records.length - 1) {
      focusCell(records[recordIdx + 1].record_id!, REVIEW_FIELDS[0].key);
    } else if (direction === 'down' && recordIdx < records.length - 1) {
      focusCell(records[recordIdx + 1].record_id!, field);
    }
  };

  const onKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    recordId: string,
    field: string
  ) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      moveCell(recordId, field, 'next');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      moveCell(recordId, field, 'down');
    } else if (e.key === 'Escape') {
      (e.target as HTMLElement).blur();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') || !activeCell) return;
    e.preventDefault();
    const rows = text.split('\n').filter(Boolean);
    const startRecordIdx = records.findIndex((r) => r.record_id === activeCell.recordId);
    const startFieldIdx = REVIEW_FIELDS.findIndex((f) => f.key === activeCell.field);
    rows.forEach((row, ri) => {
      const cells = row.split('\t');
      const record = records[startRecordIdx + ri];
      if (!record?.record_id) return;
      cells.forEach((cell, ci) => {
        const field = REVIEW_FIELDS[startFieldIdx + ci];
        if (field) setFieldValue(record.record_id!, field.key, cell.trim());
      });
    });
  };

  const allSelected = records.length > 0 && records.every((r) => r.record_id && selectedRowIds[r.record_id]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" onPaste={onPaste}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Review grid — {records.length} record(s)
        </span>
        {onExpandRecord && selectedRecordId && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onExpandRecord(selectedRecordId)}
          >
            <Maximize2 className="h-3.5 w-3.5 mr-1" />
            Expand selected
          </Button>
        )}
      </div>
      <div className="overflow-x-auto max-h-[50vh]">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-brand-700 text-white">
            <tr>
              <th className="w-10 border border-brand-800 p-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAllRows}
                  className="rounded"
                  aria-label="Select all"
                />
              </th>
              <th className="border border-brand-800 p-2 whitespace-nowrap">DN</th>
              {REVIEW_FIELDS.map((f) => (
                <th key={f.key} className="border border-brand-800 p-2 whitespace-nowrap text-left font-semibold">
                  {f.label}
                </th>
              ))}
              <th className="border border-brand-800 p-2">Review</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const id = record.record_id!;
              const isSelected = selectedRecordId === id;
              const reviewStatus = getReviewStatus(record);
              return (
                <tr
                  key={id}
                  className={cn(
                    'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    isSelected && 'bg-brand-50/50 dark:bg-brand-950/20'
                  )}
                  onClick={() => setSelectedRecordId(id)}
                >
                  <td className="border border-slate-200 dark:border-slate-700 p-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!selectedRowIds[id]}
                      onChange={() => toggleRowSelection(id)}
                      className="rounded"
                    />
                  </td>
                  <td className="border border-slate-200 dark:border-slate-700 p-2 font-medium whitespace-nowrap">
                    {getRecordField(record, 'dn_number') || '—'}
                  </td>
                  {REVIEW_FIELDS.map((field) => {
                    const value = getRecordField(record, field.key);
                    const hasEdit = recordEdits[id]?.[field.key] !== undefined;
                    const source = resolveFieldSource(field.key, record, hasEdit, value);
                    const cellKey = `${id}:${field.key}`;
                    const isActive = activeCell?.recordId === id && activeCell?.field === field.key;
                    const linkedField = 'linkedTo' in field ? field.linkedTo : undefined;
                    const linkedValue = linkedField ? getRecordField(record, linkedField).trim() : '';
                    const isLinkedEngineer = field.key === 'cause_owner';

                    if (isLinkedEngineer && !linkedValue) {
                      return (
                        <td
                          key={field.key}
                          className="border border-slate-200 dark:border-slate-700 p-0 bg-slate-50 dark:bg-slate-900/40"
                          title="Fill in Rework Flow first"
                        >
                          <span className="block h-8 px-2 text-xs text-slate-400 leading-8">—</span>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={field.key}
                        className={cn('border p-0', SOURCE_STYLES[source], isActive && 'ring-2 ring-brand-700 ring-inset')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {'dropdown' in field && field.dropdown && DROPDOWN_OPTIONS[field.key] ? (
                          <select
                            ref={(el) => { cellRefs.current[cellKey] = el; }}
                            value={value}
                            onChange={(e) => setFieldValue(id, field.key, e.target.value)}
                            onFocus={() => setActiveCell({ recordId: id, field: field.key })}
                            onKeyDown={(e) => onKeyDown(e, id, field.key)}
                            className="w-full h-8 px-2 bg-transparent border-0 text-xs focus:outline-none"
                            title={SOURCE_LABELS[source]}
                          >
                            <option value="">—</option>
                            {DROPDOWN_OPTIONS[field.key].map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            ref={(el) => { cellRefs.current[cellKey] = el; }}
                            value={value}
                            onChange={(e) => setFieldValue(id, field.key, e.target.value)}
                            onFocus={() => setActiveCell({ recordId: id, field: field.key })}
                            onKeyDown={(e) => onKeyDown(e, id, field.key)}
                            onDoubleClick={() => focusCell(id, field.key)}
                            placeholder={isLinkedEngineer ? 'Engineer name' : undefined}
                            className="w-full h-8 px-2 bg-transparent border-0 text-xs focus:outline-none min-w-[80px]"
                            title={isLinkedEngineer ? 'Who entered the rework flow' : SOURCE_LABELS[source]}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="border border-slate-200 dark:border-slate-700 p-2">
                    <div className="flex flex-col gap-1 items-start">
                      <ReviewStatusBadge status={reviewStatus} />
                      {record.status === 'Duplicate' && record.duplicate_status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${DUPLICATE_STATUS_COLORS[record.duplicate_status] || ''}`}>
                          {record.duplicate_status}
                          {record.duplicate_match ? ` · ${record.duplicate_match.confidence_score}%` : ''}
                        </span>
                      )}
                      {record.status === 'Duplicate' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={(e) => { e.stopPropagation(); openDuplicateModal(id); }}
                        >
                          {duplicateActions[id] ? `Action: ${duplicateActions[id]}` : 'Resolve Duplicate'}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2 text-brand-700 hover:bg-brand-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExpandRecord?.(id);
                        }}
                        title="Full view"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeReviewRecords([id]);
                        }}
                        title="Remove this record from review"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-500 flex flex-wrap gap-4">
        <span>🟢 PDF</span><span>🔵 Suggested</span><span>🟡 Edited</span><span>🔴 Missing</span>
        <span className="ml-auto">Tab: next cell · Enter: down · Paste: TSV</span>
      </div>
    </div>
  );
}

function ReviewStatusBadge({ status }: { status: ReviewStatusType }) {
  const variant = status === 'Ready to Insert' ? 'success' : status === 'Draft' ? 'secondary' : status === 'Inserted' ? 'pdf' : 'required';
  return <Badge variant={variant as 'success'} className="text-[10px] whitespace-nowrap">{status}</Badge>;
}
