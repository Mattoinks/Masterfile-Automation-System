import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

export function NotificationDropdown() {
  const { notifications, clearNotifications, stats } = useApp();

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          align="end"
          sideOffset={8}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={clearNotifications} className="text-xs text-brand-700 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
          {notifications.length === 0 ? (
            <p className="px-2 py-4 text-xs text-slate-500 text-center">No notifications</p>
          ) : (
            notifications.slice(0, 8).map((n) => (
              <DropdownMenu.Item key={n.id} className="outline-none" asChild>
                <div
                  className={cn(
                    'flex gap-2 rounded-lg px-2 py-2 text-xs cursor-default',
                    !n.read && 'bg-slate-50 dark:bg-slate-800'
                  )}
                >
                  {n.type === 'error' ? (
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : n.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Info className="h-4 w-4 text-blue-500 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{n.title}</p>
                    <p className="text-slate-500 mt-0.5">{n.message}</p>
                  </div>
                </div>
              </DropdownMenu.Item>
            ))
          )}
          {stats.duplicates_found > 0 && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
              <DropdownMenu.Item className="outline-none" asChild>
                <Link to="/preview" className="block rounded-lg px-2 py-2 text-xs text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950">
                  {stats.duplicates_found} duplicate(s) detected today
                </Link>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
