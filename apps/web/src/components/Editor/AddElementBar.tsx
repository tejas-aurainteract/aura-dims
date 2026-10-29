/**
 * Aura DIMS - Element Creation Toolbar
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Left-side or floating element bar to add:
 * - Text elements (Heading, Subheading, Body, Gujarati, Hindi)
 * - Shapes (Rectangle, Rounded Rectangle, Ellipse, Line)
 * - Media assets (Image, Video from departmental library)
 */

import React, { useState } from 'react';
import {
  Type,
  Square,
  Circle,
  Minus,
  Image as ImageIcon,
  Video as VideoIcon,
  Languages,
} from 'lucide-react';
import {
  SupportedFontFamily,
  ShapeType,
} from '@aura-dims/display-schema';

export interface AddElementBarProps {
  onAddText: (
    content: string,
    fontFamily: SupportedFontFamily,
    fontSize: number,
    fontWeight: 'normal' | 'medium' | 'bold'
  ) => void;
  onAddShape: (shapeType: ShapeType) => void;
  onOpenAssetPicker: (mediaType: 'image' | 'video') => void;
  canAddVideo: boolean;
}

export const AddElementBar: React.FC<AddElementBarProps> = ({
  onAddText,
  onAddShape,
  onOpenAssetPicker,
  canAddVideo,
}) => {
  const [isTextMenuOpen, setIsTextMenuOpen] = useState(false);
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);

  return (
    <aside className="w-16 bg-white border-r border-slate-200 py-3 flex flex-col items-center gap-3 shrink-0 select-none z-20">
      {/* Add Text Menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsTextMenuOpen(!isTextMenuOpen);
            setIsShapeMenuOpen(false);
          }}
          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
            isTextMenuOpen
              ? 'bg-teal-50 text-teal-700 ring-2 ring-teal-500'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Add Text Element"
        >
          <Type className="w-5 h-5" />
          <span className="text-[9px] font-medium">Text</span>
        </button>

        {isTextMenuOpen && (
          <div
            className="absolute left-14 top-0 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
            onClick={() => setIsTextMenuOpen(false)}
          >
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Standard Typography
            </div>
            <button
              type="button"
              onClick={() => onAddText('Heading Text', 'Inter', 64, 'bold')}
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between"
            >
              <span className="text-base font-bold text-slate-900">Heading</span>
              <span className="text-xs text-slate-400 font-mono">64px</span>
            </button>
            <button
              type="button"
              onClick={() => onAddText('Subheading Text', 'Inter', 40, 'medium')}
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between"
            >
              <span className="text-sm font-semibold text-slate-800">Subheading</span>
              <span className="text-xs text-slate-400 font-mono">40px</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onAddText(
                  'Enter informational body text here for your digital display.',
                  'Inter',
                  28,
                  'normal'
                )
              }
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between"
            >
              <span className="text-xs text-slate-700">Body Paragraph</span>
              <span className="text-xs text-slate-400 font-mono">28px</span>
            </button>

            <div className="my-1 border-t border-slate-100" />
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Languages className="w-3 h-3 text-teal-600" />
              <span>Multilingual (Gujarat / India)</span>
            </div>

            <button
              type="button"
              onClick={() =>
                onAddText(
                  'મહત્વપૂર્ણ ડિજિટલ સૂચના',
                  'Noto Sans Gujarati',
                  56,
                  'bold'
                )
              }
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between"
            >
              <span className="text-sm font-bold text-slate-900 font-['Noto_Sans_Gujarati']">
                ગુજરાતી શીર્ષક
              </span>
              <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-sm">
                Gujarati
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onAddText(
                  'महत्वपूर्ण डिजिटल डिस्प्ले सूचना',
                  'Noto Sans Devanagari',
                  56,
                  'bold'
                )
              }
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between"
            >
              <span className="text-sm font-bold text-slate-900 font-['Noto_Sans_Devanagari']">
                हिंदी शीर्षक
              </span>
              <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-sm">
                Hindi
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Add Shapes Menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsShapeMenuOpen(!isShapeMenuOpen);
            setIsTextMenuOpen(false);
          }}
          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
            isShapeMenuOpen
              ? 'bg-teal-50 text-teal-700 ring-2 ring-teal-500'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Add Shape"
        >
          <Square className="w-5 h-5" />
          <span className="text-[9px] font-medium">Shapes</span>
        </button>

        {isShapeMenuOpen && (
          <div
            className="absolute left-14 top-0 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
            onClick={() => setIsShapeMenuOpen(false)}
          >
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Basic Shapes
            </div>
            <button
              type="button"
              onClick={() => onAddShape('rectangle')}
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-xs font-medium text-slate-700"
            >
              <Square className="w-4 h-4 text-slate-500" />
              <span>Rectangle</span>
            </button>
            <button
              type="button"
              onClick={() => onAddShape('rounded_rectangle')}
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-xs font-medium text-slate-700"
            >
              <div className="w-4 h-4 border-2 border-slate-500 rounded-xs" />
              <span>Rounded Rectangle</span>
            </button>
            <button
              type="button"
              onClick={() => onAddShape('ellipse')}
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-xs font-medium text-slate-700"
            >
              <Circle className="w-4 h-4 text-slate-500" />
              <span>Circle / Ellipse</span>
            </button>
            <button
              type="button"
              onClick={() => onAddShape('line')}
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-xs font-medium text-slate-700"
            >
              <Minus className="w-4 h-4 text-slate-500" />
              <span>Divider Line</span>
            </button>
          </div>
        )}
      </div>

      <div className="w-8 h-[1px] bg-slate-200 my-1" />

      {/* Add Image Button */}
      <button
        type="button"
        onClick={() => {
          setIsTextMenuOpen(false);
          setIsShapeMenuOpen(false);
          onOpenAssetPicker('image');
        }}
        className="w-11 h-11 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 flex flex-col items-center justify-center gap-0.5 transition-colors"
        title="Insert Image from Media Library"
      >
        <ImageIcon className="w-5 h-5" />
        <span className="text-[9px] font-medium">Image</span>
      </button>

      {/* Add Video Button */}
      <button
        type="button"
        disabled={!canAddVideo}
        onClick={() => {
          setIsTextMenuOpen(false);
          setIsShapeMenuOpen(false);
          onOpenAssetPicker('video');
        }}
        className="w-11 h-11 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none flex flex-col items-center justify-center gap-0.5 transition-colors"
        title={canAddVideo ? 'Insert Video from Media Library' : 'Maximum 1 video allowed per slide'}
      >
        <VideoIcon className="w-5 h-5" />
        <span className="text-[9px] font-medium">Video</span>
      </button>
    </aside>
  );
};
