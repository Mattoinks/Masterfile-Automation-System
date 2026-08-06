import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { DashboardAnalytics } from '@/components/dashboard/DashboardAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  Download,
  ClipboardList,
  CheckCircle2,
  PackageCheck,
  Upload,
  FileEdit,
  LogIn,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { downloadMasterfile, type LogEntry } from '@/api';

const ACTION_ICONS: Record<string, typeof Upload> = {
  Upload: Upload,
  Review: FileEdit,
  Login: LogIn,
};

function actionIcon(action: string) {
  return ACTION_ICONS[action] || Activity;
}

function statusTone(status: string): 'success' | 'warning' | 'error' {
  const s = status.toLowerCase();
  if (s.includes('error') || s.includes('fail')) return 'error';
  if (s.includes('remov') || s.includes('skip') || s.includes('duplicate')) return 'warning';
  return 'success';
}

const TONE_STYLES: Record<string, string> = {
  success: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
  warning: 'text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
  error: 'text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-400',
};

function relativeTime(timestamp: string): string {
  // Backend logs store UTC timestamps as "YYYY-MM-DD HH:MM:SS"
  const date = new Date(`${timestamp.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return timestamp;
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function activityLine(log: LogEntry): string {
  const who = log.user && log.user !== 'System' ? log.user : null;
  if (log.action === 'Login') return who ? `${who} logged in` : 'Login';
  if (log.dn_number && log.dn_number !== 'N/A') return `${log.action}: ${log.dn_number}`;
  if (log.filename && log.filename !== 'N/A') return `${log.action}: ${log.filename}`;
  return log.action;
}

export function DashboardPage() {
  const { logs, readyCount, pendingReviewCount, stats } = useApp();
  const { userName, can } = useAuth();

  const stages = [
    {
      label: 'Pending Review',
      caption: 'Records waiting for review',
      value: pendingReviewCount,
      icon: ClipboardList,
      color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950',
    },
    {
      label: 'Ready to Insert',
      caption: 'Records approved',
      value: readyCount,
      icon: PackageCheck,
      color: 'text-blue-700 bg-blue-50 dark:bg-blue-950',
    },
    {
      label: 'Inserted',
      caption: 'Successfully processed',
      value: stats.successful_inserts,
      icon: CheckCircle2,
      color: 'text-violet-700 bg-violet-50 dark:bg-violet-950',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome back, {userName}! 👋
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Here's what's happening with your RMA Masterfile system today.
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
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between">
              {stages.map((stage, i) => (
                <div key={stage.label} className="flex flex-1 items-start">
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', stage.color)}>
                        <stage.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-lg font-bold leading-tight text-slate-900 dark:text-white">{stage.value}</p>
                        <p className="text-xs leading-tight text-slate-500">{stage.label}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">{stage.caption}</p>
                    {i === 0 && <div className="h-0.5 w-10 rounded-full bg-emerald-500" />}
                  </div>
                  {i < stages.length - 1 && (
                    <ArrowRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-700" />
                  )}
                </div>
              ))}
            </div>
            <Button asChild className="w-full" variant={readyCount ? 'default' : 'secondary'}>
              <Link to="/preview">{readyCount ? 'Go to Review Queue' : 'Go to Review Records'} <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {logs.slice(0, 6).map((log) => {
              const Icon = actionIcon(log.action);
              const tone = statusTone(log.status);
              return (
                <div key={log.id} className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm">
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE_STYLES[tone])}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-slate-700 dark:text-slate-200">{activityLine(log)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{relativeTime(log.timestamp)}</span>
                </div>
              );
            })}
            {!logs.length && (
              <p className="flex items-center gap-2 py-6 text-center text-xs text-slate-500 justify-center">
                <AlertTriangle className="h-4 w-4" /> No activity yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <DashboardAnalytics />
    </div>
  );
}
