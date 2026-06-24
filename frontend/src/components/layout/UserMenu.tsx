import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { User, Settings, Moon, Sun, LogOut, FileSpreadsheet, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/context/ThemeContext';
import { useAuth, ROLE_LABELS } from '@/context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export function UserMenu() {
  const { theme, toggleTheme } = useTheme();
  const { userName, role, logout, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">{userName}</span>
          <Badge variant="secondary" className="text-[10px] hidden md:inline-flex">
            {ROLE_LABELS[role]}
          </Badge>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          align="end"
          sideOffset={8}
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Shield className="h-3 w-3" /> {ROLE_LABELS[role]}
            </p>
          </div>
          <DropdownMenu.Item className="outline-none" asChild>
            <Link
              to="/masterfile"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4" /> Masterfile
            </Link>
          </DropdownMenu.Item>
          {can('configure') && (
            <DropdownMenu.Item className="outline-none" asChild>
              <Link
                to="/settings"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Settings className="h-4 w-4" /> Settings
              </Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer outline-none"
            onSelect={(e) => { e.preventDefault(); toggleTheme(); }}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
          <DropdownMenu.Item
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer outline-none text-red-600"
            onSelect={(e) => { e.preventDefault(); handleLogout(); }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
