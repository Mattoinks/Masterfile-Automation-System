import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';

export function ProcessingPipeline() {
  const { uploadedFiles, records, isProcessing } = useApp();

  if (!uploadedFiles.length && !records.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(records.length ? records.map((r) => ({ name: r.filename, record: r })) : uploadedFiles.map((f) => ({ name: f.name, record: null }))).map(({ name, record }) => {
          const steps = [
            { label: 'Extracted', done: !!record },
            { label: 'Validated', done: !!record && record.status !== 'Invalid' },
            { label: 'Historical Match', done: !!record?.matched_historical_dn || !!record?.field_sources?.owner },
            { label: 'Ready to Insert', done: !!record && (record.status === 'New' || record.status === 'Duplicate') },
          ];
          const ready = steps.every((s) => s.done);
          return (
            <div key={name} className="rounded-lg border p-4 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-sm">{name}</p>
                <Badge variant={ready ? 'success' : record?.status === 'Invalid' ? 'required' : 'secondary'}>
                  {isProcessing ? 'Processing...' : ready ? 'Ready' : record?.status || 'Queued'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {steps.map((step) => (
                  <div key={step.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    {isProcessing && !record ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-700" />
                    ) : step.done ? (
                      <CheckCircle2 className="h-4 w-4 text-brand-700" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300" />
                    )}
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
