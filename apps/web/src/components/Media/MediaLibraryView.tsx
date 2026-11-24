/**
 * Aura DIMS - Secure Departmental Media Library View
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Full-featured Media Asset Repository featuring:
 * 1. Scope tabs: This project | Department | Shared with me | Company library
 * 2. Project selector for project-scoped browsing
 * 3. Grid & List view modes with visibility, approval, and read-only indicators
 * 4. Upload modal with project scoping and cancellation
 * 5. Search and multidimensional filtering (Type, Department, Processing Status, Archived)
 * 6. Cursor-based pagination
 * 7. Media detail panel with metadata editing, project moving, and SHA-256 copy
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
  FolderKanban,
  Building2,
  Share2,
  Globe,
  Lock,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { MediaCard } from './MediaCard';
import { UploadMediaModal } from './UploadMediaModal';
import { MediaDetailModal } from './MediaDetailModal';
import type { MediaAsset, Department, ProjectRecord } from '@aura-dims/display-schema';

export interface MediaLibraryViewProps {
  projectId?: string;
}

export const MediaLibraryView: React.FC<MediaLibraryViewProps> = ({ projectId }) => {
  const { userProfile } = useAuth();

  // Scope state: 'project' | 'department' | 'shared' | 'global'
  const [activeScope, setActiveScope] = useState<'project' | 'department' | 'shared' | 'global'>(
    projectId ? 'project' : 'department'
  );
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || '');

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

  // Load active projects for the project selector dropdown
  useEffect(() => {
    async function loadProjects() {
      try {
        const deptToQuery =
          userProfile?.role === 'admin'
            ? selectedDeptId !== 'all'
              ? selectedDeptId
              : undefined
            : (userProfile?.departmentId || undefined);

        const res = await api.listProjects({
          departmentId: deptToQuery,
          status: 'active',
        });
        const projs = res.projects || [];
        setProjects(projs);

        if (!selectedProjectId && projs.length > 0 && projs[0]) {
          const defaultGen = projs.find((p) => p.isGeneral || p.id.startsWith('proj_general_'));
          setSelectedProjectId(defaultGen ? defaultGen.id : projs[0].id);
        }
      } catch (err) {
        console.warn('[Aura DIMS] Could not fetch projects list:', err);
      }
    }
    loadProjects();
  }, [userProfile?.departmentId, userProfile?.role, selectedDeptId, selectedProjectId]);

  // Fetch Media Assets based on Scope, Project, and Filters
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

        const projectToQuery =
          activeScope === 'project'
            ? projectId || selectedProjectId || undefined
            : undefined;

        const res = await api.listMediaAssets({
          departmentId: deptParam,
          projectId: projectToQuery,
          scope: activeScope,
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
            message: 'You do not have authorization to query media in this scope.',
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
    [
      userProfile?.role,
      userProfile?.departmentId,
      selectedDeptId,
      activeScope,
      projectId,
      selectedProjectId,
      selectedType,
      selectedStatus,
      searchQuery,
      pageSize,
      includeArchived,
    ]
  );

  // Trigger fetch when scope or filters change
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
      newHistory.pop();
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

  return (
    <div className="space-y-6">
      {/* Scope Navigation Tabs & Project Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <nav className="flex space-x-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveScope('project')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              activeScope === 'project'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>This Project</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScope('department')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              activeScope === 'department'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Department</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScope('shared')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              activeScope === 'shared'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Shared with me</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScope('global')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              activeScope === 'global'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Company Library</span>
          </button>
        </nav>

        {/* Project Selector (shown when in 'project' scope and not locked by fixed prop) */}
        {activeScope === 'project' && !projectId && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-slate-500 font-medium">Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="text-xs font-semibold rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:outline-teal-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isGeneral ? '(General)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

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
          onChange={(e) => setSelectedType(e.target.value as any)}
          className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All Types (Image & Video)</option>
          <option value="image">Images Only</option>
          <option value="video">Videos Only</option>
        </select>

        {/* Department Filter (Admin Only in department/shared views) */}
        {userProfile?.role === 'admin' && activeScope !== 'project' && (
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        )}

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as any)}
          className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All Processing States</option>
          <option value="ready">Ready (Verified)</option>
          <option value="validating">Validating</option>
          <option value="failed">Failed Verification</option>
          <option value="archived">Archived Media</option>
        </select>

        {/* Include Archived Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer ml-auto text-slate-600 font-medium">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded-sm border-slate-300 text-teal-600 focus:ring-teal-500 h-3.5 w-3.5"
          />
          <span>Show archived assets</span>
        </label>
      </div>

      {/* Main Content View (Grid or List) */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden p-3 space-y-3 animate-pulse shadow-xs"
            >
              <div className="aspect-video bg-slate-100 rounded-xl" />
              <div className="h-4 bg-slate-100 rounded-md w-3/4" />
              <div className="h-3 bg-slate-100 rounded-md w-1/2" />
            </div>
          ))}
        </div>
      ) : errorState ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          {errorState.kind === 'permission-denied' ? (
            <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto mb-3" />
          ) : (
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          )}
          <h3 className="text-base font-bold text-slate-900 mb-1">
            {errorState.kind === 'permission-denied' ? 'Access Restricted' : 'Unable to Load Media'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">{errorState.message}</p>
          <button
            type="button"
            onClick={() => fetchAssets(null)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
          <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 mb-1">No media assets found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5">
            {searchQuery
              ? 'No media assets matched your search filters.'
              : 'There are no media assets in this scope yet.'}
          </p>
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Upload first asset</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Layout */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => {
            const isReadOnly =
              (asset.visibility === 'shared' || asset.visibility === 'global') &&
              asset.departmentId !== userProfile?.departmentId &&
              userProfile?.role !== 'admin';

            return (
              <MediaCard
                key={asset.id}
                asset={asset}
                departmentName={departmentMap.get(asset.departmentId) || asset.departmentId}
                isReadOnly={isReadOnly}
                onClick={() => setSelectedAsset(asset)}
              />
            );
          })}
        </div>
      ) : (
        /* List Layout */
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Asset</th>
                <th className="py-3 px-4">Scope & Visibility</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((asset) => {
                const isReadOnly =
                  (asset.visibility === 'shared' || asset.visibility === 'global') &&
                  asset.departmentId !== userProfile?.departmentId &&
                  userProfile?.role !== 'admin';

                return (
                  <tr
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                        {asset.mediaType === 'image' ? (
                          <FileImage className="h-4 w-4" />
                        ) : (
                          <FileVideo className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                          {asset.title || asset.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate">{asset.id}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="capitalize px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {asset.visibility || 'project'}
                        </span>
                        {isReadOnly && (
                          <span title="Read-only shared asset">
                            <Lock className="h-3 w-3 text-slate-400" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 uppercase text-slate-600 font-medium">
                      {asset.mediaType}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {formatFileSize(asset.fileSizeBytes)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          asset.status === 'ready'
                            ? 'bg-emerald-50 text-emerald-700'
                            : asset.status === 'archived'
                            ? 'bg-slate-100 text-slate-600'
                            : asset.status === 'failed'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {asset.status === 'ready' && <ShieldCheck className="h-3 w-3" />}
                        <span className="capitalize">{asset.status.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(asset.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {!isLoading && !errorState && assets.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
          <div>
            Showing <span className="font-semibold text-slate-800">{assets.length}</span> assets
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
        preselectedProjectId={projectId || selectedProjectId || undefined}
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
