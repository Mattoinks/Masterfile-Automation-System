import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchMyRequests, type RmaRequestRecord } from '@/api';

const STATUS_VARIANT: Record<string, 'required' | 'history' | 'success'> = {
  New: 'required',
  'In Progress': 'history',
  Done: 'success',
};

export function MyRequestsPage() {
  const [requests, setRequests] = useState<RmaRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status');

  useEffect(() => {
    fetchMyRequests()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  const visibleRequests = statusFilter ? requests.filter((r) => r.status === statusFilter) : requests;

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Requests</CardTitle>
        <CardDescription>
          {statusFilter ? `Showing ${statusFilter} requests.` : "Requests you've submitted and their current status."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : visibleRequests.length === 0 ? (
          <p className="text-sm text-slate-500">
            {statusFilter ? `No ${statusFilter} requests.` : "You haven't submitted any requests yet."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>DN Number</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRequests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium">{r.request_code}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] || 'secondary'}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell>{r.dn_number || '—'}</TableCell>
                  <TableCell className="text-slate-500">{new Date(r.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
