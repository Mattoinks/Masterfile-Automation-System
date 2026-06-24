import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth, ROLE_LABELS } from '@/context/AuthContext';
import { fetchBackups, restoreBackup, resetMasterfile, fetchWorksheetConfig, fetchBusinessRules, fetchReferenceLookups, type BackupInfo } from '@/api';
import { useApp } from '@/context/AppContext';
import { Lock, RotateCcw, Shield, Trash2 } from 'lucide-react';

export function SettingsPage() {
  const { userName, role, user, can } = useAuth();
  const { refreshDashboard, lockStatus } = useApp();
  const [worksheet, setWorksheet] = useState<Record<string, unknown>>({});
  const [rules, setRules] = useState<Record<string, unknown>>({});
  const [lookups, setLookups] = useState<Record<string, unknown>>({});
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchWorksheetConfig(),
      fetchBusinessRules(),
      fetchReferenceLookups(),
    ]).then(([ws, br, rl]) => {
      setWorksheet(ws);
      setRules(br);
      setLookups(rl);
    });
  }, []);

  useEffect(() => {
    if (can('restore')) {
      fetchBackups().then((r) => setBackups(r.backups)).catch(() => setBackups([]));
    }
  }, [can]);

  const handleRestore = async (filename: string) => {
    if (!confirm(`Restore masterfile from ${filename}? Current file will be backed up first.`)) return;
    setRestoring(filename);
    try {
      await restoreBackup(filename);
      await refreshDashboard();
      alert('Masterfile restored successfully.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(null);
    }
  };

  const handleReset = async () => {
    if (!confirm('Remove ALL masterfile records and start fresh at Case_ID 1? A backup will be created first.')) return;
    setResetting(true);
    try {
      const result = await resetMasterfile();
      await refreshDashboard();
      alert(`Masterfile reset. Removed ${result.removed_rows} row(s). Next insert will be Case_ID 1.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-slate-500">System configuration and backups (Admin)</p>
      </div>

      {lockStatus?.locked && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <Lock className="h-5 w-5 text-amber-600" />
            <div>
              <strong>Excel Lock Active</strong>
              <p className="text-slate-600 dark:text-slate-300">
                Currently being edited by: {lockStatus.user}
                {lockStatus.since && ` (since ${new Date(lockStatus.since).toLocaleTimeString()})`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Your Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Display Name</span><strong>{userName}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Username</span><strong>{user?.username}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Role</span><Badge>{ROLE_LABELS[role]}</Badge></div>
          <div className="flex justify-between">
            <span className="text-slate-500">Last Login</span>
            <strong>{user?.last_login ? new Date(user.last_login).toLocaleString() : '—'}</strong>
          </div>
        </CardContent>
      </Card>

      {can('delete') && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <Trash2 className="h-5 w-5" /> Reset Test Data
            </CardTitle>
            <CardDescription>
              Clear all FY2526 records so the next insert starts at Case_ID 1 (for testing)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting ? 'Resetting...' : 'Reset Masterfile to Empty'}
            </Button>
          </CardContent>
        </Card>
      )}

      {can('restore') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" /> Backup & Restore</CardTitle>
            <CardDescription>Automatic backups created before every save</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {backups.length ? backups.slice(0, 10).map((b) => (
              <div key={b.filename} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{b.filename}</p>
                  <p className="text-xs text-slate-500">{b.created_at}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restoring === b.filename}
                  onClick={() => handleRestore(b.filename)}
                >
                  {restoring === b.filename ? 'Restoring...' : 'Restore'}
                </Button>
              </div>
            )) : (
              <p className="text-sm text-slate-500">No backups yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Fiscal Year</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="default" className="text-sm">
            {(worksheet.active_worksheet as string) || 'FY2526'}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default Values</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-50 dark:bg-slate-900 rounded-lg p-4 overflow-auto">
            {JSON.stringify(rules.defaults || {}, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device & Package Lookups</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-50 dark:bg-slate-900 rounded-lg p-4 overflow-auto max-h-96">
            {JSON.stringify(lookups, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
