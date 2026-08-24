import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PortalLayout } from '@/components/layout/PortalLayout';

export function PortalProtectedLayout() {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-500">Loading session...</p>
      </div>
    );
  }

  // Every request must stay tied to the real, individually-authenticated
  // Requester who submitted it - no more silent auto-login as a shared
  // demo account. An unauthenticated visitor (or a non-requester session,
  // e.g. a stale internal-staff tab) goes to the real portal login/register
  // flow instead.
  if (!isAuthenticated || role !== 'requester') {
    return <Navigate to="/portal/login" replace />;
  }

  return <PortalLayout />;
}
