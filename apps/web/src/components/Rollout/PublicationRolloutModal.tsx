/**
 * Aura DIMS - Publication Rollout Progress & Safe Target Retry Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Strictly use "digital display" in all user-facing copy.
 *
 * Provides real-time visibility into publication distribution stages:
 * - Intended targets
 * - Prepared targets
 * - Downloading / Verifying targets
 * - Active presentation targets
 * - Failed targets
 * - Stale telemetry targets (> 15 min)
 *
 * Safe Target Retry:
 * Resets delivery failure markers on specific lagging or failed displays
 * without disruptive full-fleet republishing.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Tv,
  RotateCcw,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  GetPublicationRolloutProgressResponse,
} from '@aura-dims/display-schema';

interface PublicationRolloutModalProps {
  isOpen: boolean;
  onClose: () => void;
  publicationId: string;
  scheduleTitle: string;
}

export const PublicationRolloutModal: React.FC<PublicationRolloutModalProps> = ({
  isOpen,
  onClose,
  publicationId,
  scheduleTitle,
}) => {
  const [data, setData] = useState<GetPublicationRolloutProgressResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchProgress = async () => {
    if (!publicationId) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.getPublicationRolloutProgress({ publicationId });
      setData(res);
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to fetch publication rollout progress.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProgress();
    }
  }, [isOpen, publicationId]);

  if (!isOpen) return null;

  const handleRetryTarget = async (displayId: string) => {
    setRetryingId(displayId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await api.retryPublicationTarget({ publicationId, displayId });
      setSuccessMessage(`Delivery retry dispatched for digital display.`);
      fetchProgress();
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to dispatch publication retry.'));
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAllIncomplete = async () => {
    if (!data) return;
    const incompleteTargets = data.targets.filter(
      (t) => t.deliveryStage === 'failed' || t.isStale || t.deliveryStage !== 'active'
    );

    if (incompleteTargets.length === 0) return;

    setRetryingAll(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    let retried = 0;
    try {
      for (const t of incompleteTargets) {
        await api.retryPublicationTarget({ publicationId, displayId: t.displayId });
        retried++;
      }
      setSuccessMessage(`Successfully dispatched retry to ${retried} digital displays.`);
      fetchProgress();
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err, 'Failed while dispatching batch retries.'));
    } finally {
      setRetryingAll(false);
    }
  };

  const percentage = data && data.targetCount > 0 ? Math.round((data.activeCount / data.targetCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/10 rounded-lg text-teal-400">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Publication Rollout Progress</h2>
              <p className="text-xs text-slate-400">
                "{scheduleTitle}" • Publication Manifest{' '}
                <span className="font-mono text-teal-300 text-[11px]">{publicationId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-200">
          {errorMessage && (
            <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full mb-3" />
              <p className="text-slate-400 text-xs">Aggregating fleet delivery telemetry...</p>
            </div>
          ) : data ? (
            <>
              {/* Progress Bar & Percentage */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Active Presentation Adoption</span>
                  <span className="text-teal-400 font-bold text-base">{percentage}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  {data.activeCount} of {data.targetCount} digital displays actively presenting this publication.
                </p>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Targets</span>
                  <span className="text-xl font-bold text-white mt-1 block">{data.targetCount}</span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[11px] text-emerald-400 uppercase tracking-wider block">Active</span>
                  <span className="text-xl font-bold text-emerald-400 mt-1 block">{data.activeCount}</span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[11px] text-sky-400 uppercase tracking-wider block">Downloading</span>
                  <span className="text-xl font-bold text-sky-400 mt-1 block">{data.downloadingCount}</span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[11px] text-rose-400 uppercase tracking-wider block">Failed</span>
                  <span className="text-xl font-bold text-rose-400 mt-1 block">{data.failedCount}</span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[11px] text-amber-400 uppercase tracking-wider block">Stale (&gt;15m)</span>
                  <span className="text-xl font-bold text-amber-400 mt-1 block">{data.staleOrNoReportCount}</span>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Target Digital Displays Breakdown
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchProgress}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                    title="Refresh telemetry"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  {(data.failedCount > 0 || data.staleOrNoReportCount > 0 || data.activeCount < data.targetCount) && (
                    <button
                      onClick={handleRetryAllIncomplete}
                      disabled={retryingAll}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {retryingAll ? 'Retrying Targets...' : 'Retry Incomplete Targets'}
                    </button>
                  )}
                </div>
              </div>

              {/* Target Displays Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 max-h-72 overflow-y-auto">
                {data.targets.map((t) => (
                  <div key={t.displayId} className="px-4 py-3 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Tv className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="font-semibold text-white">{t.displayName}</span>
                        <span className="text-slate-500 font-mono text-[11px]">({t.displayId})</span>
                        {t.isStale && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                            Telemetry Stale (&gt;15m)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 pl-6 flex items-center gap-3">
                        <span>
                          Sync: {t.lastSyncAt ? new Date(t.lastSyncAt).toLocaleTimeString('en-IN') : 'Never'}
                        </span>
                        <span>
                          Heartbeat:{' '}
                          {t.lastHeartbeatAt ? new Date(t.lastHeartbeatAt).toLocaleTimeString('en-IN') : 'None'}
                        </span>
                        {t.lastDeliveryError && (
                          <span className="text-rose-400 truncate max-w-xs font-mono">
                            Error: {t.lastDeliveryError}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div>
                        {t.deliveryStage === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Active Presentation
                          </span>
                        ) : t.deliveryStage === 'failed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                            <XCircle className="w-3 h-3" />
                            Failed
                          </span>
                        ) : ['downloading', 'verifying', 'ready'].includes(t.deliveryStage) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                            <Clock className="w-3 h-3" />
                            {t.deliveryStage}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                            {t.deliveryStage || 'idle'}
                          </span>
                        )}
                      </div>

                      {t.deliveryStage !== 'active' && (
                        <button
                          type="button"
                          onClick={() => handleRetryTarget(t.displayId)}
                          disabled={retryingId === t.displayId}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                          title="Retry delivery on this digital display"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
