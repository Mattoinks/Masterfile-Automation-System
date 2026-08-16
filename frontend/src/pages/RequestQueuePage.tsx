import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fetchRequestQueue, updateRequestStatus, REQUEST_STATUSES, type RmaRequestRecord } from '@/api';
import { REQUEST_FORM_FIELDS } from '@/lib/requestFormFields';

const STATUS_VARIANT: Record<string, 'required' | 'history' | 'success'> = {
  New: 'required',
  'In Progress': 'history',
  Done: 'success',
};

// Fields shown only in the expanded detail row, kept off the main table so
// it stays scannable (Request ID/Status/Requester/Customer/DN/Lots/Dates
// are the columns shown directly).
const DETAIL_ONLY_KEYS = new Set(['problem_description', 'test_flow']);

export function RequestQueuePage() {
  const [requests, setRequests] = useState<RmaRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchParams] = useSearchParams();

  const load = async (status?: string) => {
    setLoading(true);
    try {
      setRequests(await fetchRequestQueue(status || undefined));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setExpandedId(Number(id));
  }, [searchParams]);

  const handleStatusChange = async (id: number, status: string) => {
    await updateRequestStatus(id, status);
    await load(statusFilter);
  };

  const detailFields = REQUEST_FORM_FIELDS.filter((f) => DETAIL_ONLY_KEYS.has(f.key));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-7 w-7" /> Incoming RMA Requests
          </h2>
          <p className="text-sm text-slate-500">Requests submitted through the RMA Request Portal</p>
        </div>
        <select
          className="h-9 rounded-lg border px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>DN Number</TableHead>
                <TableHead>Lots/Qty</TableHead>
                <TableHead>Return Date</TableHead>
                <TableHead>Expected Finish</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500">No requests yet.</TableCell></TableRow>
              ) : (
                requests.map((r) => {
                  const isExpanded = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <TableRow
                        className={cn('cursor-pointer', isExpanded && 'bg-brand-50 dark:bg-brand-950/30')}
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      >
                        <TableCell className="font-mono font-medium">{r.request_code}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <select
                            className="text-xs rounded border px-2 py-1 dark:bg-slate-900"
                            value={r.status}
                            onChange={(e) => handleStatusChange(r.id, e.target.value)}
                          >
                            {REQUEST_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <Badge variant={STATUS_VARIANT[r.status] || 'secondary'} className="ml-2 hidden md:inline-flex">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.requester_display_name}</TableCell>
                        <TableCell>{r.customer_name}</TableCell>
                        <TableCell>{r.dn_number || '—'}</TableCell>
                        <TableCell>{r.fields.lot_qty || '—'}</TableCell>
                        <TableCell>{r.fields.date_of_return || '—'}</TableCell>
                        <TableCell>{r.fields.expected_finish_date || '—'}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-slate-50 dark:bg-slate-900/50">
                            <div className="grid gap-3 py-2 sm:grid-cols-2">
                              {detailFields.map((f) => (
                                <div key={f.key}>
                                  <p className="text-xs font-medium text-slate-500">{f.label}</p>
                                  <p className="text-sm">{r.fields[f.key] || '—'}</p>
                                </div>
                              ))}
                              {r.internal_notes && (
                                <div className="sm:col-span-2">
                                  <p className="text-xs font-medium text-slate-500">Internal Notes</p>
                                  <p className="text-sm">{r.internal_notes}</p>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
