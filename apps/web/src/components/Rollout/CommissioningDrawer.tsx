/**
 * Aura DIMS - 12-Item Digital Display Commissioning Drawer
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Strictly use "digital display" in all user-facing copy.
 *
 * Distinguishes:
 * - Automated Telemetry Evidence (Network, Enrollment, Users, Fallback, Active Publication)
 * - Human Physical Verification (Mounting, Orientation, Fonts/Video, Visibility, Restart, Offline, Handover)
 *
 * Commissioning Guard:
 * Digital display is only finalized as "commissioned" when all 12 items are verified.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ShieldCheck,
  User,
  Check,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  DisplayView,
  CommissioningRecord,
  CommissioningCheckId,
  CommissioningCheckItem,
} from '@aura-dims/display-schema';

interface CommissioningDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  display: DisplayView | null;
  onCommissioningUpdated?: () => void;
}

export const CommissioningDrawer: React.FC<CommissioningDrawerProps> = ({
  isOpen,
  onClose,
  display,
  onCommissioningUpdated,
}) => {
  const [record, setRecord] = useState<CommissioningRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingCheckId, setSavingCheckId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signoffNotes, setSignoffNotes] = useState<string>('');

  // Editing state for notes
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !display) return;

    async function loadChecklist() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await api.getCommissioningChecklist({ displayId: display!.id });
        setRecord(res.commissioning);
        // Pre-fill existing notes
        const notesMap: Record<string, string> = {};
        res.commissioning.checklist.forEach((c: CommissioningCheckItem) => {
          notesMap[c.id] = c.notes || '';
        });
        setEditingNotes(notesMap);
      } catch (err: any) {
        setErrorMessage(getApiErrorMessage(err, 'Failed to load digital display commissioning checklist.'));
      } finally {
        setLoading(false);
      }
    }
    loadChecklist();
  }, [isOpen, display]);

  if (!isOpen || !display) return null;

  const handleUpdateCheck = async (
    checkId: CommissioningCheckId,
    status: 'passed' | 'failed' | 'skipped'
  ) => {
    setSavingCheckId(checkId);
    setErrorMessage(null);

    try {
      const notes = editingNotes[checkId] || '';
      const res = await api.updateCommissioningCheck({
        displayId: display.id,
        checkId,
        status,
        notes,
      });
      setRecord(res.commissioning);
      if (onCommissioningUpdated) onCommissioningUpdated();
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err, `Failed to update checklist item ${checkId}.`));
    } finally {
      setSavingCheckId(null);
    }
  };

  const handleFinalize = async () => {
    if (!record) return;

    setFinalizing(true);
    setErrorMessage(null);

    try {
      const res = await api.finalizeCommissioning({
        displayId: display.id,
        notes: signoffNotes.trim() || undefined,
      });
      setRecord(res.commissioning);
      if (onCommissioningUpdated) onCommissioningUpdated();
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to finalize digital display commissioning.'));
    } finally {
      setFinalizing(false);
    }
  };

  const passedCount = record?.checklist.filter((c) => c.status === 'passed').length || 0;
  const canFinalize = (record?.checklist || []).length > 0 && (record?.checklist || []).every((c) => c.status === 'passed');
  const isFullyCommissioned = record?.status === 'commissioned';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-2xl h-full flex flex-col shadow-2xl">
        {/* Top Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-500/10 rounded-xl text-teal-400">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Digital Display Commissioning</h2>
                {isFullyCommissioned ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Commissioned
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {passedCount}/12 Complete
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {display.name} • {display.siteName} ({display.orientation})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-200">
          {errorMessage && (
            <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Progress Tracker */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">12-Step Quality Gate</span>
              <span className="text-white font-bold">{passedCount} of 12 Passed</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  passedCount === 12 ? 'bg-emerald-500' : 'bg-teal-500'
                }`}
                style={{ width: `${(passedCount / 12) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Combines automated software telemetry with on-site physical inspection to certify playback readiness.
            </p>
          </div>

          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full mb-3" />
              <p className="text-xs text-slate-400">Loading commissioning checklist & verifying telemetry...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {record?.checklist.map((item) => {
                const isAutomated = item.checkKind === 'automated';
                const isPassed = item.status === 'passed';
                const isFailed = item.status === 'failed';
                const isSaving = savingCheckId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`border rounded-xl p-4 transition-colors ${
                      isPassed
                        ? 'bg-slate-950/40 border-slate-800'
                        : isFailed
                        ? 'bg-rose-950/20 border-rose-900/50'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-500">
                            #{item.id}
                          </span>
                          <h4 className="text-xs font-bold text-white">{item.label}</h4>
                          {isAutomated ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                              Automated Evidence
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                              Physical Inspection
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">{item.description}</p>
                      </div>

                      {/* Status Pill */}
                      <div className="shrink-0">
                        {isPassed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Passed
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                            <XCircle className="w-3 h-3" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Evidence & Signoff Metadata */}
                    <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                      {item.confirmedByEmail && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <User className="w-3 h-3 text-slate-500" />
                          <span>
                            Verified by <span className="text-slate-300 font-medium">{item.confirmedByEmail}</span> on{' '}
                            {item.confirmedAt ? new Date(item.confirmedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Unknown'}
                          </span>
                        </div>
                      )}

                      {/* Notes / Comments */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingNotes[item.id] || ''}
                          onChange={(e) =>
                            setEditingNotes({
                              ...editingNotes,
                              [item.id]: e.target.value,
                            })
                          }
                          placeholder="Optional verification observations or serial / bracket notes..."
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      {/* Human Action Controls */}
                      {!isFullyCommissioned && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateCheck(item.id, 'passed')}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            Mark Passed
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateCheck(item.id, 'failed')}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-[11px] font-medium transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Mark Failed
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateCheck(item.id, 'skipped')}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] transition-colors"
                          >
                            Reset
                          </button>
                          {isSaving && (
                            <span className="text-[11px] text-teal-400 animate-pulse ml-2">Saving...</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with Finalize Quality Gate */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/80 space-y-4">
          {!isFullyCommissioned ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Final Signoff Observation Notes
                </label>
                <input
                  type="text"
                  value={signoffNotes}
                  onChange={(e) => setSignoffNotes(e.target.value)}
                  placeholder="e.g. All 12 checks verified. Installed at Main Campus Level 1."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {canFinalize
                    ? 'All 12 checks verified. Ready to certify.'
                    : `Must complete all 12 checks to certify (${passedCount}/12 completed).`}
                </span>
                <button
                  type="button"
                  onClick={handleFinalize}
                  disabled={!canFinalize || finalizing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs shadow-sm transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {finalizing ? 'Certifying...' : 'Finalize Commissioning'}
                </button>
              </div>
            </>
          ) : (
            <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>
                  Digital display fully certified & commissioned on{' '}
                  {record?.commissionedAt ? new Date(record.commissionedAt).toLocaleDateString('en-IN') : 'recently'}.
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
