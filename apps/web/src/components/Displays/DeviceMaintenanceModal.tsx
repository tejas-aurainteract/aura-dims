import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  RefreshCw,
  Power,
  RotateCcw,
  Camera,
  Activity,
  Clock,
  HardDrive,
  Cpu,
  Wifi,
  WifiOff,
  Radio,
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronRight,
  Play,
  Server,
  Code2,
  Ban,
  RotateCw,
  Send,
  Eraser,
  Eye,
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

const QUICK_COMMANDS = [
  { label: 'System Info', cmd: 'sudo uname -a && sudo uptime' },
  { label: 'Network IPs', cmd: 'sudo ip -br address' },
  { label: 'Wi-Fi Status', cmd: 'sudo nmcli -t -f active,ssid,signal dev wifi && sudo ip -br addr' },
  { label: 'Saved Wi-Fi Profiles', cmd: 'sudo nmcli -t -f NAME,TYPE,UUID connection show | grep -E "wireless|wifi"' },
  { label: 'Scan Wi-Fi', cmd: 'sudo nmcli dev wifi list' },
  {
    label: 'Clear Wi-Fi Profiles',
    cmd: `for id in $(sudo nmcli -t -f UUID,TYPE con show | awk -F: '$2 ~ /wireless|wifi/ {print $1}'); do sudo nmcli con delete "$id"; done; sudo nmcli con reload; REMAINING=$(sudo nmcli -t -f TYPE con show | grep -c -E 'wireless|wifi'); echo "Wi-Fi profiles cleared. Remaining wireless profiles: $REMAINING"`,
  },
  {
    label: 'Switch to AP Mode',
    cmd: `sudo nmcli connection delete "Aura-AP" 2>/dev/null; MAC_TAIL=$(cat /sys/class/net/wlan0/address 2>/dev/null | tr -d ':\\n\\r ' | tail -c 4 | tr '[:lower:]' '[:upper:]'); SSID="Aura-\${MAC_TAIL:-WIFI}"; sudo nmcli dev wifi hotspot ifname wlan0 ssid "$SSID" password "12345678" con-name "Aura-AP" && echo "Digital display switched to AP Mode ($SSID)"`,
  },
  { label: 'Disk Space', cmd: 'sudo df -h /' },
  { label: 'Memory (RAM)', cmd: 'sudo free -h' },
  { label: 'Player Status', cmd: 'sudo systemctl status aura-player --no-pager -n 15' },
  { label: 'Player Logs', cmd: 'sudo journalctl -u aura-player -n 50 --no-pager' },
  { label: 'Restart Player', cmd: 'sudo systemctl restart aura-player' },
  { label: 'Reboot Pi', cmd: 'sudo systemctl reboot' },
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

  // Wi-Fi Onboarding & AP Confirmation Modals
  const [showClearWifiModal, setShowClearWifiModal] = useState<boolean>(false);
  const [showSwitchApModal, setShowSwitchApModal] = useState<boolean>(false);

  // Real-Time Cloud Terminal State (Cleared timestamp persisted per display)
  const [terminalInput, setTerminalInput] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [terminalClearedAt, setTerminalClearedAt] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`aura_dims_terminal_cleared_${display.id}`);
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

  // Live Digital Display Preview State (Ephemeral In-Memory - Never permanently stored)
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [isCapturingPreview, setIsCapturingPreview] = useState<boolean>(false);
  const [previewCapturedAt, setPreviewCapturedAt] = useState<string | null>(null);
  const [previewDimensions, setPreviewDimensions] = useState<{ width: number | null; height: number | null } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isEnlarged, setIsEnlarged] = useState<boolean>(false);
  const operationsRef = useRef<DeviceOperationRecord[]>([]);

  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  // Clean up in-memory blob URL on unmount or URL change
  useEffect(() => {
    return () => {
      if (livePreviewUrl && livePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(livePreviewUrl);
      }
    };
  }, [livePreviewUrl]);

  // Real-time operations subscription (Audit & Terminal tabs)
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
        const now = Date.now();
        const hasRunning = ops.some(
          (o) =>
            (o.state === 'queued' || o.state === 'claimed' || o.state === 'in_progress') &&
            now - new Date(o.requestedAt).getTime() < 30 * 1000
        );
        setIsExecuting(hasRunning);
      },
      (err) => {
        console.warn('[DeviceMaintenanceModal] Operations snapshot warning:', err);
      }
    );

    return () => unsubscribe();
  }, [display.id]);

  // Scroll to bottom when operations update
  useEffect(() => {
    if (activeTab === 'terminal') {
      terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [operations, activeTab]);

  const handleCaptureLivePreview = async () => {
    setPreviewError(null);
    setIsCapturingPreview(true);
    setBannerError(null);

    // Clean up previous blob URL if exists
    if (livePreviewUrl && livePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(livePreviewUrl);
      setLivePreviewUrl(null);
    }

    try {
      const res = await api.requestDisplayOperation({
        displayId: display.id,
        type: 'CAPTURE_PREVIEW',
      });

      const targetOpId = res.operation.id;
      const startTime = Date.now();
      const timeoutMs = 30000;

      const pollForCompletion = async (): Promise<void> => {
        if (Date.now() - startTime > timeoutMs) {
          throw new Error('Timed out waiting for digital display preview capture response.');
        }

        const currentOps = operationsRef.current;
        const matchingOp = currentOps.find((o) => o.id === targetOpId);

        if (matchingOp?.state === 'failed') {
          throw new Error(matchingOp.errorMessage || 'Digital display failed to capture preview.');
        }

        if (matchingOp?.state === 'succeeded') {
          // Fetch preview URL from backend
          const urlRes = await api.getDisplayPreviewUrl({ displayId: display.id });

          try {
            // Fetch bytes into client memory blob so the image is held only in browser RAM
            const imgRes = await fetch(urlRes.url);
            const blob = await imgRes.blob();
            const memoryUrl = URL.createObjectURL(blob);
            setLivePreviewUrl(memoryUrl);
          } catch {
            // Fallback directly to URL if fetch has any local network issue
            setLivePreviewUrl(urlRes.url);
          }

          setPreviewCapturedAt(urlRes.preview?.capturedAt || new Date().toISOString());
          setPreviewDimensions({
            width: urlRes.preview?.width || null,
            height: urlRes.preview?.height || null,
          });

          // Discard image from Cloud Storage and clear lastPreview from database immediately
          try {
            await api.discardDisplayPreview({ displayId: display.id });
          } catch (discardErr) {
            console.warn('[DeviceMaintenanceModal] Failed to discard storage preview:', discardErr);
          }

          setIsCapturingPreview(false);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        return pollForCompletion();
      };

      await pollForCompletion();
    } catch (err: any) {
      setPreviewError(err?.message || 'Failed to capture live preview from digital display.');
      setIsCapturingPreview(false);
    }
  };

  const handleClearLivePreview = () => {
    if (livePreviewUrl && livePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(livePreviewUrl);
    }
    setLivePreviewUrl(null);
    setPreviewCapturedAt(null);
    setPreviewDimensions(null);
    setPreviewError(null);
    setIsEnlarged(false);
  };

  const handleRunTerminalCommand = async (cmdToRun?: string) => {
    const cmd = (cmdToRun ?? terminalInput).trim();
    if (!cmd) return;

    setBannerError(null);
    setIsExecuting(true);
    setTerminalInput('');

    try {
      if (cmd === 'restart' || cmd === 'restart-player' || cmd === 'systemctl restart aura-player') {
        await handleRequestOperation('RESTART_PLAYER');
      } else if (cmd === 'reboot' || cmd === 'systemctl reboot') {
        await handleRequestOperation('REBOOT', { confirmed: true, reason: 'Manual remote terminal reboot' });
      } else {
        const finalCmd = cmd.startsWith('sudo ') ? cmd : `sudo ${cmd}`;
        await api.requestDisplayOperation({
          displayId: display.id,
          type: 'EXEC_COMMAND',
          command: finalCmd,
        });
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to dispatch command to digital display.');
      setIsExecuting(false);
    }
  };

  const handleConfirmClearWifi = async () => {
    setShowClearWifiModal(false);
    setActiveTab('terminal');
    await handleRunTerminalCommand(
      `for id in $(sudo nmcli -t -f UUID,TYPE con show | awk -F: '$2 ~ /wireless|wifi/ {print $1}'); do sudo nmcli con delete "$id"; done; sudo nmcli con reload; REMAINING=$(sudo nmcli -t -f TYPE con show | grep -c -E 'wireless|wifi'); echo "Wi-Fi profiles cleared. Remaining wireless profiles: $REMAINING"`
    );
  };

  const handleConfirmSwitchAp = async () => {
    setShowSwitchApModal(false);
    setActiveTab('terminal');
    await handleRunTerminalCommand(
      `sudo nmcli connection delete "Aura-AP" 2>/dev/null; MAC_TAIL=$(cat /sys/class/net/wlan0/address 2>/dev/null | tr -d ':\\n\\r ' | tail -c 4 | tr '[:lower:]' '[:upper:]'); SSID="Aura-\${MAC_TAIL:-WIFI}"; sudo nmcli dev wifi hotspot ifname wlan0 ssid "$SSID" password "12345678" con-name "Aura-AP" && echo "Digital display switched to AP Mode ($SSID)"`
    );
  };

  const handleClearTerminal = () => {
    const now = Date.now();
    try {
      localStorage.setItem(`aura_dims_terminal_cleared_${display.id}`, String(now));
    } catch (err) {
      console.warn('[DeviceMaintenanceModal] Failed to persist terminal clear timestamp:', err);
    }
    setTerminalClearedAt(now);
    setTerminalInput('');
  };

  const handleRestoreTerminalHistory = () => {
    try {
      localStorage.removeItem(`aura_dims_terminal_cleared_${display.id}`);
    } catch (err) {
      console.warn('[DeviceMaintenanceModal] Failed to remove terminal clear timestamp:', err);
    }
    setTerminalClearedAt(0);
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
        SCAN_WIFI: 'Wi-Fi Network Scan',
        CONNECT_WIFI: 'Connect to Wi-Fi',
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
  const ip = (display as any).ipAddress || display.installationRef || '192.168.1.140';

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
            <span>Terminal & Diagnostics</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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

              {/* Action Cards Grid - Core Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                {/* 2. Refresh Local Renderer */}
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

                {/* 3. Controlled Hardware Reboot */}
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
              </div>

              {/* Wi-Fi Onboarding & Local AP Mode Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Clear All Wi-Fi Profiles */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <WifiOff className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Clear All Wi-Fi Profiles</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Removes all saved wireless network credentials from the digital display. Once disconnected, the device will instantly trigger local AP fallback mode.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-rose-400/80">Requires confirmation</span>
                    <button
                      onClick={() => setShowClearWifiModal(true)}
                      disabled={!isAdmin || isExecuting}
                      className="px-3.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/70 disabled:opacity-40 text-rose-200 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <WifiOff className="w-3.5 h-3.5" />
                      <span>Clear All Profiles</span>
                    </button>
                  </div>
                </div>

                {/* 2. Switch to AP Mode */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700/80 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                      <Radio className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Switch to AP Mode</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Forces digital display into Access Point mode broadcasting <code className="text-teal-300">Aura-&lt;Last4MAC&gt;</code> (pass: <code className="text-teal-300">12345678</code>) with captive portal.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-teal-400/80">Local onboarding hotspot</span>
                    <button
                      onClick={() => setShowSwitchApModal(true)}
                      disabled={!isAdmin || isExecuting}
                      className="px-3.5 py-1.5 bg-teal-950/80 hover:bg-teal-900 border border-teal-800/70 disabled:opacity-40 text-teal-200 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Switch to AP Mode</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Digital Display Output Preview Section (Ephemeral In-Memory Only) */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">Live Digital Display Preview</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-teal-500/10 text-teal-300 border border-teal-500/20">
                          In-Memory Only • Not Stored
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Live visual capture of currently rendering content. Discarded immediately after preview without consuming cloud storage.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {livePreviewUrl && (
                      <button
                        type="button"
                        onClick={handleClearLivePreview}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
                      >
                        Clear Preview
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCaptureLivePreview}
                      disabled={isCapturingPreview || !isOnline}
                      className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      {isCapturingPreview ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Capturing Snapshot...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5" />
                          <span>{livePreviewUrl ? 'Refresh Preview' : 'Capture Live Preview'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {previewError && (
                  <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{previewError}</span>
                  </div>
                )}

                {/* Display Area */}
                {isCapturingPreview ? (
                  <div className="py-12 px-4 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                        <Camera className="w-6 h-6 animate-pulse" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-teal-400 rounded-full animate-ping" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-200">Capturing live frame from digital display...</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Requesting hardware framebuffer snapshot via remote agent.
                      </p>
                    </div>
                  </div>
                ) : livePreviewUrl ? (
                  <div className="space-y-3">
                    <div
                      className="relative rounded-lg overflow-hidden border border-slate-800 bg-black flex items-center justify-center max-h-[380px] group cursor-pointer"
                      onClick={() => setIsEnlarged(!isEnlarged)}
                      title="Click to enlarge"
                    >
                      <img
                        src={livePreviewUrl}
                        alt={`Live preview of digital display ${display.name}`}
                        className="max-h-[380px] w-auto object-contain mx-auto transition-transform"
                      />
                      <div className="absolute bottom-2 right-2 px-2.5 py-1 bg-black/80 backdrop-blur-sm rounded text-[11px] text-slate-200 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity border border-slate-700/60">
                        <Eye className="w-3.5 h-3.5 text-teal-400" />
                        <span>Click to {isEnlarged ? 'shrink' : 'enlarge'}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-teal-400" />
                        <span>
                          Captured at:{' '}
                          {previewCapturedAt
                            ? new Date(previewCapturedAt).toLocaleTimeString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              }) + ' IST'
                            : 'Just now'}
                        </span>
                        {previewDimensions?.width && (
                          <span className="text-slate-500 font-mono">
                            ({previewDimensions.width}×{previewDimensions.height})
                          </span>
                        )}
                      </div>
                      <span className="text-emerald-400/90 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Purged from Cloud Storage (In-memory ephemeral buffer)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 px-4 rounded-lg bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center space-y-2">
                    <Camera className="w-8 h-8 text-slate-600 mb-1" />
                    <p className="text-xs font-medium text-slate-300">No live preview captured yet</p>
                    <p className="text-[11px] text-slate-500 max-w-md">
                      Click "Capture Live Preview" above to inspect what this digital display is currently presenting.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: STANDALONE REAL-TIME TERMINAL & DIAGNOSTICS */}
          {activeTab === 'terminal' && (
            <div className="space-y-4">
              {/* Terminal Status Bar */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-teal-400" />
                    Target:
                  </span>
                  <span className="text-xs font-mono text-white bg-slate-900 border border-slate-700/80 px-2 py-0.5 rounded-md">
                    aura@{display.name}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    ({(display as any).ipAddress || display.installationRef || 'remote'})
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live Cloud Stream Active
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
                  <span>Quick Diagnostic & Control Commands</span>
                  <span className="text-[10px] text-slate-500">Live remote execution via persistent stream</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_COMMANDS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleRunTerminalCommand(item.cmd)}
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
                      bash — aura@{display.name || 'digital-display'}
                    </span>
                  </div>
                  <span className="text-[10px] text-teal-400 font-mono">
                    Real-Time Cloud Pipeline
                  </span>
                </div>

                {/* Terminal Content Stream */}
                <div className="p-4 text-xs text-slate-200 min-h-[300px] max-h-[440px] overflow-y-auto space-y-3 select-text">
                  {operations.filter((op) => !terminalClearedAt || new Date(op.requestedAt).getTime() > terminalClearedAt).length === 0 ? (
                    <div className="text-slate-500 py-12 text-center font-sans">
                      <Terminal className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                      <p className="text-xs font-medium text-slate-300">Remote Terminal is ready.</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                        {terminalClearedAt > 0
                          ? 'Terminal output cleared. Old command executions remain recorded in the Operations Audit Log tab.'
                          : 'Type any Linux command below or click a quick action above to execute on the digital display.'}
                      </p>
                      {terminalClearedAt > 0 && (
                        <button
                          type="button"
                          onClick={handleRestoreTerminalHistory}
                          className="mt-3.5 inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-mono transition-colors border border-teal-500/20 px-3 py-1 rounded-md bg-teal-500/5 hover:bg-teal-500/10"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore Prior Execution History</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    operations
                      .filter((op) => !terminalClearedAt || new Date(op.requestedAt).getTime() > terminalClearedAt)
                      .slice(0, 25)
                      .reverse()
                      .map((op) => (
                        <div key={op.id} className="space-y-1.5 border-b border-slate-900 pb-2.5 last:border-0">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-teal-400 font-semibold font-mono">
                              aura@display:~$ {op.command || op.diagnosticAction || op.type}
                            </span>
                            <span className="text-slate-500 text-[10px]">
                              {new Date(op.requestedAt).toLocaleTimeString()}
                            </span>
                          </div>

                          {/* State rendering */}
                          {op.state === 'queued' && (
                            <div className="text-amber-400 flex items-center gap-1.5 text-xs py-0.5">
                              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                              <span>... (sent to digital display)</span>
                            </div>
                          )}

                          {(op.state === 'claimed' || op.state === 'in_progress' || op.state === 'awaiting_reconnect') && (
                            <div className="text-amber-300 flex items-center gap-1.5 text-xs py-0.5 animate-pulse">
                              <span className="inline-block w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                              <span>... (executing on Linux)</span>
                            </div>
                          )}

                          {op.output && (
                            <pre className="text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 whitespace-pre-wrap break-all leading-relaxed font-mono text-[11px] max-h-60 overflow-y-auto">
                              {op.output}
                            </pre>
                          )}

                          {op.state === 'succeeded' && (
                            <div className="text-emerald-400 text-[11px] font-mono flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>[Finished: exit code {op.exitCode ?? 0}]</span>
                            </div>
                          )}

                          {(op.state === 'failed' || op.state === 'expired') && (
                            <div className="text-red-400 font-mono bg-red-950/30 p-2 rounded-lg border border-red-900/40 text-[11px] flex items-start gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">[Failed: exit {op.exitCode ?? 1}]</span>{' '}
                                <span>{op.errorMessage || op.resultSummary || 'Operation failed'}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                  )}
                  <div ref={terminalBottomRef} />
                </div>

                {/* Terminal Prompt & Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRunTerminalCommand();
                  }}
                  className="bg-slate-900/90 border-t border-slate-800 p-2.5 flex items-center gap-2"
                >
                  <div className="flex items-center gap-1.5 text-xs text-teal-400 pl-2 font-mono select-none">
                    <span>aura@display:~$</span>
                  </div>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    placeholder="Enter Linux command (e.g. uname -a, ip -br a, df -h, systemctl status aura-player)..."
                    className="flex-1 bg-transparent text-xs font-mono text-white placeholder-slate-500 outline-none px-2"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearTerminal}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs rounded-lg transition-all flex items-center gap-1.5 border border-slate-700 shadow-sm"
                      title="Clear Terminal Output (persists across visits)"
                    >
                      <Eraser className="w-3.5 h-3.5 text-slate-400" />
                      <span>Clear Terminal</span>
                    </button>
                    <button
                      type="submit"
                      disabled={!terminalInput.trim()}
                      className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      {isExecuting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Run</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Run</span>
                        </>
                      )}
                    </button>
                  </div>
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

      {/* Clear All Wi-Fi Profiles Confirmation Modal */}
      {showClearWifiModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-rose-900/60 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <WifiOff className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Clear All Wi-Fi Profiles</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete all saved wireless network credentials from digital display{' '}
              <strong className="text-white font-semibold">{display.name}</strong>?
            </p>
            <div className="bg-rose-950/30 border border-rose-900/40 rounded-lg p-3 text-[11px] text-rose-300/90 leading-relaxed">
              <strong>Notice:</strong> If the digital display is connected over Wi-Fi, it will disconnect and immediately transition into Access Point (hotspot) mode with captive portal for new onboarding.
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearWifiModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isExecuting}
                onClick={handleConfirmClearWifi}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>Confirm Clear All Profiles</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch to AP Mode Confirmation Modal */}
      {showSwitchApModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-teal-900/60 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-teal-400">
              <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20">
                <Radio className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Switch to AP Mode</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Activate local onboarding Access Point mode on digital display{' '}
              <strong className="text-white font-semibold">{display.name}</strong>?
            </p>
            <div className="bg-teal-950/30 border border-teal-900/40 rounded-lg p-3 text-[11px] text-teal-300/90 leading-relaxed space-y-1">
              <div>• <strong>Hotspot SSID:</strong> <code className="text-teal-200">Aura-&lt;Last4MAC&gt;</code></div>
              <div>• <strong>Hotspot Password:</strong> <code className="text-teal-200">12345678</code></div>
              <div>• <strong>Captive Portal:</strong> Automatically directs connected phones/laptops to local setup page.</div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSwitchApModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isExecuting}
                onClick={handleConfirmSwitchAp}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Confirm Switch to AP Mode</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Live Digital Display Preview Modal */}
      {isEnlarged && livePreviewUrl && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
          onClick={() => setIsEnlarged(false)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Camera className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-semibold text-white">
                  Live Digital Display Preview • {display.name}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {previewCapturedAt ? new Date(previewCapturedAt).toLocaleTimeString() : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsEnlarged(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Close Enlarged View"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center overflow-auto max-h-[calc(90vh-100px)]">
              <img
                src={livePreviewUrl}
                alt={`Full live preview of digital display ${display.name}`}
                className="max-h-[calc(90vh-120px)] w-auto object-contain mx-auto"
              />
            </div>
            <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
              <span className="text-emerald-400/90 flex items-center gap-1.5 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                In-memory visual buffer • Purged from cloud storage
              </span>
              <button
                type="button"
                onClick={() => setIsEnlarged(false)}
                className="px-3.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
