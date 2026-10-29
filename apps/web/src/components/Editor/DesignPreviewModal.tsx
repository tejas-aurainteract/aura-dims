/**
 * Aura DIMS - Design Preview & Full Playback Simulation Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Full-screen accurate playback simulation for digital displays:
 * - Timed slide sequence progression
 * - Video playback execution
 * - Progress bar and slide step controls
 * - Fullscreen toggle
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  DesignDocument,
  extractReferencedAssetIds,
} from '@aura-dims/display-schema';
import { DesignRenderer } from './DesignRenderer';
import { resolveAssetsBatch } from '@/lib/assetResolver';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
  Clock,
  Layers,
} from 'lucide-react';

export interface DesignPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DesignDocument;
  initialSlideIndex?: number;
}

export const DesignPreviewModal: React.FC<DesignPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  initialSlideIndex = 0,
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(initialSlideIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [assetsMap, setAssetsMap] = useState<Map<string, string>>(new Map());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const slides = document.slides || [];
  const currentSlide = slides[currentSlideIndex] || slides[0];
  const slideDuration = currentSlide ? currentSlide.durationSeconds || 10 : 10;

  // Resolve all referenced assets on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadAssets = async () => {
      const assetIds = extractReferencedAssetIds(document);
      const map = await resolveAssetsBatch(assetIds, 'original');
      if (isMounted) {
        setAssetsMap(map);
      }
    };

    loadAssets();
    setCurrentSlideIndex(Math.min(initialSlideIndex, Math.max(0, slides.length - 1)));
    setElapsedSeconds(0);
    setIsPlaying(true);

    return () => {
      isMounted = false;
    };
  }, [isOpen, document, initialSlideIndex, slides.length]);

  // Timed progression interval
  useEffect(() => {
    if (!isOpen || !isPlaying || slides.length <= 1) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        if (prev + 1 >= slideDuration) {
          // Advance to next slide (loop)
          setCurrentSlideIndex((curr) => (curr + 1) % slides.length);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, isPlaying, slideDuration, slides.length]);

  // Reset elapsed seconds on manual slide change
  const goToSlide = (idx: number) => {
    setCurrentSlideIndex(idx);
    setElapsedSeconds(0);
  };

  const handleNext = () => {
    goToSlide((currentSlideIndex + 1) % slides.length);
  };

  const handlePrev = () => {
    goToSlide((currentSlideIndex - 1 + slides.length) % slides.length);
  };

  const toggleFullscreen = () => {
    if (typeof window === 'undefined') return;

    if (!window.document.fullscreenElement) {
      modalContainerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      window.document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  if (!isOpen || !currentSlide) return null;

  // Calculate scaling to fit modal viewport nicely
  const dims = document.dimensions || { width: 1920, height: 1080 };
  const isLandscape = dims.width >= dims.height;

  return (
    <div
      ref={modalContainerRef}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-between select-none animate-in fade-in duration-200"
    >
      {/* Top Header Control Bar */}
      <div className="w-full h-14 bg-gradient-to-b from-black/80 to-transparent px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white tracking-wide">
            Aura DIMS Display Simulation
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-mono border border-teal-500/40">
            {dims.width}×{dims.height} ({document.orientation})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4" />
            ) : (
              <Maximize className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Exit Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="flex-1 w-full flex items-center justify-center p-4 min-h-0 overflow-hidden">
        <div
          style={{
            maxWidth: isLandscape ? '90vw' : 'auto',
            maxHeight: isLandscape ? '75vh' : '82vh',
            aspectRatio: `${dims.width} / ${dims.height}`,
            width: isLandscape ? '100%' : 'auto',
            height: !isLandscape ? '100%' : 'auto',
          }}
          className="relative shadow-2xl rounded-sm overflow-hidden flex items-center justify-center bg-black"
        >
          {/* Renderer container with responsive CSS scale */}
          <div
            style={{
              width: `${dims.width}px`,
              height: `${dims.height}px`,
              transform: `scale(var(--preview-scale, 1))`,
              transformOrigin: 'top left',
            }}
            ref={(node) => {
              if (node && node.parentElement) {
                const parentW = node.parentElement.clientWidth;
                const scale = parentW / dims.width;
                node.style.setProperty('--preview-scale', `${scale}`);
                node.parentElement.style.height = `${dims.height * scale}px`;
              }
            }}
          >
            <DesignRenderer
              slide={currentSlide}
              dimensions={dims}
              assetsMap={assetsMap}
              interactive={false}
              isPlaying={isPlaying}
            />
          </div>

          {/* Slide Progress Indicator Bar */}
          {slides.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-40">
              <div
                className="h-full bg-teal-400 transition-all duration-1000 ease-linear"
                style={{
                  width: `${((elapsedSeconds + 1) / slideDuration) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Playback Controls */}
      <div className="w-full bg-gradient-to-t from-black/90 to-transparent py-4 px-6 flex items-center justify-between text-white shrink-0 z-30">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-semibold text-slate-200">
            Slide {currentSlideIndex + 1} of {slides.length}
          </span>
        </div>

        {/* Center: Prev / Play / Next */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={slides.length <= 1}
            onClick={handlePrev}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full disabled:opacity-30 transition-colors"
            title="Previous Slide"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 rounded-full bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center justify-center shadow-lg transition-transform hover:scale-105"
            title={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-slate-950" />
            ) : (
              <Play className="w-5 h-5 fill-slate-950 translate-x-0.5" />
            )}
          </button>

          <button
            type="button"
            disabled={slides.length <= 1}
            onClick={handleNext}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full disabled:opacity-30 transition-colors"
            title="Next Slide"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Duration Countdown */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
          <Clock className="w-3.5 h-3.5 text-teal-400" />
          <span>
            {elapsedSeconds}s / {slideDuration}s
          </span>
        </div>
      </div>
    </div>
  );
};
