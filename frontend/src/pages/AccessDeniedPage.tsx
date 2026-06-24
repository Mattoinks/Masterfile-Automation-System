import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AccessDeniedPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <ShieldX className="h-16 w-16 text-red-400 mb-4" />
      <h2 className="text-2xl font-bold">Access Denied</h2>
      <p className="text-slate-500 mt-2 max-w-md">
        Your account does not have permission to access this page.
        Contact an administrator if you believe this is an error.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
