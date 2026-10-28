/**
 * Aura DIMS - Secure Login Page
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements email/password authentication against Firebase Auth.
 * Adheres strictly to the requirement of no public signup interface.
 */

import React, { useState } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tv, Lock, Mail, AlertCircle, Loader2, Info } from 'lucide-react';
import { EMULATOR_CONFIG } from '@/lib/firebase';

export const LoginPage: React.FC = () => {
  const { login, error, clearError, currentUser, userProfile, isResolvingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // If already authenticated and profile is active, redirect to home
  if (!isResolvingAuth && currentUser && userProfile && userProfile.status === 'active') {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError('Please enter your company email address.');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email, password);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err: unknown) {
      // Handled by AuthContext and localError
      const msg = err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      setLocalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeErrorMessage = localError || error;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Icon & Name */}
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-2xl bg-teal-600 flex items-center justify-center text-white shadow-md">
            <Tv className="h-7 w-7" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-slate-900">
          Aura DIMS
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500 font-medium">
          Aura Digital Information Management System
        </p>
        <p className="text-center text-[11px] text-slate-400">
          Aurainteract Private Limited
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 sm:rounded-2xl sm:px-10">
          {/* Error Banner */}
          {activeErrorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{activeErrorMessage}</div>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700">
                Email Address
              </label>
              <div className="mt-1 relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@aurainteract.com"
                  className="block w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-[11px] font-medium text-teal-700 hover:text-teal-800"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="mt-1 relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-60 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign in</span>
                )}
              </button>
            </div>
          </form>

          {/* Explicit Notice: No Self-Registration */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              User accounts are provisioned by Aura DIMS Administrators.
              Public registration is disabled for enterprise security.
            </p>
          </div>

          {/* Local Development Mode Helper */}
          {EMULATOR_CONFIG.isEmulator && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
              <div className="flex items-center gap-1.5 font-semibold text-amber-900 mb-1">
                <Info className="h-3.5 w-3.5 text-amber-700" />
                <span>Local Emulator Environment</span>
              </div>
              <p className="text-amber-800">
                To sign in locally, use the bootstrapped admin credentials:
              </p>
              <div className="mt-1 font-mono text-[10px] bg-amber-100/70 p-1.5 rounded text-amber-950">
                <div>Email: <strong>admin@aurainteract.com</strong></div>
                <div>Password: <strong>AuraAdmin#2026</strong></div>
              </div>
              <p className="mt-1 text-[10px] text-amber-700">
                Or run <code className="font-mono font-bold">pnpm run bootstrap:admin</code> to seed or reset.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

