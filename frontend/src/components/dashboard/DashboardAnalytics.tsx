import { useEffect, useState } from 'react';
import { fetchAnalytics, type Analytics } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkline } from './Sparkline';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { dailyCounts, trend } from '@/lib/dashboardMetrics';
import { BarChart3, Cpu, Percent, User, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Fixed-order categorical palette for device identity - never cycled/reassigned.
// Colorblind-safety validated (dataviz skill's validate_palette.js, both modes).
const DONUT_COLORS_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7'];
const DONUT_COLORS_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#9085e9'];

function DeviceDonut({ devices }: { devices: { device: string; count: number }[] }) {
  const { theme } = useTheme();
  const DONUT_COLORS = theme === 'dark' ? DONUT_COLORS_DARK : DONUT_COLORS_LIGHT;
  const top = devices.slice(0, 4);
  const otherCount = devices.slice(4).reduce((sum, d) => sum + d.count, 0);
  const slices = otherCount > 0 ? [...top, { device: 'Others', count: otherCount }] : top;
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  if (!total) return <p className="text-xs text-slate-400">No data</p>;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90">
        {slices.map((s, i) => {
          const fraction = s.count / total;
          const dash = fraction * circumference;
          const circle = (
            <circle
              key={s.device}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={DONUT_COLORS[i]}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {slices.map((s, i) => (
          <div key={s.device} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[i] }} />
            <span className="min-w-0 flex-1 truncate">{s.device}</span>
            <strong className="shrink-0">{s.count} ({Math.round((s.count / total) * 100)}%)</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyBarChart({ data }: { data: [string, number][] }) {
  if (!data.length) return <p className="text-xs text-slate-400">No monthly data yet</p>;
  const max = Math.max(...data.map(([, count]) => count), 1);

  return (
    <div className="flex h-32 items-end gap-3">
      {data.map(([month, count]) => (
        <div key={month} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{count}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-brand-600 dark:bg-brand-500"
              style={{ height: `${Math.max((count / max) * 100, count > 0 ? 4 : 0)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500">{month}</span>
        </div>
      ))}
    </div>
  );
}

function OwnerBars({ owners }: { owners: { owner: string; count: number }[] }) {
  const top = owners.slice(0, 5);
  const max = Math.max(...top.map((o) => o.count), 1);

  return (
    <div className="space-y-2">
      {top.map((o) => (
        <div key={o.owner} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate">{o.owner}</span>
            <strong>{o.count}</strong>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${(o.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {!top.length && <p className="text-xs text-slate-400">No data</p>}
    </div>
  );
}

export function DashboardAnalytics() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const { logs, stats } = useApp();

  useEffect(() => {
    fetchAnalytics().then(setAnalytics).catch(() => setAnalytics(null));
  }, []);

  // Real daily "Duplicate Resolution" activity from the audit log - a
  // genuine trend proxy, since there's no per-day historical duplicate-rate
  // metric on the backend to show directly.
  const duplicateSeries = dailyCounts(logs, (l) => l.action === 'Duplicate Resolution');
  const duplicateDelta = trend(duplicateSeries);

  if (!analytics) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-sm text-slate-500 text-center">
          Analytics loading...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" /> Dashboard Analytics
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Percent className="h-4 w-4" /> Duplicate Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{analytics.duplicate_rate}%</p>
              {duplicateDelta !== null && duplicateDelta !== 0 && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-xs font-semibold',
                    duplicateDelta > 0 ? 'text-red-600' : 'text-emerald-600'
                  )}
                >
                  {duplicateDelta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(duplicateDelta)}% vs last 7 days
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">DNs with multiple entries</p>
            <Sparkline data={duplicateSeries} color="#b45309" className="mt-2 h-8 w-full" />
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{stats.duplicates_found}</p>
                <p className="text-slate-500">This period</p>
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{stats.total_records}</p>
                <p className="text-slate-500">Total records</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4" /> Top Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DeviceDonut devices={analytics.top_devices} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Cases per Owner
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OwnerBars owners={analytics.cases_per_owner} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Common Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {analytics.common_failures.map((f) => (
              <div key={f.issue} className="flex justify-between text-xs">
                <span>{f.issue}</span>
                <strong>{f.count}</strong>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyBarChart data={Object.entries(analytics.monthly_returns).slice(0, 8)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
