import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApp } from '@/context/AppContext';
import { SOURCE_LABELS } from '@/lib/utils';
import { cn } from '@/lib/utils';

function sourceBadgeVariant(source: string) {
  if (source === 'pdf') return 'pdf' as const;
  if (source === 'required') return 'required' as const;
  if (['history', 'lookup', 'derived', 'default'].includes(source)) return 'history' as const;
  return 'secondary' as const;
}

export function RecordsTable() {
  const { records, selectedRecordId, setSelectedRecordId, getRecordField, getFieldSource } = useApp();

  if (!records.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-500 text-sm">
          No records to preview. Upload and process DN PDFs first.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extraction Preview</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>DN Number</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => {
              const id = record.record_id || record.filename;
              const ownerSource = getFieldSource(record, 'owner');
              const primarySource = record.field_sources?.device || 'pdf';
              return (
                <TableRow
                  key={id}
                  data-state={selectedRecordId === id ? 'selected' : undefined}
                  className={cn('cursor-pointer', selectedRecordId === id && 'bg-brand-50 dark:bg-brand-950/30')}
                  onClick={() => setSelectedRecordId(id)}
                >
                  <TableCell className="font-medium">{getRecordField(record, 'dn_number')}</TableCell>
                  <TableCell>{getRecordField(record, 'device')}</TableCell>
                  <TableCell>{getRecordField(record, 'package') || '—'}</TableCell>
                  <TableCell>{getRecordField(record, 'quantity')}</TableCell>
                  <TableCell>{getRecordField(record, 'owner') || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={record.status === 'Invalid' ? 'required' : record.status === 'Duplicate' ? 'secondary' : 'success'}>
                      {record.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={sourceBadgeVariant(ownerSource === 'required' ? 'required' : primarySource)}>
                      {SOURCE_LABELS[ownerSource] || SOURCE_LABELS[primarySource] || primarySource}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
