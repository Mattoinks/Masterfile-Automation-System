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
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginAsViewer: () => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  isReadOnly: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  engineer: 'Engineer',
  viewer: 'Viewer',
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
    const result = await apiLogin(username, password, rememberMe);
    setUser(result.user);
    const me = await fetchMe();
    setPermissions(me.permissions);
  }, []);

  const loginAsViewer = useCallback(async () => {
    await login('viewer1', 'viewer123', false);
  }, [login]);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
    setPermissions([]);
  }, []);

  const can = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions]
  );

  const role = (user?.role || 'viewer') as UserRole;

  const value: AuthContextValue = {
    user,
    userName: user?.display_name || user?.username || '',
    role,
    permissions,
    isAuthenticated: !!user,
    isLoading,
    lastLogin: user?.last_login || null,
    login,
    loginAsViewer,
    logout,
    can,
    isReadOnly: role === 'viewer',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ROLE_LABELS };
