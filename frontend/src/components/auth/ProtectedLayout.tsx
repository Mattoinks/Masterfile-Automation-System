import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/layout/AppShell';

export function ProtectedLayout() {
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

  return <AppShell />;
}

interface RequirePermissionProps {
  permission?: string;
  children: React.ReactNode;
}

export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { can } = useAuth();
  if (permission && !can(permission)) {
    return <Navigate to="/access-denied" replace />;
  }
  return <>{children}</>;
}

export function PermissionOutlet({ permission }: { permission?: string }) {
  return (
    <RequirePermission permission={permission}>
      <Outlet />
    </RequirePermission>
  );
}
