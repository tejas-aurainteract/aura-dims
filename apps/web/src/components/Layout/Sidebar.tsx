import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Tv,
  FolderOpen,
  Edit3,
  LayoutTemplate,
  Calendar,
  CheckCircle2,
  Users2,
  Settings,
  Activity,
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navItems: NavItem[] = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Displays', path: '/displays', icon: Tv },
  { name: 'Content Library', path: '/content-library', icon: FolderOpen },
  { name: 'Content Creator', path: '/content-creator', icon: Edit3 },
  { name: 'Templates', path: '/templates', icon: LayoutTemplate },
  { name: 'Schedules', path: '/schedules', icon: Calendar },
  { name: 'Approvals', path: '/approvals', icon: CheckCircle2 },
  { name: 'Users & Roles', path: '/users-and-roles', icon: Users2 },
  { name: 'Settings', path: '/settings', icon: Settings },
  { name: 'System Diagnostics', path: '/diagnostics', icon: Activity, badge: 'Live' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand & Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
        <div className="h-9 w-9 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-sm">
          <Tv className="h-5 w-5" />
        </div>
        <div>
          <div className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
            <span>Digital Display</span>
          </div>
          <div className="text-[10px] font-medium text-teal-700 tracking-wider uppercase">
            Aura DIMS
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
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
                <>
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 ${
                        isActive ? 'text-teal-600' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isActive
                          ? 'bg-teal-200 text-teal-900'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Company Footer Info */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50">
        <div className="text-[11px] font-semibold text-slate-800">
          Aurainteract Private Limited
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          Aura Digital Information Management System
        </div>
        <div className="mt-2 text-[9px] text-slate-400 font-mono">
          Milestone: Foundation & Emulators
        </div>
      </div>
    </aside>
  );
};

