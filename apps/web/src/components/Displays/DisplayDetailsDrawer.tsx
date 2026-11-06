/**
 * Aura DIMS - Digital Display Hardware Health, Delivery, Files & Operations Drawer
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Always use "digital display" in all user-facing copy.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  DeviceOperationRecord,
  DeviceOperationType,
  DisplayView,
} from '@aura-dims/display-schema';
import { api, getApiErrorMessage } from '../../lib/api';

interface DisplayDetailsDrawerProps {
  display: DisplayView;
  isAdmin: boolean;
  onClose: () => void;
  onDisplayUpdated: () => void;
}

type DrawerTab = 'health' | 'delivery' | 'files' | 'operations';

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return 'Unknown';
  }
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return 'Unknown';
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
  } catch {
    return iso;
  }
}

export const DisplayDetailsDrawer: React.FC<DisplayDetailsDrawerProps> = ({
  display: initialDisplay,
  isAdmin,
  onClose,
  onDisplayUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('health');
  const [display, setDisplay] = useState<DisplayView>(initialDisplay);
  const [operations, setOperations] = useState<DeviceOperationRecord[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [actionBusy, setActionBusy] = useState<DeviceOperationType | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Reboot confirmation modal state
  const [showRebootModal, setShowRebootModal] = useState(false);
  const [rebootReason, setRebootReason] = useState('');

  const refreshDisplayAndOperations = useCallback(async () => {
    try {
      setLoadingOps(true);
      const [dispRes, opsRes] = await Promise.all([
        api.getDisplay({ displayId: initialDisplay.id }),
        api.listDisplayOperations({ displayId: initialDisplay.id, limit: 25 }),
      ]);
      setDisplay(dispRes.display);
      setOperations(opsRes.operations);
    } catch (err: any) {
      setBannerError(getApiErrorMessage(err, 'Failed to load digital display details.'));
    } finally {
      setLoadingOps(false);
    }
  }, [initialDisplay.id]);

  useEffect(() => {
    setDisplay(initialDisplay);
    refreshDisplayAndOperations();
  }, [initialDisplay, refreshDisplayAndOperations]);

  const loadPreviewUrl = useCallback(async (targetDisplayId: string) => {
    try {
      setLoadingPreview(true);
      const res = await api.getDisplayPreviewUrl({ displayId: targetDisplayId });
      setPreviewUrl(res.url);
      setPreviewExpiresAt(res.expiresAt);
    } catch {
      setPreviewUrl(null);
      setPreviewExpiresAt(null);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (display.lastPreview?.storagePath) {
      loadPreviewUrl(display.id);
    } else {
      setPreviewUrl(null);
    }
  }, [display.id, display.lastPreview?.operationId, display.lastPreview?.storagePath, loadPreviewUrl]);

  const handleRequestOperation = async (
    type: DeviceOperationType,
    options?: { confirmed?: boolean; reason?: string }
  ) => {
    setBannerError(null);
    setBannerSuccess(null);
    setActionBusy(type);

    try {
      const res = await api.requestDisplayOperation({
        displayId: display.id,
        type,
        confirmed: options?.confirmed,
        reason: options?.reason,
      });

      const labelMap: Record<DeviceOperationType, string> = {
        SYNC_NOW: 'Sync Now',
        REFRESH_RENDERER: 'Renderer Refresh',
        CAPTURE_PREVIEW: 'Software Preview Capture',
        SAFE_CLEANUP_CACHE: 'Safe Cache Cleanup',
        REBOOT: 'Controlled OS Reboot',
      };

      setBannerSuccess(
        res.deduplicated
          ? `${labelMap[type]} is already queued or in progress (${res.operation.state}).`
          : `Queued ${labelMap[type]} operation for this digital display.`
      );
      setShowRebootModal(false);
      setRebootReason('');
      await refreshDisplayAndOperations();
      onDisplayUpdated();
    } catch (err: any) {
      setBannerError(
        getApiErrorMessage(err, `Failed to request ${type} operation for digital display.`)
      );
    } finally {
      setActionBusy(null);
    }
  };

  const reported = display.reported;
  const hw = reported?.hardwareMetrics;
  const caps = reported?.capabilities;
  const assetProgress = reported?.assetProgress || [];
  const cacheInventory = reported?.cacheInventory;
  const isDisplayActive = display.lifecycle === 'active';

  const canCapturePreview = isDisplayActive && (caps ? caps.capturePreview : true);
  const canRefreshRenderer = isDisplayActive && (caps ? caps.refreshRenderer : true);
  const canReboot = isAdmin && isDisplayActive && (caps ? caps.reboot : true);

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-end z-50"
      data-testid="display-details-drawer"
    >
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-4xl h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white">{display.name}</h2>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                  display.connectivity === 'online'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : display.connectivity === 'offline'
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {display.connectivity === 'online'
                  ? 'Online'
                  : display.connectivity === 'offline'
                    ? 'Offline'
                    : 'Never Connected'}
              </span>
              <span className="px-2 py-0.5 text-xs font-mono bg-slate-800 text-slate-300 rounded">
                {display.orientation === 'landscape' ? 'Landscape' : 'Portrait'} (
                {display.configuredResolution.width}×{display.configuredResolution.height})
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Digital Display ID: <span className="font-mono text-slate-300">{display.id}</span> •{' '}
              Site: {display.siteName || display.siteId} • Department:{' '}
              {display.departmentName || display.departmentId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshDisplayAndOperations}
              disabled={loadingOps}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
            >
              {loadingOps ? 'Refreshing...' : 'Refresh Telemetry'}
            </button>
            <button
              onClick={onClose}
              aria-label="Close digital display details"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-slate-800 bg-slate-900/60 flex gap-6">
          {(
            [
              { id: 'health', label: 'Hardware & Health' },
              { id: 'delivery', label: 'Package Delivery & Presentation' },
              { id: 'files', label: 'Verified Cache & Files' },
              { id: 'operations', label: 'Device Operations & Preview' },
            ] as Array<{ id: DrawerTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`drawer-tab-${tab.id}`}
              className={`py-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-teal-500 text-teal-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Status Banners */}
        {bannerError && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex justify-between items-center">
            <span>{bannerError}</span>
            <button onClick={() => setBannerError(null)} className="text-red-400 hover:text-white">
              ✕
            </button>
          </div>
        )}
        {bannerSuccess && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs flex justify-between items-center">
            <span>{bannerSuccess}</span>
            <button
              onClick={() => setBannerSuccess(null)}
              className="text-emerald-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: HEALTH */}
          {activeTab === 'health' && (
            <div className="space-y-6" data-testid="tab-panel-health">
              {/* Server-Received Freshness & Runtime Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Server-Received Heartbeat</div>
                  <div className="text-sm font-semibold text-white mt-1">
                    {formatTimestamp(display.lastHeartbeatAt)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Authoritative server clock (Asia/Kolkata)
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Renderer & Playback State</div>
                  <div className="text-sm font-semibold text-white mt-1 flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        reported?.rendererHealth === 'healthy'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : reported?.rendererHealth === 'stalled'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {reported?.rendererHealth || 'Unknown'}
                    </span>
                    <span className="text-xs text-slate-300">
                      {reported?.playback?.isPlaying ? 'Presenting Slides' : 'Idle'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Slide: {reported?.playback?.currentSlideId || 'None'}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Agent & Renderer Runtime</div>
                  <div className="text-sm font-semibold text-white mt-1">
                    Agent v{reported?.appVersion || 'Unknown'} • Renderer v
                    {reported?.rendererVersion || caps?.rendererVersion || 'Unknown'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Uptime: {formatDurationSeconds(reported?.uptimeSeconds)}
                  </div>
                </div>
              </div>

              {/* Published Broadcast & Content */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Published Broadcast & Content
                  </h3>
                  {(display.publishedScheduleTitle || display.activeScheduleTitle) && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/30">
                      Published
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-slate-400">Broadcast Schedule</div>
                    <div className="text-sm font-semibold text-white mt-1">
                      {display.publishedScheduleTitle || display.activeScheduleTitle || 'None Assigned'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      ID: {display.publishedScheduleId || 'N/A'}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-slate-400">Active Playlist</div>
                    <div className="text-sm font-semibold text-indigo-300 mt-1">
                      {display.publishedPlaylistTitle || display.activePlaylistTitle || 'None Assigned'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Orientation: {display.orientation}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-slate-400">Broadcast Window & State</div>
                    <div className="text-sm font-semibold text-amber-300 mt-1">
                      {display.publishedScheduleWindow || display.activeScheduleWindow
                        ? `${display.publishedScheduleWindow || display.activeScheduleWindow} IST`
                        : 'All Day'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Playing Slide: {reported?.playback?.currentSlideId || 'Fallback'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Real Hardware Telemetry */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Digital Display Hardware Telemetry
                  </h3>
                  <span className="text-xs text-slate-500">
                    Observed: {hw?.observedAt ? formatTimestamp(hw.observedAt) : 'Not reported'}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
                    <div className="text-xs text-slate-400">CPU Temperature</div>
                    <div className="text-base font-bold text-white mt-1">
                      {hw?.cpuTempCelsius !== null && hw?.cpuTempCelsius !== undefined
                        ? `${hw.cpuTempCelsius.toFixed(1)} °C`
                        : 'Unknown'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
                    <div className="text-xs text-slate-400">Memory Usage</div>
                    <div className="text-base font-bold text-white mt-1">
                      {hw?.memoryUsedBytes !== null && hw?.memoryTotalBytes
                        ? `${formatBytes(hw.memoryUsedBytes)} / ${formatBytes(hw.memoryTotalBytes)}`
                        : 'Unknown'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
                    <div className="text-xs text-slate-400">Free Disk Space</div>
                    <div className="text-base font-bold text-white mt-1">
                      {hw?.diskFreeBytes !== null && hw?.diskFreeBytes !== undefined
                        ? `${formatBytes(hw.diskFreeBytes)} free`
                        : formatBytes(reported?.availableStorageBytes)}
                    </div>
                    {hw?.diskTotalBytes ? (
                      <div className="text-[11px] text-slate-500">
                        of {formatBytes(hw.diskTotalBytes)} total
                      </div>
                    ) : null}
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
                    <div className="text-xs text-slate-400">OS & Architecture</div>
                    <div className="text-sm font-semibold text-white mt-1">
                      {hw?.osPlatform ? `${hw.osPlatform} (${hw.arch || 'unknown'})` : 'Unknown'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {hw?.bootId ? `Boot ID: ${hw.bootId.slice(0, 12)}...` : 'Boot ID: Unknown'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Versioned Capabilities */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Advertised Digital Display Capabilities
                </h3>
                {caps ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-300">Visual Design Canvas & Localized Fonts</span>
                      <span
                        className={
                          caps.visualDesigns ? 'text-emerald-400 font-semibold' : 'text-red-400'
                        }
                      >
                        {caps.visualDesigns ? 'Supported' : 'Unsupported'}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-300">Supported Fonts</span>
                      <span className="text-slate-200 font-mono">
                        {caps.supportedFonts.join(', ') || 'None'}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-300">On-Demand Software Preview Capture</span>
                      <span
                        className={
                          caps.capturePreview ? 'text-emerald-400 font-semibold' : 'text-amber-400'
                        }
                      >
                        {caps.capturePreview
                          ? 'Supported (X11 scrot)'
                          : `Disabled (${caps.capturePreviewReason || 'No X11/scrot'})`}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <span className="text-slate-300">Controlled OS Reboot Helper</span>
                      <span
                        className={
                          caps.reboot ? 'text-emerald-400 font-semibold' : 'text-amber-400'
                        }
                      >
                        {caps.reboot
                          ? 'Supported'
                          : `Disabled (${caps.rebootReason || 'Not configured'})`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Capability advertisement not yet received from this digital display.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DELIVERY */}
          {activeTab === 'delivery' && (
            <div className="space-y-6" data-testid="tab-panel-delivery">
              {/* 4-Stage Separation: Desired vs Staged vs Active vs Presented */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">1. Desired Publication</div>
                  <div className="text-xs font-mono text-white mt-1 break-all">
                    {display.desiredPublicationId || 'None assigned'}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">2. Delivery & Verification Stage</div>
                  <div className="text-sm font-semibold text-teal-400 mt-1 uppercase">
                    {display.deliveryStage || 'idle'}
                  </div>
                  {display.lastDeliveryError && (
                    <div className="text-[11px] text-red-400 mt-1">
                      {display.lastDeliveryError}
                    </div>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">3. Active Local Package</div>
                  <div className="text-xs font-mono text-emerald-400 mt-1 break-all">
                    {display.activePublicationId || 'None active'}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">4. Actually Presented on Display</div>
                  <div className="text-xs font-mono text-sky-400 mt-1 break-all">
                    {display.presentedPublicationId ||
                      reported?.playback?.presentedPublicationId ||
                      'Awaiting first slide render'}
                  </div>
                  {(display.firstPresentedAt || reported?.playback?.firstPresentedAt) && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      Since:{' '}
                      {formatTimestamp(
                        display.firstPresentedAt || reported?.playback?.firstPresentedAt
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Per-Asset Download & SHA-256 Verification Progress */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Per-Asset Transfer & SHA-256 Verification Telemetry
                  </h3>
                  <span className="text-xs text-slate-400">
                    {assetProgress.length} asset(s) tracked
                  </span>
                </div>

                {assetProgress.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No per-asset transfer telemetry reported yet for this digital display.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 pr-3">File Name</th>
                          <th className="py-2 px-3">Stage</th>
                          <th className="py-2 px-3">Progress</th>
                          <th className="py-2 px-3">Bytes</th>
                          <th className="py-2 pl-3">SHA-256 Checksum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {assetProgress.map((item) => (
                          <tr key={`${item.publicationId}:${item.assetId}`}>
                            <td className="py-2.5 pr-3 text-slate-200 font-medium">
                              <div>{item.fileName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {item.assetId} {item.fromCache ? '• (Cache Hit)' : ''}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                  item.stage === 'ready'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : item.stage === 'failed'
                                      ? 'bg-red-500/10 text-red-400'
                                      : 'bg-sky-500/10 text-sky-400'
                                }`}
                              >
                                {item.stage}
                              </span>
                              {item.errorMessage && (
                                <div className="text-[10px] text-red-400 mt-0.5">
                                  {item.errorMessage}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 w-36">
                              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    item.stage === 'failed' ? 'bg-red-500' : 'bg-teal-500'
                                  }`}
                                  style={{ width: `${item.progressPercent}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {item.progressPercent}%
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 font-mono">
                              {formatBytes(item.bytesTransferred)} / {formatBytes(item.sizeBytes)}
                            </td>
                            <td className="py-2.5 pl-3 font-mono text-[11px] text-slate-400">
                              {item.verifiedChecksumSha256 ? (
                                <span className="text-emerald-400">
                                  ✓ {item.verifiedChecksumSha256.slice(0, 12)}…
                                </span>
                              ) : (
                                <span>{item.checksumSha256.slice(0, 12)}…</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FILES */}
          {activeTab === 'files' && (
            <div className="space-y-6" data-testid="tab-panel-files">
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Content-Addressable Cache Inventory
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Active publication assets, previous rollback package assets, and in-use staged
                    downloads are strictly protected during cache cleanup.
                  </p>
                </div>
                <button
                  onClick={() => handleRequestOperation('SAFE_CLEANUP_CACHE')}
                  disabled={!isDisplayActive || actionBusy !== null}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg border border-slate-700 shrink-0"
                >
                  {actionBusy === 'SAFE_CLEANUP_CACHE'
                    ? 'Requesting Cleanup...'
                    : 'Run Safe Cache Cleanup'}
                </button>
              </div>

              {cacheInventory ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-xs text-slate-400">Cached Blobs</div>
                      <div className="text-base font-bold text-white mt-1">
                        {cacheInventory.totalItems}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-xs text-slate-400">Total Cache Size</div>
                      <div className="text-base font-bold text-white mt-1">
                        {formatBytes(cacheInventory.totalBytes)}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-xs text-slate-400">Protected (Referenced)</div>
                      <div className="text-base font-bold text-emerald-400 mt-1">
                        {formatBytes(cacheInventory.referencedBytes)}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-xs text-slate-400">Reclaimable (Unreferenced)</div>
                      <div className="text-base font-bold text-amber-400 mt-1">
                        {formatBytes(cacheInventory.unreferencedBytes)}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-2 pr-3">SHA-256 Hash</th>
                            <th className="py-2 px-3">Referenced Files</th>
                            <th className="py-2 px-3">Size</th>
                            <th className="py-2 pl-3">Protection Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {cacheInventory.items.map((item) => (
                            <tr key={item.checksumSha256}>
                              <td className="py-2.5 pr-3 font-mono text-slate-300">
                                {item.checksumSha256.slice(0, 16)}…
                              </td>
                              <td className="py-2.5 px-3 text-slate-200">
                                {item.fileNames.length > 0
                                  ? item.fileNames.join(', ')
                                  : item.assetIds.join(', ') || 'Unreferenced blob'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-300">
                                {formatBytes(item.sizeBytes)}
                              </td>
                              <td className="py-2.5 pl-3 space-x-1">
                                {item.references.map((ref) => (
                                  <span
                                    key={ref}
                                    className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                                      ref === 'active'
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : ref === 'previous'
                                          ? 'bg-sky-500/15 text-sky-400'
                                          : ref === 'staged'
                                            ? 'bg-purple-500/15 text-purple-400'
                                            : 'bg-amber-500/15 text-amber-400'
                                    }`}
                                  >
                                    {ref}
                                  </span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                  Cache inventory has not yet been reported by this digital display.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: OPERATIONS & PREVIEW */}
          {activeTab === 'operations' && (
            <div className="space-y-6" data-testid="tab-panel-operations">
              {/* Action Controls */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Authorized Digital Display Operations
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Operations are queued durably on the server, claimed transactionally by the
                    digital display player, and audited end-to-end.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleRequestOperation('SYNC_NOW')}
                    disabled={!isDisplayActive || actionBusy !== null}
                    data-testid="op-btn-sync-now"
                    className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {actionBusy === 'SYNC_NOW' ? 'Queuing...' : 'Sync Now'}
                  </button>

                  <button
                    onClick={() => handleRequestOperation('REFRESH_RENDERER')}
                    disabled={!canRefreshRenderer || actionBusy !== null}
                    title={caps?.refreshRendererReason || undefined}
                    data-testid="op-btn-refresh-renderer"
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
                  >
                    {actionBusy === 'REFRESH_RENDERER' ? 'Queuing...' : 'Refresh Local Renderer'}
                  </button>

                  <button
                    onClick={() => handleRequestOperation('CAPTURE_PREVIEW')}
                    disabled={!canCapturePreview || actionBusy !== null}
                    title={
                      caps?.capturePreview === false
                        ? caps.capturePreviewReason || 'Unsupported on this digital display'
                        : undefined
                    }
                    data-testid="op-btn-capture-preview"
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
                  >
                    {actionBusy === 'CAPTURE_PREVIEW'
                      ? 'Queuing...'
                      : 'Capture Software Preview'}
                  </button>

                  <button
                    onClick={() => handleRequestOperation('SAFE_CLEANUP_CACHE')}
                    disabled={!isDisplayActive || actionBusy !== null}
                    data-testid="op-btn-cleanup-cache"
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
                  >
                    {actionBusy === 'SAFE_CLEANUP_CACHE'
                      ? 'Queuing...'
                      : 'Safe Cache Cleanup'}
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => setShowRebootModal(true)}
                      disabled={!canReboot || actionBusy !== null}
                      title={
                        caps?.reboot === false
                          ? caps.rebootReason || 'Reboot helper not configured on this digital display'
                          : 'Admin-only controlled OS reboot'
                      }
                      data-testid="op-btn-reboot"
                      className="px-3.5 py-2 bg-red-950/80 hover:bg-red-900/80 disabled:opacity-40 text-red-200 text-xs font-medium rounded-lg border border-red-800/70 transition-colors"
                    >
                      Controlled Reboot (Admin)
                    </button>
                  )}
                </div>

                {caps && (!caps.capturePreview || !caps.reboot) && (
                  <div className="text-[11px] text-slate-400 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    {!caps.capturePreview && (
                      <div>
                        • <strong>Preview Capture Disabled:</strong>{' '}
                        {caps.capturePreviewReason || 'X11/scrot unavailable on host.'}
                      </div>
                    )}
                    {!caps.reboot && (
                      <div>
                        • <strong>Reboot Disabled:</strong>{' '}
                        {caps.rebootReason || 'Controlled reboot helper not configured.'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* On-Demand Software Preview Viewer */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      On-Demand Digital Display Software Preview
                    </h3>
                    <p className="text-[11px] text-amber-400/90 mt-0.5">
                      Note: Software framebuffer capture verifies local X11 renderer output only; it
                      does not verify physical digital display panel power or HDMI cable connection.
                    </p>
                  </div>
                  {display.lastPreview && (
                    <span className="text-xs text-slate-400">
                      Captured: {formatTimestamp(display.lastPreview.capturedAt)}
                    </span>
                  )}
                </div>

                {loadingPreview ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Loading private preview URL...
                  </div>
                ) : previewUrl && display.lastPreview ? (
                  <div className="space-y-2">
                    <div className="rounded-lg overflow-hidden border border-slate-800 bg-black flex justify-center max-h-72">
                      <img
                        src={previewUrl}
                        alt={`Software preview for digital display ${display.name}`}
                        className="max-h-72 object-contain"
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>Size: {formatBytes(display.lastPreview.sizeBytes)}</span>
                      <span>
                        Private URL expires: {formatTimestamp(previewExpiresAt)} • Retention until:{' '}
                        {formatTimestamp(display.lastPreview.expiresAt)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-lg bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                    No active software preview captured for this digital display. Use "Capture
                    Software Preview" above when supported.
                  </div>
                )}
              </div>

              {/* Durable Operation History */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Durable Operation Lifecycle History
                </h3>
                {operations.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No operations have been requested for this digital display yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 pr-3">Operation</th>
                          <th className="py-2 px-3">State</th>
                          <th className="py-2 px-3">Requested</th>
                          <th className="py-2 px-3">Attempts</th>
                          <th className="py-2 pl-3">Result / Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {operations.map((op) => (
                          <tr key={op.id}>
                            <td className="py-2.5 pr-3 font-medium text-slate-200">
                              <div>{op.type}</div>
                              <div className="text-[10px] font-mono text-slate-500">
                                {op.id.slice(0, 8)}…
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                  op.state === 'succeeded'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : op.state === 'failed' || op.state === 'expired'
                                      ? 'bg-red-500/15 text-red-400'
                                      : op.state === 'awaiting_reconnect'
                                        ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-sky-500/15 text-sky-400'
                                }`}
                              >
                                {op.state}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              <div>{formatTimestamp(op.requestedAt)}</div>
                              {op.completedAt && (
                                <div className="text-[10px] text-slate-500">
                                  Done: {formatTimestamp(op.completedAt)}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {op.attemptCount}/{op.maxAttempts}
                            </td>
                            <td className="py-2.5 pl-3 text-slate-300">
                              {op.errorMessage ? (
                                <span className="text-red-400">
                                  {op.errorCode ? `[${op.errorCode}] ` : ''}
                                  {op.errorMessage}
                                </span>
                              ) : (
                                op.resultSummary || op.reason || '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin Reboot Confirmation Modal */}
      {showRebootModal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-red-800/60 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">
              Confirm Controlled Digital Display Reboot
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are requesting an OS reboot for digital display{' '}
              <strong className="text-white">{display.name}</strong>. This operation expires in 5
              minutes if unclaimed, will not be automatically replayed, and will only transition from{' '}
              <code className="text-amber-300">awaiting_reconnect</code> to{' '}
              <code className="text-emerald-300">succeeded</code> after the digital display
              reconnects with a verified new boot ID or reset uptime.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Audit Reason (Optional)
              </label>
              <input
                type="text"
                value={rebootReason}
                onChange={(e) => setRebootReason(e.target.value)}
                placeholder="e.g. Scheduled maintenance window"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRebootModal(false)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleRequestOperation('REBOOT', {
                    confirmed: true,
                    reason: rebootReason.trim() || undefined,
                  })
                }
                disabled={actionBusy === 'REBOOT'}
                data-testid="confirm-reboot-btn"
                className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg"
              >
                {actionBusy === 'REBOOT' ? 'Confirming...' : 'Confirm Controlled Reboot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

