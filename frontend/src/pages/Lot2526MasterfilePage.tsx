import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Lot2526CaseBrowser } from '@/components/review/Lot2526CaseBrowser';
import { useAuth } from '@/context/AuthContext';

export function Lot2526MasterfilePage() {
  const { isReadOnly, can } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">2526 Masterfile</h2>
          <p className="text-sm text-slate-500">
            {isReadOnly
              ? 'View 2526 lot-creation cases — read-only access'
              : 'View cases and edit lot-creation fields — always synced with the 2526 worksheet'}
          </p>
        </div>
        {can('upload') && (
          <Button variant="outline" onClick={() => navigate('/upload')}>
            <Upload className="h-4 w-4" /> Add Case (Upload DN)
          </Button>
        )}
      </div>
      <Lot2526CaseBrowser />
    </div>
  );
}
