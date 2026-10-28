/**
 * Aura DIMS - Application Shell Header
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Displays active route title, compact local development indicator,
 * and authenticated user profile with sign-out action.
 * Nonfunctional global search and notifications are removed until implemented.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronDown, LogOut, User, Shield, Building2 } from 'lucide-react';
import { EMULATOR_CONFIG } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/displays': 'Digital Displays',
  '/content': 'Content',
  '/schedules': 'Schedules',
  '/approvals': 'Approvals',
  '/users': 'Users & Access Control',
  '/settings': 'Settings',
  '/dev/diagnostics': 'Diagnostics (Dev)',
};

export const Header: React.FC = () => {
  const location = useLocation();
  const { userProfile, currentUser, department, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentTitle = routeTitles[location.pathname] || 'Aura DIMS';

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const displayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'User';
  const roleLabel = userProfile?.role === 'admin' ? 'Admin' : 'Department Head';
  const userInitials = displayName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      {/* Top Main Navigation Bar */}
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-semibold text-slate-800">{currentTitle}</span>
          </div>

          {/* Development Environment Indicator (Subtle, non-leaking) */}
          {EMULATOR_CONFIG.isEmulator && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-100/80 text-amber-900 border border-amber-300/50">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Dev: {EMULATOR_CONFIG.projectId}</span>
            </span>
          )}
        </div>

        {/* User Profile & Actions Menu */}
        <div className="flex items-center gap-4">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none"
              aria-expanded={dropdownOpen}
            >
              <div className="h-9 w-9 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {userInitials}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                  <span>{displayName}</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span className="font-medium text-teal-700">{roleLabel}</span>
                  {department && (
                    <>
                      <span>•</span>
                      <span>{department.name}</span>
                    </>
                  )}
                </div>
              </div>
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-lg border border-slate-200 py-2 z-50 text-xs text-slate-700 animate-in fade-in-50 zoom-in-95">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <div className="font-semibold text-slate-900 truncate">{displayName}</div>
                  <div className="text-[11px] text-slate-500 truncate">{currentUser?.email}</div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-teal-100 text-teal-800 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      <span>{roleLabel}</span>
                    </span>
                    {department && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        <span>{department.code}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="py-1">
                  <Link
                    to="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors text-slate-700"
                  >
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span>Settings & Preferences</span>
                  </Link>
                </div>

                <div className="pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={async () => {
                      setDropdownOpen(false);
                      await logout();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
