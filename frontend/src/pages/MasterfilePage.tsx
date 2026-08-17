import { MasterfileGrid } from '@/components/masterfile/MasterfileGrid';
import { useAuth } from '@/context/AuthContext';

export function MasterfilePage() {
  const { isReadOnly } = useAuth();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Masterfile</h2>
        <p className="text-sm text-slate-500">
          {isReadOnly
            ? 'View FY2526 records — read-only access'
            : 'View, search, filter, sort, and edit FY2526 records directly — always synced with RMA_MASTER.xlsx'}
        </p>
      </div>
      <MasterfileGrid />
    </div>
  );
}
