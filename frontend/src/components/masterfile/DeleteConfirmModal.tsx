import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DeleteConfirmModalProps {
  caseIds: string[];
  dnNumbers: string[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  permanent?: boolean;
}

export function DeleteConfirmModal({
  caseIds,
  dnNumbers,
  onConfirm,
  onCancel,
  loading,
  permanent,
}: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
          <div>
            <h2 className="text-lg font-bold">
              {permanent ? 'Permanently Delete Record?' : 'Delete Record?'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {permanent
                ? 'This will physically remove the row from the Excel masterfile. This cannot be undone.'
                : 'The record will be moved to the Recycle Bin and hidden from normal views. You can restore it later.'}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm space-y-1 mb-6">
          {caseIds.map((id, i) => (
            <div key={id}>
              <strong>Case ID:</strong> {id}
              {dnNumbers[i] && <> · <strong>DN:</strong> {dnNumbers[i]}</>}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting...' : permanent ? 'Permanently Delete' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
