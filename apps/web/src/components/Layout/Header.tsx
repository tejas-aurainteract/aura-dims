import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search,
  Bell,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import { EMULATOR_CONFIG } from '@/lib/firebase';

const routeTitles: Record<string, string> = {
  '/': 'Overview',
  '/displays': 'Digital Displays',
  '/content-library': 'Content Library',
  '/content-creator': 'Content Creator',
  '/templates': 'Templates',
  '/schedules': 'Schedules',
  '/approvals': 'Approvals',
  '/users-and-roles': 'Users & Roles',
  '/settings': 'Settings',
  '/diagnostics': 'System Diagnostics',
};

export const Header: React.FC = () => {
  const location = useLocation();
  const currentTitle = routeTitles[location.pathname] || 'Overview';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      {/* Explicit Local Emulator Environment Indicator */}
      <div className="bg-amber-500/10 border-b border-amber-300/40 px-4 py-1.5 text-xs text-amber-900 flex items-center justify-between font-mono">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-semibold tracking-wide uppercase text-[11px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
            Local Development
          </span>
          <span className="text-slate-600">
            Connected to Firebase Emulator Suite: <strong className="text-slate-900">{EMULATOR_CONFIG.projectId}</strong>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-[11px] text-slate-500">
          <span>Auth :9099</span>
          <span>Firestore :8080</span>
          <span>Functions :5001</span>
          <span>Storage :9199</span>
          <span>UI :4000</span>
          <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">Asia/Kolkata</span>
        </div>
      </div>

      {/* Main Top Navigation Bar */}
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-semibold text-slate-800">{currentTitle}</span>
          </div>

          {/* Site Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            >
              <MapPin className="h-3.5 w-3.5 text-slate-500" />
              <span>All sites (India)</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Search, Notifications & User Info */}
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              readOnly
              placeholder="Search content, digital displays, schedules..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-600 placeholder:text-slate-400 focus:outline-none cursor-not-allowed"
              title="Search will be activated once indexing is enabled in Milestone 2"
            />
          </div>

          <button
            type="button"
            className="relative p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-teal-500" />
          </button>

          <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="h-8 w-8 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              A
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                Admin Shell
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </div>
              <div className="text-[10px] text-slate-400">Aurainteract Pvt Ltd</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

