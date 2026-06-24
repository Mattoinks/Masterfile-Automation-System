import { MasterfileRecordsManager } from '@/components/masterfile/MasterfileRecordsManager';
import { AdvancedSearchPanel } from '@/components/search/AdvancedSearchPanel';
import { Button } from '@/components/ui/button';
import { downloadMasterfile } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { Download } from 'lucide-react';

export function MasterfilePage() {
  const { isReadOnly, can } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Masterfile</h2>
          <p className="text-sm text-slate-500">
            {isReadOnly
              ? 'View FY2526 records — read-only access'
              : 'View, edit, and manage FY2526 records — always synced with RMA_MASTER.xlsx'}
          </p>
        </div>
        {can('download') && (
          <Button onClick={() => downloadMasterfile().catch(alert)}>
            <Download className="h-4 w-4" /> Download Updated Masterfile
          </Button>
        )}
      </div>
      <AdvancedSearchPanel />
      <MasterfileRecordsManager />
    </div>
  );
}
