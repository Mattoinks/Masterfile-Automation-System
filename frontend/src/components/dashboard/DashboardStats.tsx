import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkline } from './Sparkline';
import { useApp } from '@/context/AppContext';
import { dailyCounts, trend } from '@/lib/dashboardMetrics';
import { Database, FileUp, Copy, Clock, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const CARD_COLOR = {
  brand: { badge: 'text-brand-700 bg-brand-50 dark:bg-brand-950', line: '#15803d' },
  blue: { badge: 'text-blue-700 bg-blue-50 dark:bg-blue-950', line: '#2563eb' },
  emerald: { badge: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950', line: '#059669' },
  amber: { badge: 'text-amber-700 bg-amber-50 dark:bg-amber-950', line: '#b45309' },
  violet: { badge: 'text-violet-700 bg-violet-50 dark:bg-violet-950', line: '#6d28d9' },
};

function StatCard({
  value,
  label,
  icon: Icon,
  tone,
  series,
}: {
  value: number;
  label: string;
  icon: typeof Database;
  tone: keyof typeof CARD_COLOR;
  series: number[] | null;
}) {
  const { badge, line } = CARD_COLOR[tone];
  const delta = series ? trend(series) : null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', badge)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
              {delta !== null && delta !== 0 && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-xs font-semibold',
                    delta > 0 ? 'text-emerald-600' : 'text-red-600'
                  )}
                >
                  {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(delta)}%
                </span>
              )}
            </div>
            <p className="truncate text-xs text-slate-500">{label}</p>
          </div>
        </div>
        {series && (
          <Sparkline data={series} color={line} className="mt-3 h-8 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardStats() {
  const { stats, pendingReviewCount, logs } = useApp();

  const uploadSeries = dailyCounts(logs, (l) => l.action === 'Upload' && l.status === 'Uploaded');
  const insertSeries = dailyCounts(logs, (l) => l.action === 'Insert');
  const duplicateSeries = dailyCounts(logs, (l) => l.action === 'Duplicate Resolution');
  // Total Cases has no single "case created" event of its own - it grows by
  // the same Insert events as New Records, so its trend is that same series
  // accumulated day over day (a real running total, not a separate metric).
  const totalCasesSeries = insertSeries.reduce<number[]>((acc, v) => {
    acc.push((acc[acc.length - 1] || 0) + v);
    return acc;
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      <StatCard value={stats.total_records} label="Total Cases" icon={Database} tone="brand" series={totalCasesSeries} />
      <StatCard value={stats.todays_uploads} label="Today's Uploads" icon={FileUp} tone="blue" series={uploadSeries} />
      <StatCard value={stats.successful_inserts} label="New Records" icon={Copy} tone="emerald" series={insertSeries} />
      <StatCard value={stats.duplicates_found} label="Duplicates" icon={AlertTriangle} tone="amber" series={duplicateSeries} />
      {/* Pending Review is a live snapshot, not a discrete logged event - no real
          daily series exists for it, so it's shown without a sparkline rather
          than a fabricated one. */}
      <StatCard value={pendingReviewCount} label="Pending Review" icon={Clock} tone="violet" series={null} />
    </div>
  );
}

export function FutureMetrics() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm text-slate-500">Future Analytics</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-400">
        <div className="rounded-lg border border-dashed p-3">OCR Confidence</div>
        <div className="rounded-lg border border-dashed p-3">AI Suggestions</div>
        <div className="rounded-lg border border-dashed p-3">Duplicate Warnings</div>
        <div className="rounded-lg border border-dashed p-3">Monthly Statistics</div>
      </CardContent>
    </Card>
  );
}
