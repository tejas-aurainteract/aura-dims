/**
 * Aura DIMS - Contextual Properties Inspector
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Side inspector panel for:
 * - Selected element geometry (X, Y, W, H, Rotation, Opacity)
 * - Text typography (Font family, size, weight, alignment, color, ligatures)
 * - Shape geometry and styling (Fill, stroke, radius)
 * - Media configuration (Fit, loop, mute, change asset)
 * - Slide properties when nothing is selected (Background, duration)
 */

import React from 'react';
import {
  CanvasElement,
  TextElement,
  ShapeElement,
  ImageElement,
  VideoElement,
  DesignSlide,
  DESIGN_CONSTRAINTS,
  SupportedFontFamily,
} from '@aura-dims/display-schema';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Lock,
  Unlock,
  Trash2,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  Sliders,
  Paintbrush,
  Clock,
  Layers,
} from 'lucide-react';

export interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  activeSlide: DesignSlide;
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void;
  onDeleteElement: (id: string) => void;
  onUpdateSlideBackground: (background: DesignSlide['background']) => void;
  onUpdateSlideDuration: (seconds: number) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onOpenAssetPicker: (mediaType: 'image' | 'video') => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedElement,
  activeSlide,
  onUpdateElement,
  onDeleteElement,
  onUpdateSlideBackground,
  onUpdateSlideDuration,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onOpenAssetPicker,
}) => {
  // If nothing is selected, show slide properties
  if (!selectedElement) {
    return (
      <aside className="w-72 bg-white border-l border-slate-200 p-4 flex flex-col gap-5 overflow-y-auto select-none shrink-0 z-20">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Paintbrush className="w-4 h-4 text-teal-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Slide Properties
          </h3>
        </div>

        {/* Slide Duration */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Slide Duration</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={DESIGN_CONSTRAINTS.MIN_SLIDE_DURATION_SECONDS}
              max={DESIGN_CONSTRAINTS.MAX_SLIDE_DURATION_SECONDS}
              value={activeSlide.durationSeconds || 10}
              onChange={(e) =>
                onUpdateSlideDuration(
                  Math.max(1, parseInt(e.target.value, 10) || 10)
                )
              }
              className="w-24 px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:border-teal-500 focus:outline-hidden"
            />
            <span className="text-xs text-slate-500">seconds (display time)</span>
          </div>
        </div>

        {/* Slide Background */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-700">Background Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={
                activeSlide.background.type === 'color'
                  ? activeSlide.background.value
                  : '#0f172a'
              }
              onChange={(e) =>
                onUpdateSlideBackground({
                  type: 'color',
                  value: e.target.value,
                })
              }
              className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
            />
            <input
              type="text"
              value={activeSlide.background.value || '#0f172a'}
              onChange={(e) =>
                onUpdateSlideBackground({
                  type: 'color',
                  value: e.target.value,
                })
              }
              className="flex-1 px-2 py-1 text-xs font-mono border border-slate-200 rounded-lg focus:border-teal-500 focus:outline-hidden"
            />
          </div>

          {/* Quick Preset Colors */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Preset Themes
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'Slate Dark', val: '#0f172a' },
                { label: 'Navy Blue', val: '#0a192f' },
                { label: 'Charcoal', val: '#18181b' },
                { label: 'Deep Teal', val: '#042f2e' },
                { label: 'Aura Dark', val: '#090d16' },
                { label: 'Pure Black', val: '#000000' },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() =>
                    onUpdateSlideBackground({ type: 'color', value: p.val })
                  }
                  style={{ backgroundColor: p.val }}
                  className="w-6 h-6 rounded-md border border-slate-600 hover:scale-110 transition-transform shadow-xs"
                  title={p.label}
                />
              ))}
            </div>
          </div>

          {/* Gradient Presets */}
          <div className="space-y-1.5 pt-2">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Gradient Presets
            </span>
            <div className="flex flex-col gap-1.5">
              {[
                {
                  label: 'Teal to Dark',
                  val: 'linear-gradient(135deg, #042f2e 0%, #0f172a 100%)',
                },
                {
                  label: 'Midnight Blue',
                  val: 'linear-gradient(135deg, #0a192f 0%, #020c1b 100%)',
                },
                {
                  label: 'Corporate Slate',
                  val: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                },
              ].map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() =>
                    onUpdateSlideBackground({ type: 'gradient', value: g.val })
                  }
                  style={{ backgroundImage: g.val }}
                  className="w-full h-7 rounded-md text-[10px] font-semibold text-white/90 border border-slate-600/50 hover:opacity-90 flex items-center justify-center shadow-xs"
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 leading-relaxed">
          Tip: Click any element on the digital display canvas to customize its typography, geometry, and styling.
        </div>
      </aside>
    );
  }

  // Element is selected
  const el = selectedElement;

  return (
    <aside className="w-72 bg-white border-l border-slate-200 p-4 flex flex-col gap-4 overflow-y-auto select-none shrink-0 z-20">
      {/* Header & Lock / Delete */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sliders className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 truncate">
            {el.type}: {el.name}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onUpdateElement(el.id, { locked: !el.locked })}
            className={`p-1 rounded-md transition-colors ${
              el.locked
                ? 'bg-amber-50 text-amber-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            title={el.locked ? 'Unlock element' : 'Lock element'}
          >
            {el.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => onDeleteElement(el.id)}
            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete element"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Geometry: X, Y, W, H */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Geometry (px)
        </span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-[10px] text-slate-500">X Position</label>
            <input
              type="number"
              value={el.x}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, { x: parseInt(e.target.value, 10) || 0 })
              }
              className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:border-teal-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">Y Position</label>
            <input
              type="number"
              value={el.y}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, { y: parseInt(e.target.value, 10) || 0 })
              }
              className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:border-teal-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">Width</label>
            <input
              type="number"
              value={el.width}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, {
                  width: Math.max(20, parseInt(e.target.value, 10) || 20),
                })
              }
              className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:border-teal-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">Height</label>
            <input
              type="number"
              value={el.height}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, {
                  height: Math.max(20, parseInt(e.target.value, 10) || 20),
                })
              }
              className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:border-teal-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Rotation & Opacity */}
        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          <div>
            <label className="text-[10px] text-slate-500">Rotation (°)</label>
            <input
              type="number"
              value={el.rotation || 0}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, {
                  rotation: (parseInt(e.target.value, 10) || 0) % 360,
                })
              }
              className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:border-teal-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">Opacity ({Math.round((el.opacity ?? 1) * 100)}%)</label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={el.opacity ?? 1}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, { opacity: parseFloat(e.target.value) })
              }
              className="w-full h-7 cursor-pointer accent-teal-600"
            />
          </div>
        </div>
      </div>

      {/* Layer Order Controls */}
      <div className="space-y-1.5 pt-2 border-t border-slate-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
          <Layers className="w-3 h-3 text-slate-500" />
          <span>Layer Position</span>
        </span>
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => onBringToFront(el.id)}
            className="p-1.5 border border-slate-200 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center transition-colors"
            title="Bring to Front"
          >
            <ChevronsUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onBringForward(el.id)}
            className="p-1.5 border border-slate-200 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center transition-colors"
            title="Bring Forward"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSendBackward(el.id)}
            className="p-1.5 border border-slate-200 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center transition-colors"
            title="Send Backward"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSendToBack(el.id)}
            className="p-1.5 border border-slate-200 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center transition-colors"
            title="Send to Back"
          >
            <ChevronsDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TEXT SPECIFIC PROPERTIES */}
      {el.type === 'text' && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Typography
          </span>

          {/* Content TextArea */}
          <div>
            <label className="text-[10px] text-slate-500">Text Content</label>
            <textarea
              rows={3}
              value={(el as TextElement).content}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, { content: e.target.value })
              }
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:border-teal-500 focus:outline-hidden resize-y"
            />
          </div>

          {/* Font Family */}
          <div>
            <label className="text-[10px] text-slate-500">Font Family</label>
            <select
              value={(el as TextElement).fontFamily}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, {
                  fontFamily: e.target.value as SupportedFontFamily,
                })
              }
              className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:border-teal-500 focus:outline-hidden"
            >
              <option value="Inter">Inter (English / Global)</option>
              <option value="Noto Sans Gujarati">Noto Sans Gujarati (ગુજરાતી)</option>
              <option value="Noto Sans Devanagari">Noto Sans Devanagari (हिंदी)</option>
            </select>
          </div>

          {/* Font Size & Weight */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">Size (px)</label>
              <input
                type="number"
                value={(el as TextElement).fontSize}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, {
                    fontSize: Math.max(8, parseInt(e.target.value, 10) || 12),
                  })
                }
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md font-mono focus:border-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Weight</label>
              <select
                value={(el as TextElement).fontWeight}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, {
                    fontWeight: e.target.value as 'normal' | 'medium' | 'bold',
                  })
                }
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:border-teal-500 focus:outline-hidden"
              >
                <option value="normal">Normal (400)</option>
                <option value="medium">Medium (600)</option>
                <option value="bold">Bold (700)</option>
              </select>
            </div>
          </div>

          {/* Formatting & Alignment Toolbar */}
          <div className="flex items-center justify-between border border-slate-200 rounded-lg p-1 bg-slate-50">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateElement(el.id, {
                    fontWeight:
                      (el as TextElement).fontWeight === 'bold' ? 'normal' : 'bold',
                  })
                }
                className={`p-1.5 rounded-md ${
                  (el as TextElement).fontWeight === 'bold'
                    ? 'bg-teal-100 text-teal-800'
                    : 'text-slate-600 hover:bg-white'
                }`}
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateElement(el.id, {
                    italic: !(el as TextElement).italic,
                  })
                }
                className={`p-1.5 rounded-md ${
                  (el as TextElement).italic
                    ? 'bg-teal-100 text-teal-800'
                    : 'text-slate-600 hover:bg-white'
                }`}
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateElement(el.id, {
                    underline: !(el as TextElement).underline,
                  })
                }
                className={`p-1.5 rounded-md ${
                  (el as TextElement).underline
                    ? 'bg-teal-100 text-teal-800'
                    : 'text-slate-600 hover:bg-white'
                }`}
                title="Underline"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-4 w-[1px] bg-slate-200" />

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onUpdateElement(el.id, { textAlign: 'left' })}
                className={`p-1.5 rounded-md ${
                  (el as TextElement).textAlign === 'left'
                    ? 'bg-teal-100 text-teal-800'
                    : 'text-slate-600 hover:bg-white'
                }`}
                title="Align Left"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateElement(el.id, { textAlign: 'center' })}
                className={`p-1.5 rounded-md ${
                  (el as TextElement).textAlign === 'center'
                    ? 'bg-teal-100 text-teal-800'
                    : 'text-slate-600 hover:bg-white'
                }`}
                title="Align Center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateElement(el.id, { textAlign: 'right' })}
                className={`p-1.5 rounded-md ${
                  (el as TextElement).textAlign === 'right'
                    ? 'bg-teal-100 text-teal-800'
                    : 'text-slate-600 hover:bg-white'
                }`}
                title="Align Right"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Text Color */}
          <div>
            <label className="text-[10px] text-slate-500">Text Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={(el as TextElement).color || '#ffffff'}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, { color: e.target.value })
                }
                className="w-7 h-7 rounded-md cursor-pointer border border-slate-200"
              />
              <input
                type="text"
                value={(el as TextElement).color || '#ffffff'}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, { color: e.target.value })
                }
                className="flex-1 px-2 py-1 text-xs font-mono border border-slate-200 rounded-md focus:border-teal-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      )}

      {/* SHAPE SPECIFIC PROPERTIES */}
      {el.type === 'shape' && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Shape Styling
          </span>

          {/* Fill Color */}
          <div>
            <label className="text-[10px] text-slate-500">Fill Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={(el as ShapeElement).fillColor || '#ffffff'}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, { fillColor: e.target.value })
                }
                className="w-7 h-7 rounded-md cursor-pointer border border-slate-200"
              />
              <input
                type="text"
                value={(el as ShapeElement).fillColor || '#ffffff'}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, { fillColor: e.target.value })
                }
                className="flex-1 px-2 py-1 text-xs font-mono border border-slate-200 rounded-md focus:border-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Border Color & Width */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">Border Width (px)</label>
              <input
                type="number"
                min="0"
                value={(el as ShapeElement).borderWidth || 0}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, {
                    borderWidth: Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md font-mono focus:border-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Border Radius (px)</label>
              <input
                type="number"
                min="0"
                value={(el as ShapeElement).borderRadius || 0}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, {
                    borderRadius: Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md font-mono focus:border-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-500">Border Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={(el as ShapeElement).borderColor || '#cbd5e1'}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, { borderColor: e.target.value })
                }
                className="w-7 h-7 rounded-md cursor-pointer border border-slate-200"
              />
              <input
                type="text"
                value={(el as ShapeElement).borderColor || '#cbd5e1'}
                disabled={el.locked}
                onChange={(e) =>
                  onUpdateElement(el.id, { borderColor: e.target.value })
                }
                className="flex-1 px-2 py-1 text-xs font-mono border border-slate-200 rounded-md focus:border-teal-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      )}

      {/* IMAGE / VIDEO SPECIFIC PROPERTIES */}
      {(el.type === 'image' || el.type === 'video') && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Media Asset Settings
          </span>

          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-col gap-2">
            <div className="text-[11px] text-slate-600">
              <span className="font-semibold text-slate-800">Asset Reference:</span>
              <div className="font-mono text-[10px] text-slate-500 truncate mt-0.5">
                {(el as ImageElement | VideoElement).assetId || 'No asset assigned'}
              </div>
            </div>

            <button
              type="button"
              disabled={el.locked}
              onClick={() => onOpenAssetPicker(el.type as 'image' | 'video')}
              className="w-full py-1.5 px-3 text-xs font-semibold rounded-md bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 transition-colors"
            >
              Choose from Media Library
            </button>
          </div>

          {/* Object Fit */}
          <div>
            <label className="text-[10px] text-slate-500">Scaling / Fit</label>
            <select
              value={(el as ImageElement | VideoElement).fit || 'contain'}
              disabled={el.locked}
              onChange={(e) =>
                onUpdateElement(el.id, {
                  fit: e.target.value as 'contain' | 'cover' | 'fill',
                })
              }
              className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:border-teal-500 focus:outline-hidden capitalize"
            >
              <option value="contain">Contain (Keep aspect ratio)</option>
              <option value="cover">Cover (Crop to fill frame)</option>
              {el.type === 'image' && <option value="fill">Fill / Stretch</option>}
            </select>
          </div>

          {/* Video Specific: Muted & Loop */}
          {el.type === 'video' && (
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(el as VideoElement).muted !== false}
                  disabled={el.locked}
                  onChange={(e) =>
                    onUpdateElement(el.id, { muted: e.target.checked })
                  }
                  className="rounded-sm text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-700">Muted Playback (Signage Standard)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(el as VideoElement).loop !== false}
                  disabled={el.locked}
                  onChange={(e) =>
                    onUpdateElement(el.id, { loop: e.target.checked })
                  }
                  className="rounded-sm text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-700">Continuous Loop</span>
              </label>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

