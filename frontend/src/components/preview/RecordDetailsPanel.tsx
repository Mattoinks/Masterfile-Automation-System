import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { SOURCE_COLORS, SOURCE_LABELS } from '@/lib/utils';
import { cn } from '@/lib/utils';

const DETAIL_FIELDS = [
  'dn_number', 'device', 'package', 'owner', 'gf', 'type_of_return', 'dc',
  'store_received', 'recd_mth', 'recd_lw', 'date_code', 'dc_bau', 'test_bau',
  'case_title', 'rework_flow_procedure', 'cause_owner', 'quantity', 'rma_number',
];

const FIELD_LABELS: Record<string, string> = {
  cause_owner: 'Engineer (who entered Rework Flow)',
  rework_flow_procedure: 'Rework Flow',
};

export function RecordDetailsPanel() {
  const { userName } = useAuth();
  const {
    records, selectedRecordId, getRecordField, getFieldSource,
    setRecordEdits, duplicateActions, setDuplicateActions, setFieldValue,
  } = useApp();

  const record = records.find((r) => r.record_id === selectedRecordId) || records[0];
  if (!record?.record_id) return null;

  const canEdit = record.status === 'New' || record.status === 'Duplicate';
  const reworkFlow = getRecordField(record, 'rework_flow_procedure').trim();

  const handleFieldChange = (field: string, value: string) => {
    if (field === 'rework_flow_procedure') {
      setFieldValue(record.record_id!, field, value);
      return;
    }
    setRecordEdits((prev) => ({
      ...prev,
      [record.record_id!]: { ...prev[record.record_id!], [field]: value },
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Details — DN {getRecordField(record, 'dn_number')}</CardTitle>
        {record.matched_historical_dn && (
          <p className="text-xs text-blue-600">Matched historical DN {record.matched_historical_dn}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
        {DETAIL_FIELDS.map((field) => {
          if (field === 'cause_owner' && !reworkFlow) return null;

          const source = getFieldSource(record, field);
          const pdfVal = record.field_sources?.[field] === 'pdf' ? getRecordField(record, field) : '';
          const histVal = ['history', 'lookup'].includes(record.field_sources?.[field] || '') ? getRecordField(record, field) : '';
          const finalVal = getRecordField(record, field);
          const label = FIELD_LABELS[field] || field.replace(/_/g, ' ');
          const diag = record.field_diagnostics?.[field];

          return (
            <div key={field} className={cn('rounded-lg border p-3', SOURCE_COLORS[source] || '')}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                <Badge variant={source === 'pdf' ? 'pdf' : source === 'required' ? 'required' : 'history'}>
                  {SOURCE_LABELS[source] || source}
                </Badge>
              </div>
              {diag && !finalVal && (
                <div className="mb-2 rounded border border-amber-200 bg-amber-50/80 p-2 text-xs dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="font-medium text-amber-800 dark:text-amber-300">Why empty?</p>
                  <p className="text-slate-600 dark:text-slate-300">{diag.reason}</p>
                  {diag.suggested_value && (
                    <p className="mt-1 text-violet-700 dark:text-violet-300">
                      Suggested: <strong>{diag.suggested_value}</strong>
                      {diag.suggestion_source && ` (${diag.suggestion_source})`}
                      {diag.historical_match?.confidence
                        ? ` — ${diag.historical_match.confidence}% confidence`
                        : ''}
                    </p>
                  )}
                </div>
              )}
              {field === 'cause_owner' && (
                <p className="text-xs text-slate-500 mb-2">
                  Auto-filled as <strong>{userName}</strong> when you enter Rework Flow — you can change it.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 text-xs mb-2 text-slate-600 dark:text-slate-300">
                <div><span className="block opacity-60">PDF</span>{pdfVal || '(blank)'}</div>
                <div><span className="block opacity-60">Historical</span>{histVal || '(blank)'}</div>
                <div><span className="block opacity-60">Final</span><strong>{finalVal || '(blank)'}</strong></div>
              </div>
              <Input
                value={finalVal}
                disabled={!canEdit}
                placeholder={field === 'cause_owner' ? 'Engineer name' : undefined}
                onChange={(e) => handleFieldChange(field, e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          );
        })}

        {record.status === 'Duplicate' && (
          <div className="pt-2">
            <label className="text-sm text-slate-600">Duplicate action</label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
              value={duplicateActions[record.record_id] || 'skip'}
              onChange={(e) =>
                setDuplicateActions((prev) => ({
                  ...prev,
                  [record.record_id!]: e.target.value as 'skip' | 'replace',
                }))
              }
            >
              <option value="skip">Skip</option>
              <option value="replace">Replace</option>
            </select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
