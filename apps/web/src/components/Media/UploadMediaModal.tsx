/**
 * Aura DIMS - Upload Media Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements accessible, drag-and-drop media ingestion into departmental staging
 * with client-side bounds verification, upload cancellation, and server-side validation feedback.
 */

import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileImage,
  FileVideo,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Tag as TagIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { startMediaUpload, validateMediaFileClient, type UploadProgressEvent, type ActiveUploadHandle } from '@/lib/mediaUpload';
import { MEDIA_CONSTRAINTS, type MediaAsset, type Department } from '@aura-dims/display-schema';

interface UploadMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  selectedDepartmentId?: string;
  onUploadSuccess: (asset: MediaAsset) => void;
}

export const UploadMediaModal: React.FC<UploadMediaModalProps> = ({
  isOpen,
  onClose,
  departments,
  selectedDepartmentId,
  onUploadSuccess,
}) => {
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetDeptId, setTargetDeptId] = useState<string>(
    selectedDepartmentId || userProfile?.departmentId || (departments[0]?.id ?? '')
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Upload progress states
  const [isUploading, setIsUploading] = useState(false);
  const [progressEvent, setProgressEvent] = useState<UploadProgressEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const activeUploadRef = useRef<ActiveUploadHandle | null>(null);

  if (!isOpen) return null;

  const isImage = selectedFile?.type.startsWith('image/');

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    const validation = validateMediaFileClient(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid file');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!title) {
      // Auto-populate title from clean filename
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setTitle(baseName.slice(0, MEDIA_CONSTRAINTS.MAX_TITLE_LENGTH));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]!);
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

  const handleCancelUpload = () => {
    if (activeUploadRef.current) {
      activeUploadRef.current.cancel();
      activeUploadRef.current = null;
    }
    setIsUploading(false);
    setProgressEvent(null);
    setErrorMessage('Upload cancelled by user.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please select a media file to upload.');
      return;
    }

    const deptToUse = userProfile?.role === 'admin' ? targetDeptId : (userProfile?.departmentId ?? '');
    if (!deptToUse) {
      setErrorMessage('A department must be assigned to upload media.');
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);

    try {
      const handle = startMediaUpload({
        file: selectedFile,
        departmentId: deptToUse,
        title: title.trim(),
        description: description.trim(),
        tags,
        onProgress: (evt) => {
          setProgressEvent(evt);
        },
      });

      activeUploadRef.current = handle;
      const readyAsset = await handle.done;
      activeUploadRef.current = null;
      setIsUploading(false);
      onUploadSuccess(readyAsset);
      onClose();
    } catch (err: unknown) {
      activeUploadRef.current = null;
      setIsUploading(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900">Upload Media Asset</h2>
            <p className="text-xs text-slate-500">
              Departmental digital signage repository • Aurainteract Private Limited
            </p>
          </div>
          {!isUploading && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-xl bg-red-50 p-3.5 border border-red-200 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-700 leading-relaxed font-medium">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Drag & Drop Zone */}
          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-teal-500 bg-teal-50/50'
                  : 'border-slate-300 hover:border-teal-500 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.mp4,image/jpeg,image/png,video/mp4"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
              <div className="mx-auto w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 mb-3 shadow-xs">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-900">
                Click to browse or drag and drop media here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                JPEG, PNG (up to 20 MB) • MP4 H.264 / AAC (up to 200 MB, 10 min)
              </p>
              <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-slate-400">
                <span>Max 1920×1080 / 1080×1920</span>
                <span>•</span>
                <span>Aspect ratio preserved</span>
                <span>•</span>
                <span>Automatic SHA-256</span>
              </div>
            </div>
          ) : (
            /* Selected File Summary Card */
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                  {isImage ? <FileImage className="h-5 w-5" /> : <FileVideo className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{selectedFile.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type || 'Media'}
                  </p>
                </div>
              </div>
              {!isUploading && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setProgressEvent(null);
                    setErrorMessage(null);
                  }}
                  className="text-xs text-slate-400 hover:text-red-600 font-semibold px-2 py-1 rounded-md hover:bg-white transition-colors"
                >
                  Change
                </button>
              )}
            </div>
          )}

          {/* Department Selection (Admin Only) */}
          {userProfile?.role === 'admin' ? (
            <div>
              <label htmlFor="dept-select" className="block text-xs font-semibold text-slate-700 mb-1">
                Target Department <span className="text-red-500">*</span>
              </label>
              <select
                id="dept-select"
                value={targetDeptId}
                disabled={isUploading}
                onChange={(e) => setTargetDeptId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
              >
                {departments
                  .filter((d) => d.status === 'active')
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Asset will be strictly scoped to this department's digital displays and authors.
              </p>
            </div>
          ) : (
            <div className="text-xs text-slate-600">
              Department:{' '}
              <span className="font-semibold text-slate-900">
                {departments.find((d) => d.id === userProfile?.departmentId)?.name || userProfile?.departmentId}
              </span>
            </div>
          )}

          {/* Metadata: Title */}
          <div>
            <label htmlFor="media-title" className="block text-xs font-semibold text-slate-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="media-title"
              type="text"
              required
              disabled={isUploading}
              maxLength={MEDIA_CONSTRAINTS.MAX_TITLE_LENGTH}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Factory Safety Protocols Briefing"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
            />
          </div>

          {/* Metadata: Description */}
          <div>
            <label htmlFor="media-desc" className="block text-xs font-semibold text-slate-700 mb-1">
              Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="media-desc"
              rows={2}
              disabled={isUploading}
              maxLength={MEDIA_CONSTRAINTS.MAX_DESCRIPTION_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief context for signage playlist schedulers..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 resize-none"
            />
          </div>

          {/* Metadata: Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tags</label>
            <div className="flex gap-2">
              <input
                type="text"
                disabled={isUploading || tags.length >= MEDIA_CONSTRAINTS.MAX_TAGS_COUNT}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tag (e.g. safety, cafeteria)..."
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
              />
              <button
                type="button"
                disabled={isUploading || !tagInput.trim() || tags.length >= MEDIA_CONSTRAINTS.MAX_TAGS_COUNT}
                onClick={handleAddTag}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-700 border border-teal-200"
                  >
                    <TagIcon className="h-2.5 w-2.5" />
                    <span>{tag}</span>
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-teal-900 font-bold ml-0.5"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Upload Progress Bar */}
          {isUploading && progressEvent && (
            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-teal-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                  {progressEvent.step === 'initiating' && 'Allocating staging path...'}
                  {progressEvent.step === 'uploading' && `Uploading (${progressEvent.progressPercent}%)`}
                  {progressEvent.step === 'validating' && 'Validating on server (checksum, codecs)...'}
                  {progressEvent.step === 'ready' && 'Ready!'}
                </span>
                <span className="font-mono">{progressEvent.progressPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-teal-200/60 overflow-hidden">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressEvent.progressPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-teal-700">{progressEvent.message}</p>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            {isUploading ? (
              <button
                type="button"
                onClick={handleCancelUpload}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
              >
                Cancel Upload
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || !title.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 shadow-xs transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Start Upload</span>
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
