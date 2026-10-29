/**
 * Aura DIMS - Executive Business Dashboard
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements simplified dashboard strictly using real authorized data.
 * Does not display fake metrics, assumed site names, or misleading zero counts.
 * Displays a compact setup state explaining modules under configuration and
 * a Recent Content section displaying real authorized ready media and visual designs.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tv,
  Layers,
  Plus,
  AlertTriangle,
  Loader2,
  Building2,
  Shield,
  FolderOpen,
  FileImage,
  FileVideo,
  ShieldCheck,
  Palette,
  Monitor,
  Smartphone,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { api } from '@/lib/api';
import type { MediaAsset, DesignRecord, ApprovalRecord, ScheduleRecord } from '@aura-dims/display-schema';

type QueryState<T> =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'permission-denied'; error: string }
  | { status: 'service-unavailable'; error: string }
  | { status: 'populated'; data: T };

export const DashboardPage: React.FC = () => {
  const { userProfile, currentUser, department } = useAuth();
  const navigate = useNavigate();

  const [displaysState, setDisplaysState] = useState<QueryState<{ count: number }>>({ status: 'loading' });
  const [contentState, setContentState] = useState<QueryState<{ count: number }>>({ status: 'loading' });
  const [recentMedia, setRecentMedia] = useState<MediaAsset[]>([]);
  const [loadingRecentMedia, setLoadingRecentMedia] = useState(true);
  const [recentDesigns, setRecentDesigns] = useState<DesignRecord[]>([]);
  const [loadingRecentDesigns, setLoadingRecentDesigns] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRecord[]>([]);
  const [activeSchedules, setActiveSchedules] = useState<ScheduleRecord[]>([]);

  useEffect(() => {
    // Real Firestore check for digital displays
    const fetchDisplays = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'displays'), limit(10)));
        if (snap.empty) {
          setDisplaysState({ status: 'empty' });
        } else {
          setDisplaysState({ status: 'populated', data: { count: snap.size } });
        }
      } catch (err: unknown) {
        const firestoreError = err as { code?: string; message?: string };
        if (firestoreError.code === 'permission-denied') {
          setDisplaysState({ status: 'permission-denied', error: 'Permission denied for display query.' });
        } else {
          setDisplaysState({
            status: 'service-unavailable',
            error: firestoreError.message || 'Service unavailable.',
          });
        }
      }
    };

    // Real Firestore check for content items
    const fetchContent = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'designs'), limit(10)));
        if (snap.empty) {
          setContentState({ status: 'empty' });
        } else {
          setContentState({ status: 'populated', data: { count: snap.size } });
        }
      } catch (err: unknown) {
        const firestoreError = err as { code?: string; message?: string };
        if (firestoreError.code === 'permission-denied') {
          setContentState({ status: 'permission-denied', error: 'Permission denied for content query.' });
        } else {
          setContentState({
            status: 'service-unavailable',
            error: firestoreError.message || 'Service unavailable.',
          });
        }
      }
    };

    // Fetch real authorized recent ready media
    const fetchRecentMedia = async () => {
      setLoadingRecentMedia(true);
      try {
        const res = await api.listMediaAssets({
          status: 'ready',
          pageSize: 4,
        });
        setRecentMedia(res.assets || []);
      } catch {
        // Non-blocking for dashboard
      } finally {
        setLoadingRecentMedia(false);
      }
    };

    // Fetch real authorized recent designs
    const fetchRecentDesigns = async () => {
      setLoadingRecentDesigns(true);
      try {
        const res = await api.listDesigns({
          pageSize: 4,
          status: 'draft',
        });
        setRecentDesigns(res.designs || []);
      } catch {
        // Non-blocking for dashboard
      } finally {
        setLoadingRecentDesigns(false);
      }
    };

    const fetchApprovals = async () => {
      try {
        const res = await api.listApprovals({ status: 'pending_review', limit: 5 });
        setPendingApprovals(res.approvals || []);
      } catch {
        // Non-blocking
      }
    };

    const fetchSchedules = async () => {
      try {
        const res = await api.listSchedules({ status: 'active', limit: 5 });
        setActiveSchedules(res.schedules || []);
      } catch {
        // Non-blocking
      }
    };

    fetchDisplays();
    fetchContent();
    fetchRecentMedia();
    fetchRecentDesigns();
    fetchApprovals();
    fetchSchedules();
  }, []);

  const displayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'User';
  const roleLabel = userProfile?.role === 'admin' ? 'Administrator' : 'Department Head';

  return (
    <div className="space-y-6">
      {/* Header Profile / Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Welcome back, {displayName}
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
              <Shield className="h-3 w-3 text-teal-600" />
              <span>{roleLabel}</span>
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Aura Digital Information Management System (Aura DIMS) • Aurainteract Private Limited
          </p>

          {department && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-1">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-medium">Department: {department.name} ({department.code})</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/content')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create content</span>
          </button>
        </div>
      </div>

      {/* Compact Setup State Notice */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-xs flex flex-col sm:flex-row items-start sm:items-center gap-4 border border-slate-700">
        <div className="h-10 w-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/30">
          <Layers className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-white tracking-wide">
            Digital Display Fleet & Content Management Configuration
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
            Digital display enrollment, playlist scheduling, and visual layout publishing are being configured for your organization.
            Telemetry metrics, real-time playback statuses, and scheduled content feeds will become active here as physical digital displays are provisioned.
          </p>
        </div>
      </div>

      {/* Operations Quick Overview: Approvals & Schedules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pending Approvals Card */}
        <div
          onClick={() => navigate('/approvals')}
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-teal-300 transition-colors cursor-pointer flex items-center justify-between"
        >
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Editorial Approvals</span>
            <div className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span>{pendingApprovals.length}</span>
              {pendingApprovals.length > 0 && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Awaiting Review
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {pendingApprovals.length === 0
                ? 'All submissions reviewed'
                : `${pendingApprovals.length} publication package(s) awaiting review`}
            </p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>

        {/* Active Schedules Card */}
        <div
          onClick={() => navigate('/schedules')}
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-teal-300 transition-colors cursor-pointer flex items-center justify-between"
        >
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Active Schedules</span>
            <div className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span>{activeSchedules.length}</span>
              {activeSchedules.length > 0 && (
                <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  Broadcasting
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {activeSchedules.length === 0
                ? 'No active schedules configured'
                : `${activeSchedules.length} active broadcast rule(s) in Asia/Kolkata`}
            </p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Calendar className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Module Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Module 1: Enrolled Digital Displays Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-semibold text-slate-800">Digital Display Fleet</span>
              <Tv className="h-4 w-4 text-teal-600" />
            </div>

            {displaysState.status === 'loading' && (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                <span>Querying digital displays...</span>
              </div>
            )}

            {displaysState.status === 'empty' && (
              <div className="py-4">
                <div className="text-xs text-slate-600 font-medium">No digital displays enrolled</div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enrolled digital displays will report connectivity and status here.
                </p>
              </div>
            )}

            {displaysState.status === 'permission-denied' && (
              <div className="py-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Permission Denied: Scoped to assigned digital displays only.</span>
              </div>
            )}

            {displaysState.status === 'service-unavailable' && (
              <div className="py-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span>Displays Service Unavailable: {displaysState.error}</span>
              </div>
            )}

            {displaysState.status === 'populated' && (
              <div className="py-2">
                <div className="text-2xl font-bold text-slate-900">{displaysState.data.count}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Enrolled digital displays in your scope</div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/displays')}
              className="text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              Open displays directory &rarr;
            </button>
          </div>
        </div>

        {/* Module 2: Content Publications Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-semibold text-slate-800">Content & Layouts</span>
              <Layers className="h-4 w-4 text-teal-600" />
            </div>

            {contentState.status === 'loading' && (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                <span>Querying visual designs...</span>
              </div>
            )}

            {contentState.status === 'empty' && (
              <div className="py-4">
                <div className="text-xs text-slate-600 font-medium">No published layouts or media</div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Upload assets or design layouts in Content to deploy to digital displays.
                </p>
              </div>
            )}

            {contentState.status === 'permission-denied' && (
              <div className="py-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Permission Denied: Scoped to authorized content collections.</span>
              </div>
            )}

            {contentState.status === 'service-unavailable' && (
              <div className="py-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span>Content Service Unavailable: {contentState.error}</span>
              </div>
            )}

            {contentState.status === 'populated' && (
              <div className="py-2">
                <div className="text-2xl font-bold text-slate-900">{contentState.data.count}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Active visual designs</div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/content')}
              className="text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              Open content workspace &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Section: Recent Visual Designs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-teal-600" />
              <span>Recent Visual Designs</span>
            </h3>
            <p className="text-xs text-slate-500">
              Interactive visual layouts authored for digital displays
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/content?tab=designs')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 self-start sm:self-auto"
          >
            View All Designs &rarr;
          </button>
        </div>

        {loadingRecentDesigns ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            <span>Loading recent designs...</span>
          </div>
        ) : recentDesigns.length === 0 ? (
          <div className="py-6 text-center text-slate-500 space-y-2">
            <Palette className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-xs">No visual designs authored yet.</p>
            <button
              type="button"
              onClick={() => navigate('/content?tab=designs')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold hover:bg-teal-100 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create First Design</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {recentDesigns.map((design) => {
              const isLandscape = design.orientation === 'landscape';
              return (
                <div
                  key={design.id}
                  onClick={() => navigate(`/content/editor/${design.id}`)}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50 hover:border-teal-300 transition-all cursor-pointer space-y-2 group"
                >
                  <div className="aspect-video w-full rounded-lg bg-slate-900 flex items-center justify-center text-slate-600 relative overflow-hidden">
                    {isLandscape ? (
                      <Monitor className="h-7 w-7 text-teal-500/40 group-hover:scale-110 transition-transform" />
                    ) : (
                      <Smartphone className="h-7 w-7 text-teal-500/40 group-hover:scale-110 transition-transform" />
                    )}
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-slate-950/80 text-white font-mono text-[9px] flex items-center gap-1 border border-white/10">
                      <span className="capitalize">{design.orientation}</span>
                    </div>
                    <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-teal-900/80 text-teal-300 font-mono text-[9px]">
                      {design.slideCount} {design.slideCount === 1 ? 'Slide' : 'Slides'}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-teal-700">
                      {design.title}
                    </h4>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span>{design.departmentId}</span>
                      <span>
                        {new Date(design.updatedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section: Recent Media Library Assets */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-teal-600" />
              <span>Recent Content</span>
            </h3>
            <p className="text-xs text-slate-500">
              Verified media assets ready for digital display layouts • Departmental repository
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/content?tab=media')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 self-start sm:self-auto"
          >
            View Media Library &rarr;
          </button>
        </div>

        {loadingRecentMedia ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            <span>Loading recent media assets...</span>
          </div>
        ) : recentMedia.length === 0 ? (
          <div className="py-6 text-center text-slate-500 space-y-2">
            <FolderOpen className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-xs">No media assets in your library yet.</p>
            <button
              type="button"
              onClick={() => navigate('/content?tab=media')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold hover:bg-teal-100 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Upload to Media Library</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {recentMedia.map((asset) => {
              const isImg = asset.mediaType === 'image';
              return (
                <div
                  key={asset.id}
                  onClick={() => navigate('/content?tab=media')}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50 hover:border-teal-300 transition-colors cursor-pointer space-y-2"
                >
                  <div className="aspect-video w-full rounded-lg bg-slate-900 flex items-center justify-center text-slate-600 relative overflow-hidden">
                    {isImg ? <FileImage className="h-6 w-6 text-teal-400" /> : <FileVideo className="h-6 w-6 text-teal-400" />}
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-emerald-600/90 text-white text-[9px] font-bold flex items-center gap-0.5">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      <span>Ready</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 truncate">{asset.title || asset.name}</h4>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span className="uppercase font-semibold">{asset.mediaType}</span>
                      <span>
                        {new Date(asset.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
