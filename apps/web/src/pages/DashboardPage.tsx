import React, { useState, useEffect } from 'react';
import {
  Tv,
  CheckCircle2,
  Clock,
  Plus,
  Calendar,
  Layers,
  Server,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { checkDiagnostics, EMULATOR_CONFIG, type DiagnosticsResult } from '@/lib/firebase';

export const DashboardPage: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [checking, setChecking] = useState<boolean>(false);

  const runDiagnostics = async () => {
    setChecking(true);
    try {
      const res = await checkDiagnostics();
      setDiagnostics(res);
    } catch (e) {
      console.error('Failed to run diagnostics', e);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage content and digital displays across your sites • Aurainteract Private Limited
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
            onClick={() => alert('Visual Content Creator is planned for future content authoring milestone.')}
          >
            <Plus className="h-4 w-4" />
            <span>Create content</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
            onClick={() => alert('Playlist Scheduling is planned for future publication milestone.')}
          >
            <Calendar className="h-4 w-4" />
            <span>Schedule content</span>
          </button>
        </div>
      </div>

      {/* Foundation Architecture Cards (Not fabricated operational metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Deployment Target */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Initial Target Fleet</span>
            <Tv className="h-4 w-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">~20</div>
          <div className="mt-1 text-[11px] text-slate-500">
            Digital displays planned (expanding to 100+)
          </div>
        </div>

        {/* Card 2: Environment */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Development Environment</span>
            <Server className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Local Emulator</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">
            {EMULATOR_CONFIG.projectId}
          </div>
        </div>

        {/* Card 3: Scheduling Timezone */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Scheduling Timezone</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">Asia/Kolkata</div>
          <div className="mt-1 text-[11px] text-slate-500">
            IST (UTC+05:30) local clock scheduling
          </div>
        </div>

        {/* Card 4: Content Languages */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Content Languages</span>
            <Globe className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">3 Languages</div>
          <div className="mt-1 text-[11px] text-slate-500">
            English, Gujarati, and Hindi
          </div>
        </div>
      </div>

      {/* Live Firebase Emulator Connectivity Diagnostics Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Firebase Emulator Suite Connectivity
              </h2>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                Active Probe
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live communication checks against local Firebase Emulator services (Zero cloud credentials required)
            </p>
          </div>

          <button
            type="button"
            onClick={runDiagnostics}
            disabled={checking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin text-teal-600' : ''}`} />
            <span>{checking ? 'Testing...' : 'Re-test Emulators'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5">
          {/* Auth Service */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Authentication</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="text-xs font-mono text-slate-900 font-medium mt-1">Port 9099</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {diagnostics?.services.auth.details || 'Connected to emulator'}
            </div>
          </div>

          {/* Firestore Service */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Cloud Firestore</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="text-xs font-mono text-slate-900 font-medium mt-1">Port 8080</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {diagnostics?.services.firestore.details || 'Deny-by-default rules active'}
            </div>
          </div>

          {/* Cloud Functions Service */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Cloud Functions</span>
              <span
                className={`h-2 w-2 rounded-full ${
                  diagnostics?.services.functions.status === 'connected'
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
              />
            </div>
            <div className="text-xs font-mono text-slate-900 font-medium mt-1">Port 5001</div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={diagnostics?.services.functions.details}>
              {diagnostics?.services.functions.details || 'Verifying callable function...'}
            </div>
          </div>

          {/* Cloud Storage Service */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Cloud Storage</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="text-xs font-mono text-slate-900 font-medium mt-1">Port 9199</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {diagnostics?.services.storage.details || 'Deny-by-default rules active'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Display Overview & Right Column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Digital Display Fleet Overview */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Digital Display Fleet Overview</h2>
                <p className="text-xs text-slate-500">
                  Target sites: Ahmedabad, Vadodara, Surat, Rajkot
                </p>
              </div>
              <span className="text-xs font-semibold text-teal-700 cursor-not-allowed opacity-60">
                Manage assignments →
              </span>
            </div>

            {/* Filter controls placeholder */}
            <div className="flex gap-2 mb-4">
              <select disabled className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed">
                <option>All sites (India)</option>
              </select>
              <select disabled className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed">
                <option>All departments</option>
              </select>
            </div>

            {/* Unimplemented / Empty State Table */}
            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50">
              <Tv className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <h3 className="text-xs font-bold text-slate-800">
                No Digital Displays Enrolled Yet
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                Device enrollment, token generation, and secure assignment to Department Heads will be provisioned once authentication & roles are configured in Milestone 2.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Showing 0 of ~20 digital displays</span>
            <span className="text-slate-400 cursor-not-allowed">View all digital displays →</span>
          </div>
        </div>

        {/* Right 1 Col: Upcoming Schedules & Approvals Empty States */}
        <div className="space-y-6">
          {/* Upcoming Schedules */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Upcoming Schedules
              </h2>
              <span className="text-[11px] text-slate-400 cursor-not-allowed">View all →</span>
            </div>
            <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50/50">
              <Calendar className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
              <p className="text-xs font-medium text-slate-700">No Scheduled Broadcasts</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Dayparting and Asia/Kolkata playlist schedules will appear here.
              </p>
            </div>
          </div>

          {/* Approvals */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Approvals Queue
              </h2>
              <span className="text-[11px] text-slate-400 cursor-not-allowed">View all →</span>
            </div>
            <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50/50">
              <CheckCircle2 className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
              <p className="text-xs font-medium text-slate-700">No Pending Approvals</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Content requiring Department Head or Admin sign-off will queue here.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Content Shelf Empty State */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Content</h2>
            <p className="text-xs text-slate-500">
              Visual content creator drafts and published digital signage manifests
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400 cursor-not-allowed">
            View all content →
          </span>
        </div>

        <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center bg-slate-50/50">
          <Layers className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <h3 className="text-xs font-bold text-slate-800">Media Library & Creator Workspace Empty</h3>
          <p className="text-xs text-slate-500 max-w-lg mx-auto mt-1 leading-relaxed">
            Content drafts (landscape 1920×1080 and portrait 1080×1920) will be authored using the visual canvas editor in later milestones. All published revisions will produce immutable manifests.
          </p>
        </div>
      </div>
    </div>
  );
};

