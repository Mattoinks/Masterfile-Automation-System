import { FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import type { Lot2526BreakdownRecord } from '@/api';

const FIELD_LABELS: { key: keyof Lot2526BreakdownRecord; label: string }[] = [
  { key: 'test_bau', label: 'Test Bau' },
  { key: 'original_label_lot_no', label: 'Original Label Lot no.' },
  { key: 'date_code', label: 'Date code' },
  { key: 'return_qty_from_dc', label: 'Return Qty from DC' },
  { key: 'created_lot_no', label: 'Created Lot#' },
  { key: 'date_created', label: 'Date Created' },
  { key: 'created_date_code', label: 'Date Code (Created Lot#)' },
  { key: 'physical_lot_qty', label: 'Physical Lot Qty' },
  { key: 'lot_code', label: 'Lot Code' },
  { key: 'disposition_or_ss_plan_name', label: 'Disposition or SS Plan Name' },
  { key: 'date_attached_ss_plan', label: 'Date attached SS Plan' },
  { key: 'lw', label: 'LW' },
];

export function Lot2526ReviewSection() {
  const { lot2526Drafts, updateLot2526Draft } = useApp();

  if (!lot2526Drafts.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>2526 Breakdown</CardTitle>
        <CardDescription>
          Extracted from the same DN PDF(s) above. Reviewed here, saved together with the FY2526 records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lot2526Drafts.map((draft, index) => {
          const prev = lot2526Drafts[index - 1];
          const groupKey = draft.record_id ?? draft.filename;
          const isNewGroup = index === 0 || groupKey !== (prev?.record_id ?? prev?.filename);

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
                  {FIELD_LABELS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{label}</label>
                      <Input
                        type={key === 'date_created' ? 'date' : key === 'physical_lot_qty' ? 'number' : undefined}
                        inputMode={key === 'physical_lot_qty' ? 'numeric' : undefined}
                        min={key === 'physical_lot_qty' ? '0' : undefined}
                        step={key === 'physical_lot_qty' ? '1' : undefined}
                        value={(draft[key] as string) || ''}
                        onChange={(e) => draft.record_id && updateLot2526Draft(draft.record_id, key, e.target.value)}
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
