/**
 * Aura DIMS - Editor Asset Picker Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Integrated departmental asset picker for inserting Ready media into
 * digital display layouts. References immutable assetId records.
 */

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { resolveAssetUrl } from '@/lib/assetResolver';

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
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
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

        if (isMounted) {
          setAssets(res.assets);

          // Resolve thumbnail URLs for retrieved assets
          const thumbMap = new Map<string, string>();
          await Promise.all(
            res.assets.map(async (a) => {
              const url = await resolveAssetUrl(a.id, 'thumbnail');
              if (url) thumbMap.set(a.id, url);
            })
          );
          if (isMounted) {
            setThumbnails(thumbMap);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load media assets');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAssets();

    return () => {
      isMounted = false;
    };
  }, [isOpen, mediaType, search]);

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
                Choose a validated departmental asset from Aura DIMS Media Library
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

        {/* Search Toolbar */}
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
          <span className="text-xs text-slate-500 font-mono">
            {assets.length} Ready {mediaType}s
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
                Upload and validate {mediaType} files in the Content &gt; Media Library tab first.
              </span>
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

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
