import { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import { cn, sanitizeQtyInput } from '@/lib/utils';
import type { Lot2526BreakdownRecord } from '@/api';

const ROWS_PER_PAGE = 10;

// test_bau and disposition_or_ss_plan_name are excluded here - they're
// mirrored read-only from the linked FY2526 record's Test Bau / Rework
// Flow Procedure fields instead (rendered separately below), not
// independently editable on the draft itself.
const FIELD_LABELS: { key: keyof Lot2526BreakdownRecord; label: string }[] = [
  { key: 'original_label_lot_no', label: 'Original Label Lot no.' },
  { key: 'date_code', label: 'Date code' },
  { key: 'return_qty_from_dc', label: 'Return Qty from DC' },
  { key: 'created_lot_no', label: 'Created Lot#' },
  { key: 'date_created', label: 'Date Created' },
  { key: 'created_date_code', label: 'Date Code (Created Lot#)' },
  { key: 'physical_lot_qty', label: 'Physical Lot Qty' },
  { key: 'lot_code', label: 'Lot Code' },
  { key: 'date_attached_ss_plan', label: 'Date attached SS Plan' },
  { key: 'lw', label: 'LW' },
];

export function Lot2526ReviewSection() {
  const { lot2526Drafts, updateLot2526Draft, records, getRecordField } = useApp();
  const [page, setPage] = useState(0);

  if (!lot2526Drafts.length) return null;

  const pageCount = Math.max(1, Math.ceil(lot2526Drafts.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const startIndex = currentPage * ROWS_PER_PAGE;
  const pageIndices = lot2526Drafts
    .map((_, i) => i)
    .slice(startIndex, startIndex + ROWS_PER_PAGE);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>2526 Breakdown</CardTitle>
          <CardDescription>
            Extracted from the same DN PDF(s) above. Reviewed here, saved together with the FY2526 records.
          </CardDescription>
        </div>
        {lot2526Drafts.length > ROWS_PER_PAGE && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span>
              Row {startIndex + 1}-{Math.min(startIndex + ROWS_PER_PAGE, lot2526Drafts.length)} of{' '}
              {lot2526Drafts.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {pageIndices.map((index) => {
          const draft = lot2526Drafts[index];
          const prev = lot2526Drafts[index - 1];
          const groupKey = draft.record_id ?? draft.filename;
          // Show the file-name divider whenever this is truly the start of a
          // new file's rows, OR it's the first row on this page (a group
          // spanning a page break shouldn't leave the current page without
          // any indication of which file its rows belong to).
          const isNewGroup =
            index === 0 || groupKey !== (prev?.record_id ?? prev?.filename) || index === startIndex;
          const linkedRecord = records.find((r) => r.record_id === draft.record_id);
          const testBau = linkedRecord ? getRecordField(linkedRecord, 'test_bau') : draft.test_bau;
          const dispositionSource = linkedRecord
            ? getRecordField(linkedRecord, 'rework_flow_procedure')
            : draft.disposition_or_ss_plan_name;

          return (
            <div key={draft.record_id ? `${draft.record_id}-${index}` : index}>
              {isNewGroup && (
                <div
                  className={cn(
                    'mb-3 flex items-center gap-2',
                    index > 0 && 'mt-8 border-t-2 border-brand-700/30 pt-6 dark:border-brand-500/30'
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 text-brand-700 dark:text-brand-500" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{draft.filename}</p>
                </div>
              )}
              <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Test Bau</label>
                    <Input value={testBau || ''} disabled title="Same as this DN's FY2526 Test Bau" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Disposition or SS Plan Name</label>
                    <Input
                      value={dispositionSource || ''}
                      disabled
                      title="Same as this DN's FY2526 Rework Flow Procedure"
                    />
                  </div>
                  {FIELD_LABELS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{label}</label>
                      <Input
                        type={key === 'date_created' || key === 'date_attached_ss_plan' ? 'date' : undefined}
                        inputMode={key === 'physical_lot_qty' ? 'numeric' : undefined}
                        value={(draft[key] as string) || ''}
                        onChange={(e) => {
                          const value = key === 'physical_lot_qty' ? sanitizeQtyInput(e.target.value) : e.target.value;
                          updateLot2526Draft(index, key, value);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
