import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, FolderKanban, Lock, LogIn, Monitor, Moon, Sun, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export function LoginPage() {
  const { login, loginAsViewer, isAuthenticated, isLoading, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={role === 'requester' ? '/portal' : '/home'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedInUser = await login(username, password, rememberMe);
      navigate(loggedInUser.role === 'requester' ? '/portal' : '/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewer = async () => {
    setError('');
    setSubmitting(true);
    try {
      await loginAsViewer();
      navigate('/home');
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
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95 md:grid-cols-2 md:min-h-[640px]">
        {/* Left panel: branding + illustration */}
        <div className="hidden flex-col items-center justify-center gap-10 bg-gradient-to-b from-brand-50 to-brand-100/50 px-10 py-12 text-center dark:from-slate-800 dark:to-slate-900 md:flex">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-700 text-white shadow-lg">
            <FolderKanban className="h-12 w-12" />
          </div>

          <div>
            <h1 className="bg-gradient-to-r from-brand-600 via-brand-700 to-slate-900 bg-clip-text text-3xl font-bold tracking-wide text-transparent dark:to-white">
              RMA MASTERFILE SYSTEM
            </h1>
            <div className="mx-auto mt-4 h-1 w-14 rounded-full bg-brand-600" aria-hidden="true" />
            <p className="mx-auto mt-5 max-w-[320px] text-base leading-relaxed text-slate-500 dark:text-slate-400">
              Securely manage, access, and organize masterfiles with efficiency and accuracy.
            </p>
          </div>

          {/* Decorative security illustration */}
          <img
            src="/signupage.png"
            alt=""
            aria-hidden="true"
            className="w-full max-w-[320px] rounded-xl object-contain"
          />
        </div>

        {/* Right panel: login form */}
        <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6 flex items-center gap-3 md:hidden">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
                <FolderKanban className="h-6 w-6" />
              </div>
              <h1 className="bg-gradient-to-r from-brand-600 via-brand-700 to-slate-900 bg-clip-text text-base font-bold tracking-wide text-transparent dark:to-white">
                RMA MASTERFILE SYSTEM
              </h1>
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome Back!</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Sign in to continue to RMA Masterfile System
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

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded accent-brand-700"
                  />
                  Remember me
                </label>
                <span className="font-medium text-brand-700 dark:text-brand-400">Forgot Password?</span>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
                <LogIn className="h-4 w-4" />
                {submitting ? 'Signing in...' : 'Login'}
              </Button>
            </form>

            <div className="my-7 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span className="text-xs text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>

            <Button
              variant="outline"
              className="h-11 w-full text-brand-700 dark:text-brand-400"
              onClick={handleViewer}
              disabled={submitting}
            >
              <Monitor className="h-4 w-4" />
              Continue as Viewer
            </Button>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 text-center">
                Demo: admin / admin123 · engineer1 / engineer123 · viewer1 / viewer123 · requester1 / requester123
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
