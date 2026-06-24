import { useEffect, useState } from 'react';
import { fetchAnalytics, type Analytics } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Cpu, Percent, User, AlertCircle } from 'lucide-react';

export function DashboardAnalytics() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    fetchAnalytics().then(setAnalytics).catch(() => setAnalytics(null));
  }, []);

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
            <p className="text-2xl font-bold">{analytics.duplicate_rate}%</p>
            <p className="text-xs text-slate-500">DNs with multiple entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4" /> Top Devices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {analytics.top_devices.slice(0, 5).map((d) => (
              <div key={d.device} className="flex justify-between text-xs">
                <span className="truncate max-w-[70%]">{d.device}</span>
                <strong>{d.count}</strong>
              </div>
            ))}
            {!analytics.top_devices.length && <p className="text-xs text-slate-400">No data</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Cases per Owner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {analytics.cases_per_owner.slice(0, 5).map((o) => (
              <div key={o.owner} className="flex justify-between text-xs">
                <span>{o.owner}</span>
                <strong>{o.count}</strong>
              </div>
            ))}
            {!analytics.cases_per_owner.length && <p className="text-xs text-slate-400">No data</p>}
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
            <div className="flex flex-wrap gap-3">
              {Object.entries(analytics.monthly_returns).slice(0, 8).map(([month, count]) => (
                <div key={month} className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs">
                  <span className="text-slate-500">{month}</span>
                  <p className="font-bold text-lg">{count}</p>
                </div>
              ))}
              {!Object.keys(analytics.monthly_returns).length && (
                <p className="text-xs text-slate-400">No monthly data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
