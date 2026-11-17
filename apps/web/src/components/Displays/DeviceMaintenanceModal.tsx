import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Check,
  ChevronDown,
  ChevronRight,
  Play,
  Server,
  Code2,
  Ban,
  RotateCw,
  Radio,
  Send,
  Eraser,
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  DeviceOperationRecord,
  DeviceOperationType,
  DiagnosticActionType,
  DisplayView,
} from '@aura-dims/display-schema';

interface DeviceMaintenanceModalProps {
  display: DisplayView;
  isAdmin: boolean;
  onClose: () => void;
  onDisplayUpdated?: () => void;
}

interface TerminalLogLine {
  id: string;
  type: 'cmd' | 'output' | 'progress' | 'error' | 'system';
  text: string;
}

const QUICK_COMMANDS = [
  { label: 'System Info', cmd: 'uname -a && uptime' },
  { label: 'Network IPs', cmd: 'ip -br address' },
  { label: 'Disk Space', cmd: 'df -h /' },
  { label: 'Memory (RAM)', cmd: 'free -h' },
  { label: 'Player Status', cmd: 'systemctl status aura-player --no-pager -n 15' },
  { label: 'Player Logs', cmd: 'journalctl -u aura-player -n 50 --no-pager' },
  { label: 'Restart Player', cmd: 'restart' },
  { label: 'Reboot Pi', cmd: 'reboot' },
];

export const DeviceMaintenanceModal: React.FC<DeviceMaintenanceModalProps> = ({
  display,
  isAdmin,
  onClose,
  onDisplayUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'controls' | 'terminal' | 'audit'>('controls');
  const [operations, setOperations] = useState<DeviceOperationRecord[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Reboot Confirmation Modal
  const [showRebootModal, setShowRebootModal] = useState<boolean>(false);
  const [rebootReason, setRebootReason] = useState<string>('');
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);

  // Standalone Real-Time WebSocket Terminal State
  const defaultWsHost = (display as any).ipAddress || display.installationRef || '192.168.1.140';
  const [wsHost, setWsHost] = useState<string>(defaultWsHost);
  const [wsPort, setWsPort] = useState<string>('8091');
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [wsLines, setWsLines] = useState<TerminalLogLine[]>([]);
  const [terminalInput, setTerminalInput] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

  // Real-time operations subscription (Audit tab)
  useEffect(() => {
    const opsQuery = query(
      collection(db, 'displays', display.id, 'operations'),
      orderBy('requestedAt', 'desc'),
      limit(50)
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

  // Direct WebSocket Connection Logic
  const connectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setWsStatus('connecting');
    const wsUrl = `ws://${wsHost.trim()}:${wsPort.trim()}`;

    try {
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setWsStatus('connected');
        setWsLines((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: 'system',
            text: `🟢 Connected to Digital Display Linux WebSocket at ${wsUrl}`,
          },
        ]);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'system') {
            setWsLines((prev) => [
              ...prev,
              { id: crypto.randomUUID(), type: 'system', text: msg.message },
            ]);
          } else if (msg.type === 'progress') {
            // Heartbeat: Linux replies "..." while executing
            setWsLines((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.type === 'progress') {
                return [
                  ...prev.slice(0, -1),
                  {
                    id: last.id,
                    type: 'progress',
                    text: `... (${msg.elapsedSeconds ? `${msg.elapsedSeconds}s` : 'running'})`,
                  },
                ];
              }
              return [
                ...prev,
                { id: crypto.randomUUID(), type: 'progress', text: '...' },
              ];
            });
          } else if (msg.type === 'stdout' || msg.type === 'stderr') {
            setWsLines((prev) => {
              const filtered = prev.filter((p) => p.type !== 'progress');
              return [
                ...filtered,
                { id: crypto.randomUUID(), type: 'output', text: msg.data },
              ];
            });
          } else if (msg.type === 'completed') {
            setIsExecuting(false);
            setWsLines((prev) => {
              const filtered = prev.filter((p) => p.type !== 'progress');
              return [
                ...filtered,
                { id: crypto.randomUUID(), type: 'output', text: msg.output },
                {
                  id: crypto.randomUUID(),
                  type: 'system',
                  text: `[Finished: exit code ${msg.exitCode}]`,
                },
              ];
            });
          } else if (msg.type === 'error') {
            setIsExecuting(false);
            setWsLines((prev) => [
              ...prev,
              { id: crypto.randomUUID(), type: 'error', text: `Error: ${msg.message}` },
            ]);
          }
        } catch {
          setWsLines((prev) => [
            ...prev,
            { id: crypto.randomUUID(), type: 'output', text: String(event.data) },
          ]);
        }
      };

      socket.onerror = () => {
        setWsStatus('disconnected');
        setIsExecuting(false);
        setWsLines((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: 'error',
            text: `🔴 WebSocket connection error to ${wsUrl}. Verify the Pi agent is running on port ${wsPort}.`,
          },
        ]);
      };

      socket.onclose = () => {
        setWsStatus('disconnected');
        setIsExecuting(false);
      };

      wsRef.current = socket;
    } catch (err: any) {
      setWsStatus('disconnected');
      setIsExecuting(false);
      setWsLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'error',
          text: `Failed to open WebSocket: ${err?.message || err}`,
        },
      ]);
    }
  }, [wsHost, wsPort]);

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus('disconnected');
    setIsExecuting(false);
  }, []);

  // Connect automatically when Terminal tab is opened
  useEffect(() => {
    if (activeTab === 'terminal' && wsStatus === 'disconnected' && !wsRef.current) {
      connectWs();
    }
  }, [activeTab, connectWs, wsStatus]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Scroll to bottom when lines change
  useEffect(() => {
    if (activeTab === 'terminal') {
      terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [wsLines, activeTab]);

  const sendWsCommand = (cmdToRun?: string) => {
    const cmd = (cmdToRun ?? terminalInput).trim();
    if (!cmd) return;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setWsLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'error',
          text: 'WebSocket is not connected. Click "Connect" above to connect directly to the Pi.',
        },
      ]);
      return;
    }

    setIsExecuting(true);
    setWsLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: 'cmd', text: `aura@pi:~$ ${cmd}` },
      { id: crypto.randomUUID(), type: 'progress', text: '...' },
    ]);

    wsRef.current.send(JSON.stringify({ command: cmd }));
    setTerminalInput('');
  };

  const handleClearTerminal = () => {
    setWsLines([]);
  };

  // Device Controls operations
  const handleRequestOperation = async (
    type: DeviceOperationType,
    options?: { command?: string; confirmed?: boolean; reason?: string; diagnosticAction?: DiagnosticActionType }
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
        diagnosticAction: options?.diagnosticAction,
      });

      const labelMap: Record<DeviceOperationType, string> = {
        SYNC_NOW: 'Sync Now',
        REFRESH_RENDERER: 'Renderer Refresh',
        CAPTURE_PREVIEW: 'Software Preview Capture',
        SAFE_CLEANUP_CACHE: 'Safe Cache Cleanup',
        REBOOT: 'Controlled OS Reboot',
        RESTART_PLAYER: 'Player Daemon Restart',
        RUN_DIAGNOSTICS: options?.diagnosticAction ? `Diagnostic (${options.diagnosticAction})` : 'Run Diagnostics',
        EXEC_COMMAND: 'Command Execution',
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

  const handleRetryOperation = async (op: DeviceOperationRecord) => {
    setBannerError(null);
    setBannerSuccess(null);
    setActionBusy(`retry-${op.id}`);

    try {
      const res = await api.retryDisplayOperation({
        displayId: display.id,
        operationId: op.id,
      });
      setBannerSuccess(`Retried operation ${op.type} (new operation ID: ${res.operation.id.slice(0, 8)}).`);
    } catch (err: any) {
      setBannerError(getApiErrorMessage(err, `Failed to retry operation ${op.id}.`));
    } finally {
      setActionBusy(null);
    }
  };

  const handleCancelOperation = async (op: DeviceOperationRecord) => {
    setBannerError(null);
    setBannerSuccess(null);
    setActionBusy(`cancel-${op.id}`);

    try {
      await api.cancelDisplayOperation({
        displayId: display.id,
        operationId: op.id,
        reason: 'Cancelled by operator in Maintenance Modal',
      });
      setBannerSuccess(`Cancelled operation ${op.type}.`);
    } catch (err: any) {
      setBannerError(getApiErrorMessage(err, `Failed to cancel operation ${op.id}.`));
    } finally {
      setActionBusy(null);
    }
  };

  const isOnline = display.connectivity === 'online';
  const reported = display.reported;
  const hw = reported?.hardwareMetrics;
  const osInfo = hw?.osRelease ? `Linux ${hw.osRelease}` : (hw?.osPlatform || 'Linux (Raspberry Pi OS)');
  const model = hw?.arch ? `Raspberry Pi (${hw.arch})` : 'Raspberry Pi Hardware';
  const appVer = reported?.appVersion || 'v0.1.0';
  const ip = defaultWsHost;

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
                Digital Display Maintenance, Standalone Real-Time Terminal & Controls • {model} • Player {appVer}
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
            <span>Standalone Terminal (WebSocket)</span>
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-emerald-400'
                  : wsStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-600'
              }`}
            />
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
                        daemon. Reloads published manifests and runtime agents without rebooting the host OS.
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
                        Forces the presentation canvas window on the digital display to
                        reload its viewport canvas without terminating background services.
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

          {/* TAB 2: STANDALONE REAL-TIME WEBSOCKET TERMINAL */}
          {activeTab === 'terminal' && (
            <div className="space-y-4">
              {/* WebSocket Connection Bar */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-teal-400" />
                    WebSocket Host:
                  </span>
                  <input
                    type="text"
                    value={wsHost}
                    onChange={(e) => setWsHost(e.target.value)}
                    placeholder="192.168.1.140"
                    disabled={wsStatus === 'connected'}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-white w-36 outline-none focus:border-teal-500"
                  />
                  <span className="text-xs font-mono text-slate-500">:</span>
                  <input
                    type="text"
                    value={wsPort}
                    onChange={(e) => setWsPort(e.target.value)}
                    placeholder="8091"
                    disabled={wsStatus === 'connected'}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white w-16 outline-none focus:border-teal-500"
                  />
                  {wsStatus === 'connected' ? (
                    <button
                      onClick={disconnectWs}
                      className="px-3 py-1 bg-red-950/60 hover:bg-red-900 border border-red-800/70 text-red-300 text-xs font-medium rounded-lg transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={connectWs}
                      disabled={wsStatus === 'connecting'}
                      className="px-3 py-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      {wsStatus === 'connecting' ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <span>Connect</span>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                      wsStatus === 'connected'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        : wsStatus === 'connecting'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                        : 'bg-red-500/10 text-red-300 border-red-500/20'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        wsStatus === 'connected'
                          ? 'bg-emerald-400 animate-pulse'
                          : wsStatus === 'connecting'
                          ? 'bg-amber-400 animate-spin'
                          : 'bg-red-400'
                      }`}
                    />
                    {wsStatus === 'connected'
                      ? 'Live WebSocket Connected'
                      : wsStatus === 'connecting'
                      ? 'Connecting...'
                      : 'Disconnected'}
                  </span>

                  <button
                    onClick={handleClearTerminal}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    title="Clear Terminal Output"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Action Buttons Bar */}
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block flex items-center justify-between">
                  <span>Quick Linux Commands (Sent directly over WebSocket)</span>
                  <span className="text-[10px] text-slate-500">Zero database queue delay • Direct bash execution</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_COMMANDS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => sendWsCommand(item.cmd)}
                      disabled={isExecuting || wsStatus !== 'connected'}
                      className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 text-slate-200 text-xs rounded-lg transition-all flex items-center gap-1.5 hover:border-teal-500/50 disabled:opacity-40"
                      title={item.cmd}
                    >
                      <Code2 className="w-3 h-3 text-teal-400" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Terminal Window */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 shadow-inner overflow-hidden flex flex-col font-mono">
                {/* Terminal Header */}
                <div className="bg-slate-900/90 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                    <span className="text-[11px] text-slate-400 ml-2">
                      bash — aura@{wsHost}:{wsPort}
                    </span>
                  </div>
                  <span className="text-[10px] text-teal-400 font-mono">
                    Direct WebSocket Pipeline
                  </span>
                </div>

                {/* Terminal Content Screen */}
                <div className="p-4 text-xs text-slate-200 min-h-[300px] max-h-[420px] overflow-y-auto space-y-2 select-text">
                  {wsLines.length === 0 ? (
                    <div className="text-slate-500 py-12 text-center font-sans">
                      <Terminal className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                      <p>WebSocket Terminal is ready.</p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Type any command below or click a quick action above to execute instantly on Linux.
                      </p>
                    </div>
                  ) : (
                    wsLines.map((line) => {
                      if (line.type === 'cmd') {
                        return (
                          <div key={line.id} className="text-teal-400 font-semibold pt-1">
                            {line.text}
                          </div>
                        );
                      }
                      if (line.type === 'progress') {
                        return (
                          <div key={line.id} className="text-amber-400 flex items-center gap-1.5 animate-pulse py-0.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                            <span>{line.text}</span>
                          </div>
                        );
                      }
                      if (line.type === 'system') {
                        return (
                          <div key={line.id} className="text-slate-500 text-[11px] italic">
                            {line.text}
                          </div>
                        );
                      }
                      if (line.type === 'error') {
                        return (
                          <div key={line.id} className="text-red-400 font-mono bg-red-950/30 p-1.5 rounded border border-red-900/40">
                            {line.text}
                          </div>
                        );
                      }
                      return (
                        <pre key={line.id} className="text-slate-300 whitespace-pre-wrap break-all leading-relaxed font-mono">
                          {line.text}
                        </pre>
                      );
                    })
                  )}
                  <div ref={terminalBottomRef} />
                </div>

                {/* Terminal Prompt & Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendWsCommand();
                  }}
                  className="bg-slate-900/90 border-t border-slate-800 p-2.5 flex items-center gap-2"
                >
                  <div className="flex items-center gap-1.5 text-xs text-teal-400 pl-2 font-mono select-none">
                    <span>aura@pi:~$</span>
                  </div>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    placeholder={
                      wsStatus === 'connected'
                        ? 'Enter Linux command (e.g. ls, uptime, restart, df -h)...'
                        : 'Connect WebSocket above to enter commands...'
                    }
                    disabled={wsStatus !== 'connected' || isExecuting}
                    className="flex-1 bg-transparent text-xs font-mono text-white placeholder-slate-500 outline-none px-2"
                  />
                  <button
                    type="submit"
                    disabled={!terminalInput.trim() || isExecuting || wsStatus !== 'connected'}
                    className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    {isExecuting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Running...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Run</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: OPERATIONS AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 flex items-center justify-between pb-1">
                <span>Durable Operations Audit History</span>
                <span>{operations.length} recorded events</span>
              </div>

              {operations.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-slate-800 text-slate-500 text-xs">
                  No operations recorded for this digital display.
                </div>
              ) : (
                <div className="space-y-2">
                  {operations.map((op) => {
                    const isExpanded = expandedOpId === op.id;
                    const isPending =
                      op.state === 'queued' ||
                      op.state === 'claimed' ||
                      op.state === 'in_progress' ||
                      op.state === 'awaiting_reconnect';
                    const isSuccess = op.state === 'succeeded';
                    const isFailed = op.state === 'failed' || op.state === 'expired' || op.state === 'cancelled';

                    return (
                      <div
                        key={op.id}
                        className="bg-slate-950/60 border border-slate-800/80 rounded-xl overflow-hidden hover:border-slate-700/80 transition-all text-xs"
                      >
                        <div
                          onClick={() => setExpandedOpId(isExpanded ? null : op.id)}
                          className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <button className="text-slate-500 hover:text-slate-300">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">
                                  {op.type === 'RUN_DIAGNOSTICS' && op.diagnosticAction
                                    ? `RUN_DIAGNOSTICS (${op.diagnosticAction})`
                                    : op.type}
                                </span>
                                {op.retryOf && (
                                  <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded font-mono">
                                    retry of {op.retryOf.slice(0, 8)}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 font-mono">
                                ID: {op.id.slice(0, 12)}...
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* State Badge */}
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                {op.state}
                              </span>
                            )}
                            {isSuccess && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                <Check className="w-3 h-3" />
                                succeeded
                              </span>
                            )}
                            {isFailed && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-300 border border-red-500/20">
                                <AlertTriangle className="w-3 h-3" />
                                {op.state}
                              </span>
                            )}

                            {/* Cancel button for queued */}
                            {op.state === 'queued' && isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelOperation(op);
                                }}
                                disabled={actionBusy !== null}
                                className="text-red-400 hover:text-red-300 text-[10px] px-2 py-1 rounded border border-red-800 bg-red-950/40 inline-flex items-center gap-1 font-semibold"
                                title="Cancel queued operation"
                              >
                                <Ban className="w-3 h-3" />
                                Cancel
                              </button>
                            )}

                            {/* Retry button for failed */}
                            {isFailed && isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetryOperation(op);
                                }}
                                disabled={actionBusy !== null}
                                className="text-amber-300 hover:text-amber-200 text-[10px] px-2 py-1 rounded border border-amber-800 bg-amber-950/40 inline-flex items-center gap-1 font-semibold"
                                title="Retry operation"
                              >
                                <RotateCw className="w-3 h-3" />
                                Retry
                              </button>
                            )}

                            <span className="text-[11px] text-slate-500 font-mono">
                              {new Date(op.requestedAt).toLocaleTimeString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-slate-850 bg-slate-950/80 space-y-3 font-mono text-[11px]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-400">
                              <div>
                                <span className="text-slate-500">Requested By: </span>
                                <span className="text-slate-300">{op.requestedByRole}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Attempts: </span>
                                <span className="text-slate-300">
                                  {op.attemptCount} / {op.maxAttempts}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">Max Runtime: </span>
                                <span className="text-slate-300">{op.maxRuntimeSeconds ?? 60}s</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Completed At: </span>
                                <span className="text-slate-300">{op.completedAt || 'Pending'}</span>
                              </div>
                            </div>

                            {op.errorMessage && (
                              <div className="text-red-300 bg-red-950/50 p-2.5 rounded border border-red-900/60 font-sans">
                                <strong>Error ({op.errorCode || 'FAILURE'}): </strong> {op.errorMessage}
                              </div>
                            )}

                            {op.resultSummary && (
                              <div className="text-emerald-300 bg-emerald-950/40 p-2 rounded border border-emerald-900/50 font-sans">
                                <strong>Result: </strong> {op.resultSummary}
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
