/**
 * Aura DIMS - Secure Departmental Media Library View
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Full-featured Media Asset Repository featuring:
 * 1. Grid & List view modes
 * 2. Upload modal with drag & drop and cancellation
 * 3. Search and multidimensional filtering (Type, Department, Processing Status, Archived)
 * 4. Cursor-based pagination
 * 5. Media detail and preview panel with metadata editing and SHA-256 copy
 * 6. Explicit Loading, Empty, Permission-denied, Processing failure, and Service-unavailable states.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UploadCloud,
  LayoutGrid,
  List,
  Search,
  Filter,
  RefreshCw,
  FolderOpen,
  FileImage,
  FileVideo,
  AlertCircle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { MediaCard } from './MediaCard';
import { UploadMediaModal } from './UploadMediaModal';
import { MediaDetailModal } from './MediaDetailModal';
import type { MediaAsset, Department } from '@aura-dims/display-schema';

export const MediaLibraryView: React.FC = () => {
  const { userProfile } = useAuth();

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filter and search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'image' | 'video'>('all');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'ready' | 'validating' | 'failed' | 'archived'>('all');
  const [includeArchived, setIncludeArchived] = useState(false);

  // Pagination states
  const [pageSize] = useState(12);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Data states
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<{
    kind: 'permission-denied' | 'service-unavailable' | 'error';
    message: string;
  } | null>(null);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);

  // Load departments list for Admin filter and name resolution
  useEffect(() => {
    async function loadDepts() {
      try {
        const snap = await getDocs(collection(db, 'departments'));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Department));
        setDepartments(list);
      } catch (err) {
        console.warn('[Aura DIMS] Could not fetch departments list:', err);
      }
    }
    loadDepts();
  }, []);

  // Fetch Media Assets
  const fetchAssets = useCallback(
    async (cursorToUse: string | null = null) => {
      setIsLoading(true);
      setErrorState(null);

      try {
        const deptParam =
          userProfile?.role === 'admin'
            ? selectedDeptId === 'all'
              ? undefined
              : selectedDeptId
            : (userProfile?.departmentId ?? undefined);

        const res = await api.listMediaAssets({
          departmentId: deptParam,
          mediaType: selectedType,
          status: selectedStatus,
          search: searchQuery.trim() || undefined,
          pageSize,
          cursor: cursorToUse,
          includeArchived: includeArchived || selectedStatus === 'archived',
        });

        setAssets(res.assets || []);
        setNextCursor(res.nextCursor);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('permission-denied')) {
          setErrorState({
            kind: 'permission-denied',
            message: 'You do not have authorization to query media in this departmental scope.',
          });
        } else if (msg.includes('unavailable') || msg.includes('ECONNREFUSED')) {
          setErrorState({
            kind: 'service-unavailable',
            message: 'Media Library service is currently unavailable. Please check backend connectivity.',
          });
        } else {
          setErrorState({
            kind: 'error',
            message: msg || 'An unexpected error occurred while loading media assets.',
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [userProfile?.role, userProfile?.departmentId, selectedDeptId, selectedType, selectedStatus, searchQuery, pageSize, includeArchived]
  );

  // Trigger fetch when filters change
  useEffect(() => {
    setCursorHistory([]);
    fetchAssets(null);
  }, [fetchAssets]);

  const handleNextPage = () => {
    if (nextCursor) {
      setCursorHistory((prev) => [...prev, nextCursor]);
      fetchAssets(nextCursor);
    }
  };

  const handlePreviousPage = () => {
    if (cursorHistory.length > 0) {
      const newHistory = [...cursorHistory];
      newHistory.pop(); // Remove current
      const prevCursor = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
      setCursorHistory(newHistory);
      fetchAssets(prevCursor ?? null);
    }
  };

  const departmentMap = useMemo(() => {
    const map = new Map<string, string>();
    departments.forEach((d) => map.set(d.id, d.name));
    return map;
  }, [departments]);

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds == null) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Action Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, filename, or tag..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
          />
        </div>

        {/* View Mode & Upload Button */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          {/* Grid / List View Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Grid View"
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-teal-700 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="List View"
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-teal-700 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchAssets(null)}
            title="Refresh Library"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Upload Button */}
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Upload media</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 font-medium mr-1">
          <Filter className="h-3.5 w-3.5" />
          <span>Filters:</span>
        </div>

        {/* Media Type Filter */}
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as 'all' | 'image' | 'video')}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All Media Types</option>
          <option value="image">Images Only (JPEG/PNG)</option>
          <option value="video">Videos Only (MP4 H.264)</option>
        </select>

        {/* Department Filter (Admin Only) */}
        {userProfile?.role === 'admin' ? (
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 font-semibold text-xs">
            Dept: {departmentMap.get(userProfile?.departmentId || '') || userProfile?.departmentId}
          </span>
        )}

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) =>
            setSelectedStatus(e.target.value as 'all' | 'ready' | 'validating' | 'failed' | 'archived')
          }
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All Statuses</option>
          <option value="ready">Ready (Verified)</option>
          <option value="validating">Validating</option>
          <option value="failed">Failed Verification</option>
          <option value="archived">Archived</option>
        </select>

        {/* Include Archived Toggle */}
        <label className="flex items-center gap-2 cursor-pointer ml-auto text-slate-600 hover:text-slate-900 select-none">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-3.5 w-3.5"
          />
          <span className="text-xs">Include archived</span>
        </label>
      </div>

      {/* Main Content State Handling */}
      {isLoading ? (
        /* Loading Skeleton */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs animate-pulse p-4 space-y-3"
            >
              <div className="aspect-video w-full rounded-xl bg-slate-200" />
              <div className="h-4 bg-slate-200 rounded-md w-3/4" />
              <div className="h-3 bg-slate-100 rounded-md w-1/2" />
            </div>
          ))}
        </div>
      ) : errorState ? (
        /* Explicit Error States */
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center max-w-lg mx-auto space-y-3">
          <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            {errorState.kind === 'permission-denied' ? (
              <ShieldAlert className="h-6 w-6" />
            ) : (
              <AlertCircle className="h-6 w-6" />
            )}
          </div>
          <h3 className="text-sm font-bold text-red-900">
            {errorState.kind === 'permission-denied'
              ? 'Access Denied'
              : errorState.kind === 'service-unavailable'
              ? 'Service Unavailable'
              : 'Error Loading Media Assets'}
          </h3>
          <p className="text-xs text-red-700 leading-relaxed">{errorState.message}</p>
          <button
            type="button"
            onClick={() => fetchAssets(null)}
            className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      ) : assets.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center max-w-lg mx-auto space-y-3">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto shadow-xs">
            <FolderOpen className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No Media Assets Found</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {searchQuery
              ? `No media assets matched "${searchQuery}". Try refining your search or active filters.`
              : 'Your departmental repository is empty. Upload JPEG/PNG images or MP4 videos to start preparing content for digital displays.'}
          </p>
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 shadow-xs transition-colors"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Upload first asset</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              departmentName={departmentMap.get(asset.departmentId) || asset.departmentId}
              onClick={() => setSelectedAsset(asset)}
            />
          ))}
        </div>
      ) : (
        /* List View */
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Dimensions</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((asset) => {
                  const isImg = asset.mediaType === 'image';
                  return (
                    <tr
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                            {isImg ? <FileImage className="h-4 w-4" /> : <FileVideo className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate max-w-xs">
                              {asset.title || asset.name}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate max-w-xs">{asset.fileName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 uppercase font-semibold text-slate-600">
                        {asset.mediaType}
                        {asset.durationSeconds ? (
                          <span className="text-[10px] text-slate-400 lowercase font-normal ml-1">
                            ({formatDuration(asset.durationSeconds)})
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {departmentMap.get(asset.departmentId) || asset.departmentId}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {asset.dimensions?.width && asset.dimensions?.height
                          ? `${asset.dimensions.width}×${asset.dimensions.height}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{formatFileSize(asset.fileSizeBytes)}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            asset.status === 'ready'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : asset.status === 'archived'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : asset.status === 'failed'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {asset.status === 'ready' && <ShieldCheck className="h-3 w-3" />}
                          <span className="capitalize">{asset.status.replace('_', ' ')}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(asset.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAsset(asset);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg text-teal-700 hover:bg-teal-50 border border-teal-200 transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && !errorState && assets.length > 0 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-900">{assets.length}</span> asset
            {assets.length === 1 ? '' : 's'} on this page
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={cursorHistory.length === 0}
              onClick={handlePreviousPage}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={!nextCursor}
              onClick={handleNextPage}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <UploadMediaModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        departments={departments}
        selectedDepartmentId={selectedDeptId !== 'all' ? selectedDeptId : undefined}
        onUploadSuccess={(newAsset) => {
          setAssets((prev) => [newAsset, ...prev]);
        }}
      />

      <MediaDetailModal
        asset={selectedAsset}
        isOpen={Boolean(selectedAsset)}
        onClose={() => setSelectedAsset(null)}
        departments={departments}
        onAssetUpdated={(updated) => {
          setSelectedAsset(updated);
          setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        }}
      />
    </div>
  );
};
