/**
 * Aura DIMS - Digital Displays Fleet Management & Delivery Telemetry
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Strictly use "digital display" in all user-facing text, badges, and tooltips.
 * Real-time monitoring of device delivery stages, storage, health, and playback presentation.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Tv,
  Plus,
  Search,
  RefreshCw,
  Key,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  X,
  Copy,
  Shield,
  MapPin,
  Building,
  Activity,
} from 'lucide-react';
import { collection, onSnapshot, getDocs, query, where, type Query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type {
  DigitalDisplay,
  DisplayView,
  DisplayOrientation,
} from '@aura-dims/display-schema';

export const DisplaysPage: React.FC = () => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [displays, setDisplays] = useState<DisplayView[]>([]);
  const [sites, setSites] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [orientationFilter, setOrientationFilter] = useState<'all' | 'landscape' | 'portrait'>('all');
  const [connectivityFilter, setConnectivityFilter] = useState<'all' | 'online' | 'offline' | 'never_connected'>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'active' | 'syncing' | 'failed' | 'lag'>('all');

  // Modals state
  const [registerModalOpen, setRegisterModalOpen] = useState<boolean>(false);
  const [pairingModalDisplay, setPairingModalDisplay] = useState<DigitalDisplay | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [detailsModalDisplay, setDetailsModalDisplay] = useState<DisplayView | null>(null);

  // Form State for Register Modal
  const [formName, setFormName] = useState<string>('');
  const [formSiteId, setFormSiteId] = useState<string>('');
  const [formDeptId, setFormDeptId] = useState<string>(userProfile?.departmentId || '');
  const [formLocation, setFormLocation] = useState<string>('');
  const [formOrientation, setFormOrientation] = useState<DisplayOrientation>('landscape');
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load reference metadata: Sites & Departments
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [sitesSnap, deptsSnap] = await Promise.all([
          getDocs(collection(db, 'sites')),
          getDocs(collection(db, 'departments')),
        ]);
        const siteMap: Record<string, string> = {};
        sitesSnap.forEach((doc) => {
          siteMap[doc.id] = (doc.data().name as string) || doc.id;
        });
        setSites(siteMap);

        const deptMap: Record<string, string> = {};
        deptsSnap.forEach((doc) => {
          deptMap[doc.id] = (doc.data().name as string) || doc.id;
        });
        setDepartments(deptMap);
      } catch (err) {
        console.warn('Metadata loading warning:', err);
      }
    }
    loadMetadata();
  }, []);

  // Real-time Firestore subscription to /displays with server fallback
  useEffect(() => {
    setLoading(true);

    const mapDisplayRecord = (id: string, d: any): DisplayView => {
      const nowMs = Date.now();
      let lastHeartbeatMs: number | null = null;
      if (d.lastHeartbeatAt) {
        lastHeartbeatMs = typeof d.lastHeartbeatAt.toMillis === 'function'
          ? d.lastHeartbeatAt.toMillis()
          : new Date(d.lastHeartbeatAt).getTime();
      }

      let connectivity: 'never_connected' | 'online' | 'offline' = 'never_connected';
      if (lastHeartbeatMs !== null && !isNaN(lastHeartbeatMs)) {
        connectivity = nowMs - lastHeartbeatMs <= 180_000 ? 'online' : 'offline';
      }

      return {
        id,
        name: d.name || 'Unnamed Digital Display',
        siteId: d.siteId || '',
        siteName: sites[d.siteId] || d.siteId || 'Site Unassigned',
        locationDescription: d.locationDescription || '',
        departmentId: d.departmentId || '',
        departmentName: departments[d.departmentId] || d.departmentId || 'Department Unassigned',
        groupIds: d.groupIds || [],
        groupNames: [],
        orientation: d.orientation || 'landscape',
        configuredResolution: d.configuredResolution || { width: 1920, height: 1080 },
        lifecycle: d.lifecycle || 'active',
        desiredPublicationId: d.desiredPublicationId || null,
        activePublicationId: d.activePublicationId || null,
        deliveryStage: d.deliveryStage || d.reported?.deliveryStage || 'idle',
        lastSyncAt: d.lastSyncAt ? (typeof d.lastSyncAt.toDate === 'function' ? d.lastSyncAt.toDate().toISOString() : String(d.lastSyncAt)) : null,
        lastDeliveryError: d.lastDeliveryError || null,
        lastHeartbeatAt: d.lastHeartbeatAt ? (typeof d.lastHeartbeatAt.toDate === 'function' ? d.lastHeartbeatAt.toDate().toISOString() : String(d.lastHeartbeatAt)) : null,
        reported: d.reported || null,
        connectivity,
        enrolledAt: d.enrolledAt ? (typeof d.enrolledAt.toDate === 'function' ? d.enrolledAt.toDate().toISOString() : String(d.enrolledAt)) : null,
        createdBy: d.createdBy || '',
        createdAt: d.createdAt ? (typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate().toISOString() : String(d.createdAt)) : '',
        updatedAt: d.updatedAt ? (typeof d.updatedAt.toDate === 'function' ? d.updatedAt.toDate().toISOString() : String(d.updatedAt)) : '',
      };
    };

    const fetchViaApi = async () => {
      try {
        const res = await api.listDisplays({
          departmentId: isAdmin ? undefined : (userProfile?.departmentId || undefined),
        });
        const items = (res.displays || []).map((d) => mapDisplayRecord(d.id, d));
        items.sort((a, b) => a.name.localeCompare(b.name));
        setDisplays(items);
        setError(null);
      } catch (apiErr: any) {
        console.error('[Aura DIMS] Failed to fetch digital displays via API:', apiErr);
        setError(apiErr?.message || 'Failed to stream digital display fleet telemetry.');
      } finally {
        setLoading(false);
      }
    };

    let q: Query;
    if (isAdmin) {
      q = collection(db, 'displays');
    } else if (userProfile?.departmentId) {
      q = query(collection(db, 'displays'), where('departmentId', '==', userProfile.departmentId));
    } else {
      // Caller has neither admin role nor department - fetch via API to get authoritative server response
      fetchViaApi();
      return;
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: DisplayView[] = [];
        snapshot.forEach((doc) => {
          items.push(mapDisplayRecord(doc.id, doc.data()));
        });
        items.sort((a, b) => a.name.localeCompare(b.name));
        setDisplays(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn('[Aura DIMS] Real-time digital displays subscription warning (falling back to backend API):', err?.message || err);
        // Resilient fallback: Query via Admin SDK callable function
        fetchViaApi();
      }
    );

    return () => unsubscribe();
  }, [isAdmin, userProfile?.departmentId, sites, departments]);

  // Filtered displays
  const filteredDisplays = useMemo(() => {
    return displays.filter((d) => {
      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = d.name.toLowerCase().includes(term);
        const matchesLoc = d.locationDescription.toLowerCase().includes(term);
        const matchesSite = (d.siteName || '').toLowerCase().includes(term);
        if (!matchesName && !matchesLoc && !matchesSite) return false;
      }

      // Orientation
      if (orientationFilter !== 'all' && d.orientation !== orientationFilter) return false;

      // Connectivity
      if (connectivityFilter !== 'all' && d.connectivity !== connectivityFilter) return false;

      // Delivery Status
      if (deliveryFilter === 'active') {
        if (d.deliveryStage !== 'active') return false;
      } else if (deliveryFilter === 'syncing') {
        if (!['downloading', 'verifying', 'ready'].includes(d.deliveryStage || '')) return false;
      } else if (deliveryFilter === 'failed') {
        if (d.deliveryStage !== 'failed') return false;
      } else if (deliveryFilter === 'lag') {
        if (!d.desiredPublicationId || d.desiredPublicationId === d.activePublicationId) return false;
      }

      return true;
    });
  }, [displays, searchTerm, orientationFilter, connectivityFilter, deliveryFilter]);

  // Fleet KPI Aggregates
  const kpis = useMemo(() => {
    const total = displays.length;
    const online = displays.filter((d) => d.connectivity === 'online').length;
    const offline = displays.filter((d) => d.connectivity === 'offline').length;
    const activePlayback = displays.filter((d) => d.deliveryStage === 'active').length;
    const versionLag = displays.filter(
      (d) => d.desiredPublicationId && d.desiredPublicationId !== d.activePublicationId
    ).length;

    return { total, online, offline, activePlayback, versionLag };
  }, [displays]);

  // Generate pairing code handler
  const handleGeneratePairingCode = async (display: DigitalDisplay) => {
    setPairingModalDisplay(display);
    setPairingLoading(true);
    setPairingCode(null);
    setCopiedCode(false);

    try {
      if (display.lifecycle !== 'pending_enrollment') {
        await api.resetEnrollment({ displayId: display.id });
      }
      const res = await api.generateDisplayPairingCode({ displayId: display.id });
      setPairingCode(res.pairingCode);
      setPairingExpiresAt(res.expiresAt);
    } catch (err: any) {
      alert(`Could not generate pairing code: ${err?.message || err}`);
      setPairingModalDisplay(null);
    } finally {
      setPairingLoading(false);
    }
  };

  // Register display handler
  const handleRegisterDisplay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formSiteId || !formDeptId) {
      setFormError('Please fill all required digital display configuration fields.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      const res = await api.registerDisplay({
        name: formName.trim(),
        siteId: formSiteId,
        departmentId: formDeptId,
        locationDescription: formLocation.trim(),
        orientation: formOrientation,
        configuredResolution: formOrientation === 'landscape'
          ? { width: 1920, height: 1080 }
          : { width: 1080, height: 1920 },
      });

      setRegisterModalOpen(false);
      setFormName('');
      setFormLocation('');
      // Open pairing modal immediately for the new display
      handleGeneratePairingCode(res.display);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to register digital display.');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Tv className="w-7 h-7 text-teal-400" />
            <h1 className="text-2xl font-bold tracking-tight text-white">Digital Displays Fleet Management</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Operational governance, publication verification, and live playback presentation monitoring across Aurainteract customer sites.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setRegisterModalOpen(true);
              setFormError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium shadow-sm transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Register Digital Display
          </button>
        )}
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Registered Fleet</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-white">{kpis.total}</span>
            <Tv className="w-5 h-5 text-slate-500" />
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Configured digital displays</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Online Displays</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-emerald-400">{kpis.online}</span>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Heartbeat &lt; 3 mins</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Offline Displays</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-amber-400">{kpis.offline}</span>
            <Clock className="w-5 h-5 text-amber-500/70" />
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Autonomous offline playback</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-teal-400 uppercase tracking-wider">Active Presentation</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-teal-400">{kpis.activePlayback}</span>
            <Play className="w-5 h-5 text-teal-500" />
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Targeted package verified</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-rose-400 uppercase tracking-wider">Version Sync Lag</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-rose-400">{kpis.versionLag}</span>
            <RefreshCw className="w-5 h-5 text-rose-500" />
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Desired ≠ Active package</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search digital display name, location, or site..."
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Orientation Filter */}
          <select
            value={orientationFilter}
            onChange={(e) => setOrientationFilter(e.target.value as any)}
            className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Orientations</option>
            <option value="landscape">Landscape (1920×1080)</option>
            <option value="portrait">Portrait (1080×1920)</option>
          </select>

          {/* Connectivity Filter */}
          <select
            value={connectivityFilter}
            onChange={(e) => setConnectivityFilter(e.target.value as any)}
            className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Connectivity</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="never_connected">Never Connected</option>
          </select>

          {/* Delivery Filter */}
          <select
            value={deliveryFilter}
            onChange={(e) => setDeliveryFilter(e.target.value as any)}
            className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Delivery States</option>
            <option value="active">Active Presentation</option>
            <option value="syncing">Syncing (Download/Verify)</option>
            <option value="lag">Version Lag (Pending Sync)</option>
            <option value="failed">Failed Verification</option>
          </select>
        </div>
      </div>

      {/* Digital Displays Grid / List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full mb-3"></div>
          <p className="text-slate-400 text-sm">Streaming digital display fleet telemetry...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-950/20 border border-rose-800/50 rounded-xl text-rose-300 text-sm text-center">
          {error}
        </div>
      ) : filteredDisplays.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
          <Tv className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No digital displays matched your criteria</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
            Try adjusting your search terms or filter selections.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDisplays.map((display) => (
            <div
              key={display.id}
              className="bg-slate-900/70 border border-slate-800 hover:border-slate-700/80 transition-all rounded-xl p-5 flex flex-col justify-between shadow-sm relative group"
            >
              {/* Header Badges */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    {/* Connectivity badge */}
                    {display.connectivity === 'online' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Online
                      </span>
                    ) : display.connectivity === 'offline' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        Offline
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                        <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                        Unpaired
                      </span>
                    )}

                    {/* Orientation badge */}
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
                      {display.orientation === 'landscape' ? 'Landscape 16:9' : 'Portrait 9:16'}
                    </span>
                  </div>

                  {/* Lifecycle badge */}
                  {display.lifecycle === 'pending_enrollment' ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-950/80 text-indigo-400 border border-indigo-800/60">
                      Pending Enrollment
                    </span>
                  ) : display.lifecycle === 'suspended' ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-950/80 text-rose-400 border border-rose-800/60">
                      Suspended
                    </span>
                  ) : null}
                </div>

                {/* Display Title & Location */}
                <h3 className="text-base font-bold text-white group-hover:text-teal-400 transition-colors">
                  {display.name}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{display.locationDescription || 'Location not specified'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                  <Building className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{display.siteName} • {display.departmentName}</span>
                </div>

                {/* Telemetry & Delivery Progress Bar */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2.5">
                  {/* Delivery Status Badge */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Delivery Status:</span>
                    {display.deliveryStage === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-teal-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Active Presentation
                      </span>
                    ) : display.deliveryStage === 'downloading' ? (
                      <span className="inline-flex items-center gap-1 text-blue-400 font-medium">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Downloading Assets
                      </span>
                    ) : display.deliveryStage === 'verifying' ? (
                      <span className="inline-flex items-center gap-1 text-yellow-400 font-medium">
                        <Shield className="w-3.5 h-3.5 animate-pulse" />
                        Verifying SHA-256
                      </span>
                    ) : display.deliveryStage === 'failed' ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-medium" title={display.lastDeliveryError || 'Unknown error'}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Verification Failed
                      </span>
                    ) : (
                      <span className="text-slate-500 font-medium">Idle / Standby</span>
                    )}
                  </div>

                  {/* Version Match / Lag */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Publication Version:</span>
                    {display.desiredPublicationId ? (
                      <span className="font-mono text-slate-300">
                        {display.activePublicationId ? (
                          display.desiredPublicationId === display.activePublicationId ? (
                            <span className="text-emerald-400">v.{display.activePublicationId.slice(-6)} (Synced)</span>
                          ) : (
                            <span className="text-amber-400">
                              v.{display.activePublicationId.slice(-6)} → v.{display.desiredPublicationId.slice(-6)} (Lag)
                            </span>
                          )
                        ) : (
                          <span className="text-blue-400">Target v.{display.desiredPublicationId.slice(-6)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-500">None Targeted</span>
                    )}
                  </div>

                  {/* Current Playing Content */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Playing Now:</span>
                    <span className="text-slate-300 truncate max-w-[170px]" title={display.reported?.playback?.currentSlideId || 'Fallback'}>
                      {display.reported?.playback?.currentPlaylistId
                        ? `Slide ${display.reported?.playback?.currentSlideId || 'Active'}`
                        : 'Corporate Neutral Fallback'}
                    </span>
                  </div>

                  {/* Local Storage Metric */}
                  {display.reported?.storage && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Device Storage:</span>
                        <span>
                          {((display.reported.storage.freeBytes || 0) / (1024 * 1024 * 1024)).toFixed(1)} GB free / {((display.reported.storage.totalBytes || 0) / (1024 * 1024 * 1024)).toFixed(1)} GB
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-teal-500 h-full rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                ((display.reported.storage.usedBytes || 0) /
                                  (display.reported.storage.totalBytes || 1)) *
                                  100
                              )
                            )}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Last Heartbeat */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Last heartbeat:</span>
                    <span>
                      {display.lastHeartbeatAt
                        ? new Date(display.lastHeartbeatAt).toLocaleTimeString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          }) + ' IST'
                        : 'Never connected'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => setDetailsModalDisplay(display)}
                  className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 font-medium"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Full Telemetry
                </button>

                {isAdmin && (
                  <button
                    onClick={() => handleGeneratePairingCode(display)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-400 hover:text-teal-300 text-xs font-medium transition-colors"
                  >
                    <Key className="w-3 h-3" />
                    Pairing Code
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Pairing Code Generated */}
      {pairingModalDisplay && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setPairingModalDisplay(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-teal-400 mb-2">
              <Key className="w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Digital Display Enrollment Code</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Single-use cryptographic enrollment code for digital display: <strong className="text-slate-200">{pairingModalDisplay.name}</strong>.
            </p>

            {pairingLoading ? (
              <div className="py-8 text-center">
                <div className="inline-block animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full mb-2"></div>
                <p className="text-xs text-slate-400">Generating secure CSPRNG pairing token...</p>
              </div>
            ) : pairingCode ? (
              <div className="space-y-4">
                <div className="p-4 bg-slate-950 border-2 border-dashed border-teal-500/50 rounded-xl text-center">
                  <span className="font-mono text-3xl font-extrabold tracking-widest text-teal-300 select-all">
                    {pairingCode}
                  </span>
                  <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 mt-2">
                    <Clock className="w-3 h-3" />
                    <span>Valid until {pairingExpiresAt ? new Date(pairingExpiresAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) + ' IST' : '15 minutes'}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pairingCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedCode ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied to Clipboard' : 'Copy Code'}
                  </button>
                  <button
                    onClick={() => setPairingModalDisplay(null)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    Done
                  </button>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <span className="font-semibold text-slate-300">How to enroll:</span>
                  <p>1. Power on the digital display player kiosk.</p>
                  <p>2. Enter this 6-character code on the first-run enrollment screen.</p>
                  <p>3. Or in terminal: <code className="text-teal-400 font-mono">pnpm run player:agent --pair {pairingCode}</code></p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal: Register Digital Display */}
      {registerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setRegisterModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-teal-400 mb-1">
              <Tv className="w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Register Digital Display</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Add a new physical digital display asset to the Aura DIMS enterprise fleet.
            </p>

            <form onSubmit={handleRegisterDisplay} className="space-y-4">
              {formError && (
                <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-lg">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Digital Display Name <span className="text-teal-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Boardroom Totem Display"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Enterprise Site <span className="text-teal-400">*</span>
                  </label>
                  <select
                    required
                    value={formSiteId}
                    onChange={(e) => setFormSiteId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Select site...</option>
                    {Object.entries(sites).map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Department <span className="text-teal-400">*</span>
                  </label>
                  <select
                    required
                    value={formDeptId}
                    onChange={(e) => setFormDeptId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Select department...</option>
                    {Object.entries(departments).map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Location Description
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. Ground Floor Reception Area"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Display Orientation <span className="text-teal-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormOrientation('landscape')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                      formOrientation === 'landscape'
                        ? 'border-teal-500 bg-teal-950/30 text-teal-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="w-4 h-2.5 border border-current rounded-sm"></span>
                    Landscape (1920×1080)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormOrientation('portrait')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                      formOrientation === 'portrait'
                        ? 'border-teal-500 bg-teal-950/30 text-teal-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="w-2.5 h-4 border border-current rounded-sm"></span>
                    Portrait (1080×1920)
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium flex items-center gap-1.5"
                >
                  {formSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Register &amp; Generate Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Full Telemetry & Diagnostics Drawer */}
      {detailsModalDisplay && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setDetailsModalDisplay(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-teal-400 mb-1">
              <Activity className="w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Digital Display Diagnostics &amp; Delivery</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Live hardware telemetry and sync metrics for: <strong className="text-slate-200">{detailsModalDisplay.name}</strong>
            </p>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
                <span className="font-semibold text-slate-300 block mb-1">Hardware &amp; Runtime</span>
                <p className="text-slate-400">ID: <code className="text-teal-400 font-mono">{detailsModalDisplay.id}</code></p>
                <p className="text-slate-400">Orientation: <span className="text-slate-200">{detailsModalDisplay.orientation}</span></p>
                <p className="text-slate-400">Configured Resolution: <span className="text-slate-200">{detailsModalDisplay.configuredResolution.width}×{detailsModalDisplay.configuredResolution.height}</span></p>
                <p className="text-slate-400">App Version: <span className="text-slate-200">{detailsModalDisplay.reported?.appVersion || '1.0.0'}</span></p>
                <p className="text-slate-400">Renderer Health: <span className="text-emerald-400">{detailsModalDisplay.reported?.rendererHealth || 'healthy'}</span></p>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
                <span className="font-semibold text-slate-300 block mb-1">Delivery State Machine</span>
                <p className="text-slate-400">Current Stage: <span className="text-teal-400 font-bold uppercase">{detailsModalDisplay.deliveryStage}</span></p>
                <p className="text-slate-400">Active Package: <span className="font-mono text-slate-200">{detailsModalDisplay.activePublicationId || 'None'}</span></p>
                <p className="text-slate-400">Targeted Package: <span className="font-mono text-slate-200">{detailsModalDisplay.desiredPublicationId || 'None'}</span></p>
                <p className="text-slate-400">Version Sync Lag: <span className={detailsModalDisplay.desiredPublicationId === detailsModalDisplay.activePublicationId ? 'text-emerald-400' : 'text-amber-400'}>
                  {detailsModalDisplay.desiredPublicationId === detailsModalDisplay.activePublicationId ? 'Zero (In Sync)' : 'Pending Synchronization'}
                </span></p>
              </div>
            </div>

            {/* Playback presentation details */}
            <div className="mt-4 p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-2">
              <span className="font-semibold text-slate-300 block">Current Playback Presentation</span>
              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <p>Playlist ID: <span className="text-slate-200 font-mono">{detailsModalDisplay.reported?.playback?.currentPlaylistId || 'Neutral Fallback'}</span></p>
                <p>Slide ID: <span className="text-slate-200 font-mono">{detailsModalDisplay.reported?.playback?.currentSlideId || 'Fallback Slide'}</span></p>
                <p>Playing State: <span className="text-emerald-400 font-semibold">{detailsModalDisplay.reported?.playback?.isPlaying ? 'Actively Rendering' : 'Idle / Standby'}</span></p>
                <p>Slide Started At: <span className="text-slate-200">{detailsModalDisplay.reported?.playback?.lastSlideStartedAt ? new Date(detailsModalDisplay.reported.playback.lastSlideStartedAt).toLocaleTimeString('en-IN') : 'N/A'}</span></p>
              </div>
            </div>

            {/* Error banner if verification failed */}
            {detailsModalDisplay.lastDeliveryError && (
              <div className="mt-4 p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 text-xs">
                <span className="font-semibold block mb-0.5">Last Delivery Exception:</span>
                {detailsModalDisplay.lastDeliveryError}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setDetailsModalDisplay(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
