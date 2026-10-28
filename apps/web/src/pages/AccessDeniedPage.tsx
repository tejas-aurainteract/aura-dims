/**
 * Aura DIMS - Access Denied / Unassigned Profile
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Rendered when a user authenticates successfully with Firebase Auth,
 * but either has no profile record in /users or has been set to 'inactive'.
 */

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldX, LogOut, UserX } from 'lucide-react';

export const AccessDeniedPage: React.FC = () => {
  const { currentUser, userProfile, logout } = useAuth();

  const isInactive = userProfile && userProfile.status === 'inactive';
  const isMissingProfile = !userProfile;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 sm:rounded-2xl sm:px-10 text-center">
          <div className="h-14 w-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
            {isInactive ? <UserX className="h-7 w-7 text-amber-700" /> : <ShieldX className="h-7 w-7 text-amber-700" />}
          </div>

          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {isInactive ? 'Account Deactivated' : 'Access Restricted'}
          </h2>

          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            {isInactive ? (
              <>
                Your user profile (<strong className="text-slate-900">{currentUser?.email}</strong>) has been deactivated by an Administrator. You cannot access Aura DIMS digital display workflows.
              </>
            ) : isMissingProfile ? (
              <>
                You have authenticated as <strong className="text-slate-900">{currentUser?.email}</strong>, but no authorized user profile or role assignment exists in Aura DIMS.
              </>
            ) : (
              <>
                Your account is currently not authorized to access Aura DIMS resources.
              </>
            )}
          </p>

          <div className="mt-6 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">What should you do?</div>
            <p className="text-[11px] text-slate-500">
              Please contact your Aurainteract System Administrator to activate your account or assign departmental permissions.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => logout()}
              className="w-full inline-flex justify-center items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out ({currentUser?.email || 'Current Account'})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

