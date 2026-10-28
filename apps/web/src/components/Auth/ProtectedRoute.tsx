/**
 * Aura DIMS - Protected Route Guard
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Enforces session authentication, profile presence, active status,
 * and role-based permissions (Admin vs Department Head).
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';
import type { UserRole } from '@aura-dims/display-schema';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { currentUser, userProfile, loadingAuth, isResolvingAuth } = useAuth();
  const location = useLocation();

  // 1. Separate Loading State: Auth restoration & Profile loading
  if (isResolvingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center max-w-sm w-full text-center">
          <div className="h-12 w-12 rounded-xl bg-teal-600 text-white flex items-center justify-center mb-4 shadow-xs">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Aura DIMS</h2>
          <p className="text-xs text-slate-500 mt-1">
            {loadingAuth ? 'Restoring secure session...' : 'Verifying user profile & authorization...'}
          </p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated check
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. User authenticated, but missing profile or inactive
  if (!userProfile || userProfile.status !== 'active') {
    return <Navigate to="/access-denied" replace />;
  }

  // 4. Role restriction (e.g. Admin only)
  if (requiredRole && userProfile.role !== requiredRole) {
    return (
      <div className="p-8 max-w-2xl mx-auto my-12 bg-white rounded-2xl border border-red-200 shadow-sm text-center">
        <div className="h-12 w-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-600 mt-2">
          This section requires <strong className="capitalize font-semibold text-slate-900">{requiredRole}</strong> privileges.
          Your current account is assigned the role of{' '}
          <strong className="capitalize font-semibold text-slate-900">{userProfile.role.replace('_', ' ')}</strong>.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-xs"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
