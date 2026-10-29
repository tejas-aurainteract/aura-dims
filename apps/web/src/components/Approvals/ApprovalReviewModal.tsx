/**
 * Aura DIMS - Approval Review & Decision Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Detailed inspection dialog for publication submissions: verifies playlist content,
 * target digital displays, scheduling rules in Asia/Kolkata, and priority.
 */

import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Monitor,
  Smartphone,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { ApprovalRecord } from '@aura-dims/display-schema';

interface ApprovalReviewModalProps {
  approval: ApprovalRecord;
  onClose: () => void;
  onDecided: () => void;
}

export const ApprovalReviewModal: React.FC<ApprovalReviewModalProps> = ({
  approval,
  onClose,
  onDecided,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const isPending = approval.status === 'pending_review';

  const [decisionMode, setDecisionMode] = useState<'idle' | 'rejecting'>('idle');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLandscape = approval.orientation === 'landscape';
  const rule = approval.scheduleRule;

  const handleApprove = async () => {
    if (!window.confirm(`Approve publication for "${approval.playlistTitle}" to ${approval.targetDisplayIds.length} digital displays?`)) {
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      await api.reviewApproval({
        approvalId: approval.id,
        decision: 'approved',
      });
      onDecided();
    } catch (err: any) {
      console.error('Failed to approve submission:', err);
      setError(err?.message || 'Failed to approve submission.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      setError('Please provide a specific rejection reason explaining what needs revision.');
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      await api.reviewApproval({
        approvalId: approval.id,
        decision: 'rejected',
        rejectionReason: rejectionReason.trim(),
      });
      onDecided();
    } catch (err: any) {
      console.error('Failed to reject submission:', err);
      setError(err?.message || 'Failed to reject submission.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`p-2 rounded-xl ${
                approval.status === 'approved'
                  ? 'bg-emerald-50 text-emerald-600'
                  : approval.status === 'rejected'
                  ? 'bg-rose-50 text-rose-600'
                  : approval.status === 'withdrawn'
                  ? 'bg-slate-100 text-slate-500'
                  : 'bg-amber-50 text-amber-600'
              }`}
            >
              {approval.status === 'approved' ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : approval.status === 'rejected' ? (
                <XCircle className="h-5 w-5" />
              ) : (
                <Clock className="h-5 w-5" />
              )}
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Publication Review: {approval.playlistTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Submitted by {approval.submittedByName} • {new Date(approval.submittedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Status Alert if Decided */}
          {approval.status === 'rejected' && approval.rejectionReason && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-rose-900">
                <XCircle className="h-4 w-4" />
                <span>Rejection Editorial Feedback</span>
              </p>
              <p className="pl-5.5 text-rose-700">{approval.rejectionReason}</p>
            </div>
          )}

          {/* Key Facts Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
              <span className="text-slate-400 block text-[11px] mb-1">Target Orientation</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                {isLandscape ? <Monitor className="h-3.5 w-3.5 text-indigo-600" /> : <Smartphone className="h-3.5 w-3.5 text-purple-600" />}
                <span>{isLandscape ? 'Landscape (1920×1080)' : 'Portrait (1080×1920)'}</span>
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
              <span className="text-slate-400 block text-[11px] mb-1">Broadcast Priority</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                {rule?.priority === 10 ? (
                  <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Emergency Override (Priority 10)</span>
                  </span>
                ) : (
                  <span>Priority Level {rule?.priority || 5} / 10</span>
                )}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
              <span className="text-slate-400 block text-[11px] mb-1">Scheduling Timezone</span>
              <span className="font-semibold text-slate-800">Asia/Kolkata (UTC+05:30)</span>
            </div>
          </div>

          {/* Schedule Window Section */}
          <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-teal-600" />
              <span>Broadcast Scheduling Window</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700 mt-2">
              <div>
                <span className="text-slate-400 block text-[11px]">Validity Dates</span>
                <span className="font-medium text-slate-900">
                  {rule?.startDate} to {rule?.endDate}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Daily Time Window</span>
                <span className="font-medium text-slate-900">
                  {rule?.startTime} – {rule?.endTime} (Asia/Kolkata)
                  {rule?.isOvernight && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                      Overnight Window
                    </span>
                  )}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Recurrence Model</span>
                <span className="font-medium text-slate-900">
                  {rule?.scheduleType === 'recurring' ? 'Weekly recurring' : 'One-time broadcast'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Active Days of Week</span>
                <span className="font-medium text-slate-900">
                  {rule?.scheduleType === 'recurring' && rule?.daysOfWeek
                    ? rule.daysOfWeek
                        .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                        .join(', ')
                    : 'Exact specified dates'}
                </span>
              </div>
            </div>
          </div>

          {/* Targeted Digital Displays */}
          <div>
            <h3 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
              <Monitor className="h-4 w-4 text-teal-600" />
              <span>
                Targeted Digital Displays ({approval.targetDisplayIds.length} devices)
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
              {approval.targetDisplayNames.map((name, idx) => (
                <div
                  key={approval.targetDisplayIds[idx] || idx}
                  className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs flex items-center justify-between"
                >
                  <span className="font-medium text-slate-800 truncate" title={name}>
                    {name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                    {approval.targetDisplayIds[idx]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Rejection Form when Reject is clicked */}
          {decisionMode === 'rejecting' && (
            <form onSubmit={handleReject} className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <label className="block text-xs font-bold text-rose-900">
                Reason for Rejection <span className="text-rose-600">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain required edits, font adjustments, or scheduling conflicts for the submitter..."
                className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDecisionMode('idle')}
                  className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                  {processing ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          )}

          {/* Decision History Audit Trail */}
          {approval.history && approval.history.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-900 mb-2">Audit Decision Trail</h3>
              <div className="space-y-1.5 text-xs text-slate-600">
                {approval.history.map((h, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between text-[11px]"
                  >
                    <span>
                      <strong className="capitalize text-slate-800">{h.action}</strong> by {h.actorName}
                      {h.reason && <span className="text-slate-500"> — "{h.reason}"</span>}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {new Date(h.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Current Status: <strong className="capitalize text-slate-800">{approval.status.replace('_', ' ')}</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 rounded-xl transition-colors"
            >
              Close
            </button>

            {isAdmin && isPending && decisionMode === 'idle' && (
              <>
                <button
                  type="button"
                  onClick={() => setDecisionMode('rejecting')}
                  className="px-4 py-2 border border-rose-300 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 rounded-xl transition-colors"
                >
                  Reject...
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={processing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                  {processing ? 'Approving...' : 'Approve Publication'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
