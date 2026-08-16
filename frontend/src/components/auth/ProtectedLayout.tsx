import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/layout/AppShell';

export function ProtectedLayout() {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-500">Loading session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // The bare root is the app's "front door" -- send it to the branded
    // landing page. Every other deep link (e.g. a bookmarked /masterfile
    // URL) still goes straight to /login, unchanged.
    return <Navigate to={location.pathname === '/' ? '/welcome' : '/login'} replace />;
  }

  // Requesters have no permissions in this internal shell (Dashboard,
  // Masterfile, etc.) -- they live entirely in the separate /portal shell.
  // Redirect here rather than letting them fall through to AccessDeniedPage,
  // whose "Return to Dashboard" link would just bounce them right back.
  if (role === 'requester') {
    return <Navigate to="/portal" replace />;
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
