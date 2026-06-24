import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { fastSearch, type IndexedRecord } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function AdvancedSearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IndexedRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fastSearch(query, 50)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" /> Real-Time Search
        </CardTitle>
        <p className="text-xs text-slate-500">Instant results from SQLite index — DN, Case ID, Device, Owner, Package, SAP</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Type to search... e.g. 4037889502"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {query.trim() && (
          <div className="overflow-x-auto max-h-[40vh] rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-brand-700 hover:bg-brand-700">
                  <TableHead className="text-white">Case_ID</TableHead>
                  <TableHead className="text-white">DN</TableHead>
                  <TableHead className="text-white">Device</TableHead>
                  <TableHead className="text-white">Owner</TableHead>
                  <TableHead className="text-white">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">Searching...</TableCell></TableRow>
                ) : !results.length ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">No records found</TableCell></TableRow>
                ) : results.map((row) => (
                  <TableRow key={row.case_id}>
                    <TableCell className="text-xs">{row.case_id}</TableCell>
                    <TableCell className="text-xs">{row.dn_number}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate">{row.device}</TableCell>
                    <TableCell className="text-xs">{row.owner}</TableCell>
                    <TableCell className="text-xs">{row.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
