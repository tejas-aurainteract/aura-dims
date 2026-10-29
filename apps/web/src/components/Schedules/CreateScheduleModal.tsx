/**
 * Aura DIMS - Create / Edit Broadcast Schedule Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Configures date windows, dayparting, weekly recurrence, and priority in Asia/Kolkata.
 * Enforces orientation compatibility, target display assignments, and conflict preflight checks.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Monitor,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type {
  ScheduleRecord,
  ScheduleRule,
  DisplayOrientation,
  PlaylistRecord,
  DigitalDisplay,
} from '@aura-dims/display-schema';
import {
  validateScheduleRule,
  detectScheduleConflicts,
} from '@aura-dims/display-schema';

interface CreateScheduleModalProps {
  schedule?: ScheduleRecord | null;
  departmentId: string;
  onClose: () => void;
  onSaved: () => void;
}

export const CreateScheduleModal: React.FC<CreateScheduleModalProps> = ({
  schedule,
  departmentId,
  onClose,
  onSaved,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const isEditing = !!schedule;

  const [title, setTitle] = useState(schedule?.title || '');
  const [orientation, setOrientation] = useState<DisplayOrientation>(
    schedule?.orientation || 'landscape'
  );

  // Playlists
  const [availablePlaylists, setAvailablePlaylists] = useState<PlaylistRecord[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(schedule?.playlistRevisionId || '');
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  // Target Digital Displays
  const [availableDisplays, setAvailableDisplays] = useState<DigitalDisplay[]>([]);
  const [selectedDisplayIds, setSelectedDisplayIds] = useState<string[]>(
    schedule?.targetDisplayIds || []
  );
  const [loadingDisplays, setLoadingDisplays] = useState(false);

  // Schedule Rule Form
  const [scheduleType, setScheduleType] = useState<'one_time' | 'recurring'>(
    schedule?.scheduleRule.scheduleType || 'recurring'
  );
  const [startDate, setStartDate] = useState(
    schedule?.scheduleRule.startDate ||
      new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(
    schedule?.scheduleRule.endDate ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState(schedule?.scheduleRule.startTime || '08:00');
  const [endTime, setEndTime] = useState(schedule?.scheduleRule.endTime || '18:00');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    schedule?.scheduleRule.daysOfWeek || [1, 2, 3, 4, 5] // Mon-Fri default
  );
  const [priority, setPriority] = useState<number>(schedule?.scheduleRule.priority || 5);
  const [overrideExpiresAt, setOverrideExpiresAt] = useState<string>(
    schedule?.scheduleRule.overrideExpiresAt || ''
  );

  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOvernight = startTime > endTime;

  // Load playlists for orientation
  useEffect(() => {
    const fetchPlaylists = async () => {
      setLoadingPlaylists(true);
      try {
        const res = await api.listPlaylists({
          departmentId: isAdmin ? undefined : departmentId,
          orientation,
          includeArchived: false,
        });
        setAvailablePlaylists(res.playlists);
        if (res.playlists.length > 0 && res.playlists[0] && !selectedPlaylistId) {
          setSelectedPlaylistId(res.playlists[0].id);
        }
      } catch (err) {
        console.error('Failed to load playlists:', err);
      } finally {
        setLoadingPlaylists(false);
      }
    };

    fetchPlaylists();
  }, [orientation, departmentId, isAdmin]);

  // Load eligible digital displays
  useEffect(() => {
    const fetchDisplays = async () => {
      setLoadingDisplays(true);
      try {
        // Query displays via Firestore directly (reading authorized /displays)
        const { collection, getDocs, query, where } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');

        let q = query(
          collection(db, 'displays'),
          where('orientation', '==', orientation),
          where('lifecycle', '==', 'active')
        );

        if (!isAdmin) {
          q = query(q, where('departmentId', '==', departmentId));
        }

        const snap = await getDocs(q);
        const disps: DigitalDisplay[] = [];
        snap.forEach((d) => disps.push({ id: d.id, ...(d.data() as any) }));
        setAvailableDisplays(disps);

        // Preselect all available displays if none selected
        if (selectedDisplayIds.length === 0 && disps.length > 0 && disps[0]) {
          setSelectedDisplayIds([disps[0].id]);
        }
      } catch (err) {
        console.error('Failed to load eligible digital displays:', err);
      } finally {
        setLoadingDisplays(false);
      }
    };

    fetchDisplays();
  }, [orientation, departmentId, isAdmin]);

  const toggleDayOfWeek = (day: number) => {
    if (daysOfWeek.includes(day)) {
      if (daysOfWeek.length > 1) {
        setDaysOfWeek(daysOfWeek.filter((d) => d !== day));
      }
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  const toggleDisplaySelection = (displayId: string) => {
    if (selectedDisplayIds.includes(displayId)) {
      if (selectedDisplayIds.length > 1) {
        setSelectedDisplayIds(selectedDisplayIds.filter((id) => id !== displayId));
      }
    } else {
      setSelectedDisplayIds([...selectedDisplayIds, displayId]);
    }
  };

  const handlePreflightConflictCheck = async () => {
    setError(null);
    setConflictWarning(null);

    const rule: ScheduleRule = {
      scheduleType,
      startDate,
      endDate,
      startTime,
      endTime,
      isOvernight,
      daysOfWeek,
      priority,
      overrideExpiresAt: priority === 10 ? overrideExpiresAt : null,
      timezone: 'Asia/Kolkata',
    };

    const val = validateScheduleRule(rule);
    if (!val.valid) {
      setError(val.errors.join(' '));
      return;
    }

    try {
      const res = await api.listSchedules({
        departmentId: isAdmin ? undefined : departmentId,
        limit: 100,
      });

      const candidateSchedules = res.schedules.filter(
        (s) => s.id !== schedule?.id && (s.status === 'active' || s.status === 'approved')
      );

      // Create dummy schedule representing the current draft
      const draftCandidate: ScheduleRecord = {
        id: 'draft-candidate',
        title: title || 'Draft Schedule',
        departmentId,
        playlistRevisionId: selectedPlaylistId,
        playlistTitle: 'Draft',
        approvalId: null,
        targetDisplayIds: selectedDisplayIds,
        orientation,
        scheduleRule: rule,
        fallbackConfig: { type: 'bundled' },
        status: 'active',
        ownerId: userProfile?.uid || 'user',
        ownerDisplayName: userProfile?.displayName || 'User',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const testSchedules = [...candidateSchedules, draftCandidate];
      let foundConflict = false;

      for (const dId of selectedDisplayIds) {
        const cRes = detectScheduleConflicts(testSchedules, dId, orientation);
        if (cRes.hasConflict && cRes.conflicts.length > 0 && cRes.conflicts[0]) {
          const c = cRes.conflicts[0];
          setConflictWarning(
            `Conflict warning on digital display '${dId}' at ${c.date} ${c.time}: overlaps with schedule [${c.conflictingTitles.join(', ')}] with equal priority (${c.priority}).`
          );
          foundConflict = true;
          break;
        }
      }

      if (!foundConflict) {
        setConflictWarning('Preflight check passed: No equal-priority collisions detected.');
      }
    } catch (err: any) {
      console.error('Conflict preflight check failed:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a schedule title.');
      return;
    }
    if (!selectedPlaylistId) {
      setError('Please select a playlist.');
      return;
    }
    if (selectedDisplayIds.length === 0) {
      setError('Select at least one eligible digital display.');
      return;
    }

    const playlist = availablePlaylists.find((p) => p.id === selectedPlaylistId);
    const playlistTitle = playlist?.title || 'Selected Playlist';

    const rule: ScheduleRule = {
      scheduleType,
      startDate,
      endDate,
      startTime,
      endTime,
      isOvernight,
      daysOfWeek,
      priority,
      overrideExpiresAt: priority === 10 ? overrideExpiresAt : null,
      timezone: 'Asia/Kolkata',
    };

    const val = validateScheduleRule(rule);
    if (!val.valid) {
      setError(val.errors.join(' '));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // First ensure the playlist has a frozen revision
      const revRes = await api.createPlaylistRevision({
        playlistId: selectedPlaylistId,
      });

      if (isEditing) {
        await api.updateSchedule({
          scheduleId: schedule.id,
          title: title.trim(),
          playlistRevisionId: revRes.revision.id,
          playlistTitle,
          targetDisplayIds: selectedDisplayIds,
          scheduleRule: rule,
          fallbackConfig: { type: 'bundled' },
        });
      } else {
        await api.createSchedule({
          title: title.trim(),
          departmentId,
          playlistRevisionId: revRes.revision.id,
          playlistTitle,
          targetDisplayIds: selectedDisplayIds,
          orientation,
          scheduleRule: rule,
          fallbackConfig: { type: 'bundled' },
        });
      }

      onSaved();
    } catch (err: any) {
      console.error('Failed to save schedule:', err);
      setError(err?.message || 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing ? 'Edit Schedule' : 'Create Broadcast Schedule'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Calibrated to Asia/Kolkata (UTC+05:30) • Maps playlists to target digital displays
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {conflictWarning && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                conflictWarning.includes('passed')
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {conflictWarning.includes('passed') ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              )}
              <span>{conflictWarning}</span>
            </div>
          )}

          {/* Title & Orientation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Schedule Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Standard Weekday Lobby Broadcast"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Display Orientation <span className="text-rose-500">*</span>
              </label>
              {isEditing ? (
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 font-medium">
                  {orientation === 'landscape' ? 'Landscape (1920×1080)' : 'Portrait (1080×1920)'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOrientation('landscape');
                      setSelectedDisplayIds([]);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${
                      orientation === 'landscape'
                        ? 'border-teal-600 bg-teal-50/50 text-teal-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Monitor className="h-4 w-4" />
                    <span>Landscape</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrientation('portrait');
                      setSelectedDisplayIds([]);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${
                      orientation === 'portrait'
                        ? 'border-teal-600 bg-teal-50/50 text-teal-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Smartphone className="h-4 w-4" />
                    <span>Portrait</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Playlist Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Playlist ({orientation}) <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={selectedPlaylistId}
              onChange={(e) => setSelectedPlaylistId(e.target.value)}
              disabled={loadingPlaylists || availablePlaylists.length === 0}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              {loadingPlaylists ? (
                <option>Loading playlists...</option>
              ) : availablePlaylists.length === 0 ? (
                <option value="">No matching {orientation} playlists found</option>
              ) : (
                availablePlaylists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.totalDurationSeconds}s total • {p.items?.length || 0} designs)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Target Digital Displays Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Target Digital Displays ({selectedDisplayIds.length} selected) <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Only active {orientation} digital displays shown
              </span>
            </div>

            {loadingDisplays ? (
              <div className="py-4 text-center text-xs text-slate-400">Loading digital displays...</div>
            ) : availableDisplays.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                No active {orientation} digital displays available in your department.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                {availableDisplays.map((d) => {
                  const isSelected = selectedDisplayIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDisplaySelection(d.id)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/40 text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <p className="font-semibold truncate">{d.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{d.locationDescription}</p>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'border-slate-300'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Schedule Window Section */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-teal-600" />
                <span>Scheduling Parameters (Asia/Kolkata)</span>
              </span>

              {/* Type Switcher */}
              <div className="flex items-center bg-white p-0.5 border border-slate-200 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setScheduleType('recurring')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    scheduleType === 'recurring' ? 'bg-teal-600 text-white font-medium' : 'text-slate-600'
                  }`}
                >
                  Weekly Recurring
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('one_time')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    scheduleType === 'one_time' ? 'bg-teal-600 text-white font-medium' : 'text-slate-600'
                  }`}
                >
                  One-Time Window
                </button>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  End Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Time Window */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Start Time (HH:mm) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  End Time (HH:mm) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                />
              </div>
            </div>

            {isOvernight && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                <strong>Overnight Window Detected:</strong> Start time ({startTime}) is later than end time ({endTime}).
                In accordance with Aura DIMS scheduling policy, an overnight Monday window ending Tuesday morning belongs to Monday's recurrence.
              </div>
            )}

            {/* Recurring Days of Week */}
            {scheduleType === 'recurring' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-slate-700">Days of Week</label>
                  <div className="flex gap-2 text-[10px] text-teal-600 font-medium">
                    <button
                      type="button"
                      onClick={() => setDaysOfWeek([1, 2, 3, 4, 5])}
                      className="hover:underline"
                    >
                      Weekdays
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setDaysOfWeek([0, 6])}
                      className="hover:underline"
                    >
                      Weekends
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}
                      className="hover:underline"
                    >
                      All 7 Days
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, idx) => {
                    const active = daysOfWeek.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDayOfWeek(idx)}
                        className={`py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Priority Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Broadcast Priority (1=Normal, 9=High)
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                >
                  <option value={1}>Priority 1 - Background / Low</option>
                  <option value={3}>Priority 3 - General Corporate</option>
                  <option value={5}>Priority 5 - Standard Scheduled</option>
                  <option value={7}>Priority 7 - Department Urgent</option>
                  <option value={9}>Priority 9 - High Operational Notice</option>
                  {isAdmin && <option value={10}>Priority 10 - Administrator Emergency Override</option>}
                </select>
              </div>

              {priority === 10 && (
                <div>
                  <label className="block text-[11px] font-semibold text-rose-700 mb-1">
                    Emergency Override Expiration (Required) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={overrideExpiresAt}
                    onChange={(e) => setOverrideExpiresAt(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs text-slate-900"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Conflict Preflight Check Action */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-600">
              <span className="font-semibold block text-slate-900">Collision Detection</span>
              <span>Verify that this schedule does not collide with equal priority on any targeted display.</span>
            </div>
            <button
              type="button"
              onClick={handlePreflightConflictCheck}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 rounded-lg transition-colors shrink-0 ml-3"
            >
              Run Conflict Check
            </button>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
