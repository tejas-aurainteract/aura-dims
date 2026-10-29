/**
 * Aura DIMS - Design Document DOM Renderer
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Pixel-accurate, scaled DOM renderer for digital display slides.
 * Supports:
 * - Complex script shaping and ligatures for Gujarati and Hindi (Devanagari)
 * - Typography styling, shapes, image fitting, and video loop constraints
 * - Logical canvas dimensions (1920x1080 Landscape, 1080x1920 Portrait)
 * - Safe-margin guide overlay (5% outer border)
 */

import React from 'react';
import {
  DesignSlide,
  Resolution,
  CanvasElement,
  TextElement,
  ShapeElement,
  ImageElement,
  VideoElement,
} from '@aura-dims/display-schema';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';

export interface DesignRendererProps {
  slide: DesignSlide;
  dimensions: Resolution;
  assetsMap?: Map<string, string> | Record<string, string>;
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string) => void;
  interactive?: boolean;
  showSafeZone?: boolean;
  isPlaying?: boolean;
  scale?: number;
  className?: string;
}

export const DesignRenderer: React.FC<DesignRendererProps> = ({
  slide,
  dimensions,
  assetsMap = new Map(),
  selectedElementId,
  onSelectElement,
  interactive = false,
  showSafeZone = false,
  isPlaying = false,
  scale = 1,
  className = '',
}) => {
  // Helper to get asset URL from Map or Record
  const getAssetUrl = (assetId?: string): string | null => {
    if (!assetId) return null;
    if (assetsMap instanceof Map) {
      return assetsMap.get(assetId) || null;
    }
    return (assetsMap as Record<string, string>)[assetId] || null;
  };

  // Background styling
  const renderBackground = () => {
    const bg = slide.background;
    if (bg.type === 'color') {
      return { backgroundColor: bg.value || '#0f172a' };
    }
    if (bg.type === 'gradient') {
      return { backgroundImage: bg.value || 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' };
    }
    if (bg.type === 'asset' && bg.assetId) {
      const url = getAssetUrl(bg.assetId);
      if (url) {
        return {
          backgroundImage: `url("${url}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        };
      }
    }
    return { backgroundColor: '#0f172a' };
  };

  // Render individual canvas element
  const renderElement = (el: CanvasElement) => {
    const isSelected = interactive && selectedElementId === el.id;

    // Font Family CSS mapping
    const getFontFamilyStyle = (fontFamily: string) => {
      switch (fontFamily) {
        case 'Noto Sans Gujarati':
          return '"Noto Sans Gujarati", sans-serif';
        case 'Noto Sans Devanagari':
          return '"Noto Sans Devanagari", sans-serif';
        case 'Inter':
        default:
          return '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      }
    };

    const containerStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${el.x}px`,
      top: `${el.y}px`,
      width: `${el.width}px`,
      height: `${el.height}px`,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      opacity: el.opacity ?? 1,
      zIndex: el.zIndex ?? 1,
      cursor: interactive ? (el.locked ? 'not-allowed' : 'move') : 'default',
      userSelect: 'none',
      boxSizing: 'border-box',
    };

    return (
      <div
        key={el.id}
        data-element-id={el.id}
        data-element-type={el.type}
        style={containerStyle}
        onClick={(e) => {
          if (interactive && onSelectElement) {
            e.stopPropagation();
            onSelectElement(el.id);
          }
        }}
        className={
          isSelected
            ? 'outline-2 outline-teal-500 outline-offset-1 select-none ring-1 ring-white/50'
            : interactive
            ? 'hover:outline-1 hover:outline-teal-400/50 hover:outline-dashed'
            : ''
        }
      >
        {/* Render by Element Type */}
        {el.type === 'text' && renderTextElement(el as TextElement, getFontFamilyStyle)}
        {el.type === 'shape' && renderShapeElement(el as ShapeElement)}
        {el.type === 'image' && renderImageElement(el as ImageElement, getAssetUrl)}
        {el.type === 'video' && renderVideoElement(el as VideoElement, getAssetUrl, isPlaying)}
      </div>
    );
  };

  const renderTextElement = (
    el: TextElement,
    getFontFamilyStyle: (font: string) => string
  ) => {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          fontFamily: getFontFamilyStyle(el.fontFamily),
          fontSize: `${el.fontSize}px`,
          fontWeight: el.fontWeight,
          fontStyle: el.italic ? 'italic' : 'normal',
          textDecoration: el.underline ? 'underline' : 'none',
          color: el.color,
          textAlign: el.textAlign,
          lineHeight: el.lineHeight,
          letterSpacing: `${el.letterSpacing}px`,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
        }}
      >
        {el.content}
      </div>
    );
  };

  const renderShapeElement = (el: ShapeElement) => {
    const baseStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      backgroundColor: el.fillColor || 'transparent',
      borderColor: el.borderColor || 'transparent',
      borderWidth: `${el.borderWidth || 0}px`,
      borderStyle: (el.borderWidth && el.borderWidth > 0) ? 'solid' : 'none',
      boxSizing: 'border-box',
    };

    if (el.shapeType === 'ellipse') {
      return <div style={{ ...baseStyle, borderRadius: '50%' }} />;
    }

    if (el.shapeType === 'rounded_rectangle') {
      return (
        <div
          style={{
            ...baseStyle,
            borderRadius: `${el.borderRadius ?? 24}px`,
          }}
        />
      );
    }

    if (el.shapeType === 'line') {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              height: `${Math.max(el.borderWidth || 2, 2)}px`,
              backgroundColor: el.fillColor || el.borderColor || '#cbd5e1',
            }}
          />
        </div>
      );
    }

    // Default: rectangle
    return (
      <div
        style={{
          ...baseStyle,
          borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined,
        }}
      />
    );
  };

  const renderImageElement = (
    el: ImageElement,
    getAssetUrl: (id?: string) => string | null
  ) => {
    const url = getAssetUrl(el.assetId);

    if (!el.assetId || !url) {
      return (
        <div className="w-full h-full bg-slate-800/80 border-2 border-dashed border-slate-600/80 rounded-lg flex flex-col items-center justify-center p-4 text-slate-400">
          <ImageIcon className="w-12 h-12 mb-2 opacity-60 text-teal-400" />
          <span className="text-sm font-semibold text-slate-300">
            {el.name || 'Image Asset'}
          </span>
          <span className="text-xs text-slate-500 mt-1 text-center">
            {el.assetId ? 'Asset loading or unavailable' : 'Select asset in properties'}
          </span>
        </div>
      );
    }

    return (
      <img
        src={url}
        alt={el.name || 'Digital display graphic'}
        style={{
          width: '100%',
          height: '100%',
          objectFit: el.fit || 'contain',
          pointerEvents: 'none',
        }}
        onError={(e) => {
          // Fallback if image fails to load
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  };

  const renderVideoElement = (
    el: VideoElement,
    getAssetUrl: (id?: string) => string | null,
    isPlaying: boolean
  ) => {
    const url = getAssetUrl(el.assetId);

    if (!el.assetId || !url) {
      return (
        <div className="w-full h-full bg-slate-900/90 border-2 border-dashed border-teal-600/60 rounded-lg flex flex-col items-center justify-center p-4 text-slate-400">
          <VideoIcon className="w-12 h-12 mb-2 text-teal-400 opacity-80" />
          <span className="text-sm font-semibold text-slate-200">
            {el.name || 'Video Player'}
          </span>
          <span className="text-xs text-slate-500 mt-1 text-center">
            {el.assetId ? 'Video stream unavailable' : 'Assign video in properties'}
          </span>
        </div>
      );
    }

    return (
      <video
        src={url}
        muted={el.muted !== false}
        loop={el.loop !== false}
        autoPlay={isPlaying}
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: el.fit || 'contain',
          pointerEvents: 'none',
        }}
      />
    );
  };

  // Sort elements by zIndex ascending
  const sortedElements = [...(slide.elements || [])].sort(
    (a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1)
  );

  return (
    <div
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        position: 'relative',
        overflow: 'hidden',
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
        ...renderBackground(),
      }}
      className={`shadow-2xl select-none ${className}`}
      onClick={() => {
        if (interactive && onSelectElement) {
          onSelectElement('');
        }
      }}
    >
      {/* 5% Safe Area Guide Overlay */}
      {showSafeZone && (
        <div
          style={{
            position: 'absolute',
            top: '5%',
            left: '5%',
            width: '90%',
            height: '90%',
            border: '2px dashed rgba(20, 184, 166, 0.45)',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <div className="absolute top-2 left-2 bg-teal-900/80 text-teal-300 text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider backdrop-blur-xs">
            5% Safe Display Zone
          </div>
        </div>
      )}

      {/* Render Slide Elements */}
      {sortedElements.map((el) => renderElement(el))}
    </div>
  );
};
