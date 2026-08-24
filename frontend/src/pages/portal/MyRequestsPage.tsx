import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fetchMyRequests, type RmaRequestRecord } from '@/api';
import { REQUEST_FORM_FIELDS } from '@/lib/requestFormFields';

const STATUS_VARIANT: Record<string, 'required' | 'history' | 'success'> = {
  New: 'required',
  Pending: 'history',
  Approved: 'success',
};

// Same split as the staff queue: the scannable columns stay in the main row,
// everything else (the full submitted form) is one click away instead of
// crowding out a table meant to stay glanceable.
const DETAIL_ONLY_KEYS = new Set(['problem_description', 'test_flow']);

export function MyRequestsPage() {
  const [requests, setRequests] = useState<RmaRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status');

  useEffect(() => {
    fetchMyRequests()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  const visibleRequests = statusFilter ? requests.filter((r) => r.status === statusFilter) : requests;
  const detailFields = REQUEST_FORM_FIELDS.filter((f) => DETAIL_ONLY_KEYS.has(f.key));

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Requests</CardTitle>
        <CardDescription>
          {statusFilter ? `Showing ${statusFilter} requests.` : "Requests you've submitted and their current status."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading...</p>
        ) : visibleRequests.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {statusFilter ? `No ${statusFilter} requests.` : "You haven't submitted any requests yet."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Lots/Qty</TableHead>
                <TableHead>Return Date</TableHead>
                <TableHead>Expected Finish</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRequests.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <TableRow
                      className={cn('cursor-pointer', isExpanded && 'bg-brand-50 dark:bg-brand-950/30')}
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    >
                      <TableCell className="font-mono font-medium">{r.request_code}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status] || 'secondary'}>{r.status}</Badge>
                      </TableCell>
                      <TableCell>{r.customer_name}</TableCell>
                      <TableCell>{r.fields.priority || '—'}</TableCell>
                      <TableCell>{r.fields.lot_qty || '—'}</TableCell>
                      <TableCell>{r.fields.date_of_return || '—'}</TableCell>
                      <TableCell>{r.fields.expected_finish_date || '—'}</TableCell>
                      <TableCell className="text-slate-500">{new Date(r.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-slate-50 dark:bg-slate-900/50">
                          <div className="grid gap-3 py-2 sm:grid-cols-2">
                            {detailFields.map((f) => (
                              <div key={f.key}>
                                <p className="text-xs font-medium text-slate-500">{f.label}</p>
                                <p className="text-sm">{r.fields[f.key] || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
