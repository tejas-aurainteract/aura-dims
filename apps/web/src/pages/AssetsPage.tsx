/**
 * Aura DIMS - Centralized Assets Management Hub
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Leader-only workspace (Admin & Department Head) for organizing, uploading,
 * and sharing media assets across departments with folder hierarchy.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderOpen,
  FolderPlus,
  Upload,
  Search,
  LayoutGrid,
  List,
  ChevronRight,
  FileImage,
  FileVideo,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Folder,
  Check,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { startMediaUpload, type UploadProgressEvent } from '@/lib/mediaUpload';
import { MediaDetailModal } from '@/components/Media/MediaDetailModal';
import type { MediaAsset, Department } from '@aura-dims/display-schema';

export interface AssetFolder {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  departmentId?: string | null;
}

const SYSTEM_FOLDERS: AssetFolder[] = [
  { id: 'system_images', name: 'Images', createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'system_videos', name: 'Videos', createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z' },
];

export const AssetsPage: React.FC = () => {
  const { userProfile, currentUser } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // Data state
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Active navigation folder (null = root)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Filtering & view mode
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'image' | 'video'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals state
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFolderId, setUploadFolderId] = useState<string>('');
  const [isGlobalShared, setIsGlobalShared] = useState(false);
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressEvent | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Detail modal state
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);

  // 1. Subscribe to Folders
  useEffect(() => {
    const q = query(collection(db, 'asset_folders'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as AssetFolder[];
        setFolders(list);
      },
      (err) => {
        console.warn('[AssetsPage] Error loading folders:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Load Departments
  useEffect(() => {
    async function loadDepts() {
      try {
        const q = query(collection(db, 'departments'), where('status', '==', 'active'));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Department));
        setDepartments(list.length > 0 ? list : snap.docs.map((d) => ({ id: d.id, ...d.data() } as Department)));
      } catch (err) {
        console.warn('[AssetsPage] Error querying active departments, retrying all:', err);
        try {
          const snap = await getDocs(collection(db, 'departments'));
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Department));
          setDepartments(list.filter((d) => d.status === 'active'));
        } catch (innerErr) {
          console.error('[AssetsPage] Error loading departments:', innerErr);
        }
      }
    }
    loadDepts();
  }, []);

  // 3. Load Assets
  const loadAssets = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.listMediaAssets({
        scope: isAdmin ? 'all' : 'department',
        departmentId: userProfile?.departmentId || undefined,
        pageSize: 500,
        includeArchived: false,
      });
      setAssets(res.assets || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load assets.';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, userProfile?.departmentId]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // Combine system folders (Images, Videos) with custom folders
  const allFolders = useMemo(() => {
    const custom = folders.filter(
      (f) => f.name.toLowerCase() !== 'images' && f.name.toLowerCase() !== 'videos'
    );
    return [...SYSTEM_FOLDERS, ...custom];
  }, [folders]);

  // Active folder object
  const activeFolder = useMemo(() => {
    return allFolders.find((f) => f.id === activeFolderId) || null;
  }, [allFolders, activeFolderId]);

  // Assets grouped by folder count
  const folderAssetCounts = useMemo(() => {
    const map = new Map<string, number>();
    assets.forEach((a) => {
      const type = a.mediaType || a.type;
      if (type === 'image') {
        map.set('system_images', (map.get('system_images') || 0) + 1);
      } else if (type === 'video') {
        map.set('system_videos', (map.get('system_videos') || 0) + 1);
      }

      const folderTag = a.tags?.find((t) => t.startsWith('folder:'));
      if (folderTag) {
        const fId = folderTag.replace('folder:', '');
        if (fId !== 'system_images' && fId !== 'system_videos') {
          map.set(fId, (map.get(fId) || 0) + 1);
        }
      }
    });
    return map;
  }, [assets]);

  // Filtered assets for current view
  const displayedAssets = useMemo(() => {
    return assets.filter((asset) => {
      const type = asset.mediaType || asset.type;

      // Folder filtering
      if (activeFolderId) {
        if (activeFolderId === 'system_images' || activeFolder?.name.toLowerCase() === 'images') {
          if (type !== 'image' && !asset.tags?.includes('folder:system_images')) return false;
        } else if (activeFolderId === 'system_videos' || activeFolder?.name.toLowerCase() === 'videos') {
          if (type !== 'video' && !asset.tags?.includes('folder:system_videos')) return false;
        } else {
          const matchesFolder = asset.tags?.includes(`folder:${activeFolderId}`);
          if (!matchesFolder) return false;
        }
      }

      // Search query filtering
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = asset.title?.toLowerCase().includes(q);
        const matchesFileName = asset.fileName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesFileName) return false;
      }

      // Media type filtering
      if (selectedType !== 'all') {
        if (type !== selectedType) return false;
      }

      return true;
    });
  }, [assets, activeFolderId, activeFolder, searchQuery, selectedType]);

  // Create Folder Handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    setFolderError(null);
    try {
      const folderId = `folder_${Date.now()}`;
      const newFolder: AssetFolder = {
        id: folderId,
        name: newFolderName.trim(),
        createdBy: currentUser?.uid || 'user',
        createdAt: new Date().toISOString(),
        departmentId: userProfile?.departmentId || null,
      };

      await setDoc(doc(db, 'asset_folders', folderId), newFolder);
      setIsFolderModalOpen(false);
      setNewFolderName('');
    } catch (err: unknown) {
      setFolderError(err instanceof Error ? err.message : 'Failed to create folder.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Delete Folder Handler
  const handleDeleteFolder = async (folderId: string, folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const count = folderAssetCounts.get(folderId) || 0;
    if (count > 0) {
      alert(`Cannot delete folder "${folderName}" because it contains ${count} asset(s). Move or delete the assets first.`);
      return;
    }

    if (!confirm(`Delete folder "${folderName}"?`)) return;

    try {
      await deleteDoc(doc(db, 'asset_folders', folderId));
      if (activeFolderId === folderId) {
        setActiveFolderId(null);
      }
    } catch (err) {
      alert('Failed to delete folder.');
    }
  };

  // Open Upload Modal with preset folder
  const handleOpenUpload = (targetFolderId?: string | null) => {
    const fId = targetFolderId || activeFolderId || allFolders[0]?.id || 'system_images';
    setUploadFile(null);
    setUploadTitle('');
    setUploadDescription('');
    setUploadFolderId(fId);
    setIsGlobalShared(false);
    setSelectedDeptIds(userProfile?.departmentId ? [userProfile.departmentId] : []);
    setUploadError(null);
    setUploadProgress(null);
    setIsUploadModalOpen(true);
  };

  // Upload Asset Handler
  const handleStartUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    if (!uploadFolderId) {
      setUploadError('Please select a folder to upload into.');
      return;
    }

    const isImageFile = uploadFile.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(uploadFile.name);
    const isVideoFile = uploadFile.type.startsWith('video/') || /\.(mp4|m4v|mov)$/i.test(uploadFile.name);

    if (uploadFolderId === 'system_images' && !isImageFile) {
      setUploadError('The Images folder only accepts JPEG and PNG image files. Please select an image.');
      return;
    }

    if (uploadFolderId === 'system_videos' && !isVideoFile) {
      setUploadError('The Videos folder only accepts MP4 video files. Please select a video.');
      return;
    }

    if (!isGlobalShared && selectedDeptIds.length === 0) {
      setUploadError('Please select at least one department or choose Organization Global.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Build sharedWith array
      const sharedWithTargets = isGlobalShared
        ? ['dept:global']
        : selectedDeptIds.map((id) => `dept:${id}`);

      // Build tags
      const tags: string[] = [];
      if (uploadFolderId) {
        tags.push(`folder:${uploadFolderId}`);
      }

      // Department owner
      const targetDeptId = userProfile?.departmentId || departments[0]?.id || 'general';

      const handle = startMediaUpload({
        file: uploadFile,
        title: uploadTitle.trim() || uploadFile.name,
        description: uploadDescription.trim(),
        departmentId: targetDeptId,
        visibility: isGlobalShared ? 'global' : 'department',
        sharedWith: sharedWithTargets,
        tags,
        onProgress: (evt) => {
          setUploadProgress(evt);
        },
      });

      const newAsset = await handle.done;

      // Ensure folder tag is persisted if folder was selected
      if (uploadFolderId) {
        try {
          await updateDoc(doc(db, 'assets', newAsset.id), {
            tags: [...(newAsset.tags || []), `folder:${uploadFolderId}`],
          });
        } catch {
          // Non-critical
        }
      }

      setIsUploadModalOpen(false);
      loadAssets();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  // Toggle department in upload multi-select
  const handleToggleDept = (deptId: string) => {
    setSelectedDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <button
              type="button"
              onClick={() => setActiveFolderId(null)}
              className="hover:text-teal-700 font-medium"
            >
              Assets
            </button>
            {activeFolder && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-semibold text-slate-800">{activeFolder.name}</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {activeFolder ? activeFolder.name : 'Central Assets'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Folder-organized media assets with cross-department sharing • Aurainteract Private Limited
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeFolder && (
            <>
              <button
                type="button"
                onClick={() => setActiveFolderId(null)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>All Folders</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenUpload(activeFolderId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
              >
                <Upload className="h-4 w-4" />
                <span>Upload to {activeFolder.name}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setNewFolderName('');
              setFolderError(null);
              setIsFolderModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <FolderPlus className="h-4 w-4 text-teal-600" />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setLoadError(null)}
            className="text-xs text-red-600 hover:text-red-800 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Root View: Folders Grid & Segregation Explainer */}
      {!activeFolderId ? (
        <div className="space-y-6">
          {/* Informative Folder Banner */}
          <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-teal-500/5 p-4 rounded-2xl border border-teal-200/80 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-teal-600 text-white shadow-xs shrink-0 mt-0.5">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Folder-Organized Media Repository</h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Assets are segregated by media category and folder. Open the <strong>Images</strong> or <strong>Videos</strong> folder to access media uploaded across all projects and departments, or create a custom folder. Assets can only be uploaded from inside a destination folder.
              </p>
            </div>
          </div>

          {/* Folders Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Media Folders</h2>
              <span className="text-[11px] text-slate-400">{allFolders.length} folder(s)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {allFolders.map((f) => {
                const count = folderAssetCounts.get(f.id) || 0;
                const isSystem = f.id === 'system_images' || f.id === 'system_videos';
                const isImages = f.id === 'system_images' || f.name.toLowerCase() === 'images';
                const isVideos = f.id === 'system_videos' || f.name.toLowerCase() === 'videos';

                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFolderId(f.id)}
                    className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-teal-500/60 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors ${isImages
                            ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
                            : isVideos
                              ? 'bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white'
                              : 'bg-teal-50 text-teal-700 group-hover:bg-teal-600 group-hover:text-white'
                            }`}
                        >
                          {isImages ? (
                            <FileImage className="h-6 w-6" />
                          ) : isVideos ? (
                            <FileVideo className="h-6 w-6" />
                          ) : (
                            <Folder className="h-6 w-6" />
                          )}
                        </div>

                        {isSystem ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            Auto-Categorized
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteFolder(f.id, f.name, e)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-opacity hover:bg-red-50"
                            title="Delete folder"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="mt-4">
                        <h3 className="font-bold text-sm text-slate-900 group-hover:text-teal-700 transition-colors">
                          {f.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {isImages
                            ? 'All JPEG & PNG image assets from projects'
                            : isVideos
                              ? 'All MP4 video assets from projects'
                              : 'Custom department media folder'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{count} asset{count === 1 ? '' : 's'}</span>
                      <span className="text-teal-600 group-hover:translate-x-0.5 transition-transform font-medium flex items-center gap-1 text-[11px]">
                        Open Folder <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Folder View: Search Bar & Asset Contents */
        <div className="space-y-4">
          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={`Search assets in ${activeFolder?.name || 'folder'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-teal-500 text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Type Filter only for custom folders that can hold both */}
              {activeFolderId !== 'system_images' && activeFolderId !== 'system_videos' && (
                <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedType('all')}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors ${selectedType === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    All Types
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedType('image')}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors ${selectedType === 'image' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Images
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedType('video')}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors ${selectedType === 'video' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Videos
                  </button>
                </div>
              )}

              {/* View Mode Toggle */}
              <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Assets Listing */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {activeFolder ? `Assets in ${activeFolder.name}` : 'Media Assets'}
              </h2>
              <span className="text-[11px] text-slate-400">{displayedAssets.length} asset(s)</span>
            </div>

            {loading ? (
              <div className="py-16 bg-white rounded-2xl border border-slate-200 text-center flex flex-col items-center justify-center">
                <Loader2 className="h-6 w-6 text-teal-600 animate-spin mb-2" />
                <p className="text-xs text-slate-500">Loading assets repository...</p>
              </div>
            ) : displayedAssets.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center">
                {activeFolderId === 'system_videos' ? (
                  <FileVideo className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                ) : (
                  <FileImage className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                )}
                <p className="text-xs font-semibold text-slate-700">No assets found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {activeFolder
                    ? `No media assets in "${activeFolder.name}" yet.`
                    : 'Upload assets directly into this folder.'}
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenUpload(activeFolderId)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-2xs"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload to {activeFolder?.name}</span>
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayedAssets.map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-sm hover:border-teal-500/50 transition-all cursor-pointer flex flex-col"
                  >
                    {/* Media Thumbnail */}
                    <div className="aspect-video bg-slate-100 relative overflow-hidden flex items-center justify-center">
                      {asset.thumbnailPath ? (
                        <img
                          src={asset.thumbnailPath}
                          alt={asset.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="text-slate-400 flex flex-col items-center gap-1">
                          {asset.mediaType === 'video' ? (
                            <FileVideo className="h-8 w-8" />
                          ) : (
                            <FileImage className="h-8 w-8" />
                          )}
                        </div>
                      )}

                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-black/60 text-white backdrop-blur-xs">
                        {asset.mediaType || asset.type}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-semibold text-xs text-slate-900 truncate" title={asset.title}>
                          {asset.title || asset.fileName}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{asset.fileName}</p>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{(asset.fileSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">
                          {asset.visibility === 'global' ? 'Global' : 'Shared'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Asset</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Visibility</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedAssets.map((asset) => (
                      <tr
                        key={asset.id}
                        onClick={() => setSelectedAsset(asset)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{asset.title}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{asset.fileName}</div>
                        </td>
                        <td className="py-3 px-4 uppercase text-[10px] font-semibold text-slate-600">
                          {asset.mediaType || asset.type}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {(asset.fileSizeBytes / 1024 / 1024).toFixed(1)} MB
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                            {asset.visibility === 'global' ? 'Organization Global' : 'Department Shared'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(asset.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create Folder */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-teal-600" />
                <span>New Asset Folder</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFolderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {folderError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                {folderError}
              </div>
            )}

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Folder Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Images, Videos, Brand Logos"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFolderModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 shadow-2xs"
                >
                  {isCreatingFolder ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Upload Asset with Folder & Multi-Department Selector */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="h-5 w-5 text-teal-600" />
                <span>Upload New Asset</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleStartUpload} className="space-y-4">
              {/* File Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Media File</label>
                <input
                  type="file"
                  required
                  accept={
                    uploadFolderId === 'system_images'
                      ? 'image/jpeg,image/png'
                      : uploadFolderId === 'system_videos'
                        ? 'video/mp4'
                        : 'image/jpeg,image/png,video/mp4'
                  }
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setUploadFile(f);
                      if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {uploadFolderId === 'system_images'
                    ? 'Supported formats: JPEG, PNG (max 20MB)'
                    : uploadFolderId === 'system_videos'
                      ? 'Supported formats: MP4 H.264 (max 200MB)'
                      : 'Supported formats: JPEG, PNG (max 20MB) and MP4 H.264 (max 200MB)'}
                </p>
              </div>

              {/* Title & Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Asset Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Corporate Welcome Banner"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Description <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief note about this asset..."
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 text-slate-900 resize-none"
                />
              </div>

              {/* Target Folder Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Target Folder</label>
                <select
                  value={uploadFolderId}
                  onChange={(e) => {
                    setUploadFolderId(e.target.value);
                    setUploadError(null);
                  }}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 text-slate-900"
                >
                  {allFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name} {f.id === 'system_images' ? '(Images only)' : f.id === 'system_videos' ? '(Videos only)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department Availability Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Availability & Visibility
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Choose whether this asset is restricted to specific departments or made an Organization-wide General Asset.
                </p>

                <div className="space-y-3 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                  {/* Scope Selector: Specific Depts vs General Asset */}
                  <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setIsGlobalShared(false);
                        setUploadError(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold text-center transition-all ${
                        !isGlobalShared
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Department Scoped
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsGlobalShared(true);
                        setUploadError(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold text-center transition-all ${
                        isGlobalShared
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      General Asset (Global)
                    </button>
                  </div>

                  {isGlobalShared ? (
                    <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5 text-teal-900">
                        <Check className="h-4 w-4 text-teal-600 shrink-0" />
                        <span>Organization-Wide General Asset</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {isAdmin
                          ? 'As an Administrator, uploading this general asset makes it immediately available to all departments across the organization.'
                          : 'Uploading as a General Asset will submit an approval request to the Administrator. Once approved, this asset will become available to all departments and digital displays.'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                        Select departments to make this asset available in (multi-select):
                      </span>
                      {departments.length === 0 ? (
                        <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-500">
                          Loading departments...
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pt-1">
                          {departments.map((dept) => {
                            const isChecked = selectedDeptIds.includes(dept.id);
                            return (
                              <label
                                key={dept.id}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-teal-50 border-teal-300 text-teal-900 font-semibold'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleDept(dept.id)}
                                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-3.5 w-3.5"
                                />
                                <span className="truncate">{dept.name} ({dept.code})</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Progress Indicator */}
              {uploadProgress && (
                <div className="space-y-1.5 p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs">
                  <div className="flex justify-between text-teal-950 font-semibold">
                    <span>{uploadProgress.message}</span>
                    <span>{uploadProgress.progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-teal-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 transition-all duration-150"
                      style={{ width: `${uploadProgress.progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 shadow-2xs"
                >
                  {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{isUploading ? 'Uploading...' : 'Upload Asset'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset Detail & Preview Modal */}
      {selectedAsset && (
        <MediaDetailModal
          asset={selectedAsset}
          isOpen={Boolean(selectedAsset)}
          onClose={() => setSelectedAsset(null)}
          departments={departments}
          onAssetUpdated={(updated) => {
            setSelectedAsset(updated);
            loadAssets();
          }}
        />
      )}
    </div>
  );
};
