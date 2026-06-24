import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/context/AppContext';
import { Database, FileUp, Copy, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const cards = [
  { key: 'total_records' as const, label: 'Total Cases', icon: Database, color: 'text-brand-700 bg-brand-50 dark:bg-brand-950' },
  { key: 'todays_uploads' as const, label: "Today's Uploads", icon: FileUp, color: 'text-blue-700 bg-blue-50 dark:bg-blue-950' },
  { key: 'successful_inserts' as const, label: 'New Records', icon: Copy, color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950' },
  { key: 'duplicates_found' as const, label: 'Duplicates', icon: AlertTriangle, color: 'text-amber-700 bg-amber-50 dark:bg-amber-950' },
];

export function DashboardStats() {
  const { stats, pendingReviewCount } = useApp();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      {cards.map(({ key, label, icon: Icon, color }) => (
        <Card key={key}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className={cn('rounded-xl p-3', color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats[key]}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="rounded-xl p-3 text-violet-700 bg-violet-50 dark:bg-violet-950">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{pendingReviewCount}</p>
            <p className="text-xs text-slate-500">Pending Review</p>
          </div>
        </CardContent>
      </Card>
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
