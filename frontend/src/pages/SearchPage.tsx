import { AdvancedSearchPanel } from '@/components/search/AdvancedSearchPanel';
import { MasterfileRecordsManager } from '@/components/masterfile/MasterfileRecordsManager';

export function SearchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Search Records</h2>
        <p className="text-sm text-slate-500">Find cases by DN, device, owner, or SAP number</p>
      </div>
      <AdvancedSearchPanel />
      <MasterfileRecordsManager />
    </div>
  );
}
