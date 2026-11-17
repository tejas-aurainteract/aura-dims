import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  RefreshCw,
  Power,
  RotateCcw,
  Trash2,
  Camera,
  Activity,
  Clock,
  HardDrive,
  Cpu,
  Wifi,
  X,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Play,
  Shield,
  Server,
  Code2,
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  DeviceOperationRecord,
  DeviceOperationType,
  DisplayView,
} from '@aura-dims/display-schema';

interface DeviceMaintenanceModalProps {
  display: DisplayView;
  isAdmin: boolean;
  onClose: () => void;
  onDisplayUpdated?: () => void;
}

const PRESET_COMMANDS = [
  { label: 'System Info', cmd: 'uname -a && uptime' },
  { label: 'Network IPs', cmd: 'ip -br a' },
  { label: 'Ping Internet', cmd: 'ping -c 3 8.8.8.8' },
  { label: 'Disk Space', cmd: 'df -h /' },
  { label: 'Memory (RAM)', cmd: 'free -h' },
  { label: 'Player Status', cmd: 'systemctl status aura-player --no-pager -l' },
  { label: 'Player Logs (50)', cmd: 'journalctl -u aura-player -n 50 --no-pager' },
  { label: 'CPU Temp', cmd: 'cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk \'{print $1/1000 "°C"}\'' },
];

export const DeviceMaintenanceModal: React.FC<DeviceMaintenanceModalProps> = ({
  display,
  isAdmin,
  onClose,
  onDisplayUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'controls' | 'terminal' | 'audit'>('controls');
  const [operations, setOperations] = useState<DeviceOperationRecord[]>([]);
  const [actionBusy, setActionBusy] = useState<DeviceOperationType | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Terminal State
  const [commandInput, setCommandInput] = useState<string>('');
  const [executingCmd, setExecutingCmd] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);

  // Reboot Confirmation Modal
  const [showRebootModal, setShowRebootModal] = useState<boolean>(false);
  const [rebootReason, setRebootReason] = useState<string>('');

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Real-time operations subscription
  useEffect(() => {
    const opsQuery = query(
      collection(db, 'displays', display.id, 'operations'),
      orderBy('requestedAt', 'desc'),
      limit(40)
    );

    const unsubscribe = onSnapshot(
      opsQuery,
      (snapshot) => {
        const ops: DeviceOperationRecord[] = [];
        snapshot.forEach((doc) => {
          ops.push(doc.data() as DeviceOperationRecord);
        });
        setOperations(ops);
      },
      (err) => {
        console.warn('[DeviceMaintenanceModal] Operations snapshot warning:', err);
      }
    );

    return () => unsubscribe();
  }, [display.id]);

  const handleRequestOperation = async (
    type: DeviceOperationType,
    options?: { command?: string; confirmed?: boolean; reason?: string }
  ) => {
    setBannerError(null);
    setBannerSuccess(null);
    setActionBusy(type);

    try {
      const res = await api.requestDisplayOperation({
        displayId: display.id,
        type,
        command: options?.command,
        confirmed: options?.confirmed,
        reason: options?.reason,
      });

      const labelMap: Record<DeviceOperationType, string> = {
        SYNC_NOW: 'Sync Now',
        REFRESH_RENDERER: 'Renderer Refresh',
        CAPTURE_PREVIEW: 'Software Preview Capture',
        SAFE_CLEANUP_CACHE: 'Safe Cache Cleanup',
        REBOOT: 'Controlled OS Reboot',
        RESTART_PLAYER: 'Player Daemon Restart',
        EXEC_COMMAND: 'Remote Command Execution',
      };

      setBannerSuccess(
        res.deduplicated
          ? `${labelMap[type]} is already queued or currently running (${res.operation.state}).`
          : `Queued ${labelMap[type]} for this digital display.`
      );

      if (type === 'REBOOT') {
        setShowRebootModal(false);
        setRebootReason('');
      }

      if (onDisplayUpdated) {
        onDisplayUpdated();
      }
    } catch (err: any) {
      setBannerError(
        getApiErrorMessage(err, `Failed to request ${type} operation for digital display.`)
      );
    } finally {
      setActionBusy(null);
    }
  };

  const handleRunCommand = async (cmdToRun?: string) => {
    const cmd = (cmdToRun ?? commandInput).trim();
    if (!cmd) return;

    if (!isAdmin) {
      setBannerError('Only administrators are authorized to execute remote diagnostic commands.');
      return;
    }

    setExecutingCmd(true);
    setBannerError(null);
    setBannerSuccess(null);

    try {
      await api.requestDisplayOperation({
        displayId: display.id,
        type: 'EXEC_COMMAND',
        command: cmd,
        confirmed: true,
      });
      setBannerSuccess(`Dispatched command: "${cmd}". Awaiting digital display player execution...`);
      setCommandInput('');
    } catch (err: any) {
      setBannerError(getApiErrorMessage(err, 'Failed to dispatch command to digital display.'));
    } finally {
      setExecutingCmd(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isOnline = display.connectivity === 'online';
  const reported = display.reported;
  const hw = reported?.hardwareMetrics;
  const osInfo = hw?.osRelease ? `Linux ${hw.osRelease}` : (hw?.osPlatform || 'Linux (Raspberry Pi OS)');
  const model = hw?.arch ? `Raspberry Pi (${hw.arch})` : 'Raspberry Pi Hardware';
  const appVer = reported?.appVersion || 'v0.1.0';
  const hostLabel = display.name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'pi';
  const ip = (display as any).ipAddress || display.installationRef || '192.168.1.140';

  // Filter commands for terminal tab
  const commandOperations = operations.filter((op) => op.type === 'EXEC_COMMAND');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-white tracking-tight">{display.name}</h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    isOnline
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                <span className="text-xs text-slate-400 font-mono">({ip})</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Digital Display Maintenance, Remote Diagnostics & Service Controls • {model} • Player {appVer}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banners */}
        {bannerError && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{bannerError}</span>
            </div>
            <button
              onClick={() => setBannerError(null)}
              className="text-red-400 hover:text-red-200 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {bannerSuccess && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-teal-950/60 border border-teal-800/60 text-teal-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <span>{bannerSuccess}</span>
            </div>
            <button
              onClick={() => setBannerSuccess(null)}
              className="text-teal-400 hover:text-teal-200 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('controls')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'controls'
                ? 'border-teal-500 text-teal-300 bg-teal-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Device Controls</span>
          </button>
          <button
            onClick={() => setActiveTab('terminal')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'terminal'
                ? 'border-teal-500 text-teal-300 bg-teal-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Terminal & Diagnostics</span>
            {commandOperations.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {commandOperations.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'audit'
                ? 'border-teal-500 text-teal-300 bg-teal-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Operations Audit Log ({operations.length})</span>
          </button>
        </div>

        {/* Body Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: DEVICE CONTROLS */}
          {activeTab === 'controls' && (
            <div className="space-y-6">
              {/* Quick Health summary banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                    <Wifi className="w-3.5 h-3.5 text-teal-400" />
                    <span>IP Address</span>
                  </div>
                  <div className="text-xs font-mono font-medium text-white truncate">{ip}</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                    <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                    <span>OS Release</span>
                  </div>
                  <div className="text-xs font-mono font-medium text-white truncate">{osInfo}</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                    <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                    <span>Disk Available</span>
                  </div>
                  <div className="text-xs font-medium text-white">
                    {reported?.storage?.freeBytes
                      ? `${(reported.storage.freeBytes / 1024 / 1024 / 1024).toFixed(1)} GB Free`
                      : '48.9 GB Free'}
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Last Heartbeat</span>
                  </div>
                  <div className="text-xs font-medium text-white truncate">
                    {display.lastHeartbeatAt
                      ? new Date(display.lastHeartbeatAt).toLocaleTimeString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        }) + ' IST'
                      : 'Never'}
                  </div>
                </div>
              </div>

              {/* Action Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Restart Player Service */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Restart Player Service</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Restarts the <code className="text-amber-300">aura-player</code> systemd
                        daemon. Reloads published manifests, runtime agents, and hardware watchdog
                        without rebooting the host OS.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Fast recovery (~5s)</span>
                    <button
                      onClick={() => handleRequestOperation('RESTART_PLAYER')}
                      disabled={actionBusy !== null}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      {actionBusy === 'RESTART_PLAYER' ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Restarting...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restart Service</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 2. Controlled Hardware Reboot */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                      <Power className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Controlled Hardware Reboot</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Performs an authoritative, clean Linux operating system reboot on the
                        digital display. Only available to System Administrators.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-red-400/80">Requires confirmation (~45s)</span>
                    <button
                      onClick={() => setShowRebootModal(true)}
                      disabled={!isAdmin || actionBusy !== null}
                      className="px-3.5 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800/70 disabled:opacity-40 text-red-200 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>Reboot Device</span>
                    </button>
                  </div>
                </div>

                {/* 3. Sync Content Now */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Sync Content Now</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Triggers the digital display sync agent to immediately check for new
                        published presentations, download delta assets, and evaluate active
                        schedules.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Atomic sha256 verification</span>
                    <button
                      onClick={() => handleRequestOperation('SYNC_NOW')}
                      disabled={actionBusy !== null}
                      className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      {actionBusy === 'SYNC_NOW' ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Syncing...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Sync Now</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 4. Refresh Local Renderer */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Play className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Refresh Local Renderer</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Forces the Chromium display presentation window on the digital display to
                        reload its local HTML5 viewport canvas without terminating background
                        services.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Instant canvas refresh</span>
                    <button
                      onClick={() => handleRequestOperation('REFRESH_RENDERER')}
                      disabled={actionBusy !== null}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-slate-100 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {actionBusy === 'REFRESH_RENDERER' ? 'Refreshing...' : 'Refresh Renderer'}
                    </button>
                  </div>
                </div>

                {/* 5. Safe Cache Cleanup */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Safe Cache Cleanup</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Safely deletes unreferenced media blobs and old presentation packages while
                        preserving currently active assets and configuration manifests.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Reclaims disk storage</span>
                    <button
                      onClick={() => handleRequestOperation('SAFE_CLEANUP_CACHE')}
                      disabled={actionBusy !== null}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-slate-100 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {actionBusy === 'SAFE_CLEANUP_CACHE' ? 'Cleaning...' : 'Clean Cache'}
                    </button>
                  </div>
                </div>

                {/* 6. Capture Live Preview */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Capture Live Preview</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Instructs the digital display agent to capture a screenshot of the
                        current display output and securely upload it for remote operator inspection.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Visual verification snapshot</span>
                    <button
                      onClick={() => handleRequestOperation('CAPTURE_PREVIEW')}
                      disabled={actionBusy !== null}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-slate-100 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {actionBusy === 'CAPTURE_PREVIEW' ? 'Capturing...' : 'Capture Preview'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TERMINAL CONSOLE & DIAGNOSTICS */}
          {activeTab === 'terminal' && (
            <div className="space-y-4">
              {/* Presets Bar */}
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-2 block">
                  Quick Diagnostic Commands
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COMMANDS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleRunCommand(item.cmd)}
                      disabled={executingCmd || !isAdmin}
                      className="px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/70 text-slate-200 text-xs rounded-lg transition-all flex items-center gap-1.5 hover:border-teal-500/50"
                      title={item.cmd}
                    >
                      <Code2 className="w-3 h-3 text-teal-400" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Command Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRunCommand();
                }}
                className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 focus-within:border-teal-500/80 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs font-mono text-teal-400 pl-2 select-none">
                  <Terminal className="w-4 h-4 text-teal-400" />
                  <span>aura@{hostLabel}:~$</span>
                </div>
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Enter shell command (e.g. ping -c 3 google.com, df -h, uptime)..."
                  disabled={executingCmd || !isAdmin}
                  className="flex-1 bg-transparent text-xs font-mono text-white placeholder-slate-500 outline-none px-2"
                />
                <button
                  type="submit"
                  disabled={!commandInput.trim() || executingCmd || !isAdmin}
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {executingCmd ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Run</span>
                    </>
                  )}
                </button>
              </form>

              {!isAdmin && (
                <p className="text-[11px] text-amber-400/90 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Terminal execution is restricted to System Administrators.
                </p>
              )}

              {/* Interactive Terminal Screen */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 shadow-inner overflow-hidden flex flex-col">
                {/* Terminal Window Header */}
                <div className="bg-slate-900/90 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 ml-2">
                      bash — aura@{ip}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Durable Queue • Execution Output History
                  </span>
                </div>

                {/* Terminal Output Log Body */}
                <div className="p-4 font-mono text-xs text-slate-200 max-h-[380px] overflow-y-auto space-y-4">
                  {commandOperations.length === 0 ? (
                    <div className="text-slate-500 py-8 text-center">
                      <p>No terminal commands have been run on this digital display yet.</p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Select a quick diagnostic button above or type a command to execute remotely.
                      </p>
                    </div>
                  ) : (
                    commandOperations.map((op) => {
                      const isPending = op.state === 'queued' || op.state === 'claimed' || op.state === 'in_progress' || op.state === 'awaiting_reconnect';
                      const isSuccess = op.state === 'succeeded';
                      const isFailed = op.state === 'failed' || op.state === 'expired' || op.state === 'cancelled';

                      return (
                        <div
                          key={op.id}
                          className="border border-slate-800/80 rounded-lg p-3 bg-slate-900/50 space-y-2"
                        >
                          {/* Command Header Line */}
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="text-teal-400">$</span>
                              <span className="font-semibold text-white">{op.command || 'uptime'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* State Badge */}
                              {isPending && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                  {op.state}
                                </span>
                              )}
                              {isSuccess && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  <Check className="w-2.5 h-2.5" />
                                  Exit {op.exitCode ?? 0}
                                </span>
                              )}
                              {isFailed && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {op.state} (Exit {op.exitCode ?? 1})
                                </span>
                              )}

                              {/* Timestamp */}
                              <span className="text-slate-500 text-[10px]">
                                {new Date(op.requestedAt).toLocaleTimeString('en-IN', {
                                  timeZone: 'Asia/Kolkata',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>

                              {/* Copy Button */}
                              {op.output && (
                                <button
                                  onClick={() => copyToClipboard(op.output || '', op.id)}
                                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                                  title="Copy output"
                                >
                                  {copiedId === op.id ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Command Output Content */}
                          {op.output ? (
                            <pre className="text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-all bg-black/60 p-2.5 rounded border border-slate-900 overflow-x-auto">
                              {op.output}
                            </pre>
                          ) : isPending ? (
                            <div className="text-[11px] text-amber-400/80 italic flex items-center gap-1.5 py-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Awaiting digital display agent execution...
                            </div>
                          ) : op.errorMessage ? (
                            <div className="text-[11px] text-red-400 bg-red-950/40 p-2 rounded border border-red-900/40">
                              Error: {op.errorMessage}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 italic">
                              (Command executed with no standard output)
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT & ALL OPERATIONS */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>All durable operations queued or executed for this digital display</span>
                <span className="text-[11px] text-slate-500">Live streamed via Firestore</span>
              </div>

              {operations.length === 0 ? (
                <div className="p-8 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-950/50">
                  No durable operations on record for this digital display.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80 bg-slate-950/60">
                  {operations.map((op) => {
                    const isExpanded = expandedOpId === op.id;
                    const isSuccess = op.state === 'succeeded';
                    const isFailed = op.state === 'failed' || op.state === 'expired' || op.state === 'cancelled';
                    return (
                      <div key={op.id} className="p-3.5 hover:bg-slate-900/40 transition-colors">
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedOpId(isExpanded ? null : op.id)}
                        >
                          <div className="flex items-center gap-2.5">
                            <button className="text-slate-500 hover:text-slate-300">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <span className="font-semibold text-xs text-white">{op.type}</span>
                            {op.command && (
                              <span className="font-mono text-[11px] text-teal-400 truncate max-w-xs">
                                ({op.command})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                isSuccess
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : isFailed
                                  ? 'bg-red-500/10 text-red-300 border-red-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {op.state}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(op.requestedAt).toLocaleTimeString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Details */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-slate-800/60 text-xs space-y-2 text-slate-400 pl-6 font-mono">
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-500">Operation ID: </span>
                                <span className="text-slate-300 select-all">{op.id}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Requested By: </span>
                                <span className="text-slate-300">{op.requestedBy}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Requested At: </span>
                                <span className="text-slate-300">{op.requestedAt}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Completed At: </span>
                                <span className="text-slate-300">{op.completedAt || 'Pending'}</span>
                              </div>
                            </div>

                            {op.errorMessage && (
                              <div className="text-red-300 bg-red-950/40 p-2 rounded border border-red-900/50">
                                <strong>Error: </strong> {op.errorMessage}
                              </div>
                            )}

                            {op.output && (
                              <div>
                                <div className="text-[10px] text-slate-500 mb-1">Execution Output:</div>
                                <pre className="text-[11px] text-slate-200 bg-black/70 p-2.5 rounded border border-slate-900 max-h-48 overflow-y-auto whitespace-pre-wrap">
                                  {op.output}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <span>Digital Display ID: {display.id}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Controlled Hardware Reboot Confirmation Modal */}
      {showRebootModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-red-900/60 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <Power className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Confirm Hardware Reboot</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to reboot digital display{' '}
              <strong className="text-white font-semibold">{display.name}</strong>? Playback will
              temporarily stop while the device restarts and reconnects (~45-60s).
            </p>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                Reason for reboot (Audit Requirement):
              </label>
              <input
                type="text"
                value={rebootReason}
                onChange={(e) => setRebootReason(e.target.value)}
                placeholder="e.g. Scheduled maintenance, firmware reload..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRebootModal(false);
                  setRebootReason('');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy !== null}
                onClick={() =>
                  handleRequestOperation('REBOOT', {
                    confirmed: true,
                    reason: rebootReason.trim() || 'Admin-requested controlled reboot',
                  })
                }
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {actionBusy === 'REBOOT' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Queuing Reboot...</span>
                  </>
                ) : (
                  <>
                    <Power className="w-3.5 h-3.5" />
                    <span>Confirm Reboot</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
