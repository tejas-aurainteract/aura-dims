/**
 * Aura DIMS - Bulk Digital Display User Assignment Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Strictly use "digital display" in all user-facing copy.
 *
 * Enforces:
 * - Admin authorization
 * - Department Head role validation
 * - Department compatibility check (rejection of cross-department assignments)
 * - Clear preflight preview before applying changes
 * - Partial failure reporting
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  DisplayView,
  UserProfile,
  BulkAssignDisplaysPreflightResponse,
  BulkAssignDisplaysResponse,
} from '@aura-dims/display-schema';

interface BulkAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDisplays: DisplayView[];
  onAssignmentComplete?: () => void;
}

export const BulkAssignmentModal: React.FC<BulkAssignmentModalProps> = ({
  isOpen,
  onClose,
  selectedDisplays,
  onAssignmentComplete,
}) => {
  const [departmentHeads, setDepartmentHeads] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [preflightLoading, setPreflightLoading] = useState<boolean>(false);
  const [preflightData, setPreflightData] = useState<BulkAssignDisplaysPreflightResponse | null>(null);
  const [executeLoading, setExecuteLoading] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<BulkAssignDisplaysResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load active Department Heads
  useEffect(() => {
    if (!isOpen) return;

    async function loadDepartmentHeads() {
      try {
        const q = query(
          collection(db, 'users'),
          where('role', '==', 'department_head'),
          where('status', '==', 'active')
        );
        const snap = await getDocs(q);
        const users: UserProfile[] = [];
        snap.forEach((doc) => {
          users.push(doc.data() as UserProfile);
        });
        users.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setDepartmentHeads(users);
      } catch (err) {
        console.warn('Could not load department heads for assignment:', err);
      }
    }
    loadDepartmentHeads();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectUser = async (userId: string) => {
    setSelectedUserId(userId);
    setPreflightData(null);
    setExecutionResult(null);
    setErrorMessage(null);

    if (!userId) return;

    setPreflightLoading(true);
    try {
      const res = await api.preflightBulkAssignDisplays({
        displayIds: selectedDisplays.map((d) => d.id),
        targetUserId: userId,
        action: 'assign',
      });
      setPreflightData(res);
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to preflight bulk assignment.'));
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleExecuteAssignment = async () => {
    if (!selectedUserId || !preflightData) return;

    const eligibleIds = preflightData.plannedChanges
      .filter((c) => c.isCompatible)
      .map((c) => c.displayId);

    if (eligibleIds.length === 0) {
      setErrorMessage('No compatible digital displays selected for this Department Head.');
      return;
    }

    setExecuteLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.executeBulkAssignDisplays({
        displayIds: eligibleIds,
        targetUserId: selectedUserId,
        action: 'assign',
      });
      setExecutionResult(res);
      if (onAssignmentComplete) {
        onAssignmentComplete();
      }
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to assign digital displays.'));
    } finally {
      setExecuteLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/10 rounded-lg text-teal-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Bulk Digital Display Assignment</h2>
              <p className="text-xs text-slate-400">
                Assign {selectedDisplays.length} selected digital displays to a designated Department Head.
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-200">
          {errorMessage && (
            <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {executionResult ? (
            /* Execution Summary */
            <div className="space-y-6 py-2">
              <div className="p-5 bg-emerald-950/30 border border-emerald-800/50 rounded-2xl text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-base font-bold text-white">Assignment Finished</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  Successfully updated {executionResult.successCount} digital displays.
                  {executionResult.failureCount > 0 && ` ${executionResult.failureCount} displays could not be assigned.`}
                </p>
              </div>

              {/* Outcomes table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
                {executionResult.results.map((r) => (
                  <div key={r.displayId} className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {r.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="font-semibold text-white font-mono">{r.displayId}</span>
                    </div>
                    <div>
                      {r.success ? (
                        <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          Assigned
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                          {r.error || 'Failed'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Select Department Head */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Target Department Head
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => handleSelectUser(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="">-- Select Department Head --</option>
                  {departmentHeads.map((user) => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName} ({user.email}) • Dept: {user.departmentId || 'Unassigned'}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Only active Department Heads can receive digital display operating permissions.
                </p>
              </div>

              {/* Preflight Loading */}
              {preflightLoading && (
                <div className="py-8 text-center">
                  <div className="inline-block animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full mb-2" />
                  <p className="text-xs text-slate-400">Verifying departmental eligibility for selected digital displays...</p>
                </div>
              )}

              {/* Preflight Review */}
              {preflightData && (
                <div className="space-y-4">
                  {/* Summary badges */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                      <span className="text-[11px] text-emerald-400 uppercase tracking-wider block">Eligible Displays</span>
                      <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
                        {preflightData.eligibleCount} of {selectedDisplays.length}
                      </span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                      <span className="text-[11px] text-rose-400 uppercase tracking-wider block">Ineligible Displays</span>
                      <span className="text-lg font-bold text-rose-400 mt-0.5 block">
                        {preflightData.ineligibleCount}
                      </span>
                    </div>
                  </div>

                  {/* Preflight Details Breakdown */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 max-h-60 overflow-y-auto">
                    {preflightData.plannedChanges.map((d) => (
                      <div key={d.displayId} className="px-4 py-2.5 flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            {d.isCompatible ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            <span className="font-semibold text-white">{d.displayName}</span>
                            <span className="text-slate-500 font-mono text-[11px]">({d.displayId})</span>
                          </div>
                          {d.reason && (
                            <p className="text-[11px] text-rose-400 pl-6">{d.reason}</p>
                          )}
                        </div>
                        <div>
                          {d.isCompatible ? (
                            <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              Eligible
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                              Cross-Dept Mismatch
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {preflightData.ineligibleCount > 0 && (
                    <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        Cross-department assignments are prohibited by security boundaries. Only eligible displays will be assigned.
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg text-slate-400 hover:text-white text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleExecuteAssignment}
                      disabled={preflightData.eligibleCount === 0 || executeLoading}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs shadow-sm transition-colors"
                    >
                      {executeLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Assigning...
                        </>
                      ) : (
                        <>
                          Apply Assignment ({preflightData.eligibleCount} Digital Displays)
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
