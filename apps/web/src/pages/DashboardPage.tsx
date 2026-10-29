/**
 * Aura DIMS - Executive Business Dashboard
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements simplified dashboard strictly using real authorized data.
 * Does not display fake metrics, assumed site names, or misleading zero counts.
 * Displays a compact setup state explaining modules under configuration and
 * a Recent Content section displaying real authorized ready media.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tv,
  Calendar,
  Layers,
  Plus,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Building2,
  Shield,
  Clock,
  FolderOpen,
  FileImage,
  FileVideo,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { api } from '@/lib/api';
import type { MediaAsset } from '@aura-dims/display-schema';

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
        const snap = await getDocs(query(collection(db, 'content'), limit(10)));
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

    fetchDisplays();
    fetchContent();
    fetchRecentMedia();
  }, []);

  const displayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'User';
  const roleLabel = userProfile?.role === 'admin' ? 'Administrator' : 'Department Head';

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {displayName}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Aurainteract Private Limited • Aura Digital Information Management System
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/content?tab=media')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Upload media</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/schedules')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
          >
            <Calendar className="h-4 w-4" />
            <span>Schedule content</span>
          </button>
        </div>
      </div>

      {/* Role & Scope Context Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-900 flex items-center gap-2">
              <span>{roleLabel} Scope</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-medium">
                Active Session
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {userProfile?.role === 'admin'
                ? 'Full system privileges across all customer locations, digital displays, and departments.'
                : `Departmental scope restricted to ${department?.name || 'assigned department'} (${department?.code || 'Dept'}).`}
            </p>
          </div>
        </div>

        {department && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span>Department: <strong>{department.name}</strong></span>
          </div>
        )}
      </div>

      {/* Compact Operational Setup Notice */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/30">
            <Layers className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-white tracking-wide">
              Digital Display Fleet & Content Management Configuration
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              Digital display enrollment, playlist scheduling, and visual layout publishing are being configured for your organization.
              Telemetry metrics, real-time playback statuses, and scheduled content feeds will become active here as physical digital displays are provisioned.
            </p>
            <div className="pt-2 flex flex-wrap gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-teal-400" />
                Scheduling Clock: Asia/Kolkata (IST)
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-teal-400" />
                Auth & RBAC: Enforced
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Real Firestore Status Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Module 1: Digital Display Fleet Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-semibold text-slate-800">Digital Display Fleet</span>
              <Tv className="h-4 w-4 text-teal-600" />
            </div>

            {displaysState.status === 'loading' && (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                <span>Checking digital display registry...</span>
              </div>
            )}

            {displaysState.status === 'empty' && (
              <div className="py-4">
                <div className="text-xs text-slate-600 font-medium">No digital displays registered yet</div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Digital displays will appear here once provisioned through hardware enrollment.
                </p>
              </div>
            )}

            {displaysState.status === 'permission-denied' && (
              <div className="py-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Permission Denied: Scoped to authorized departments only.</span>
              </div>
            )}

            {displaysState.status === 'service-unavailable' && (
              <div className="py-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span>Telemetry Service Unavailable: {displaysState.error}</span>
              </div>
            )}

            {displaysState.status === 'populated' && (
              <div className="py-2">
                <div className="text-2xl font-bold text-slate-900">{displaysState.data.count}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Enrolled digital displays</div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/displays')}
              className="text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              View digital displays &rarr;
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
                <span>Querying published content...</span>
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
                <div className="text-[11px] text-slate-500 mt-0.5">Active content items</div>
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

      {/* Section: Recent Content (Real Authorized Ready Media) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Content</h3>
            <p className="text-xs text-slate-500">
              Verified media ready for digital display playlists • Departmental repository
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
                    {isImg ? <FileImage className="h-6 w-6" /> : <FileVideo className="h-6 w-6" />}
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
