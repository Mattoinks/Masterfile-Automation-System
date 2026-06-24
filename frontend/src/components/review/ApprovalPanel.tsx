import { AlertTriangle, CheckCircle2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useApp } from '@/context/AppContext';

export function ApprovalPanel() {
  const {
    records,
    validationResult,
    reviewedCount,
    manuallyEditedCount,
    readyCount,
    handleSave,
    isSaving,
    reviewMode,
    duplicateActions,
  } = useApp();

  const unresolvedDuplicates = records.filter(
    (r) => r.status === 'Duplicate' && r.record_id && !duplicateActions[r.record_id]
  ).length;

  if (!records.length || !reviewMode) return null;

  const canInsert = validationResult.valid && readyCount > 0 && unresolvedDuplicates === 0;

  return (
    <Card className={validationResult.valid ? 'border-emerald-200 dark:border-emerald-800' : 'border-amber-200 dark:border-amber-800'}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              {validationResult.valid ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Final Approval
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              {readyCount} record(s) ready · {reviewedCount} reviewed · {manuallyEditedCount} manually edited
            </p>

            {unresolvedDuplicates > 0 && (
              <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  {unresolvedDuplicates} duplicate(s) require resolution before insertion
                </p>
                <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                  Click Resolve Duplicate on each duplicate row to choose an action.
                </p>
              </div>
            )}

            {!validationResult.valid && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {validationResult.issues.length} field(s) require attention before insertion
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                  {validationResult.issues.slice(0, 6).map((issue, i) => (
                    <li key={i}>
                      DN {issue.dnNumber}: {issue.message}
                    </li>
                  ))}
                  {validationResult.issues.length > 6 && (
                    <li>…and {validationResult.issues.length - 6} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <Button
            size="lg"
            onClick={handleSave}
            disabled={isSaving || !canInsert}
            className="shrink-0"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Approve and Insert
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
