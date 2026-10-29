/**
 * Aura DIMS - Approvals & Governance View
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Multi-tier editorial review workflow ensuring that all content scheduled for
 * digital displays meets corporate standards before broadcast.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { ApprovalRecord, ApprovalStatus } from '@aura-dims/display-schema';
import { ApprovalReviewModal } from './ApprovalReviewModal';

export const ApprovalsView: React.FC = () => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>('pending_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRecord | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listApprovals({
        departmentId: isAdmin ? undefined : userProfile?.departmentId || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setApprovals(res.approvals);
    } catch (err: any) {
      console.error('[Aura DIMS] Failed to fetch approvals:', err);
      setError(err?.message || 'Failed to load approvals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [userProfile?.departmentId, isAdmin, statusFilter]);

  const handleWithdraw = async (approval: ApprovalRecord) => {
    if (!window.confirm(`Withdraw submission for "${approval.playlistTitle}"?`)) return;
    try {
      await api.withdrawApproval({
        approvalId: approval.id,
        reason: 'Withdrawn by submitter',
      });
      fetchApprovals();
    } catch (err: any) {
      alert(`Withdrawal failed: ${err.message}`);
    }
  };

  const filteredApprovals = useMemo(() => {
    return approvals.filter((a) => {
      const q = searchQuery.toLowerCase();
      return (
        a.playlistTitle.toLowerCase().includes(q) ||
        a.submittedByName.toLowerCase().includes(q) ||
        (a.departmentName && a.departmentName.toLowerCase().includes(q))
      );
    });
  }, [approvals, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Approvals & Governance</h1>
          <p className="text-xs text-slate-500 mt-1">
            Editorial review and compliance authorization for digital display publication packages • Asia/Kolkata
          </p>
        </div>

        {/* Direct Publishing Indicator */}
        <div className="self-start sm:self-auto">
          {isAdmin ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold">
              <ShieldCheck className="h-4 w-4" />
              <span>Administrator Direct Publishing Active</span>
            </div>
          ) : userProfile?.canDirectPublish ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold">
              <ShieldCheck className="h-4 w-4" />
              <span>Department Direct Publishing Delegated</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
              <Clock className="h-4 w-4" />
              <span>Standard Review Required (Admin Approval)</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by playlist, submitter, or department..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('pending_review')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'pending_review'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending Review
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'approved'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Approved
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'rejected'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rejected
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Submissions
          </button>
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-teal-600 mb-3" />
          <p className="text-xs text-slate-500">Loading submissions...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchApprovals}
            className="ml-auto underline font-medium hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      ) : filteredApprovals.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No submissions found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {statusFilter === 'pending_review'
              ? 'There are currently no publication submissions waiting for review.'
              : `No submissions matching status "${statusFilter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredApprovals.map((a) => {
            const isLandscape = a.orientation === 'landscape';
            const isPending = a.status === 'pending_review';

            return (
              <div
                key={a.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        isLandscape ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {isLandscape ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                      <span>{isLandscape ? 'Landscape' : 'Portrait'}</span>
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                        a.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : a.status === 'rejected'
                          ? 'bg-rose-50 text-rose-700'
                          : a.status === 'withdrawn'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {a.status === 'approved' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : a.status === 'rejected' ? (
                        <XCircle className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      <span className="capitalize">{a.status.replace('_', ' ')}</span>
                    </span>

                    {a.priority === 10 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800">
                        <ShieldAlert className="h-3 w-3" />
                        <span>Emergency Override</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900">{a.playlistTitle}</h3>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>
                      Submitted by: <strong className="text-slate-700">{a.submittedByName}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Target: <strong className="text-slate-700">{a.targetDisplayIds.length} digital displays</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Window: {a.scheduleRule.startDate} to {a.scheduleRule.endDate} ({a.scheduleRule.startTime}–{a.scheduleRule.endTime})
                    </span>
                  </div>

                  {a.status === 'rejected' && a.rejectionReason && (
                    <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-xl border border-rose-200 mt-2">
                      <strong>Rejection note:</strong> {a.rejectionReason}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && isPending ? (
                    <button
                      type="button"
                      onClick={() => setSelectedApproval(a)}
                      className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                    >
                      Review Submission
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedApproval(a)}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                    >
                      View Details
                    </button>
                  )}

                  {!isAdmin && isPending && (
                    <button
                      type="button"
                      onClick={() => handleWithdraw(a)}
                      className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl transition-colors"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {selectedApproval && (
        <ApprovalReviewModal
          approval={selectedApproval}
          onClose={() => setSelectedApproval(null)}
          onDecided={() => {
            setSelectedApproval(null);
            fetchApprovals();
          }}
        />
      )}
    </div>
  );
};
