/**
 * Aura DIMS - Slide Thumbnail Strip
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Horizontal slide manager allowing:
 * - Multi-slide navigation
 * - Add, duplicate, delete, and reorder slides
 * - Slide duration adjustment (seconds)
 * - Miniature previews
 */

import React from 'react';
import {
  DesignSlide,
  Resolution,
  DESIGN_CONSTRAINTS,
} from '@aura-dims/display-schema';
import {
  Plus,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { DesignRenderer } from './DesignRenderer';

export interface SlideThumbnailsProps {
  slides: DesignSlide[];
  dimensions: Resolution;
  activeSlideIndex: number;
  onSelectSlide: (index: number) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (index: number) => void;
  onDeleteSlide: (index: number) => void;
  onMoveSlide: (index: number, direction: 'left' | 'right') => void;
  onChangeDuration: (index: number, seconds: number) => void;
  assetsMap?: Map<string, string>;
}

export const SlideThumbnails: React.FC<SlideThumbnailsProps> = ({
  slides,
  dimensions,
  activeSlideIndex,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
  onChangeDuration,
  assetsMap = new Map(),
}) => {
  // Scale for thumbnail preview (e.g., thumbnail width around 120px)
  const thumbScale = dimensions.width === 1920 ? 0.0625 : 0.07; // ~120px wide

  return (
    <div className="h-28 bg-white border-t border-slate-200 px-4 py-2 flex items-center gap-3 shrink-0 overflow-x-auto select-none z-20">
      {/* Slides list */}
      <div className="flex items-center gap-3">
        {slides.map((slide, idx) => {
          const isActive = idx === activeSlideIndex;
          const isLandscape = dimensions.width >= dimensions.height;

          return (
            <div
              key={slide.id || idx}
              onClick={() => onSelectSlide(idx)}
              className={`group relative flex flex-col items-center cursor-pointer rounded-lg p-1.5 transition-all ${
                isActive
                  ? 'bg-teal-50 ring-2 ring-teal-600 shadow-xs'
                  : 'hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {/* Thumbnail Container */}
              <div
                style={{
                  width: isLandscape ? '120px' : '68px',
                  height: isLandscape ? '68px' : '120px',
                  overflow: 'hidden',
                  position: 'relative',
                }}
                className="bg-slate-900 rounded-md shadow-xs border border-slate-700/50"
              >
                {/* Scaled Render of the Slide */}
                <div
                  style={{
                    transform: `scale(${thumbScale})`,
                    transformOrigin: 'top left',
                    pointerEvents: 'none',
                  }}
                >
                  <DesignRenderer
                    slide={slide}
                    dimensions={dimensions}
                    assetsMap={assetsMap}
                    interactive={false}
                  />
                </div>

                {/* Slide Index Badge */}
                <div className="absolute top-1 left-1 bg-slate-900/80 text-white font-mono text-[10px] px-1 rounded-xs backdrop-blur-xs">
                  {idx + 1}
                </div>

                {/* Duration Badge */}
                <div className="absolute bottom-1 right-1 bg-slate-900/80 text-teal-300 font-mono text-[9px] px-1 rounded-xs backdrop-blur-xs flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{slide.durationSeconds || 10}s</span>
                </div>
              </div>

              {/* Hover Actions Bar */}
              <div className="flex items-center justify-between w-full mt-1 px-0.5">
                <span className="text-[10px] font-medium text-slate-500">
                  Slide {idx + 1}
                </span>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Reorder Left */}
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveSlide(idx, 'left');
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                    title="Move slide left"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>

                  {/* Reorder Right */}
                  <button
                    type="button"
                    disabled={idx === slides.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveSlide(idx, 'right');
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                    title="Move slide right"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>

                  {/* Duplicate */}
                  <button
                    type="button"
                    disabled={slides.length >= DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateSlide(idx);
                    }}
                    className="p-0.5 text-slate-400 hover:text-teal-600 disabled:opacity-20"
                    title="Duplicate slide"
                  >
                    <Copy className="w-3 h-3" />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    disabled={slides.length <= 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSlide(idx);
                    }}
                    className="p-0.5 text-slate-400 hover:text-rose-600 disabled:opacity-20"
                    title="Delete slide"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Slide Button */}
      {slides.length < DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN && (
        <button
          type="button"
          onClick={onAddSlide}
          className="h-[68px] w-20 shrink-0 border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50/50 rounded-lg flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-teal-700 transition-colors"
          title="Add new slide"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px] font-semibold">New Slide</span>
        </button>
      )}

      {/* Active Slide Duration Quick Setter */}
      {slides[activeSlideIndex] && (
        <div className="ml-auto pl-4 border-l border-slate-200 flex items-center gap-2 shrink-0">
          <Clock className="w-4 h-4 text-slate-400" />
          <div className="flex flex-col">
            <label className="text-[10px] font-medium text-slate-500">Duration</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={DESIGN_CONSTRAINTS.MIN_SLIDE_DURATION_SECONDS}
                max={DESIGN_CONSTRAINTS.MAX_SLIDE_DURATION_SECONDS}
                value={slides[activeSlideIndex].durationSeconds || 10}
                onChange={(e) =>
                  onChangeDuration(
                    activeSlideIndex,
                    Math.max(1, parseInt(e.target.value, 10) || 10)
                  )
                }
                className="w-14 px-1.5 py-0.5 text-xs font-mono border border-slate-300 rounded-md focus:border-teal-500 focus:outline-hidden"
              />
              <span className="text-xs text-slate-500">sec</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

