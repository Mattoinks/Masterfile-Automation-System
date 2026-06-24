import { useApp } from '@/context/AppContext';
import { REVIEW_FIELDS, SOURCE_LABELS, resolveFieldSource } from '@/lib/reviewFields';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function FieldComparison() {
  const {
    records,
    selectedRecordId,
    getRecordField,
    getPdfValue,
    getSuggestedValue,
    recordEdits,
  } = useApp();

  const record = records.find((r) => r.record_id === selectedRecordId) || records[0];
  if (!record?.record_id) return null;

  const id = record.record_id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Side-by-Side Comparison</CardTitle>
        <p className="text-xs text-slate-500">DN {getRecordField(record, 'dn_number')}</p>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800">
              <th className="px-3 py-2 text-left font-semibold">Field</th>
              <th className="px-3 py-2 text-left font-semibold">PDF</th>
              <th className="px-3 py-2 text-left font-semibold">Suggested</th>
              <th className="px-3 py-2 text-left font-semibold">Final</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {REVIEW_FIELDS.map((field) => {
              const pdf = getPdfValue(record, field.key);
              const suggested = getSuggestedValue(record, field.key);
              const finalVal = getRecordField(record, field.key);
              const hasEdit = recordEdits[id]?.[field.key] !== undefined;
              const source = resolveFieldSource(field.key, record, hasEdit, finalVal);
              return (
                <tr key={field.key} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-medium">{field.label}</td>
                  <td className="px-3 py-2 text-slate-500">{pdf || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{suggested || '—'}</td>
                  <td className={cn('px-3 py-2 font-semibold', !finalVal && 'text-red-500')}>
                    {finalVal || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        source === 'pdf' ? 'pdf' : source === 'manual' ? 'required' : source === 'missing' ? 'required' : 'history'
                      }
                      className="text-[10px]"
                    >
                      {SOURCE_LABELS[source]}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
