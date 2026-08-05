import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Table2,
  FileSpreadsheet,
  History,
  Trash2,
  Settings,
  Factory,
  Users,
  ScrollText,
  Search,
  Download,
  FileSearch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/api';

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  permission?: string;
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  admin: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'view' },
    { to: '/upload', icon: Upload, label: 'Upload DN', permission: 'upload' },
    { to: '/preview', icon: Table2, label: 'Review Records', permission: 'process' },
    { to: '/masterfile', icon: FileSpreadsheet, label: 'Masterfile', permission: 'view' },
    { to: '/history', icon: History, label: 'History', permission: 'view_logs' },
    { to: '/recycle-bin', icon: Trash2, label: 'Recycle Bin', permission: 'delete' },
    { to: '/users', icon: Users, label: 'User Management', permission: 'manage_users' },
    { to: '/extraction-debug', icon: FileSearch, label: 'Extraction Debug', permission: 'configure' },
    { to: '/settings', icon: Settings, label: 'Settings', permission: 'configure' },
  ],
  engineer: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'view' },
    { to: '/upload', icon: Upload, label: 'Upload DN', permission: 'upload' },
    { to: '/preview', icon: Table2, label: 'Review Records', permission: 'process' },
    { to: '/masterfile', icon: FileSpreadsheet, label: 'Masterfile', permission: 'view' },
    { to: '/history', icon: History, label: 'History', permission: 'view_logs' },
  ],
  viewer: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'view' },
    { to: '/masterfile', icon: FileSpreadsheet, label: 'Masterfile', permission: 'view' },
    { to: '/search', icon: Search, label: 'Search', permission: 'search' },
    { to: '/history', icon: ScrollText, label: 'History', permission: 'view_logs' },
    { to: '/download', icon: Download, label: 'Download', permission: 'download' },
  ],
};

export function Sidebar() {
  const { readyCount } = useApp();
  const { role, can } = useAuth();

  const items = NAV_BY_ROLE[role].filter((item) => !item.permission || can(item.permission));

  return (
    <aside className="hidden lg:flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Factory className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">RMA System</p>
          <p className="text-xs text-slate-500">Masterfile Automation</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            {label === 'Review Records' && readyCount > 0 && (
              <span className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
                {readyCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <p className="text-xs text-slate-500">FY2526 Masterfile</p>
        <p className="text-xs font-medium text-brand-700 dark:text-brand-500">Single source of truth</p>
      </div>
    </aside>
  );
}
