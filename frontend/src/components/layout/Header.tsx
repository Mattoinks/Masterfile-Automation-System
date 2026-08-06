import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationDropdown } from './NotificationDropdown';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { fastSearch, type IndexedRecord } from '@/api';
import { Moon, Sun, Lock, Menu, Search, Loader2 } from 'lucide-react';

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { reviewMode, lockStatus } = useApp();
  const { can } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IndexedRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      fastSearch(query.trim(), 8)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:px-6">
      <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <Menu className="h-5 w-5" />
      </Button>

      {can('search') && (
        <div ref={boxRef} className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Search cases, lots, RMAs..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-16 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:focus:bg-slate-800"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Ctrl+K'}
          </span>

          {open && query.trim() && (
            <div className="absolute left-0 right-0 top-full mt-1 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {results.length ? (
                results.map((r) => (
                  <button
                    key={r.case_id}
                    onClick={() => {
                      setOpen(false);
                      setQuery('');
                      navigate('/masterfile');
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="font-medium">{r.dn_number || r.case_id}</span>
                    <span className="text-xs text-slate-500">
                      {[r.device, r.owner].filter(Boolean).join(' · ') || r.case_id}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-slate-400">{searching ? 'Searching…' : 'No matches'}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="hidden flex-wrap items-center gap-2 text-xs text-slate-500 xl:flex">
        {reviewMode && <Badge variant="required" className="text-[10px]">Review Mode</Badge>}
        {lockStatus?.locked && (
          <Badge variant="required" className="gap-1 text-[10px]">
            <Lock className="h-3 w-3" /> Locked by {lockStatus.user}
          </Badge>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <NotificationDropdown />
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
