/**
 * Aura DIMS - Schedules Management & Broadcast Hub
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Coordinates scheduled broadcasts, submission to approval workflows,
 * conflict preflight, and publication manifest compilation for digital displays.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Search,
  AlertCircle,
  ShieldAlert,
  Send,
  UploadCloud,
  FileCheck,
  Monitor,
  Smartphone,
  Pencil,
  Ban,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type {
  ScheduleRecord,
  ScheduleStatus,
  DigitalDisplay,
} from '@aura-dims/display-schema';
import { CreateScheduleModal } from './CreateScheduleModal';
import { DisplayScheduleSimulatorModal } from './DisplayScheduleSimulatorModal';

export const SchedulesListView: React.FC = () => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const canDirectPublish = isAdmin || !!userProfile?.canDirectPublish;

  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [displays, setDisplays] = useState<DigitalDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ScheduleStatus>('all');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRecord | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchSchedules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listSchedules({
        departmentId: isAdmin ? undefined : userProfile?.departmentId || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setSchedules(res.schedules);

      // Also fetch digital displays for simulation
      const { collection, getDocs, query, where } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      let dq = query(collection(db, 'displays'), where('lifecycle', '==', 'active'));
      if (!isAdmin && userProfile?.departmentId) {
        dq = query(dq, where('departmentId', '==', userProfile.departmentId));
      }
      const dSnap = await getDocs(dq);
      const disps: DigitalDisplay[] = [];
      dSnap.forEach((d) => disps.push({ id: d.id, ...(d.data() as any) }));
      setDisplays(disps);
    } catch (err: any) {
      console.error('[Aura DIMS] Failed to fetch schedules:', err);
      setError(err?.message || 'Failed to load schedules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [userProfile?.departmentId, isAdmin, statusFilter]);

  const handleSubmitForApproval = async (schedule: ScheduleRecord) => {
    setActionLoadingId(schedule.id);
    try {
      await api.submitForApproval({ scheduleId: schedule.id });
      fetchSchedules();
    } catch (err: any) {
      alert(`Submission failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePublishNow = async (schedule: ScheduleRecord) => {
    if (!window.confirm(`Prepare and publish immutable publication package for "${schedule.title}" to ${schedule.targetDisplayIds.length} digital displays?`)) {
      return;
    }

    setActionLoadingId(schedule.id);
    try {
      const idempotencyKey = `pub_${schedule.id}_${Date.now()}`;
      await api.preparePublication({
        scheduleId: schedule.id,
        idempotencyKey,
      });
      fetchSchedules();
    } catch (err: any) {
      alert(`Publication preparation failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleWithdraw = async (schedule: ScheduleRecord) => {
    if (!window.confirm(`Withdraw active broadcast schedule "${schedule.title}"?`)) return;
    setActionLoadingId(schedule.id);
    try {
      await api.setScheduleStatus({
        scheduleId: schedule.id,
        status: 'withdrawn',
      });
      fetchSchedules();
    } catch (err: any) {
      alert(`Withdrawal failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      const q = searchQuery.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.playlistTitle.toLowerCase().includes(q) ||
        s.targetDisplayNames?.some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [schedules, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Broadcast Schedules</h1>
          <p className="text-xs text-slate-500 mt-1">
            Deterministic calendar scheduling calibrated to Asia/Kolkata • Maps playlists to target digital displays
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {displays.length > 0 && (
            <button
              type="button"
              onClick={() => setIsSimulatorOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Clock className="h-4 w-4 text-teal-600" />
              <span>Timeline Simulator</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingSchedule(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create schedule</span>
          </button>
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
            placeholder="Search schedules by title, playlist, or display..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'approved' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Approved
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('awaiting_approval')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'awaiting_approval'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Awaiting Approval
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('draft')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'draft' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Draft
          </button>
        </div>
      </div>

      {/* Main Content List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-teal-600 mb-3" />
          <p className="text-xs text-slate-500">Loading schedules...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchSchedules}
            className="ml-auto underline font-medium hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3">
            <Calendar className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No schedules found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            {searchQuery
              ? `No schedules match "${searchQuery}".`
              : 'Create a schedule to map visual playlists to your digital displays.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingSchedule(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create schedule</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSchedules.map((s) => {
            const isLandscape = s.orientation === 'landscape';
            const rule = s.scheduleRule;
            const isActionLoading = actionLoadingId === s.id;

            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
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
                        s.status === 'active'
                          ? 'bg-teal-50 text-teal-800'
                          : s.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-800'
                          : s.status === 'awaiting_approval'
                          ? 'bg-amber-50 text-amber-800'
                          : s.status === 'withdrawn'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="capitalize">{s.status.replace('_', ' ')}</span>
                    </span>

                    {s.publicationStatus === 'prepared' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
                        <FileCheck className="h-3 w-3" />
                        <span>Package Prepared</span>
                      </span>
                    )}

                    {rule.priority === 10 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800">
                        <ShieldAlert className="h-3 w-3" />
                        <span>Emergency Override</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{s.title}</h3>

                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      Playlist: <strong className="text-slate-900">{s.playlistTitle}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Targets:{' '}
                      <strong className="text-slate-900">
                        {s.targetDisplayIds.length} digital displays
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Window: {rule.startDate} to {rule.endDate} ({rule.startTime}–{rule.endTime} Asia/Kolkata)
                      {rule.isOvernight && (
                        <span className="ml-1 text-amber-700 font-medium">(Overnight)</span>
                      )}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Recurrence:{' '}
                    {rule.scheduleType === 'recurring' && rule.daysOfWeek
                      ? rule.daysOfWeek
                          .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                          .join(', ')
                      : 'Exact specified dates'}{' '}
                    • Priority {rule.priority}/10
                  </div>
                </div>

                {/* Schedule Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                  {/* Publish button if approved or direct publish eligible */}
                  {(canDirectPublish || s.status === 'approved') && s.status !== 'withdrawn' && (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handlePublishNow(s)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                    >
                      <UploadCloud className="h-4 w-4" />
                      <span>{s.publicationStatus === 'prepared' ? 'Re-publish' : 'Publish Package'}</span>
                    </button>
                  )}

                  {/* Submit for approval if draft */}
                  {s.status === 'draft' && !canDirectPublish && (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleSubmitForApproval(s)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                    >
                      <Send className="h-4 w-4" />
                      <span>Submit for Review</span>
                    </button>
                  )}

                  {/* Edit */}
                  {s.status !== 'withdrawn' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSchedule(s);
                        setIsCreateModalOpen(true);
                      }}
                      className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      title="Edit schedule"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}

                  {/* Withdraw */}
                  {s.status === 'active' && (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleWithdraw(s)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Withdraw broadcast schedule"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isCreateModalOpen && (
        <CreateScheduleModal
          schedule={editingSchedule}
          departmentId={userProfile?.departmentId || ''}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingSchedule(null);
          }}
          onSaved={() => {
            setIsCreateModalOpen(false);
            setEditingSchedule(null);
            fetchSchedules();
          }}
        />
      )}

      {/* Simulator Modal */}
      {isSimulatorOpen && (
        <DisplayScheduleSimulatorModal
          displays={displays}
          onClose={() => setIsSimulatorOpen(false)}
        />
      )}
    </div>
  );
};
