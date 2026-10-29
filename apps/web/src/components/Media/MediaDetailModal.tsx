/**
 * Aura DIMS - Media Detail & Preview Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Provides private authenticated preview (image / HTML5 video player),
 * metadata editing (title, description, tags), technical specifications (SHA-256, dimensions),
 * and departmental archiving/restoration.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileImage,
  FileVideo,
  Copy,
  Check,
  Archive,
  RotateCcw,
  Save,
  Loader2,
  AlertCircle,
  Tag as TagIcon,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { MEDIA_CONSTRAINTS, type MediaAsset, type Department } from '@aura-dims/display-schema';

interface MediaDetailModalProps {
  asset: MediaAsset | null;
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  onAssetUpdated: (updatedAsset: MediaAsset) => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  asset,
  isOpen,
  onClose,
  departments,
  onAssetUpdated,
}) => {
  const { userProfile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Preview URL state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Mutation states
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [copiedChecksum, setCopiedChecksum] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initialize editable fields on asset change
  useEffect(() => {
    if (asset) {
      setTitle(asset.title || asset.name || '');
      setDescription(asset.description || '');
      setTags(asset.tags || []);
      setStatusMessage(null);
      setPreviewUrl(null);
      setPreviewError(null);
    }
  }, [asset]);

  // Fetch temporary private signed preview URL
  useEffect(() => {
    let isCancelled = false;

    async function loadPreview() {
      if (!asset || !isOpen) return;

      // Only attempt preview if asset has a storage path
      if (!asset.storagePath && !asset.thumbnailPath) return;

      setLoadingPreview(true);
      setPreviewError(null);

      try {
        const res = await api.getMediaPreviewUrl({
          assetId: asset.id,
          kind: 'original',
        });
        if (!isCancelled) {
          setPreviewUrl(res.url);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setPreviewError(msg);
        }
      } finally {
        if (!isCancelled) {
          setLoadingPreview(false);
        }
      }
    }

    if (isOpen && asset) {
      loadPreview();
    }

    return () => {
      isCancelled = true;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
    };
  }, [asset, isOpen]);

  if (!isOpen || !asset) return null;

  const isImage = asset.mediaType === 'image';
  const isVideo = asset.mediaType === 'video';
  const departmentName = departments.find((d) => d.id === asset.departmentId)?.name || asset.departmentId;

  const handleCopyChecksum = () => {
    if (asset.checksumSha256) {
      navigator.clipboard.writeText(asset.checksumSha256);
      setCopiedChecksum(true);
      setTimeout(() => setCopiedChecksum(false), 2000);
    }
  };

  const handleAddTag = () => {
    const clean = tagInput.trim().toLowerCase().slice(0, MEDIA_CONSTRAINTS.MAX_TAG_LENGTH);
    if (clean && !tags.includes(clean) && tags.length < MEDIA_CONSTRAINTS.MAX_TAGS_COUNT) {
      setTags([...tags, clean]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setStatusMessage({ type: 'error', text: 'Title cannot be empty.' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await api.updateMediaMetadata({
        assetId: asset.id,
        title: title.trim(),
        description: description.trim(),
        tags,
      });

      setIsSaving(false);
      setStatusMessage({ type: 'success', text: 'Metadata updated successfully.' });
      onAssetUpdated(res.asset);
    } catch (err: unknown) {
      setIsSaving(false);
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleToggleArchive = async () => {
    const isCurrentlyArchived = asset.status === 'archived';
    const actionName = isCurrentlyArchived ? 'restore' : 'archive';

    if (!confirm(`Are you sure you want to ${actionName} this media asset?`)) {
      return;
    }

    setIsArchiving(true);
    setStatusMessage(null);

    try {
      const res = await api.setMediaArchivedStatus({
        assetId: asset.id,
        archived: !isCurrentlyArchived,
      });

      setIsArchiving(false);
      setStatusMessage({
        type: 'success',
        text: `Asset successfully ${isCurrentlyArchived ? 'restored' : 'archived'}.`,
      });
      onAssetUpdated(res.asset);
    } catch (err: unknown) {
      setIsArchiving(false);
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const canEdit = userProfile?.role === 'admin' || userProfile?.departmentId === asset.departmentId;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700">
              {isImage ? <FileImage className="h-4 w-4" /> : <FileVideo className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 truncate max-w-md">
                {asset.title || asset.name}
              </h2>
              <p className="text-xs text-slate-500">
                {departmentName} • {asset.fileName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Media Preview */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="w-full aspect-video rounded-xl bg-slate-950 flex items-center justify-center overflow-hidden border border-slate-800 relative">
              {loadingPreview ? (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
                  <span className="text-xs">Generating private preview...</span>
                </div>
              ) : previewError ? (
                <div className="p-4 text-center text-xs text-red-400 flex flex-col items-center gap-1.5">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <span>Preview unavailable: {previewError}</span>
                </div>
              ) : previewUrl ? (
                isImage ? (
                  <img
                    src={previewUrl}
                    alt={asset.title}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={previewUrl}
                    controls
                    muted
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                )
              ) : (
                <div className="text-xs text-slate-500">No preview available</div>
              )}

              {/* Status Badge */}
              <div className="absolute top-3 left-3">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-xs ${
                    asset.status === 'ready'
                      ? 'bg-emerald-600 text-white'
                      : asset.status === 'archived'
                      ? 'bg-slate-700 text-white'
                      : asset.status === 'failed'
                      ? 'bg-red-600 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  {asset.status === 'ready' && <ShieldCheck className="h-3 w-3" />}
                  <span className="capitalize">{asset.status.replace('_', ' ')}</span>
                </span>
              </div>
            </div>

            {/* Technical Specifications Panel */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Technical Specifications
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Type & Format</span>
                  <span className="font-semibold text-slate-800 uppercase">
                    {asset.mediaType} ({asset.mimeType.split('/')[1]})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Dimensions</span>
                  <span className="font-semibold text-slate-800">
                    {asset.dimensions?.width && asset.dimensions?.height
                      ? `${asset.dimensions.width} × ${asset.dimensions.height}`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">File Size</span>
                  <span className="font-semibold text-slate-800">
                    {(asset.fileSizeBytes / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                {isVideo && (
                  <>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Duration</span>
                      <span className="font-semibold text-slate-800">
                        {asset.durationSeconds != null ? `${asset.durationSeconds}s` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Video Codec</span>
                      <span className="font-semibold text-slate-800 uppercase">
                        {asset.videoCodec || 'h264'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Audio Codec</span>
                      <span className="font-semibold text-slate-800 uppercase">
                        {asset.audioCodec || 'None (Silent)'}
                      </span>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-slate-400 block text-[11px]">Uploaded By</span>
                  <span className="font-semibold text-slate-800 truncate block">
                    {asset.uploaderDisplayName || 'System'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Uploaded Date</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(asset.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {/* SHA-256 Checksum for Offline Digital Display Verification */}
              {asset.checksumSha256 && (
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-500 font-medium">SHA-256 Integrity Checksum</span>
                    <button
                      type="button"
                      onClick={handleCopyChecksum}
                      className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 font-semibold"
                    >
                      {copiedChecksum ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-slate-700 bg-white p-2 rounded-lg border border-slate-200 break-all select-all">
                    {asset.checksumSha256}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Editable Metadata & Actions */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <form onSubmit={handleSaveChanges} className="space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Descriptive Metadata
              </h3>

              {statusMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium border flex items-center gap-2 ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  {statusMessage.type === 'success' ? (
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label htmlFor="detail-title" className="block text-xs font-semibold text-slate-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="detail-title"
                  type="text"
                  required
                  disabled={!canEdit || isSaving}
                  maxLength={MEDIA_CONSTRAINTS.MAX_TITLE_LENGTH}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="detail-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  id="detail-desc"
                  rows={3}
                  disabled={!canEdit || isSaving}
                  maxLength={MEDIA_CONSTRAINTS.MAX_DESCRIPTION_LENGTH}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Context for playlist editors..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 resize-none"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tags</label>
                {canEdit && (
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      disabled={isSaving || tags.length >= MEDIA_CONSTRAINTS.MAX_TAGS_COUNT}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add tag..."
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      disabled={isSaving || !tagInput.trim() || tags.length >= MEDIA_CONSTRAINTS.MAX_TAGS_COUNT}
                      onClick={handleAddTag}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {tags.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No tags assigned</span>
                  ) : (
                    tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-700 border border-teal-200"
                      >
                        <TagIcon className="h-2.5 w-2.5" />
                        <span>{tag}</span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-teal-900 font-bold ml-0.5"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Save Button */}
              {canEdit && (
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 shadow-xs transition-colors"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span>Save Metadata Changes</span>
                  </button>
                </div>
              )}
            </form>

            {/* Archive / Restore Action */}
            {canEdit && (
              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isArchiving}
                  onClick={handleToggleArchive}
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                    asset.status === 'archived'
                      ? 'border-teal-300 text-teal-700 hover:bg-teal-50'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isArchiving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : asset.status === 'archived' ? (
                    <RotateCcw className="h-4 w-4 text-teal-600" />
                  ) : (
                    <Archive className="h-4 w-4 text-slate-500" />
                  )}
                  <span>{asset.status === 'archived' ? 'Restore to Active Library' : 'Archive Asset'}</span>
                </button>
                <p className="text-[11px] text-slate-400 mt-1 text-center">
                  {asset.status === 'archived'
                    ? 'Restoring will make this asset selectable in signage playlists.'
                    : 'Archived media is hidden from playlists but never deleted.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
