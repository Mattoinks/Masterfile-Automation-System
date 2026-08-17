import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PortalLayout } from '@/components/layout/PortalLayout';

export function PortalProtectedLayout() {
  const { isAuthenticated, isLoading, loginAsRequester } = useAuth();
  const [error, setError] = useState('');
  // Auto-login fires once per mount, not on every "not authenticated"
  // transition -- otherwise an explicit sign-out (which briefly clears auth
  // state while this component is still mounted, before the redirect to
  // /login completes) gets silently undone by this same effect logging the
  // shared account right back in.
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || attemptedRef.current) return;
    attemptedRef.current = true;
    loginAsRequester().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to open the request portal.');
    });
  }, [isLoading, isAuthenticated, loginAsRequester]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-500">Loading session...</p>
      </div>
    );
  }

  return <PortalLayout />;
}
