import { NotificationDropdown } from './NotificationDropdown';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { Moon, Sun, Lock } from 'lucide-react';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { stats, activeWorksheet, lastCaseId, reviewMode, lockStatus } = useApp();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          RMA Masterfile Automation System
        </h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Badge variant="default" className="text-[10px]">{activeWorksheet} Active</Badge>
          {reviewMode && (
            <Badge variant="required" className="text-[10px]">Review Mode</Badge>
          )}
          {lockStatus?.locked && (
            <Badge variant="required" className="text-[10px] gap-1">
              <Lock className="h-3 w-3" /> Locked by {lockStatus.user}
            </Badge>
          )}
          <span>Active Records: <strong className="text-slate-700 dark:text-slate-200">{stats.total_records}</strong></span>
          {lastCaseId > 0 && (
            <span>Last Case ID: <strong className="text-slate-700 dark:text-slate-200">{lastCaseId}</strong></span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <NotificationDropdown />
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
