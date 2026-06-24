import type { ExistingMasterRecord, ExtractedRecord } from '@/api';
import { cn } from '@/lib/utils';

const COMPARE_FIELDS: { key: string; label: string }[] = [
  { key: 'dn_number', label: 'DN' },
  { key: 'quantity', label: 'Qty' },
  { key: 'owner', label: 'Owner' },
  { key: 'device', label: 'Device' },
  { key: 'rma_number', label: 'SAP Number' },
  { key: 'date_code', label: 'Date Code' },
  { key: 'package', label: 'Package' },
  { key: 'store_received', label: 'Date' },
];

interface DuplicateComparisonProps {
  existing: ExistingMasterRecord;
  newRecord: ExtractedRecord;
  differences: Record<string, { existing: string; new: string }>;
}

export function DuplicateComparison({ existing, newRecord, differences }: DuplicateComparisonProps) {
  const getNewVal = (key: string) => {
    const val = newRecord[key as keyof ExtractedRecord];
    return val === undefined || val === null ? '' : String(val);
  };

  const getExistingVal = (key: string) => {
    const val = existing[key as keyof ExistingMasterRecord];
    return val === undefined || val === null ? '' : String(val);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Duplicate Comparison</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="p-2 text-left font-semibold">Field</th>
              <th className="p-2 text-left font-semibold">Existing</th>
              <th className="p-2 text-left font-semibold">New</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_FIELDS.map(({ key, label }) => {
              const isDiff = key in differences;
              const existingVal = getExistingVal(key) || '—';
              const newVal = getNewVal(key) || '—';
              return (
                <tr
                  key={key}
                  className={cn(
                    'border-t border-slate-100 dark:border-slate-800',
                    isDiff && 'bg-amber-50 dark:bg-amber-950/20'
                  )}
                >
                  <td className="p-2 font-medium">{label}</td>
                  <td className={cn('p-2', isDiff && 'text-amber-700 dark:text-amber-300 font-medium')}>
                    {existingVal}
                  </td>
                  <td className={cn('p-2', isDiff && 'text-amber-700 dark:text-amber-300 font-medium')}>
                    {newVal}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
