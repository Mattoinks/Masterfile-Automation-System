import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/context/AppContext';

const STAGE_LABELS: Record<string, string> = {
  preparing: 'Preparing',
  reading: 'Reading PDF',
  ocr: 'OCR scanning',
  parsing: 'Parsing fields',
  extracting: 'Extracting',
  autofill: 'Auto-fill',
  duplicate: 'Duplicate check',
  done: 'Complete',
};

export function ProcessingProgressCard() {
  const { isProcessing, processingProgress } = useApp();

  if (!isProcessing && !processingProgress?.active) return null;

  const progress = processingProgress;
  const percent = progress?.percent ?? 0;
  const stageLabel = STAGE_LABELS[progress?.stage || ''] || progress?.stage || 'Working';

  return (
    <Card className="border-brand-200 dark:border-brand-900 bg-brand-50/50 dark:bg-brand-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-brand-700" />}
          Extracting DN data…
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-700 transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">{percent}%</span>
          {progress && progress.total > 0 && (
            <span className="text-slate-500">
              {progress.completed} / {progress.total} PDF(s)
            </span>
          )}
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
          <p>
            <span className="text-xs uppercase tracking-wide text-slate-500 mr-2">{stageLabel}</span>
            {progress?.message || 'Starting…'}
          </p>
          {progress?.current_file && (
            <p className="text-xs text-slate-500 truncate">File: {progress.current_file}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
