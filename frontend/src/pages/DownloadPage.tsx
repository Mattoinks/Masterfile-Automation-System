import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { downloadMasterfile } from '@/api';
import { useApp } from '@/context/AppContext';

export function DownloadPage() {
  const { activeWorksheet, lastCaseId } = useApp();

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold">Download Masterfile</h2>
        <p className="text-sm text-slate-500">Export the latest RMA masterfile (read-only)</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> {activeWorksheet} Masterfile
          </CardTitle>
          <CardDescription>
            Current records: {lastCaseId} · Excel format (.xlsx)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => downloadMasterfile().catch(alert)}>
            <Download className="h-4 w-4" /> Download Latest Masterfile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
