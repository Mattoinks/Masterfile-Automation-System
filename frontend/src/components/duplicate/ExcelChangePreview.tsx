import { useEffect, useState } from 'react';
import { previewSave, type DuplicateAction } from '@/api';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ExcelChangePreviewProps {
  duplicateAction?: DuplicateAction;
}

export function ExcelChangePreview({ duplicateAction = 'skip' }: ExcelChangePreviewProps) {
  const { records, selectedRecordId, recordEdits } = useApp();
  const record = records.find((r) => r.record_id === selectedRecordId) || records[0];
  const [preview, setPreview] = useState<{
    before: Record<string, string> | null;
    after: Record<string, string>;
    differences: Record<string, { existing: string; new: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!record?.record_id || record.status !== 'Duplicate') {
      setPreview(null);
      return;
    }
    const action = duplicateAction;
    if (action === 'skip') {
      setPreview(null);
      return;
    }
    setLoading(true);
    previewSave(record.record_id, action, recordEdits[record.record_id] || {})
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [record, duplicateAction, recordEdits]);

  if (!record || record.status !== 'Duplicate' || duplicateAction === 'skip') return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed p-6 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading change preview...
      </div>
    );
  }

  if (!preview) return null;

  const fields = Object.keys({ ...preview.before, ...preview.after }).filter(
    (k) => !['row_number'].includes(k)
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 dark:border-slate-600">
      <div className="bg-brand-700 px-4 py-2 text-white text-sm font-semibold">
        Excel Change Preview — Before Save
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              <th className="p-2 text-left">Field</th>
              <th className="p-2 text-left">Current (Case {preview.before?.case_id || '—'})</th>
              <th className="p-2 text-left">After Save</th>
            </tr>
          </thead>
          <tbody>
            {fields.slice(0, 12).map((key) => {
              const before = String(preview.before?.[key] ?? '—');
              const after = String(preview.after?.[key] ?? '—');
              const changed = before !== after;
              return (
                <tr key={key} className={cn('border-t', changed && 'bg-amber-50 dark:bg-amber-950/20')}>
                  <td className="p-2 font-medium capitalize">{key.replace(/_/g, ' ')}</td>
                  <td className={cn('p-2', changed && 'line-through text-slate-400')}>{before}</td>
                  <td className={cn('p-2', changed && 'font-semibold text-brand-700')}>{after}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
