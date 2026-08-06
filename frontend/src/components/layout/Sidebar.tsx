import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { NavLink, useNavigate } from 'react-router-dom';
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
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { useAuth, ROLE_LABELS } from '@/context/AuthContext';
import type { UserRole } from '@/api';

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  permission?: string;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const NAV_BY_ROLE: Record<UserRole, NavSection[]> = {
  admin: [
    {
      heading: 'Main',
      items: [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'view' },
        { to: '/upload', icon: Upload, label: 'Upload DN', permission: 'upload' },
        { to: '/preview', icon: Table2, label: 'Review Records', permission: 'process' },
        { to: '/masterfile', icon: FileSpreadsheet, label: 'Masterfile', permission: 'view' },
      ],
    },
    {
      heading: 'Management',
      items: [
        { to: '/history', icon: History, label: 'Audit Logs', permission: 'view_logs' },
        { to: '/recycle-bin', icon: Trash2, label: 'Recycle Bin', permission: 'delete' },
        { to: '/users', icon: Users, label: 'User Management', permission: 'manage_users' },
        { to: '/settings', icon: Settings, label: 'Settings', permission: 'configure' },
      ],
    },
  ],
  engineer: [
    {
      heading: 'Main',
      items: [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'view' },
        { to: '/upload', icon: Upload, label: 'Upload DN', permission: 'upload' },
        { to: '/preview', icon: Table2, label: 'Review Records', permission: 'process' },
        { to: '/masterfile', icon: FileSpreadsheet, label: 'Masterfile', permission: 'view' },
      ],
    },
    {
      heading: 'Management',
      items: [{ to: '/history', icon: History, label: 'Audit Logs', permission: 'view_logs' }],
    },
  ],
  viewer: [
    {
      heading: 'Main',
      items: [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'view' },
        { to: '/masterfile', icon: FileSpreadsheet, label: 'Masterfile', permission: 'view' },
        { to: '/search', icon: Search, label: 'Search', permission: 'search' },
      ],
    },
    {
      heading: 'Management',
      items: [
        { to: '/history', icon: ScrollText, label: 'Audit Logs', permission: 'view_logs' },
        { to: '/download', icon: Download, label: 'Download', permission: 'download' },
      ],
    },
  ],
};

export function Sidebar({ expanded }: { expanded: boolean }) {
  const { readyCount } = useApp();
  const { role, can, userName, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sections = NAV_BY_ROLE[role]
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  const initial = (userName || '?').trim().charAt(0).toUpperCase();

  return (
    <aside
      className={cn(
        'relative hidden lg:flex h-full shrink-0 flex-col overflow-hidden bg-gradient-to-b from-[#1a8a4f] via-[#0f4a2c] to-[#071a10] transition-[width] duration-200 ease-in-out',
        expanded ? 'w-64' : 'w-[72px]'
      )}
    >
      <div className={cn('flex h-16 items-center gap-3 border-b border-white/10 px-4', !expanded && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
          <Factory className="h-5 w-5" />
        </div>
        {expanded && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">RMA Masterfile</p>
            <p className="truncate text-xs text-white/70">Automation System</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3">
        {sections.map((section) => (
          <div key={section.heading}>
            {expanded && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                {section.heading}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={!expanded ? label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors',
                      expanded ? 'gap-3 px-3' : 'justify-center px-0',
                      isActive ? 'bg-white/20 text-white shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white'
                    )
                  }
                >
                  <span className="relative shrink-0">
                    <Icon className="h-4 w-4" />
                    {!expanded && label === 'Review Records' && readyCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400" />
                    )}
                  </span>
                  {expanded && <span className="truncate">{label}</span>}
                  {expanded && label === 'Review Records' && readyCount > 0 && (
                    <span className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
                      {readyCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Decorative accent - purely visual, no data */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-16 h-24 w-full text-white/5"
        viewBox="0 0 300 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0,80 L50,40 L100,65 L150,20 L200,55 L250,30 L300,60 L300,100 L0,100 Z" fill="currentColor" />
      </svg>

      <div className={cn('relative border-t border-white/10 p-3', !expanded && 'flex justify-center')}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none transition-colors hover:bg-white/10',
                !expanded && 'w-auto'
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white">
                {initial}
              </div>
              {expanded && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{userName || user?.username}</p>
                    <p className="truncate text-xs text-white/60">{ROLE_LABELS[role]}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-white/50" />
                </>
              )}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[200px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              side="top"
              align="start"
              sideOffset={8}
            >
              <div className="mb-1 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <p className="text-sm font-medium">{userName || user?.username}</p>
                <p className="text-xs text-slate-500">{ROLE_LABELS[role]}</p>
              </div>
              {can('configure') && (
                <DropdownMenu.Item className="outline-none" asChild>
                  <NavLink
                    to="/settings"
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Settings className="h-4 w-4" /> Settings
                  </NavLink>
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 outline-none hover:bg-slate-100 dark:hover:bg-slate-800"
                onSelect={(e) => { e.preventDefault(); handleLogout(); }}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </aside>
  );
}
