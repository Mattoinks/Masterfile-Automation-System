import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, LogIn, Moon, Sun, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { registerRequester } from '@/api';

const MIN_PASSWORD_LENGTH = 6;

export function PortalRegisterPage() {
  const { isAuthenticated, isLoading, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (isAuthenticated && role === 'requester') {
    return <Navigate to="/portal" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      // Identity information tied to who actually submitted a request:
      // full name + a chosen username, stored directly in the same users
      // table admin/engineer accounts live in - no separate table, no
      // extra fields the app doesn't already use elsewhere. Created
      // inactive - an Admin has to approve it before login works, so no
      // auto-login here; show a pending-approval message instead.
      await registerRequester({
        username: username.trim(),
        password,
        display_name: displayName.trim(),
      });
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
                <UserPlus className="h-6 w-6" />
              </div>
              <h1 className="bg-gradient-to-r from-brand-600 via-brand-700 to-slate-900 bg-clip-text text-base font-bold tracking-wide text-transparent dark:to-white">
                REQUESTER PORTAL
              </h1>
            </div>

            {registered ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400" />
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Account Created
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Your account is pending Admin approval. You'll be able to sign in once an
                  administrator approves it.
                </p>
                <Link to="/portal/login" className="mt-6 inline-block">
                  <Button className="h-11">
                    <LogIn className="h-4 w-4" />
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              <>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Create Your Account</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              So we know exactly who submitted each request. Only Requester accounts are created this way.
            </p>

            <form onSubmit={handleSubmit} className="mt-9 space-y-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="display_name" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
                  <Input
                    id="display_name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    placeholder="Your full name"
                    className="h-11 pl-10"
                    required
                  />
                </div>
              </div>

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
                    placeholder="Choose a username"
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
                    autoComplete="new-password"
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
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

              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirm_password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
                  <Input
                    id="confirm_password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    required
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
                <UserPlus className="h-4 w-4" />
                {submitting ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 text-center">
              <Link
                to="/portal/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                <LogIn className="h-4 w-4" />
                Already have an account? Sign in
              </Link>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
