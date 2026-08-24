import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchMe,
  login as apiLogin,
  logoutApi,
  refreshSession,
  type AuthUser,
  type UserRole,
  getSessionToken,
} from '@/api';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

interface AuthContextValue {
  user: AuthUser | null;
  userName: string;
  role: UserRole;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  lastLogin: string | null;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<AuthUser>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  isReadOnly: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  engineer: 'Engineer',
  requester: 'Requester',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const loadSession = useCallback(async () => {
    if (!getSessionToken()) {
      setUser(null);
      setPermissions([]);
      setIsLoading(false);
      return;
    }
    try {
      const data = await fetchMe();
      setUser(data.user);
      setPermissions(data.permissions);
    } catch {
      setUser(null);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    const onLogout = () => {
      setUser(null);
      setPermissions([]);
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [loadSession]);

  useEffect(() => {
    if (!user) return;
    const onActivity = () => setLastActivity(Date.now());
    window.addEventListener('click', onActivity);
    window.addEventListener('keydown', onActivity);
    const interval = setInterval(async () => {
      if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
        await logoutApi();
        setUser(null);
        setPermissions([]);
        return;
      }
      await refreshSession();
    }, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('click', onActivity);
      window.removeEventListener('keydown', onActivity);
      clearInterval(interval);
    };
  }, [user, lastActivity]);

  const login = useCallback(async (username: string, password: string, rememberMe = false) => {
    await apiLogin(username, password, rememberMe);
    // Fetch user + permissions together and set both in the same tick (React
    // batches these) rather than setUser-then-await-then-setPermissions --
    // the latter renders one frame with the new role but stale permissions,
    // which can bounce a permission-gated route through a redirect loop.
    const me = await fetchMe();
    setUser(me.user);
    setPermissions(me.permissions);
    return me.user;
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
    setPermissions([]);
  }, []);

  const can = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions]
  );

  // Least-privileged placeholder for the brief window before a real user
  // loads (or when there is none) - every role-gated route/component also
  // checks isAuthenticated/isLoading, so this never actually grants access.
  const role = (user?.role || 'requester') as UserRole;

  const value: AuthContextValue = {
    user,
    userName: user?.display_name || user?.username || '',
    role,
    permissions,
    isAuthenticated: !!user,
    isLoading,
    lastLogin: user?.last_login || null,
    login,
    logout,
    can,
    // No role is read-only anymore (Viewer removed) - kept as a field since
    // several masterfile components still gate writes on `!isReadOnly`;
    // always false is the correct value now, not dead weight to strip.
    isReadOnly: false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ROLE_LABELS };
