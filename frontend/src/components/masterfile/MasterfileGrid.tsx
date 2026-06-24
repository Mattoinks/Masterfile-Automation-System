import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface MasterfileData {
  worksheet: string;
  headers: { col: number; label: string }[];
  rows: Record<string, unknown>[];
  total: number;
  last_case_id: number;
}

export function MasterfileGrid() {
  const [data, setData] = useState<MasterfileData | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/masterfile/rows?search=${encodeURIComponent(search)}&limit=200`);
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);

  const displayHeaders = data?.headers.slice(0, 12) || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>FY2526 Masterfile Viewer</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            {data ? `${data.total} rows · Last Case ID: ${data.last_case_id}` : 'Loading...'}
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search DN, Case ID, Device, Owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[70vh]">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-brand-700 hover:bg-brand-700">
                {displayHeaders.map((h) => (
                  <TableHead key={h.col} className="text-white whitespace-nowrap">
                    {h.label.replace(/\n/g, ' ')}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-slate-500">Loading masterfile...</TableCell></TableRow>
              ) : !data?.rows.length ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-slate-500">No records found</TableCell></TableRow>
              ) : (
                data.rows.map((row, i) => (
                  <TableRow key={i}>
                    {displayHeaders.map((h) => (
                      <TableCell key={h.col} className="whitespace-nowrap text-xs max-w-[180px] truncate">
                        {String(row[h.label] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
