/**
 * Aura DIMS - Editor Asset Picker Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Integrated departmental asset picker for inserting Ready media into
 * digital display layouts. Supports direct in-modal media uploads.
 */

import React, { useState, useEffect, useRef } from 'react';
import { MediaAsset } from '@aura-dims/display-schema';
import { api } from '@/lib/api';
import {
  X,
  Search,
  Image as ImageIcon,
  Video as VideoIcon,
  Clock,
  Loader2,
  FolderOpen,
  UploadCloud,
  AlertCircle,
} from 'lucide-react';
import { resolveAssetUrl } from '@/lib/assetResolver';
import { useAuth } from '@/contexts/AuthContext';
import { startMediaUpload, validateMediaFileClient, type UploadProgressEvent } from '@/lib/mediaUpload';

export interface EditorAssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaType: 'image' | 'video';
  onSelectAsset: (asset: MediaAsset) => void;
}

export const EditorAssetPickerModal: React.FC<EditorAssetPickerModalProps> = ({
  isOpen,
  onClose,
  mediaType,
  onSelectAsset,
}) => {
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In-modal direct upload states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressEvent | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listMediaAssets({
        mediaType,
        status: 'ready',
        search: search.trim() || undefined,
        pageSize: 24,
        includeArchived: false,
      });

      setAssets(res.assets);

      // Resolve thumbnail URLs for retrieved assets
      const thumbMap = new Map<string, string>();
      await Promise.all(
        res.assets.map(async (a) => {
          const url = await resolveAssetUrl(a.id, 'thumbnail');
          if (url) thumbMap.set(a.id, url);
        })
      );
      setThumbnails(thumbMap);
    } catch (err: any) {
      setError(err.message || 'Failed to load media assets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchAssets();
  }, [isOpen, mediaType, search]);

  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const validation = validateMediaFileClient(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const deptId = userProfile?.departmentId || 'global';
    setIsUploading(true);

    try {
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      const handle = startMediaUpload({
        file,
        departmentId: deptId,
        title: cleanTitle,
        onProgress: (evt) => {
          setUploadProgress(evt);
        },
      });

      const readyAsset = await handle.done;
      // Auto-select the newly uploaded and verified asset
      onSelectAsset(readyAsset);
      onClose();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload and validate asset on server.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              {mediaType === 'image' ? (
                <ImageIcon className="w-5 h-5" />
              ) : (
                <VideoIcon className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Select {mediaType === 'image' ? 'Image' : 'Video'} Asset
              </h2>
              <p className="text-xs text-slate-500">
                Choose or upload an asset for this digital display slide
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden File Input for Direct Upload */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={
            mediaType === 'image'
              ? '.jpg,.jpeg,.png,image/jpeg,image/png'
              : '.mp4,.mov,.m4v,video/mp4,video/quicktime'
          }
          onChange={handleDirectUpload}
        />

        {/* Uploading progress notification bar */}
        {isUploading && uploadProgress && (
          <div className="px-6 py-2.5 bg-teal-50 border-b border-teal-100 flex items-center justify-between text-xs text-teal-900 animate-in fade-in duration-100">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-teal-600 animate-spin shrink-0" />
              <span>{uploadProgress.message || `Processing ${uploadProgress.progressPercent}%`}</span>
            </div>
            <span className="font-mono text-teal-700 font-bold">{uploadProgress.progressPercent}%</span>
          </div>
        )}

        {/* Upload error banner */}
        {uploadError && (
          <div className="px-6 py-2 bg-rose-50 border-b border-rose-100 flex items-center gap-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Search & Upload Action Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${mediaType} assets by title...`}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-hidden"
            />
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium shadow-xs transition-colors shrink-0 disabled:opacity-50"
            title={`Upload a new ${mediaType} file directly from your computer`}
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadCloud className="w-3.5 h-3.5" />
            )}
            <span>{isUploading ? 'Uploading...' : `Upload ${mediaType === 'image' ? 'Image' : 'Video'}`}</span>
          </button>

          <span className="text-xs text-slate-500 font-mono whitespace-nowrap">
            {assets.length} Ready
          </span>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
          {loading ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-7 h-7 text-teal-600 animate-spin" />
              <span className="text-xs">Loading media assets...</span>
            </div>
          ) : error ? (
            <div className="h-48 flex flex-col items-center justify-center text-rose-600 gap-2">
              <span className="text-xs">{error}</span>
            </div>
          ) : assets.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
              <FolderOpen className="w-10 h-10 text-slate-300" />
              <span className="text-sm font-semibold text-slate-600">
                No ready {mediaType} assets found
              </span>
              <span className="text-xs text-slate-400 max-w-sm text-center">
                Upload an MP4 video or select an existing asset to display on this slide.
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium shadow-xs transition-colors"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload {mediaType === 'image' ? 'Image' : 'Video'} Now</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {assets.map((asset) => {
                const thumbUrl = thumbnails.get(asset.id);

                return (
                  <div
                    key={asset.id}
                    onClick={() => {
                      onSelectAsset(asset);
                      onClose();
                    }}
                    className="group border border-slate-200 hover:border-teal-500 hover:ring-2 hover:ring-teal-500/20 rounded-xl overflow-hidden cursor-pointer transition-all bg-white flex flex-col"
                  >
                    {/* Media Thumbnail preview */}
                    <div className="h-28 bg-slate-900 relative flex items-center justify-center overflow-hidden">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={asset.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="flex flex-col items-center text-slate-500 gap-1">
                          {asset.mediaType === 'image' ? (
                            <ImageIcon className="w-8 h-8 opacity-40 text-teal-400" />
                          ) : (
                            <VideoIcon className="w-8 h-8 opacity-40 text-teal-400" />
                          )}
                        </div>
                      )}

                      {/* Video duration badge */}
                      {asset.mediaType === 'video' && asset.durationSeconds && (
                        <div className="absolute bottom-1 right-1 bg-slate-950/80 text-white font-mono text-[9px] px-1 py-0.5 rounded-xs flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{Math.round(asset.durationSeconds)}s</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <div className="text-xs font-semibold text-slate-800 line-clamp-1 group-hover:text-teal-700">
                        {asset.title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                        <span>
                          {asset.dimensions
                            ? `${asset.dimensions.width}×${asset.dimensions.height}`
                            : ''}
                        </span>
                        <span className="capitalize">{asset.mediaType}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
