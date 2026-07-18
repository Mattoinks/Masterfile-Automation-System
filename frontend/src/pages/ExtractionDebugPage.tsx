import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  listAnalyzeSamples,
  runPdfAnalysis,
  fetchExtractionLog,
  type AnalysisRunResult,
  type FieldDiagnostic,
  type PdfAnalysisReport,
} from '@/api';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react';

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-emerald-600';
  if (confidence >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function FieldDebugCard({ diag }: { diag: FieldDiagnostic }) {
  const isFound = diag.status === 'found';
  return (
    <div
      className={cn(
        'rounded-lg border p-4 text-sm',
        isFound
          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
          : 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {isFound ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
          )}
          <span className="font-semibold capitalize">{diag.field.replace(/_/g, ' ')}</span>
        </div>
        <span className={cn('text-xs font-bold', confidenceColor(diag.confidence))}>
          {diag.confidence}%
        </span>
      </div>

      {diag.value && (
        <p className="text-xs mb-1">
          <span className="text-slate-500">Value:</span> {diag.value}
        </p>
      )}

      <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{diag.reason}</p>

      <div className="flex flex-wrap gap-1 mb-2">
        {diag.source && <Badge variant="outline">{diag.source}</Badge>}
        {diag.failure_category && (
          <Badge variant="outline" className="text-amber-700">
            {diag.failure_category.replace(/_/g, ' ')}
          </Badge>
        )}
        {diag.found_on_page && (
          <Badge variant="outline">Page {diag.found_on_page}</Badge>
        )}
      </div>

      {diag.attempted_labels.length > 0 && (
        <p className="text-xs text-slate-500 mb-1">
          Labels tried: {diag.attempted_labels.join(', ')}
        </p>
      )}

      {diag.labels_found.length > 0 && (
        <div className="text-xs text-slate-500 mb-2 space-y-0.5">
          {diag.labels_found.slice(0, 3).map((lf, i) => (
            <div key={i}>
              Line {lf.line} (p.{lf.page}): &quot;{lf.label}&quot; → {lf.value_after_label || '(empty)'}
            </div>
          ))}
        </div>
      )}

      {diag.historical_match?.value && (
        <div className="mt-2 rounded border border-blue-200 bg-blue-50/80 p-2 text-xs dark:border-blue-900 dark:bg-blue-950/30">
          <p className="font-medium text-blue-800 dark:text-blue-300">Historical Match</p>
          <p>{diag.historical_match.value} ({diag.historical_match.confidence}%)</p>
          <p className="text-slate-500">
            Case {diag.historical_match.case_id} · {diag.historical_match.match_reason}
          </p>
        </div>
      )}

      {diag.suggested_value && !diag.value && (
        <div className="mt-2 rounded border border-violet-200 bg-violet-50/80 p-2 text-xs dark:border-violet-900 dark:bg-violet-950/30">
          <p className="font-medium text-violet-800 dark:text-violet-300">Suggested</p>
          <p>{diag.suggested_value}</p>
          <p className="text-slate-500">Source: {diag.suggestion_source}</p>
        </div>
      )}

      {diag.alternative_method && (
        <p className="text-xs text-slate-400 mt-2">
          Alternative: {diag.alternative_method.replace(/_/g, ' ')}
        </p>
      )}
    </div>
  );
}

function ReportPanel({
  report,
  selected,
  onSelect,
}: {
  report: PdfAnalysisReport;
  selected: boolean;
  onSelect: () => void;
}) {
  const missing = report.fields.filter((f) => f.status === 'missing').length;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-colors',
        selected
          ? 'border-brand-600 bg-brand-50 dark:bg-brand-950/30'
          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900'
      )}
    >
      <p className="font-mono font-semibold text-sm">{report.dn_number || report.filename}</p>
      <p className="text-xs text-slate-500 truncate">{report.filename}</p>
      <div className="flex gap-2 mt-1 text-xs">
        <span>{report.page_count} pages</span>
        {missing > 0 && (
          <span className="text-red-600">{missing} missing</span>
        )}
      </div>
    </button>
  );
}

export function ExtractionDebugPage() {
  const [samples, setSamples] = useState<string[]>([]);
  const [result, setResult] = useState<AnalysisRunResult | null>(null);
  const [selectedDn, setSelectedDn] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAnalyzeSamples()
      .then((r) => setSamples(r.pdfs))
      .catch(() => setSamples([]));
  }, []);

  const selectedReport = result?.reports.find(
    (r) => r.dn_number === selectedDn || r.filename === selectedDn
  );

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await runPdfAnalysis();
      setResult(data);
      if (data.reports.length > 0) {
        setSelectedDn(data.reports[0].dn_number || data.reports[0].filename);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedReport?.dn_number) {
      setLogContent('');
      return;
    }
    fetchExtractionLog(selectedReport.dn_number)
      .then((r) => setLogContent(r.log))
      .catch(() => setLogContent(''));
  }, [selectedReport?.dn_number]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileSearch className="h-7 w-7 text-brand-700" />
            Extraction Debug Panel
          </h2>
          <p className="text-sm text-slate-500">
            Analyze sample PDFs in <code className="text-xs bg-slate-100 px-1 rounded">/analyze</code> —
            diagnose why fields are empty
          </p>
        </div>
        <Button onClick={handleRun} disabled={loading || samples.length === 0}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run Analysis ({samples.length} PDFs)
        </Button>
      </div>

      {samples.length === 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            No PDFs found in <code>/analyze</code>. Place sample DN PDFs there first.
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.summary.total_pdfs}</p>
                <p className="text-xs text-slate-500">PDFs analyzed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-600">{result.summary.missing_fields}</p>
                <p className="text-xs text-slate-500">Missing fields</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-amber-600">
                  {result.summary.low_confidence_fields}
                </p>
                <p className="text-xs text-slate-500">Low confidence</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-mono text-slate-600 truncate">
                  {new Date(result.analyzed_at).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">Last run</p>
              </CardContent>
            </Card>
          </div>

          {result.comparison.layout_variants.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Multi-PDF Comparison</CardTitle>
                <CardDescription>Layout differences across sample DNs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {result.comparison.layout_variants.map((note, i) => (
                  <p key={i} className="text-slate-600 dark:text-slate-300">• {note}</p>
                ))}
                {result.comparison.missing_sections.length > 0 && (
                  <p className="text-red-600 text-xs">
                    Always missing: {result.comparison.missing_sections.join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3 space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Reports</p>
              {result.reports.map((r) => (
                <ReportPanel
                  key={r.filename}
                  report={r}
                  selected={selectedDn === (r.dn_number || r.filename)}
                  onSelect={() => setSelectedDn(r.dn_number || r.filename)}
                />
              ))}
            </div>

            <div className="lg:col-span-9 space-y-4">
              {selectedReport && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>DN {selectedReport.dn_number}</CardTitle>
                      <CardDescription>
                        {selectedReport.filename} · {selectedReport.extraction_method} ·{' '}
                        {selectedReport.page_count} page(s)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-3">
                      {selectedReport.fields.map((diag) => (
                        <FieldDebugCard key={diag.field} diag={diag} />
                      ))}
                    </CardContent>
                  </Card>

                  {logContent && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          Extraction Log — {selectedReport.dn_number}.log
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-4 overflow-x-auto max-h-80 whitespace-pre-wrap font-mono">
                          {logContent}
                        </pre>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
