import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react';
import { auth } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { logError } from '@/utils/logError';

function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/network-request-failed':
      return 'Could not reach server. Check your connection.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    default:
      return 'Sign in failed. Try again.';
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const { currentUser, authError, setAuthError } = useAuthStore();

  const [email,        setEmail]       = useState('');
  const [password,     setPassword]    = useState('');
  const [loading,      setLoading]     = useState(false);
  const [resetting,    setResetting]   = useState(false);
  const [error,        setError]       = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { showToast } = useToast();

  function getHomeRoute(role?: string): string {
    if (role === 'proposal')        return '/proposal';
    if (role === 'backend')         return '/backend';
    if (role === 'backend_manager') return '/backend-manager';
    return '/dashboard';
  }

  useEffect(() => {
    if (currentUser) {
      navigate(getHomeRoute(currentUser.role), { replace: true });
    }
  }, [currentUser, navigate]);

  if (currentUser) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Role-based redirect handled by the useEffect above once currentUser is set
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(mapAuthError(code));
      void logError('auth.signIn', err, { email });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email.toLowerCase().trim());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.warn('[ForgotPassword] attempt:', err.code);
    } finally {
      setResetting(false);
    }
    showToast(
      'If this email is registered, you will receive a reset link shortly. Check your spam folder.',
      'success',
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 bg-gradient-to-br from-brand-navy via-brand-blue to-[#00B4D8]">
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shadow-lg border border-white/30">
          <span className="text-4xl">☀️</span>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">SolarOps</h1>
          <p className="text-sm text-white/70 mt-1">Rite Solar Field Operations</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
        <form onSubmit={handleSignIn} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@ritesolar.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setAuthError(null); setError(null); }}
              required
              autoComplete="email"
              className="h-12 text-base"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAuthError(null); setError(null); }}
                required
                autoComplete="current-password"
                className="h-12 text-base pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {(error || authError) && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-brand-red border border-red-200">
              {error || authError}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-12 text-base font-semibold w-full"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Signing in…
              </span>
            ) : (
              'Sign In'
            )}
          </Button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetting}
            className="text-sm text-brand-blue text-center mt-1 py-2 hover:underline disabled:opacity-50"
          >
            {resetting ? 'Sending…' : 'Forgot password?'}
          </button>
        </form>
      </div>
    </div>
  );
}
