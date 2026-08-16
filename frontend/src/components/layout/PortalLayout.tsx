import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ChevronDown, ClipboardList, FileText, FolderKanban, Home, LogOut, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth, ROLE_LABELS } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/portal', label: 'Home', icon: Home, end: true },
  { to: '/portal/submit', label: 'Submit Request', icon: FileText, end: false },
  { to: '/portal/my-requests', label: 'My Requests', icon: ClipboardList, end: false },
];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Minimal shell for the "requester" role -- deliberately does not use
// useApp() or Sidebar, both of which are saturated with internal
// DN/masterfile concerns a requester has no permission for.
export function PortalLayout() {
  const { userName, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950 md:px-8">
        <NavLink to="/portal" className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">RMA Request Portal</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[role]}</p>
          </div>
        </NavLink>

        <div className="hidden h-8 w-px bg-slate-200 dark:bg-slate-800 sm:block" />

        <nav className="hidden gap-1 sm:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-slate-100 dark:hover:bg-slate-900">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                  {getInitials(userName)}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{userName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[role]}</p>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[200px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                align="end"
                sideOffset={8}
              >
                <div className="mb-1 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-slate-500">{ROLE_LABELS[role]}</p>
                </div>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 outline-none hover:bg-slate-100 dark:hover:bg-slate-800"
                  onSelect={(e) => {
                    e.preventDefault();
                    handleLogout();
                  }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950 sm:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="mx-auto max-w-[1360px] p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
