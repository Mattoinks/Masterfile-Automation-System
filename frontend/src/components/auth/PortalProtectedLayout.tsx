import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PortalLayout } from '@/components/layout/PortalLayout';

export function PortalProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-500">Loading session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <PortalLayout />;
}
