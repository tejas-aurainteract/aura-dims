/**
 * Aura DIMS - Application Sidebar Navigation
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements simplified enterprise navigation:
 * Dashboard, Displays, Content, Schedules, Approvals, Users (Admin only), Settings.
 * Technical diagnostics is available strictly in development mode.
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Tv,
  FolderOpen,
  Calendar,
  CheckCircle2,
  Users2,
  Settings,
  Activity,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  devOnly?: boolean;
}

const baseNavItems: NavItem[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Displays', path: '/displays', icon: Tv },
  { name: 'Content', path: '/content', icon: FolderOpen },
  { name: 'Schedules', path: '/schedules', icon: Calendar },
  { name: 'Approvals', path: '/approvals', icon: CheckCircle2 },
  { name: 'Users', path: '/users', icon: Users2, adminOnly: true },
  { name: 'Settings', path: '/settings', icon: Settings },
  { name: 'Diagnostics', path: '/dev/diagnostics', icon: Activity, devOnly: true },
];

export const Sidebar: React.FC = () => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const isDev = import.meta.env.DEV;

  const visibleNavItems = baseNavItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.devOnly && !isDev) return false;
    return true;
  });

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand & Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
        <div className="h-9 w-9 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-xs">
          <Tv className="h-5 w-5" />
        </div>
        <div>
          <div className="font-bold text-slate-900 text-sm tracking-tight">
            Aura DIMS
          </div>
          <div className="text-[10px] font-medium text-slate-400">
            Aurainteract Pvt Ltd
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`
              }
            >
              {({ isActive }) => (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 ${
                        isActive ? 'text-teal-600' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                  {item.devOnly && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      Dev
                    </span>
                  )}
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Enterprise Identity Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50">
        <div className="text-[11px] font-semibold text-slate-800">
          Aurainteract Private Limited
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          Enterprise Digital Signage Platform
        </div>
      </div>
    </aside>
  );
};
