import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { DashboardAnalytics } from '@/components/dashboard/DashboardAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/context/AppContext';
import { useAuth, ROLE_LABELS } from '@/context/AuthContext';
import { ArrowRight, Download } from 'lucide-react';
import { downloadMasterfile } from '@/api';

export function DashboardPage() {
  const { logs, readyCount } = useApp();
  const { userName, role, lastLogin, can } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome, {userName}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Role: {ROLE_LABELS[role]}
            {lastLogin && ` · Last login: ${new Date(lastLogin).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex gap-2">
          {can('download') && (
            <Button variant="outline" onClick={() => downloadMasterfile().catch(alert)}>
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          )}
          {can('upload') && (
            <Button asChild>
              <Link to="/upload">Start Processing <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          )}
        </div>
      </div>

      <DashboardStats />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Workflow Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
              <span>Records pending review</span>
              <strong>{readyCount}</strong>
            </div>
            <Button asChild className="w-full" variant={readyCount ? 'default' : 'secondary'}>
              <Link to="/preview">{readyCount ? 'Review & Insert' : 'Go to Preview'}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {logs.slice(0, 5).map((log, i) => (
              <div key={i} className="flex justify-between text-xs border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="truncate">{log.filename}</span>
                <span className="text-slate-500">{log.status}</span>
              </div>
            ))}
            {!logs.length && <p className="text-xs text-slate-500">No activity yet</p>}
          </CardContent>
        </Card>
      </div>

      <DashboardAnalytics />
    </div>
  );
}
