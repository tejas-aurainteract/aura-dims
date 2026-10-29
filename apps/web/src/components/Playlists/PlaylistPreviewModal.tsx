/**
 * Aura DIMS - Multi-Design Playlist Playback Simulator
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Simulates timed sequential playback across multiple visual designs
 * formatted for Landscape or Portrait digital displays.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  PlaylistRecord,
  DesignDocument,
  DesignSlide,
} from '@aura-dims/display-schema';
import { DesignRenderer } from '../Editor/DesignRenderer';

interface PlaylistPreviewModalProps {
  playlist: PlaylistRecord;
  onClose: () => void;
}

interface FlattenedSlide {
  designTitle: string;
  designIndex: number;
  slide: DesignSlide;
  durationSeconds: number;
}

export const PlaylistPreviewModal: React.FC<PlaylistPreviewModalProps> = ({
  playlist,
  onClose,
}) => {
  const [flattenedSlides, setFlattenedSlides] = useState<FlattenedSlide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedSecondsInSlide, setElapsedSecondsInSlide] = useState(0);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const isLandscape = playlist.orientation === 'landscape';
  const canvasWidth = isLandscape ? 1920 : 1080;
  const canvasHeight = isLandscape ? 1080 : 1920;

  // Load all constituent design documents and flatten slides into a single playback timeline
  useEffect(() => {
    let mounted = true;
    const loadDesigns = async () => {
      setLoading(true);
      try {
        const slides: FlattenedSlide[] = [];
        for (let i = 0; i < playlist.items.length; i++) {
          const item = playlist.items[i]!;
          const res = await api.getDesign({ designId: item.designId });
          const doc = res.design.document as DesignDocument;
          for (const s of doc.slides || []) {
            slides.push({
              designTitle: item.title,
              designIndex: i + 1,
              slide: s,
              durationSeconds: s.durationSeconds || 10,
            });
          }
        }
        if (mounted) {
          setFlattenedSlides(slides);
          setCurrentSlideIndex(0);
          setElapsedSecondsInSlide(0);
        }
      } catch (err) {
        console.error('Failed to load playlist designs for preview:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDesigns();
    return () => {
      mounted = false;
    };
  }, [playlist]);

  // Timed progression interval
  useEffect(() => {
    if (!isPlaying || flattenedSlides.length === 0) return;

    const currentSlide = flattenedSlides[currentSlideIndex];
    if (!currentSlide) return;

    const timer = setInterval(() => {
      setElapsedSecondsInSlide((prev) => {
        if (prev + 1 >= currentSlide.durationSeconds) {
          // Advance to next slide
          setCurrentSlideIndex((cur) => (cur + 1) % flattenedSlides.length);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, currentSlideIndex, flattenedSlides]);

  const handlePrev = () => {
    setCurrentSlideIndex((cur) => (cur > 0 ? cur - 1 : flattenedSlides.length - 1));
    setElapsedSecondsInSlide(0);
  };

  const handleNext = () => {
    setCurrentSlideIndex((cur) => (cur + 1) % flattenedSlides.length);
    setElapsedSecondsInSlide(0);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const currentSlide = flattenedSlides[currentSlideIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div
        ref={containerRef}
        className="relative bg-slate-950 text-white rounded-2xl overflow-hidden shadow-2xl flex flex-col w-full max-w-5xl h-[85vh] border border-slate-800"
      >
        {/* Top Playback Bar */}
        <div className="px-5 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                isLandscape ? 'bg-indigo-900/60 text-indigo-300' : 'bg-purple-900/60 text-purple-300'
              }`}
            >
              {isLandscape ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
              <span>{isLandscape ? 'Landscape' : 'Portrait'} Digital Display Preview</span>
            </span>

            <div>
              <h2 className="text-xs font-bold text-white truncate max-w-xs">{playlist.title}</h2>
              {currentSlide && (
                <p className="text-[10px] text-slate-400">
                  Design {currentSlide.designIndex}/{playlist.items.length}:{' '}
                  <span className="text-teal-400">{currentSlide.designTitle}</span> • Slide{' '}
                  {currentSlideIndex + 1}/{flattenedSlides.length}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              title="Fullscreen simulation"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close preview"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scaled Preview Canvas Display */}
        <div className="flex-1 bg-slate-950 flex items-center justify-center p-4 overflow-hidden relative">
          {loading ? (
            <div className="text-center text-slate-400">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-700 border-t-teal-500 mb-2" />
              <p className="text-xs">Compiling playlist sequence for digital display simulation...</p>
            </div>
          ) : !currentSlide ? (
            <div className="text-center text-slate-500 text-xs">No slides in this playlist.</div>
          ) : (
            <div
              className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800"
              style={{
                width: isLandscape ? '800px' : '450px',
                height: isLandscape ? '450px' : '800px',
                maxHeight: '100%',
                maxWidth: '100%',
                aspectRatio: `${canvasWidth} / ${canvasHeight}`,
              }}
            >
              <DesignRenderer
                slide={currentSlide.slide}
                dimensions={{ width: canvasWidth, height: canvasHeight }}
                isPlaying={isPlaying}
              />
            </div>
          )}
        </div>

        {/* Bottom Playback Transport Controls */}
        <div className="px-5 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={loading || flattenedSlides.length === 0}
              className="p-2 rounded-xl text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={loading || flattenedSlides.length === 0}
              className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-xs transition-colors"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={loading || flattenedSlides.length === 0}
              className="p-2 rounded-xl text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <span className="text-xs text-slate-400 font-mono ml-2">
              {currentSlide
                ? `${elapsedSecondsInSlide}s / ${currentSlide.durationSeconds}s`
                : '0s / 0s'}
            </span>
          </div>

          {/* Dwell Progress Bar */}
          <div className="flex-1 max-w-md mx-6">
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 transition-all duration-300"
                style={{
                  width: currentSlide
                    ? `${(elapsedSecondsInSlide / currentSlide.durationSeconds) * 100}%`
                    : '0%',
                }}
              />
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Total Playlist: <span className="text-white font-semibold">{playlist.totalDurationSeconds}s</span>
          </div>
        </div>
      </div>
    </div>
  );
};
