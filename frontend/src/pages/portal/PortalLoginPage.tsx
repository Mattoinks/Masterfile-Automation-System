import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, LogIn, Lock, Moon, Sun, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export function PortalLoginPage() {
  const { login, isAuthenticated, isLoading, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  // Only a requester belongs on /portal - an internal-staff session hitting
  // this page (e.g. a stale tab) should not be silently treated as a
  // requester login.
  if (isAuthenticated && role === 'requester') {
    return <Navigate to="/portal" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(username, password, false);
      if (user.role !== 'requester') {
        setError('This account is not a Requester account.');
        return;
      }
      navigate('/portal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950"
      style={{
        backgroundImage: "url('/backgroundimage.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute top-4 left-4">
        <Link
          to="/welcome"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-800/60"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Welcome
        </Link>
      </div>

      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex flex-col px-6 py-10 sm:px-10">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
                <User className="h-6 w-6" />
              </div>
              <h1 className="bg-gradient-to-r from-brand-600 via-brand-700 to-slate-900 bg-clip-text text-base font-bold tracking-wide text-transparent dark:to-white">
                REQUESTER PORTAL
              </h1>
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Requester Sign In</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Sign in to submit and track your RMA requests.
            </p>

            <form onSubmit={handleSubmit} className="mt-9 space-y-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="username" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="Enter your username"
                    className="h-11 pl-10"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    className="h-11 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
                <LogIn className="h-4 w-4" />
                {submitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 text-center">
              <Link
                to="/portal/register"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                <UserPlus className="h-4 w-4" />
                New here? Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
