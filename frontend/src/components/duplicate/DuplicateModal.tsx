import { AlertTriangle, Copy, GitBranch, Pencil, SkipForward, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DUPLICATE_ACTION_LABELS,
  DUPLICATE_STATUS_COLORS,
  type DuplicateAction,
  type ExtractedRecord,
} from '@/api';
import { DuplicateComparison } from './DuplicateComparison';
import { cn } from '@/lib/utils';

const ACTION_ICONS: Record<DuplicateAction, typeof SkipForward> = {
  skip: SkipForward,
  replace: Copy,
  revision: GitBranch,
  edit_existing: Pencil,
  force_insert: Zap,
};

interface DuplicateModalProps {
  record: ExtractedRecord;
  selectedAction: DuplicateAction;
  onActionChange: (action: DuplicateAction) => void;
  onConfirm: () => void;
  onClose: () => void;
  canForceInsert: boolean;
}

const ALL_ACTIONS: DuplicateAction[] = [
  'skip',
  'replace',
  'revision',
  'edit_existing',
  'force_insert',
];

export function DuplicateModal({
  record,
  selectedAction,
  onActionChange,
  onConfirm,
  onClose,
  canForceInsert,
}: DuplicateModalProps) {
  const match = record.duplicate_match;
  const existing = match?.existing_record;
  const status = record.duplicate_status || 'Exact Duplicate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold">Duplicate Record Found</h2>
              <p className="text-sm text-slate-500 mt-1">
                Review the match and choose how to proceed before insertion.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">DN Number</span>
              <p className="font-semibold">{record.dn_number || '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">Existing Case</span>
              <p className="font-semibold">{existing?.case_id || '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">Confidence</span>
              <p className="font-semibold">{match?.confidence_score ?? 0}% Match</p>
            </div>
            <div>
              <span className="text-slate-500">Result</span>
              <span className={cn('inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium', DUPLICATE_STATUS_COLORS[status])}>
                {status}
              </span>
            </div>
          </div>

          {match?.match_reasons.length ? (
            <ul className="mt-3 text-xs text-slate-500 space-y-1">
              {match.match_reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {match && existing && (
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <DuplicateComparison
              existing={existing}
              newRecord={record}
              differences={match.field_differences}
            />
          </div>
        )}

        <div className="p-6 space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Choose Action</p>
          {ALL_ACTIONS.map((action) => {
            const Icon = ACTION_ICONS[action];
            const disabled = action === 'force_insert' && !canForceInsert;
            return (
              <label
                key={action}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                  selectedAction === action
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-950/30'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <input
                  type="radio"
                  name="duplicate-action"
                  value={action}
                  checked={selectedAction === action}
                  disabled={disabled}
                  onChange={() => onActionChange(action)}
                  className="accent-brand-700"
                />
                <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{DUPLICATE_ACTION_LABELS[action]}</p>
                  {action === 'force_insert' && !canForceInsert && (
                    <p className="text-xs text-slate-400">Requires Admin role</p>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        <div className="p-6 pt-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm}>Confirm Action</Button>
        </div>
      </div>
    </div>
  );
}
