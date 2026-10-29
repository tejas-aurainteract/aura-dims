/**
 * Aura DIMS - Design Editor Top Header
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Top bar providing:
 * - Title editing with input validation
 * - Autosave status indicator (Saved, Saving, Unsaved, Save Failed)
 * - Undo / Redo controls
 * - Zoom & Safe-zone toggles
 * - Orientation switch & preview action
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Save,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Grid,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { DisplayOrientation } from '@aura-dims/display-schema';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed';

export interface EditorHeaderProps {
  title: string;
  onChangeTitle: (newTitle: string) => void;
  orientation: DisplayOrientation;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  zoom: number;
  onChangeZoom: (zoom: number) => void;
  showSafeZone: boolean;
  onToggleSafeZone: () => void;
  onOpenPreview: () => void;
  onRequestOrientationChange: () => void;
  isSaving: boolean;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  title,
  onChangeTitle,
  orientation,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  zoom,
  onChangeZoom,
  showSafeZone,
  onToggleSafeZone,
  onOpenPreview,
  onRequestOrientationChange,
  isSaving,
}) => {
  const navigate = useNavigate();

  const renderStatusPill = () => {
    switch (saveStatus) {
      case 'saved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Saved</span>
          </span>
        );
      case 'saving':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            <span>Saving...</span>
          </span>
        );
      case 'unsaved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Unsaved changes</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Save failed</span>
          </span>
        );
    }
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-3 shrink-0 select-none z-30">
      {/* Left: Back button & Title input */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => navigate('/content?tab=designs')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          title="Back to Designs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Exit</span>
        </button>

        <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

        <input
          type="text"
          value={title}
          maxLength={120}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Untitled Design"
          className="text-sm font-semibold text-slate-900 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-300 focus:border-teal-500 rounded-md px-2 py-1 transition-all outline-hidden max-w-[200px] sm:max-w-xs md:max-w-md truncate"
        />

        {/* Save Status indicator */}
        <div className="hidden md:block">{renderStatusPill()}</div>
      </div>

      {/* Middle: Undo / Redo & Orientation Badge */}
      <div className="flex items-center gap-2">
        <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none hover:bg-white transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none hover:bg-white transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Orientation conversion trigger */}
        <button
          type="button"
          onClick={onRequestOrientationChange}
          className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          title="Convert canvas orientation"
        >
          {orientation === 'landscape' ? (
            <Monitor className="w-3.5 h-3.5 text-teal-600" />
          ) : (
            <Smartphone className="w-3.5 h-3.5 text-teal-600" />
          )}
          <span className="capitalize">{orientation} (1920×1080)</span>
        </button>
      </div>

      {/* Right: Zoom controls, Safe-zone toggle, Preview & Save */}
      <div className="flex items-center gap-2">
        {/* Safe-zone toggle */}
        <button
          type="button"
          onClick={onToggleSafeZone}
          className={`p-1.5 rounded-lg border text-xs font-medium transition-colors hidden sm:inline-flex items-center gap-1 ${
            showSafeZone
              ? 'bg-teal-50 border-teal-300 text-teal-800'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          title="Toggle 5% Safe Display Margin"
        >
          <Grid className="w-4 h-4" />
          <span className="hidden xl:inline">Safe Zone</span>
        </button>

        {/* Zoom controls */}
        <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
          <button
            type="button"
            onClick={() => onChangeZoom(Math.max(0.2, Number((zoom - 0.1).toFixed(2))))}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-xs font-mono text-slate-600 min-w-[44px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onChangeZoom(Math.min(2.0, Number((zoom + 0.1).toFixed(2))))}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeZoom(0.5)}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
            title="Reset Zoom to 50%"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Preview Button */}
        <button
          type="button"
          onClick={onOpenPreview}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
        >
          <Play className="w-3.5 h-3.5 text-teal-600" />
          <span>Preview</span>
        </button>

        {/* Explicit Save button */}
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || saveStatus === 'saved'}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:pointer-events-none shadow-xs transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>
      </div>
    </header>
  );
};

