import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

export function AppShell() {
  const { message, clearMessage } = useApp();

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {message && (
            <div
              className={cn(
                'mb-4 rounded-lg border px-4 py-3 text-sm flex justify-between items-start gap-4',
                message.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
              )}
            >
              <span>{message.text}</span>
              <button type="button" onClick={clearMessage} className="text-xs opacity-70 hover:opacity-100">
                Dismiss
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
