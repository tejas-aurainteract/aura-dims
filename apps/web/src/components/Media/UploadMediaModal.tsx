/**
 * Aura DIMS - Upload Media Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements accessible, drag-and-drop media ingestion into departmental staging
 * with project scoping, multi-tier visibility selection (project, department, shared, global),
 * client-side bounds verification, upload cancellation, and server-side validation feedback.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  UploadCloud,
  FileImage,
  FileVideo,
  AlertCircle,
  Loader2,
  Tag as TagIcon,
  FolderKanban,
  Eye,
  Share2,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { startMediaUpload, inspectMediaFileClient, type UploadProgressEvent, type ActiveUploadHandle } from '@/lib/mediaUpload';
import {
  MEDIA_CONSTRAINTS,
  type MediaAsset,
  type Department,
  type ProjectRecord,
  type AssetVisibility,
} from '@aura-dims/display-schema';

interface UploadMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  selectedDepartmentId?: string;
  preselectedProjectId?: string;
  onUploadSuccess: (asset: MediaAsset) => void;
}

export const UploadMediaModal: React.FC<UploadMediaModalProps> = ({
  isOpen,
  onClose,
  departments,
  selectedDepartmentId,
  preselectedProjectId,
  onUploadSuccess,
}) => {
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDepts = useMemo(() => departments.filter((d) => d.status === 'active'), [departments]);
  const defaultDeptId =
    selectedDepartmentId ||
    userProfile?.departmentId ||
    activeDepts[0]?.id ||
    departments[0]?.id ||
    '';

  // Form states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetDeptId, setTargetDeptId] = useState<string>(defaultDeptId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Project & Visibility Scoping States
  const [availableProjects, setAvailableProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(preselectedProjectId || '');
  const [visibility, setVisibility] = useState<AssetVisibility>('project');
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [loadingProjects, setLoadingProjects] = useState<boolean>(false);
  const [newShareTarget, setNewShareTarget] = useState<string>('');

  // Upload progress states
  const [isUploading, setIsUploading] = useState(false);
  const [inspectingFile, setInspectingFile] = useState(false);
  const [mediaMetadata, setMediaMetadata] = useState<{ width: number; height: number; duration?: number } | null>(null);
  const [progressEvent, setProgressEvent] = useState<UploadProgressEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const activeUploadRef = useRef<ActiveUploadHandle | null>(null);

  const isAdmin = userProfile?.role === 'admin';

  // Reset form fields
  const resetForm = useCallback(() => {
    setSelectedFile(null);
    setMediaMetadata(null);
    setInspectingFile(false);
    setTitle('');
    setDescription('');
    setTagInput('');
    setTags([]);
    setSelectedProjectId(preselectedProjectId || '');
    setVisibility('project');
    setSharedWith([]);
    setNewShareTarget('');
    setErrorMessage(null);
    setProgressEvent(null);
    setIsUploading(false);
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [preselectedProjectId]);

  // Load available projects for the target department
  const loadProjectsForDept = useCallback(async (deptId: string) => {
    if (!deptId) return;
    setLoadingProjects(true);
    try {
      const res = await api.listProjects({
        departmentId: deptId,
        status: 'active',
      });
      const projs = res.projects || [];
      setAvailableProjects(projs);

      // Determine initial selection
      if (preselectedProjectId && projs.some((p) => p.id === preselectedProjectId)) {
        setSelectedProjectId(preselectedProjectId);
      } else if (!isAdmin) {
        // Non-admin defaults to General project or first active project
        const genProj = projs.find((p) => p.isGeneral || p.id.startsWith('proj_general_'));
        setSelectedProjectId(genProj ? genProj.id : projs[0]?.id || '');
      } else {
        // Admin must choose explicitly unless preselected
        if (!preselectedProjectId) {
          setSelectedProjectId('');
        }
      }
    } catch (err) {
      console.warn('[Aura DIMS] Could not fetch projects for department:', err);
      setAvailableProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [isAdmin, preselectedProjectId]);

  // When modal is opened, sync department and load projects
  useEffect(() => {
    if (isOpen) {
      resetForm();
      const initialDept =
        selectedDepartmentId ||
        userProfile?.departmentId ||
        activeDepts[0]?.id ||
        departments[0]?.id ||
        '';
      setTargetDeptId(initialDept);
      if (initialDept) {
        loadProjectsForDept(initialDept);
      }
    } else {
      resetForm();
    }
  }, [isOpen, selectedDepartmentId, departments, userProfile?.departmentId, resetForm, loadProjectsForDept, activeDepts]);

  // Whenever targetDeptId changes (e.g. admin selects a different department)
  const handleDepartmentChange = (newDept: string) => {
    setTargetDeptId(newDept);
    setSelectedProjectId('');
    loadProjectsForDept(newDept);
  };

  if (!isOpen) return null;

  const handleClose = () => {
    if (isUploading) {
      handleCancelUpload();
    }
    resetForm();
    onClose();
  };

  const isImage = selectedFile?.type.startsWith('image/');

  const handleFileSelect = async (file: File) => {
    setErrorMessage(null);
    setMediaMetadata(null);
    setInspectingFile(true);

    try {
      const inspection = await inspectMediaFileClient(file);
      setInspectingFile(false);

      if (!inspection.valid) {
        setErrorMessage(inspection.error || 'Invalid file');
        setSelectedFile(null);
        return;
      }

      setMediaMetadata({
        width: inspection.width,
        height: inspection.height,
        duration: inspection.durationSeconds,
      });
      setSelectedFile(file);
      if (!title) {
        const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setTitle(baseName.slice(0, MEDIA_CONSTRAINTS.MAX_TITLE_LENGTH));
      }
    } catch (err: any) {
      setInspectingFile(false);
      setErrorMessage(err.message || 'Failed to inspect media file.');
      setSelectedFile(null);
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
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

  const handleAddSharedTarget = () => {
    if (newShareTarget && !sharedWith.includes(newShareTarget)) {
      setSharedWith([...sharedWith, newShareTarget]);
      setNewShareTarget('');
    }
  };

  const handleRemoveSharedTarget = (targetToRemove: string) => {
    setSharedWith(sharedWith.filter((t) => t !== targetToRemove));
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

    const deptToUse = isAdmin ? (targetDeptId || defaultDeptId) : (userProfile?.departmentId ?? '');
    if (!deptToUse) {
      setErrorMessage('A department must be assigned to upload media.');
      return;
    }

    if (!selectedProjectId) {
      setErrorMessage('Please select a destination project. Uploads must belong to an active project.');
      return;
    }

    if (visibility === 'shared' && sharedWith.length === 0) {
      setErrorMessage('Please specify at least one department or project target to share with.');
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);

    try {
      const handle = startMediaUpload({
        file: selectedFile,
        departmentId: deptToUse,
        projectId: selectedProjectId,
        visibility,
        sharedWith: visibility === 'shared' ? sharedWith : undefined,
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
      resetForm();
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
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900">Upload Media Asset</h2>
            <p className="text-xs text-slate-500">
              Scoped digital signage repository • Aurainteract Private Limited
            </p>
          </div>
          {!isUploading && (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
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
          {inspectingFile ? (
            <div className="border-2 border-dashed border-teal-300 rounded-2xl p-7 text-center bg-teal-50/40 animate-pulse">
              <div className="mx-auto w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600 mb-2 shadow-xs">
                <RefreshCw className="h-5 w-5 animate-spin" />
              </div>
              <p className="text-xs font-semibold text-teal-900">
                Inspecting media resolution & encoding...
              </p>
              <p className="text-[11px] text-teal-600 mt-1">
                Checking dimensions against digital display 1080p standards
              </p>
            </div>
          ) : !selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-colors ${
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
              <div className="mx-auto w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 mb-2 shadow-xs">
                <UploadCloud className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-slate-900">
                Click to browse or drag and drop media here
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                JPEG, PNG (up to 20 MB) • MP4 H.264 / AAC (up to 200 MB, 10 min)
              </p>
              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-slate-400">
                <span>Max 1920×1080 / 1080×1920</span>
                <span>•</span>
                <span>Aspect ratio preserved</span>
                <span>•</span>
                <span>Automatic SHA-256</span>
              </div>
            </div>
          ) : (
            /* Selected File Summary Card */
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                  {isImage ? <FileImage className="h-4 w-4" /> : <FileVideo className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{selectedFile.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type || 'Media'}
                    {mediaMetadata && (
                      <span className="font-semibold text-teal-700 ml-1.5">
                        • {mediaMetadata.width}×{mediaMetadata.height} px
                        {mediaMetadata.duration ? ` (${Math.round(mediaMetadata.duration)}s)` : ''}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {!isUploading && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setMediaMetadata(null);
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
          {isAdmin ? (
            <div>
              <label htmlFor="dept-select" className="block text-xs font-semibold text-slate-700 mb-1">
                Target Department <span className="text-red-500">*</span>
              </label>
              <select
                id="dept-select"
                value={targetDeptId || defaultDeptId}
                disabled={isUploading}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-teal-500 disabled:bg-slate-100"
              >
                {departments
                  .filter((d) => d.status === 'active')
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              Department:{' '}
              <span className="font-semibold text-slate-900">
                {departments.find((d) => d.id === userProfile?.departmentId)?.name || userProfile?.departmentId}
              </span>
            </div>
          )}

          {/* Project Selection (Required) */}
          <div>
            <label htmlFor="project-select" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <FolderKanban className="h-3.5 w-3.5 text-teal-600" />
                <span>Destination Project</span>
                <span className="text-red-500">*</span>
              </span>
              {loadingProjects && <Loader2 className="h-3 w-3 animate-spin text-teal-600" />}
            </label>
            <select
              id="project-select"
              required
              value={selectedProjectId}
              disabled={isUploading || loadingProjects}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-teal-500 disabled:bg-slate-100"
            >
              {isAdmin && !preselectedProjectId && (
                <option value="">— Select an active project —</option>
              )}
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isGeneral ? '(General Project)' : ''}
                </option>
              ))}
            </select>
            {isAdmin && !selectedProjectId && (
              <p className="text-[11px] text-amber-600 mt-1">
                Administrators must explicitly select a destination project.
              </p>
            )}
          </div>

          {/* Visibility Selector (Required) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1">
              <Eye className="h-3.5 w-3.5 text-teal-600" />
              <span>Asset Visibility Scope</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Project Only */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  visibility === 'project'
                    ? 'border-teal-500 bg-teal-50/60 ring-1 ring-teal-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="project"
                  checked={visibility === 'project'}
                  onChange={() => setVisibility('project')}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <div className="font-semibold text-slate-900">Project only (default)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Visible strictly to members of this project.
                  </div>
                </div>
              </label>

              {/* Department */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  visibility === 'department'
                    ? 'border-teal-500 bg-teal-50/60 ring-1 ring-teal-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="department"
                  checked={visibility === 'department'}
                  onChange={() => setVisibility('department')}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <div className="font-semibold text-slate-900">Whole department</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Available across all projects in this department.
                  </div>
                </div>
              </label>

              {/* Shared with Specific Targets */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  visibility === 'shared'
                    ? 'border-teal-500 bg-teal-50/60 ring-1 ring-teal-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="shared"
                  checked={visibility === 'shared'}
                  onChange={() => setVisibility('shared')}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <div className="font-semibold text-slate-900">Shared with targets</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Targeted sharing with specific departments/projects.
                  </div>
                </div>
              </label>

              {/* Global */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  visibility === 'global'
                    ? 'border-teal-500 bg-teal-50/60 ring-1 ring-teal-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="global"
                  checked={visibility === 'global'}
                  onChange={() => setVisibility('global')}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <div className="font-semibold text-slate-900">Company-wide (Global)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Available to all company digital displays and teams.
                  </div>
                </div>
              </label>
            </div>

            {/* Global Helper Banner */}
            {visibility === 'global' && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <span className="font-semibold block mb-0.5">Approval Required</span>
                  <span>
                    Needs admin approval before it becomes visible to everyone. Until then it stays in your project.
                  </span>
                </div>
              </div>
            )}

            {/* Shared Targets Picker */}
            {visibility === 'shared' && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Share2 className="h-3.5 w-3.5 text-teal-600" />
                  <span>Choose Share Targets</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={newShareTarget}
                    onChange={(e) => setNewShareTarget(e.target.value)}
                    className="flex-1 text-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 focus:outline-teal-500"
                  >
                    <option value="">Select target department or project...</option>
                    <optgroup label="Departments">
                      {departments.map((d) => (
                        <option key={d.id} value={`dept:${d.id}`}>
                          Dept: {d.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Projects">
                      {availableProjects.map((p) => (
                        <option key={p.id} value={`proj:${p.id}`}>
                          Project: {p.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    type="button"
                    disabled={!newShareTarget}
                    onClick={handleAddSharedTarget}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>

                {sharedWith.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {sharedWith.map((target) => (
                      <span
                        key={target}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200"
                      >
                        <span>{target}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSharedTarget(target)}
                          className="hover:text-teal-900 font-bold ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

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
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:outline-teal-500 disabled:bg-slate-100"
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
              placeholder="Brief context for digital display playlist schedulers..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:outline-teal-500 disabled:bg-slate-100 resize-none"
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
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-teal-500 disabled:bg-slate-100"
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
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || !selectedProjectId}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-xs"
                >
                  <UploadCloud className="h-4 w-4" />
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
