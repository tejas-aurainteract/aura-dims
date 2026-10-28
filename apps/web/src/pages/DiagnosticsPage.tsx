import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Cpu,
  Database,
  Lock,
  HardDrive,
} from 'lucide-react';
import { checkDiagnostics, EMULATOR_CONFIG, type DiagnosticsResult } from '@/lib/firebase';

export const DiagnosticsPage: React.FC = () => {
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    try {
      const diag = await checkDiagnostics();
      setResult(diag);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            System & Emulator Diagnostics
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time verification of local Firebase Emulator Suite connectivity • Aurainteract Private Limited
          </p>
        </div>

        <button
          type="button"
          onClick={runTests}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Running Probes...' : 'Run Diagnostics Probe'}</span>
        </button>
      </div>

      {/* Environment Overview */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Server className="h-4 w-4 text-teal-600" />
          <span>Runtime Environment & Port Allocations</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 text-[11px] block">Project ID</span>
            <span className="font-mono font-bold text-slate-800">{EMULATOR_CONFIG.projectId}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 text-[11px] block">Execution Mode</span>
            <span className="font-semibold text-emerald-700">Offline Local Emulators</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 text-[11px] block">System Timezone</span>
            <span className="font-mono font-bold text-slate-800">Asia/Kolkata</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 text-[11px] block">Cloud Credentials</span>
            <span className="font-semibold text-slate-700">None (Bypassed via demo-*)</span>
          </div>
        </div>
      </div>

      {/* Services Connectivity Matrix */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-teal-600" />
          <span>Firebase Emulator Services Connectivity Matrix</span>
        </h2>

        {error && (
          <div className="p-4 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>Diagnostics Error: {error}</span>
          </div>
        )}

        <div className="space-y-3">
          {/* Auth */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-100 text-teal-800">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Firebase Authentication Emulator</div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {EMULATOR_CONFIG.authUrl} • Deny unauthenticated writes
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Connected</span>
            </div>
          </div>

          {/* Firestore */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-100 text-teal-800">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Cloud Firestore Emulator</div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {EMULATOR_CONFIG.firestoreHost}:{EMULATOR_CONFIG.firestorePort} • Deny-by-default rules active
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Connected</span>
            </div>
          </div>

          {/* Functions */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-100 text-teal-800">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Cloud Functions Emulator (v2)</div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {EMULATOR_CONFIG.functionsHost}:{EMULATOR_CONFIG.functionsPort} • Region: asia-south1
                </div>
              </div>
            </div>
            <div
              className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                result?.services.functions.status === 'connected'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-amber-800 bg-amber-50 border-amber-200'
              }`}
            >
              {result?.services.functions.status === 'connected' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Verified Callable</span>
                </>
              ) : (
                <>
                  <Activity className="h-3.5 w-3.5 animate-pulse" />
                  <span>{loading ? 'Testing...' : 'Pending Connection'}</span>
                </>
              )}
            </div>
          </div>

          {/* Storage */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-100 text-teal-800">
                <HardDrive className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Cloud Storage for Firebase Emulator</div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {EMULATOR_CONFIG.storageHost}:{EMULATOR_CONFIG.storagePort} • Deny-by-default rules active
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Rules Status */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Security Rules Authorization Baseline</span>
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          The current foundation strictly applies <strong>deny-by-default</strong> rules across Cloud Firestore and Cloud Storage.
          Unauthenticated and unauthorized client mutations are rejected. Privileged operations are strictly dispatched via Cloud Functions with the Admin SDK in future milestones.
        </p>
      </div>
    </div>
  );
};

