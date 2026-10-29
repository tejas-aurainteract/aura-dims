/**
 * Aura DIMS - Visual Canvas Editor Workspace
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Interactive visual canvas with:
 * - Scaled logical coordinate system (1920x1080 / 1080x1920)
 * - Drag-to-move, 8-handle resize, and rotation
 * - Shift-key aspect ratio lock & arrow key nudging (1px / 10px)
 * - Safe margin overlay (5% outer border)
 * - Integrated selection handles and bounding box
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  DesignSlide,
  Resolution,
  CanvasElement,
} from '@aura-dims/display-schema';
import { DesignRenderer } from './DesignRenderer';
import { RotateCw, Lock } from 'lucide-react';

export interface EditorCanvasProps {
  slide: DesignSlide;
  dimensions: Resolution;
  zoom: number; // Scale factor, e.g. 0.5, 0.75, 1.0
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void;
  onDeleteElement?: (id: string) => void;
  assetsMap?: Map<string, string>;
  showSafeZone?: boolean;
}

type DragMode = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | null;

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  initialElement: CanvasElement;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  slide,
  dimensions,
  zoom,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onDeleteElement,
  assetsMap = new Map(),
  showSafeZone = false,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const selectedElement = slide.elements.find((el) => el.id === selectedElementId) || null;

  // Convert mouse screen coordinates to canvas logical coordinates
  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (clientX - rect.left) / zoom;
      const y = (clientY - rect.top) / zoom;
      return { x, y };
    },
    [zoom]
  );

  // Keyboard navigation & deletion listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard against typing in form inputs
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!selectedElement || selectedElement.locked) return;

      const step = e.shiftKey ? 10 : 1;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onUpdateElement(selectedElement.id, { y: Math.round(selectedElement.y - step) });
          break;
        case 'ArrowDown':
          e.preventDefault();
          onUpdateElement(selectedElement.id, { y: Math.round(selectedElement.y + step) });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onUpdateElement(selectedElement.id, { x: Math.round(selectedElement.x - step) });
          break;
        case 'ArrowRight':
          e.preventDefault();
          onUpdateElement(selectedElement.id, { x: Math.round(selectedElement.x + step) });
          break;
        case 'Delete':
        case 'Backspace':
          if (onDeleteElement) {
            e.preventDefault();
            onDeleteElement(selectedElement.id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onSelectElement(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, onUpdateElement, onDeleteElement, onSelectElement]);

  // Mouse drag handler for Move, Resize, Rotate
  const startDrag = (e: React.MouseEvent, mode: DragMode) => {
    e.stopPropagation();
    if (!selectedElement || selectedElement.locked) return;

    const coords = getCanvasCoords(e.clientX, e.clientY);
    setDragState({
      mode,
      startX: coords.x,
      startY: coords.y,
      initialElement: { ...selectedElement },
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const dx = coords.x - dragState.startX;
      const dy = coords.y - dragState.startY;
      const init = dragState.initialElement;

      if (dragState.mode === 'move') {
        onUpdateElement(init.id, {
          x: Math.round(init.x + dx),
          y: Math.round(init.y + dy),
        });
      } else if (dragState.mode === 'rotate') {
        const centerX = init.x + init.width / 2;
        const centerY = init.y + init.height / 2;
        const rad = Math.atan2(coords.y - centerY, coords.x - centerX);
        let deg = Math.round((rad * 180) / Math.PI) + 90;
        if (deg < 0) deg += 360;
        if (deg >= 360) deg -= 360;
        // Snap to 0, 90, 180, 270 if close
        if (Math.abs(deg - 0) < 4 || Math.abs(deg - 360) < 4) deg = 0;
        else if (Math.abs(deg - 90) < 4) deg = 90;
        else if (Math.abs(deg - 180) < 4) deg = 180;
        else if (Math.abs(deg - 270) < 4) deg = 270;

        onUpdateElement(init.id, { rotation: deg });
      } else {
        // Handle 8 resize handles
        let newX = init.x;
        let newY = init.y;
        let newW = init.width;
        let newH = init.height;

        const keepAspect = e.shiftKey;
        const initialAspect = init.width / (init.height || 1);

        switch (dragState.mode) {
          case 'e':
            newW = Math.max(20, Math.round(init.width + dx));
            if (keepAspect) newH = Math.round(newW / initialAspect);
            break;
          case 's':
            newH = Math.max(20, Math.round(init.height + dy));
            if (keepAspect) newW = Math.round(newH * initialAspect);
            break;
          case 'w': {
            const rawW = init.width - dx;
            if (rawW >= 20) {
              newW = Math.round(rawW);
              newX = Math.round(init.x + dx);
              if (keepAspect) newH = Math.round(newW / initialAspect);
            }
            break;
          }
          case 'n': {
            const rawH = init.height - dy;
            if (rawH >= 20) {
              newH = Math.round(rawH);
              newY = Math.round(init.y + dy);
              if (keepAspect) newW = Math.round(newH * initialAspect);
            }
            break;
          }
          case 'se':
            newW = Math.max(20, Math.round(init.width + dx));
            newH = Math.max(20, Math.round(init.height + dy));
            if (keepAspect) {
              const maxScale = Math.max(newW / init.width, newH / init.height);
              newW = Math.round(init.width * maxScale);
              newH = Math.round(init.height * maxScale);
            }
            break;
          case 'sw': {
            const rawW = init.width - dx;
            if (rawW >= 20) {
              newW = Math.round(rawW);
              newX = Math.round(init.x + dx);
              newH = Math.max(20, Math.round(init.height + dy));
            }
            break;
          }
          case 'ne': {
            newW = Math.max(20, Math.round(init.width + dx));
            const rawH = init.height - dy;
            if (rawH >= 20) {
              newH = Math.round(rawH);
              newY = Math.round(init.y + dy);
            }
            break;
          }
          case 'nw': {
            const rawW = init.width - dx;
            const rawH = init.height - dy;
            if (rawW >= 20 && rawH >= 20) {
              newW = Math.round(rawW);
              newX = Math.round(init.x + dx);
              newH = Math.round(rawH);
              newY = Math.round(init.y + dy);
            }
            break;
          }
        }

        onUpdateElement(init.id, {
          x: newX,
          y: newY,
          width: newW,
          height: newH,
        });
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, getCanvasCoords, onUpdateElement]);

  return (
    <div
      className="relative flex items-center justify-center min-w-full min-h-full p-8 select-none"
      onClick={() => onSelectElement(null)}
    >
      {/* Scaled Canvas Container */}
      <div
        ref={canvasRef}
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
        }}
        className="relative bg-slate-950 shadow-2xl rounded-sm transition-transform duration-75"
      >
        {/* Core DOM Renderer */}
        <DesignRenderer
          slide={slide}
          dimensions={dimensions}
          assetsMap={assetsMap}
          selectedElementId={selectedElementId}
          onSelectElement={(id) => onSelectElement(id || null)}
          interactive={true}
          showSafeZone={showSafeZone}
        />

        {/* Selected Element Active Bounding Box and Resize Handles */}
        {selectedElement && (
          <div
            style={{
              position: 'absolute',
              left: `${selectedElement.x}px`,
              top: `${selectedElement.y}px`,
              width: `${selectedElement.width}px`,
              height: `${selectedElement.height}px`,
              transform: selectedElement.rotation
                ? `rotate(${selectedElement.rotation}deg)`
                : undefined,
              zIndex: 9998,
              boxSizing: 'border-box',
            }}
            className="pointer-events-none ring-2 ring-teal-500 ring-offset-1"
          >
            {/* Move handle overlay */}
            <div
              className={`w-full h-full pointer-events-auto ${
                selectedElement.locked ? 'cursor-not-allowed' : 'cursor-move'
              }`}
              onMouseDown={(e) => startDrag(e, 'move')}
            />

            {!selectedElement.locked && (
              <>
                {/* 8 Resize Handles */}
                {/* Top-Left */}
                <div
                  onMouseDown={(e) => startDrag(e, 'nw')}
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-teal-600 rounded-xs pointer-events-auto cursor-nwse-resize shadow-xs hover:scale-125"
                />
                {/* Top-Center */}
                <div
                  onMouseDown={(e) => startDrag(e, 'n')}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-teal-600 rounded-xs pointer-events-auto cursor-ns-resize shadow-xs hover:scale-125"
                />
                {/* Top-Right */}
                <div
                  onMouseDown={(e) => startDrag(e, 'ne')}
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-teal-600 rounded-xs pointer-events-auto cursor-nesw-resize shadow-xs hover:scale-125"
                />
                {/* Middle-Right */}
                <div
                  onMouseDown={(e) => startDrag(e, 'e')}
                  className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-white border-2 border-teal-600 rounded-xs pointer-events-auto cursor-ew-resize shadow-xs hover:scale-125"
                />
                {/* Bottom-Right */}
                <div
                  onMouseDown={(e) => startDrag(e, 'se')}
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-teal-600 rounded-xs pointer-events-auto cursor-nwse-resize shadow-xs hover:scale-125"
                />
                {/* Bottom-Center */}
                <div
                  onMouseDown={(e) => startDrag(e, 's')}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-teal-600 rounded-xs pointer-events-auto cursor-ns-resize shadow-xs hover:scale-125"
                />
                {/* Bottom-Left */}
                <div
                  onMouseDown={(e) => startDrag(e, 'sw')}
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-teal-600 rounded-xs pointer-events-auto cursor-nesw-resize shadow-xs hover:scale-125"
                />
                {/* Middle-Left */}
                <div
                  onMouseDown={(e) => startDrag(e, 'w')}
                  className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-white border-2 border-teal-600 rounded-xs pointer-events-auto cursor-ew-resize shadow-xs hover:scale-125"
                />

                {/* Rotation Handle */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
                  <div
                    onMouseDown={(e) => startDrag(e, 'rotate')}
                    className="w-5 h-5 bg-white border-2 border-teal-600 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-md hover:scale-110"
                    title="Rotate element"
                  >
                    <RotateCw className="w-2.5 h-2.5 text-teal-700" />
                  </div>
                  <div className="w-0.5 h-2 bg-teal-500" />
                </div>
              </>
            )}

            {/* Lock indicator if locked */}
            {selectedElement.locked && (
              <div className="absolute top-2 right-2 bg-slate-900/80 text-amber-400 p-1 rounded-sm backdrop-blur-xs">
                <Lock className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

