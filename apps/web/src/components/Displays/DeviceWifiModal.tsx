/**
 * Aura DIMS - Remote Wi-Fi Network Management Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - Remote Wi-Fi scanning on the digital display using background terminal execution (EXEC_COMMAND)
 * - Interactive list of in-range Wi-Fi networks with signal strength & security status
 * - Priority-based remote connection (autoconnect-priority 100) via nmcli
 * - Manual SSID connection for hidden networks
 * - Real-time progress observation via Firestore operations collection
 *
 * Terminology rule: Always use "digital display" in user-facing copy and logs.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  RefreshCw,
  Lock,
  Unlock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Radio,
  Plus,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  DisplayView,
  DeviceOperationRecord,
  WifiScannedNetwork,
} from '@aura-dims/display-schema';
import { parseNmcliWifiList } from '@aura-dims/display-schema';

interface DeviceWifiModalProps {
  display: DisplayView;
  onClose: () => void;
  onDisplayUpdated?: () => void;
}

export const DeviceWifiModal: React.FC<DeviceWifiModalProps> = ({
  display,
  onClose,
  onDisplayUpdated,
}) => {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [networks, setNetworks] = useState<WifiScannedNetwork[]>([]);
  const [selectedSsid, setSelectedSsid] = useState<string | null>(null);
  const [selectedSecurity, setSelectedSecurity] = useState<string>('wpa2');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Manual/Hidden SSID mode
  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const [manualSsid, setManualSsid] = useState<string>('');
  const [manualSecurity, setManualSecurity] = useState<'open' | 'wpa2' | 'wpa3'>('wpa2');

  // Connection In-Flight State
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectBanner, setConnectBanner] = useState<{
    type: 'loading' | 'success' | 'error';
    message: string;
  } | null>(null);

  const activeOpUnsubRef = useRef<(() => void) | null>(null);

  // Clean up snapshot listeners on unmount
  useEffect(() => {
    return () => {
      if (activeOpUnsubRef.current) {
        activeOpUnsubRef.current();
      }
    };
  }, []);

  // Auto-scan on initial modal mount
  useEffect(() => {
    handleScanWifi();
  }, [display.id]);

  const handleScanWifi = async () => {
    setScanError(null);
    setIsScanning(true);
    setConnectBanner(null);

    // Uses the background terminal execution (EXEC_COMMAND) which works on every player version
    const scanCommand =
      'nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY dev wifi list --rescan yes 2>/dev/null || nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY dev wifi list';

    try {
      const res = await api.requestDisplayOperation({
        displayId: display.id,
        type: 'EXEC_COMMAND',
        command: scanCommand,
        reason: 'Operator requested remote Wi-Fi network scan from web dashboard.',
      });

      const opId = res.operation.id;

      // Subscribe to this specific operation doc in real-time
      if (activeOpUnsubRef.current) activeOpUnsubRef.current();

      const opDocRef = doc(db, 'displays', display.id, 'operations', opId);
      activeOpUnsubRef.current = onSnapshot(opDocRef, (snap) => {
        if (!snap.exists()) return;
        const op = snap.data() as DeviceOperationRecord;

        if (op.state === 'succeeded') {
          setIsScanning(false);
          if (op.wifiNetworks && Array.isArray(op.wifiNetworks) && op.wifiNetworks.length > 0) {
            setNetworks(op.wifiNetworks);
          } else if (op.output) {
            const parsed = parseNmcliWifiList(op.output);
            setNetworks(parsed);
            if (parsed.length === 0) {
              setScanError(
                op.output.includes('Error')
                  ? op.output
                  : 'No Wi-Fi networks discovered in range.'
              );
            }
          }
          if (activeOpUnsubRef.current) {
            activeOpUnsubRef.current();
            activeOpUnsubRef.current = null;
          }
        } else if (op.state === 'failed' || op.state === 'expired' || op.state === 'cancelled') {
          setIsScanning(false);
          setScanError(op.errorMessage || op.output || 'Wi-Fi scan failed on digital display.');
          if (activeOpUnsubRef.current) {
            activeOpUnsubRef.current();
            activeOpUnsubRef.current = null;
          }
        }
      });
    } catch (err) {
      setIsScanning(false);
      setScanError(getApiErrorMessage(err));
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSsid = isManualMode ? manualSsid.trim() : selectedSsid?.trim();
    if (!targetSsid) return;

    setIsConnecting(true);
    setConnectBanner({
      type: 'loading',
      message: `Connecting digital display to "${targetSsid}" in background...`,
    });

    try {
      const escapedSsid = targetSsid.replace(/"/g, '\\"');
      let connectCmd = '';
      if (isManualMode && manualSecurity === 'open') {
        connectCmd = `nmcli dev wifi connect "${escapedSsid}" hidden yes && nmcli connection modify "${escapedSsid}" connection.autoconnect-priority 100`;
      } else if (isManualMode) {
        const escapedPassword = password.replace(/"/g, '\\"');
        connectCmd = `nmcli dev wifi connect "${escapedSsid}" hidden yes password "${escapedPassword}" && nmcli connection modify "${escapedSsid}" connection.autoconnect-priority 100`;
      } else if (selectedSecurity === 'open' || !password) {
        connectCmd = `nmcli dev wifi connect "${escapedSsid}" && nmcli connection modify "${escapedSsid}" connection.autoconnect-priority 100`;
      } else {
        const escapedPassword = password.replace(/"/g, '\\"');
        connectCmd = `nmcli dev wifi connect "${escapedSsid}" password "${escapedPassword}" && nmcli connection modify "${escapedSsid}" connection.autoconnect-priority 100`;
      }

      const res = await api.requestDisplayOperation({
        displayId: display.id,
        type: 'EXEC_COMMAND',
        command: connectCmd,
        reason: `Remote Wi-Fi connection to "${targetSsid}" requested from web dashboard.`,
      });

      const opId = res.operation.id;

      // Subscribe in real-time to track completion
      if (activeOpUnsubRef.current) activeOpUnsubRef.current();

      const opDocRef = doc(db, 'displays', display.id, 'operations', opId);
      activeOpUnsubRef.current = onSnapshot(opDocRef, (snap) => {
        if (!snap.exists()) return;
        const op = snap.data() as DeviceOperationRecord;

        if (op.state === 'succeeded') {
          setIsConnecting(false);
          setConnectBanner({
            type: 'success',
            message:
              op.resultSummary ||
              op.output ||
              `Digital display successfully connected to "${targetSsid}".`,
          });
          setPassword('');
          setSelectedSsid(null);
          onDisplayUpdated?.();
          // Trigger a re-scan after successful connect to update the 'inUse' current badge!
          setTimeout(() => {
            handleScanWifi();
          }, 2000);
          if (activeOpUnsubRef.current) {
            activeOpUnsubRef.current();
            activeOpUnsubRef.current = null;
          }
        } else if (op.state === 'failed' || op.state === 'expired' || op.state === 'cancelled') {
          setIsConnecting(false);
          const rawErr = op.errorMessage || op.output || 'Connection failed on digital display.';
          const friendlyErr =
            rawErr.includes('Secrets were required') || rawErr.includes('property is invalid')
              ? `Connection to "${targetSsid}" failed: Incorrect password or authorization failure.`
              : `Connection to "${targetSsid}" failed: ${rawErr}`;
          setConnectBanner({
            type: 'error',
            message: friendlyErr,
          });
          if (activeOpUnsubRef.current) {
            activeOpUnsubRef.current();
            activeOpUnsubRef.current = null;
          }
        }
      });
    } catch (err) {
      setIsConnecting(false);
      setConnectBanner({
        type: 'error',
        message: getApiErrorMessage(err),
      });
    }
  };

  const getSignalIcon = (signal: number) => {
    if (signal >= 75) return <SignalHigh className="w-4 h-4 text-emerald-400" />;
    if (signal >= 45) return <SignalMedium className="w-4 h-4 text-amber-400" />;
    if (signal >= 20) return <SignalLow className="w-4 h-4 text-orange-400" />;
    return <Signal className="w-4 h-4 text-rose-400" />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Digital Display Wi-Fi Network
              </h2>
              <p className="text-xs text-slate-400">
                Manage remote wireless connectivity for{' '}
                <span className="font-semibold text-cyan-300">{display.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Status / Alert Banner */}
          {connectBanner && (
            <div
              className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                connectBanner.type === 'loading'
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                  : connectBanner.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {connectBanner.type === 'loading' && (
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400 flex-shrink-0 mt-0.5" />
              )}
              {connectBanner.type === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              )}
              {connectBanner.type === 'error' && (
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 leading-relaxed">{connectBanner.message}</div>
            </div>
          )}

          {scanError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {/* Action Header: Rescan / Manual Toggle */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {isManualMode ? 'Manual Wi-Fi Network' : 'Available Nearby Wi-Fi Networks'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsManualMode(!isManualMode)}
                className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 font-medium transition-colors"
              >
                {isManualMode ? (
                  <>← Back to Scanned List</>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" /> Join Hidden Network
                  </>
                )}
              </button>
              {!isManualMode && (
                <button
                  type="button"
                  onClick={handleScanWifi}
                  disabled={isScanning || isConnecting}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Scanning...' : 'Rescan'}
                </button>
              )}
            </div>
          </div>

          {/* Network Selection List */}
          {!isManualMode ? (
            <div className="space-y-2">
              {isScanning && networks.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center gap-2 border border-slate-800/80 rounded-lg bg-slate-950/40">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <p className="text-xs text-slate-400">
                    Scanning for Wi-Fi networks in range of the digital display...
                  </p>
                </div>
              ) : networks.length === 0 ? (
                <div className="py-10 text-center border border-slate-800 rounded-lg bg-slate-950/30 text-xs text-slate-400 space-y-2">
                  <Radio className="w-6 h-6 mx-auto text-slate-500 opacity-60" />
                  <p>No Wi-Fi networks discovered yet.</p>
                  <button
                    type="button"
                    onClick={handleScanWifi}
                    className="text-cyan-400 hover:underline"
                  >
                    Click to scan again
                  </button>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/40">
                  {networks.map((net) => {
                    const isSelected = selectedSsid === net.ssid;
                    const isOpen = net.security === 'open';

                    return (
                      <div
                        key={net.ssid}
                        onClick={() => {
                          setSelectedSsid(net.ssid);
                          setSelectedSecurity(net.security);
                          if (isOpen) setPassword('');
                        }}
                        className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-950/30 text-cyan-100'
                            : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-800/40 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                            {getSignalIcon(net.signal)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold flex items-center gap-2">
                              <span>{net.ssid}</span>
                              {net.inUse && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  Current
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1">
                                {isOpen ? (
                                  <Unlock className="w-3 h-3 text-slate-500" />
                                ) : (
                                  <Lock className="w-3 h-3 text-amber-400/80" />
                                )}
                                {isOpen ? 'Open Network' : net.security.toUpperCase()}
                              </span>
                              {net.channel && <span>• Ch {net.channel}</span>}
                              <span>• Signal {net.signal}%</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`text-xs font-semibold px-3 py-1 rounded transition-colors ${
                            isSelected
                              ? 'bg-cyan-500 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Connect'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Manual / Hidden Network Form */
            <div className="space-y-3.5 p-4 rounded-lg border border-slate-800 bg-slate-950/50">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Network SSID (Name) <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={manualSsid}
                  onChange={(e) => setManualSsid(e.target.value)}
                  placeholder="e.g. Corporate-Hidden-IoT"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Security Protocol
                </label>
                <select
                  value={manualSecurity}
                  onChange={(e) => setManualSecurity(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="wpa2">WPA2 Personal (Standard)</option>
                  <option value="wpa3">WPA3 Personal</option>
                  <option value="open">Open (No Security)</option>
                </select>
              </div>
            </div>
          )}

          {/* Password Prompt & Submission Form */}
          {(selectedSsid || isManualMode) && (
            <form onSubmit={handleConnect} className="pt-2 border-t border-slate-800/80 space-y-3">
              {(isManualMode ? manualSecurity !== 'open' : selectedSecurity !== 'open') && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Wi-Fi Password for{' '}
                    <span className="text-cyan-300 font-semibold">
                      {isManualMode ? manualSsid || 'Hidden Network' : selectedSsid}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter Wi-Fi password..."
                      required
                      autoFocus
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200">Network Priority:</strong> When
                  connecting, the digital display assigns this profile highest priority (
                  <code className="text-cyan-300">autoconnect-priority 100</code>) so it
                  automatically reconnects on subsequent reboots.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isConnecting ||
                    (isManualMode ? !manualSsid.trim() : !selectedSsid) ||
                    ((isManualMode ? manualSecurity !== 'open' : selectedSecurity !== 'open') &&
                      !password)
                  }
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5" />
                      Connect Digital Display
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
