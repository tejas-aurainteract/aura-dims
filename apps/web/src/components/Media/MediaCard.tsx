/**
 * Aura DIMS - Media Card (Grid View Item)
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Renders an accessible media card with lazy thumbnail retrieval,
 * resolution badge, video duration, department scope, and processing state.
 */

import React, { useState, useEffect } from 'react';
import { FileImage, FileVideo, Clock, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { MediaAsset } from '@aura-dims/display-schema';

interface MediaCardProps {
  asset: MediaAsset;
  departmentName: string;
  onClick: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ asset, departmentName, onClick }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loadingThumb, setLoadingThumb] = useState(false);

  const isImage = asset.mediaType === 'image';
  const isVideo = asset.mediaType === 'video';

  useEffect(() => {
    let isCancelled = false;

    async function loadThumb() {
      if (!asset.thumbnailPath && !asset.storagePath) return;
      if (asset.status !== 'ready' && asset.status !== 'archived') return;

      setLoadingThumb(true);
      try {
        const res = await api.getMediaPreviewUrl({
          assetId: asset.id,
          kind: 'thumbnail',
        });
        if (!isCancelled) {
          setThumbUrl(res.url);
        }
      } catch {
        // Thumbnail load failure is non-blocking (placeholder shown)
      } finally {
        if (!isCancelled) {
          setLoadingThumb(false);
        }
      }
    }

    loadThumb();
    return () => {
      isCancelled = true;
    };
  }, [asset.id, asset.thumbnailPath, asset.storagePath, asset.status]);

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds == null) return null;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-teal-400 transition-all cursor-pointer flex flex-col focus:outline-hidden focus:ring-2 focus:ring-teal-500"
    >
      {/* Thumbnail Area */}
      <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
        {loadingThumb ? (
          <div className="flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : thumbUrl ? (
          <img
            src={thumbUrl}
            alt={asset.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 gap-1.5 p-4 text-center">
            {isImage ? <FileImage className="h-8 w-8 text-slate-600" /> : <FileVideo className="h-8 w-8 text-slate-600" />}
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              {asset.status === 'validating' ? 'Validating...' : asset.status}
            </span>
          </div>
        )}

        {/* Video Duration Badge */}
        {isVideo && asset.durationSeconds != null && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-mono font-medium flex items-center gap-1 shadow-xs">
            <Clock className="h-2.5 w-2.5" />
            <span>{formatDuration(asset.durationSeconds)}</span>
          </div>
        )}

        {/* Dimension Badge */}
        {asset.dimensions?.width && asset.dimensions?.height ? (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/70 text-slate-200 text-[10px] font-mono shadow-xs">
            {asset.dimensions.width}×{asset.dimensions.height}
          </div>
        ) : null}

        {/* Status Pill (if not ready) */}
        {asset.status !== 'ready' && (
          <div className="absolute top-2 left-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs ${
                asset.status === 'archived'
                  ? 'bg-slate-800/90 text-white'
                  : asset.status === 'failed'
                  ? 'bg-red-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {asset.status === 'failed' && <AlertCircle className="h-2.5 w-2.5" />}
              <span className="capitalize">{asset.status.replace('_', ' ')}</span>
            </span>
          </div>
        )}
      </div>

      {/* Card Info */}
      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-200">
              {departmentName}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              {formatFileSize(asset.fileSizeBytes)}
            </span>
          </div>
          <h4 className="text-xs font-bold text-slate-900 line-clamp-1 group-hover:text-teal-700 transition-colors">
            {asset.title || asset.name}
          </h4>
          {asset.description && (
            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{asset.description}</p>
          )}
        </div>

        {/* Card Footer: Tags & Verified Checkmark */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
          <span className="truncate">
            {asset.tags && asset.tags.length > 0 ? (
              <span className="text-slate-600 font-medium">#{asset.tags[0]}</span>
            ) : (
              <span>{new Date(asset.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            )}
            {asset.tags && asset.tags.length > 1 && (
              <span className="text-slate-400 ml-1 font-normal">+{asset.tags.length - 1}</span>
            )}
          </span>

          {asset.status === 'ready' && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium" title="Verified SHA-256 for digital displays">
              <ShieldCheck className="h-3 w-3" />
              <span>Ready</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

