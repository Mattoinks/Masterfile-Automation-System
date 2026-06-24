import { Button } from '@/components/ui/button';
import type { IndexedRecord } from '@/api';

interface RecordViewModalProps {
  record: IndexedRecord;
  onClose: () => void;
}

export function RecordViewModal({ record, onClose }: RecordViewModalProps) {
  const fields = record.fields || record;
  const entries = Object.entries(fields).filter(([k]) => !['payload', 'fields'].includes(k));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 shadow-2xl border p-6">
        <h2 className="text-lg font-bold mb-1">Case {record.case_id}</h2>
        <p className="text-sm text-slate-500 mb-4">DN {record.dn_number}</p>
        <dl className="space-y-2 text-sm">
          {entries.map(([key, val]) => (
            <div key={key} className="flex gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <dt className="text-slate-500 w-32 shrink-0 capitalize">{key.replace(/_/g, ' ')}</dt>
              <dd className="font-medium break-all">{String(val ?? '—')}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
