import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Inbox, LayoutDashboard, Layers, Table2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { fetchRequestQueue } from '@/api';

interface HomeCard {
  key: string;
  label: string;
  description: string;
  to: string;
  icon: typeof LayoutDashboard;
  permission: string;
  count?: number;
}

export function InternalHomePage() {
  const navigate = useNavigate();
  const { userName, can } = useAuth();
  const { readyCount } = useApp();
  const [newRequestCount, setNewRequestCount] = useState<number | null>(null);

  const canManageRequests = can('manage_requests');

  useEffect(() => {
    if (!canManageRequests) return;
    fetchRequestQueue('New')
      .then((rows) => setNewRequestCount(rows.length))
      .catch(() => setNewRequestCount(null));
  }, [canManageRequests]);

  const cards: HomeCard[] = [
    {
      key: 'masterfile',
      label: 'RMA Masterfile',
      description: 'View, edit, and manage FY2526 records',
      to: '/masterfile',
      icon: FileSpreadsheet,
      permission: 'view',
    },
    {
      key: 'upload',
      label: 'Upload DN',
      description: 'Upload delivery note PDFs for OCR extraction',
      to: '/upload',
      icon: Upload,
      permission: 'upload',
    },
    {
      key: 'review',
      label: 'Review Queue',
      description: 'Verify and adjust extracted records before insertion',
      to: '/preview',
      icon: Table2,
      permission: 'process',
      count: readyCount > 0 ? readyCount : undefined,
    },
    {
      key: '2526',
      label: '2526 Lot Breakdown',
      description: 'Review lot-level breakdown records',
      to: '/preview?tab=2526',
      icon: Layers,
      permission: 'process',
    },
    {
      key: 'requests',
      label: 'Incoming RMA Requests',
      description: 'Track and action requests submitted through the portal',
      to: '/requests',
      icon: Inbox,
      permission: 'manage_requests',
      count: newRequestCount && newRequestCount > 0 ? newRequestCount : undefined,
    },
    {
      key: 'dashboard',
      label: 'Dashboard & Analytics',
      description: 'System-wide stats, activity, and trends',
      to: '/',
      icon: LayoutDashboard,
      permission: 'view',
    },
  ];

  const visibleCards = cards.filter((c) => can(c.permission));

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a8a4f] via-[#0f4a2c] to-[#071a10] p-6 md:p-8">
        <h1 className="text-xl font-bold text-white md:text-2xl">
          How can we help you today, {userName}?
        </h1>
        <p className="mt-1 text-sm text-white/70">Quick access to your RMA Masterfile tools.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((c) => (
          <Card
            key={c.key}
            role="button"
            tabIndex={0}
            onClick={() => navigate(c.to)}
            onKeyDown={(e) => e.key === 'Enter' && navigate(c.to)}
            className="cursor-pointer transition-shadow hover:shadow-md"
          >
            <CardContent className="flex items-start gap-4 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white">{c.label}</p>
                  {c.count !== undefined && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
                      {c.count}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{c.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
