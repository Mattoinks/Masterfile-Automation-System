import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FilePlus2,
  FileText,
  ListChecks,
  Rocket,
  Search,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { fetchMyRequests, type RequestStatus, type RmaRequestRecord } from '@/api';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'required' | 'history' | 'success'> = {
  New: 'required',
  'In Progress': 'history',
  Done: 'success',
};

const STATUS_META: Record<RequestStatus, { icon: typeof FileText; iconBg: string; iconColor: string }> = {
  New: { icon: FileText, iconBg: 'bg-blue-50 dark:bg-blue-950', iconColor: 'text-blue-600 dark:text-blue-400' },
  'In Progress': {
    icon: Clock,
    iconBg: 'bg-amber-50 dark:bg-amber-950',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  Done: {
    icon: CheckCircle2,
    iconBg: 'bg-brand-50 dark:bg-brand-950',
    iconColor: 'text-brand-700 dark:text-brand-400',
  },
};

const STATUS_ORDER: RequestStatus[] = ['New', 'In Progress', 'Done'];

const RECENT_COUNT = 5;

export function PortalHomePage() {
  const { userName } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<RmaRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchMyRequests()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const base: Record<string, number> = { New: 0, 'In Progress': 0, Done: 0 };
    requests.forEach((r) => {
      base[r.status] = (base[r.status] || 0) + 1;
    });
    return base;
  }, [requests]);

  const isSearching = query.trim().length > 0;

  const visibleRequests = useMemo(() => {
    if (!isSearching) {
      return [...requests]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, RECENT_COUNT);
    }
    const q = query.trim().toLowerCase();
    return requests.filter(
      (r) => r.request_code.toLowerCase().includes(q) || r.customer_name.toLowerCase().includes(q)
    );
  }, [requests, query, isSearching]);

  const hasAnyRequests = requests.length > 0;

  return (
    <div className="space-y-8">
      {/* Hero / search */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a8a4f] via-[#0f4a2c] to-[#071a10] p-6 md:p-10">
        <div className="relative z-10 max-w-xl">
          <p className="flex items-center gap-1.5 text-sm text-white/80">Welcome back! 👋</p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-4xl">
            How can we help you today, {userName}?
          </h1>
          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your requests by ID or customer name..."
              className="h-[52px] rounded-xl border-transparent bg-white pl-11 text-sm shadow-sm focus-visible:ring-brand-400 md:h-14"
            />
          </div>
        </div>

        {/* Decorative illustration */}
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[460px] items-end justify-end lg:flex" aria-hidden="true">
          <div className="absolute right-6 top-6 grid grid-cols-6 gap-2 opacity-40">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-white" />
            ))}
          </div>
          <Sparkles className="absolute right-10 top-8 h-5 w-5 text-emerald-200/70" />

          <img
            src="/signupage.png"
            alt=""
            aria-hidden="true"
            className="w-[420px] max-w-none translate-y-8 object-contain"
          />
        </div>
      </div>

      {/* Primary action cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate('/portal/submit')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/portal/submit')}
          className="group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
        >
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              <FilePlus2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">Create an RMA Request</p>
              <p className="text-sm text-slate-500">Submit a new RMA request for assistance</p>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white dark:bg-brand-950 dark:text-brand-300">
              <ChevronRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate('/portal/my-requests')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/portal/my-requests')}
          className="group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
        >
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              <ListChecks className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">Track RMA Cases</p>
              <p className="text-sm text-slate-500">Monitor the status of your requests</p>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white dark:bg-brand-950 dark:text-brand-300">
              <ChevronRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Your Recent RMA Requests</h2>
          <button
            type="button"
            onClick={() => navigate('/portal/my-requests')}
            className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            View All Requests <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Status summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
            return (
              <Card
                key={status}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/portal/my-requests?status=${encodeURIComponent(status)}`)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && navigate(`/portal/my-requests?status=${encodeURIComponent(status)}`)
                }
                className="cursor-pointer transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', meta.iconBg, meta.iconColor)}>
                    <meta.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{status}</p>
                    <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">{counts[status] || 0}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent list / empty state */}
        {!loading && !hasAnyRequests && !isSearching ? (
          <Card className="mt-4">
            <CardContent className="flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:text-left">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950">
                <Rocket className="h-10 w-10 text-brand-600" />
                <Sparkles className="absolute -right-1 -top-1 h-5 w-5 text-brand-300" />
                <Sparkles className="absolute -bottom-1 -left-1 h-3.5 w-3.5 text-brand-300" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">You haven't submitted any requests yet.</p>
                <p className="mt-1 text-sm text-slate-500">Create a new RMA request to get started.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-4">
            <CardContent className="p-0">
              {loading ? (
                <p className="p-6 text-sm text-slate-500">Loading...</p>
              ) : visibleRequests.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">No requests match your search.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleRequests.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium">{r.request_code}</p>
                        <p className="truncate text-xs text-slate-500">{r.customer_name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="hidden text-xs text-slate-500 sm:inline">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                        <Badge variant={STATUS_VARIANT[r.status] || 'secondary'}>{r.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

