/**
 * Aura DIMS - Visual Content Creator Studio Page
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Full-featured visual digital display canvas authoring suite:
 * - Scaled canvas with pan/zoom and 5% safe display guides
 * - Gujarati, Hindi, and English complex script typography
 * - Image & video elements with Media Library integration
 * - Multi-slide sequence management and duration control
 * - Debounced autosave with optimistic concurrency conflict detection
 * - Local crash recovery cache (localStorage)
 * - Single slide & full-sequence playback simulation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  DesignWithDocument,
  DesignSlide,
  CanvasElement,
  TextElement,
  ShapeElement,
  ImageElement,
  VideoElement,
  ShapeType,
  SupportedFontFamily,
  DESIGN_CONSTRAINTS,
  extractReferencedAssetIds,
  MediaAsset,
} from '@aura-dims/display-schema';
import {
  saveDraftRecovery,
  getDraftRecovery,
  clearDraftRecovery,
} from '@/lib/designStorage';
import { resolveAssetsBatch } from '@/lib/assetResolver';

// Subcomponents
import { EditorHeader, SaveStatus } from '@/components/Editor/EditorHeader';
import { EditorCanvas } from '@/components/Editor/EditorCanvas';
import { SlideThumbnails } from '@/components/Editor/SlideThumbnails';
import { AddElementBar } from '@/components/Editor/AddElementBar';
import { PropertiesPanel } from '@/components/Editor/PropertiesPanel';
import { DesignPreviewModal } from '@/components/Editor/DesignPreviewModal';
import { EditorAssetPickerModal } from '@/components/Editor/EditorAssetPickerModal';
import { OrientationConversionModal } from '@/components/Editor/OrientationConversionModal';
import { ConflictModal } from '@/components/Editor/ConflictModal';
import { SaveAsTemplateModal } from '@/components/Editor/SaveAsTemplateModal';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export const DesignEditorPage: React.FC = () => {
  const { designId } = useParams<{ designId: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  // Core Design State
  const [design, setDesign] = useState<DesignWithDocument | null>(null);
  const [title, setTitle] = useState('');
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Viewport & Guides
  const [zoom, setZoom] = useState(0.5);
  const [showSafeZone, setShowSafeZone] = useState(false);

  // Persistence & Concurrency
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isSaving, setIsSaving] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);

  // Modals & Panels
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [orientationModalOpen, setOrientationModalOpen] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [assetPickerState, setAssetPickerState] = useState<{
    isOpen: boolean;
    mediaType: 'image' | 'video';
    target: 'element' | 'background';
  }>({ isOpen: false, mediaType: 'image', target: 'element' });

  // Local recovery banner
  const [recoveryPrompt, setRecoveryPrompt] = useState<{
    hasRecovery: boolean;
    savedAt: string;
    draftDoc: any;
    draftTitle: string;
  } | null>(null);

  // Assets Map for previews
  const [assetsMap, setAssetsMap] = useState<Map<string, string>>(new Map());

  // History Stack for Undo / Redo
  const [history, setHistory] = useState<
    Array<{ document: DesignWithDocument['document']; title: string }>
  >([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Loading & error
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Autosave Debounce Ref
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial design
  const loadDesignData = useCallback(async () => {
    if (!designId) return;
    try {
      setInitialLoading(true);
      setError(null);
      const res = await api.getDesign({ designId });
      setDesign(res.design);
      setTitle(res.design.title);
      setHistory([{ document: res.design.document, title: res.design.title }]);
      setHistoryIndex(0);
      setSaveStatus('saved');

      // Resolve referenced assets
      const assetIds = extractReferencedAssetIds(res.design.document);
      const map = await resolveAssetsBatch(assetIds, 'original');
      setAssetsMap(map);

      // Check local recovery draft
      if (userProfile?.uid) {
        const backup = getDraftRecovery(userProfile.uid, designId);
        if (backup && backup.revision >= res.design.revision) {
          setRecoveryPrompt({
            hasRecovery: true,
            savedAt: backup.savedAt,
            draftDoc: backup.document,
            draftTitle: backup.title,
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load design');
    } finally {
      setInitialLoading(false);
    }
  }, [designId, userProfile?.uid]);

  useEffect(() => {
    loadDesignData();
  }, [loadDesignData]);

  // Push new state to history & mark unsaved
  const commitChange = useCallback(
    (newDoc: DesignWithDocument['document'], newTitle: string = title) => {
      if (!design || !userProfile?.uid || !designId) return;

      const newHistory = history.slice(0, historyIndex + 1);
      if (newHistory.length >= 30) newHistory.shift();
      newHistory.push({ document: newDoc, title: newTitle });

      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);

      setDesign((prev) => (prev ? { ...prev, document: newDoc, title: newTitle } : null));
      setTitle(newTitle);
      setSaveStatus('unsaved');

      // Local recovery backup immediately
      saveDraftRecovery(userProfile.uid, designId, design.revision, newTitle, newDoc);

      // Debounce autosave to cloud (1.5 seconds)
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        handleSave(newDoc, newTitle);
      }, 1500);
    },
    [design, userProfile?.uid, designId, history, historyIndex, title]
  );

  // Undo / Redo handlers
  const handleUndo = () => {
    if (historyIndex > 0 && design) {
      const prev = history[historyIndex - 1];
      if (!prev) return;
      setHistoryIndex(historyIndex - 1);
      setDesign({ ...design, document: prev.document, title: prev.title });
      setTitle(prev.title);
      setSaveStatus('unsaved');
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && design) {
      const next = history[historyIndex + 1];
      if (!next) return;
      setHistoryIndex(historyIndex + 1);
      setDesign({ ...design, document: next.document, title: next.title });
      setTitle(next.title);
      setSaveStatus('unsaved');
    }
  };

  // Primary Save Action
  const handleSave = async (
    docToSave?: DesignWithDocument['document'],
    titleToSave?: string
  ) => {
    if (!design || isSaving) return;

    const doc = docToSave || design.document;
    const currentTitle = titleToSave || title;

    try {
      setIsSaving(true);
      setSaveStatus('saving');

      const res = await api.updateDesign({
        designId: design.id,
        title: currentTitle.trim(),
        expectedRevision: design.revision,
        document: doc,
      });

      setDesign(res.design);
      setTitle(res.design.title);
      setSaveStatus('saved');

      if (userProfile?.uid) {
        clearDraftRecovery(userProfile.uid, design.id);
      }
    } catch (err: any) {
      console.error('[Aura DIMS] Design save error:', err);
      if (err.message && (err.message.includes('409') || err.message.includes('revision conflict'))) {
        setConflictModalOpen(true);
      }
      setSaveStatus('failed');
    } finally {
      setIsSaving(false);
    }
  };

  // Beforeunload warning on unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  // Keyboard shortcut listener for Ctrl+Z, Ctrl+Y, Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.shiftKey && e.key === 'Z'))
      ) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, design]);

  if (initialLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-100 text-slate-500 gap-3">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        <span className="text-xs font-semibold">Loading Visual Content Creator...</span>
      </div>
    );
  }

  if (error || !design) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-xl border border-slate-200 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">Failed to Load Design</h2>
          <p className="text-xs text-slate-500">{error || 'Design not found or access denied.'}</p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/content?tab=designs')}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Back to Designs
            </button>
            <button
              type="button"
              onClick={loadDesignData}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const slides = design.document.slides;
  const currentSlide: DesignSlide = slides[activeSlideIndex] || slides[0] || {
    id: 'default',
    durationSeconds: 10,
    background: { type: 'color', value: '#0f172a' },
    elements: [],
  };
  const selectedElement =
    currentSlide.elements.find((el) => el.id === selectedElementId) || null;
  const videoCount = currentSlide.elements.filter((el) => el.type === 'video').length;

  // --- Element Manipulations ---

  const handleUpdateElement = (id: string, updates: Partial<CanvasElement>) => {
    const updatedSlides = slides.map((slide, sIdx) => {
      if (sIdx !== activeSlideIndex) return slide;
      return {
        ...slide,
        elements: slide.elements.map((el) => (el.id === id ? { ...el, ...updates } : el)),
      };
    });
    commitChange({ ...design.document, slides: updatedSlides as DesignSlide[] });
  };

  const handleDeleteElement = (id: string) => {
    const updatedSlides = slides.map((slide, sIdx) => {
      if (sIdx !== activeSlideIndex) return slide;
      return {
        ...slide,
        elements: slide.elements.filter((el) => el.id !== id),
      };
    });
    if (selectedElementId === id) setSelectedElementId(null);
    commitChange({ ...design.document, slides: updatedSlides as DesignSlide[] });
  };

  const handleAddText = (
    content: string,
    fontFamily: SupportedFontFamily,
    fontSize: number,
    fontWeight: 'normal' | 'medium' | 'bold'
  ) => {
    if (currentSlide.elements.length >= DESIGN_CONSTRAINTS.MAX_ELEMENTS_PER_SLIDE) {
      alert(`Maximum of ${DESIGN_CONSTRAINTS.MAX_ELEMENTS_PER_SLIDE} elements allowed per slide.`);
      return;
    }

    const newElement: TextElement = {
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'text',
      name: 'Text Element',
      x: 100,
      y: 100,
      width: 600,
      height: 120,
      rotation: 0,
      zIndex: currentSlide.elements.length + 1,
      opacity: 1,
      content,
      fontFamily,
      fontSize,
      fontWeight,
      color: '#ffffff',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
    };

    const updatedSlides = slides.map((slide, sIdx) => {
      if (sIdx !== activeSlideIndex) return slide;
      return {
        ...slide,
        elements: [...slide.elements, newElement],
      };
    });

    setSelectedElementId(newElement.id);
    commitChange({ ...design.document, slides: updatedSlides as DesignSlide[] });
  };

  const handleAddShape = (shapeType: ShapeType) => {
    if (currentSlide.elements.length >= DESIGN_CONSTRAINTS.MAX_ELEMENTS_PER_SLIDE) {
      alert(`Maximum of ${DESIGN_CONSTRAINTS.MAX_ELEMENTS_PER_SLIDE} elements allowed per slide.`);
      return;
    }

    const newElement: ShapeElement = {
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'shape',
      shapeType,
      name: `${shapeType.replace('_', ' ')} Shape`,
      x: 150,
      y: 150,
      width: shapeType === 'line' ? 500 : 280,
      height: shapeType === 'line' ? 8 : 180,
      rotation: 0,
      zIndex: currentSlide.elements.length + 1,
      opacity: 1,
      fillColor: shapeType === 'line' ? '#cbd5e1' : '#0d9488',
      borderColor: '#ffffff',
      borderWidth: 0,
      borderRadius: shapeType === 'rounded_rectangle' ? 16 : 0,
    };

    const updatedSlides = slides.map((slide, sIdx) => {
      if (sIdx !== activeSlideIndex) return slide;
      return {
        ...slide,
        elements: [...slide.elements, newElement],
      };
    });

    setSelectedElementId(newElement.id);
    commitChange({ ...design.document, slides: updatedSlides as DesignSlide[] });
  };

  const handleSelectMediaAsset = (asset: MediaAsset) => {
    if (assetPickerState.target === 'background') {
      const updatedSlides = slides.map((slide, sIdx) => {
        if (sIdx !== activeSlideIndex) return slide;
        return {
          ...slide,
          background: {
            type: 'asset' as const,
            value: '',
            assetId: asset.id,
          },
        };
      });
      // Add to assets map
      if (asset.thumbnailPath) {
        setAssetsMap((prev) => new Map(prev).set(asset.id, asset.thumbnailPath));
      }
      commitChange({ ...design.document, slides: updatedSlides as DesignSlide[] });
      return;
    }

    // Check if replacing an existing element or adding new
    if (selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'video')) {
      handleUpdateElement(selectedElement.id, { assetId: asset.id });
      return;
    }

    // Adding new element
    if (asset.mediaType === 'image') {
      const newImg: ImageElement = {
        id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: 'image',
        name: asset.title || 'Image Element',
        x: 120,
        y: 120,
        width: 500,
        height: 350,
        rotation: 0,
        zIndex: currentSlide.elements.length + 1,
        opacity: 1,
        assetId: asset.id,
        fit: 'contain',
      };
      const updatedSlides = slides.map((slide, sIdx) => {
        if (sIdx !== activeSlideIndex) return slide;
        return { ...slide, elements: [...slide.elements, newImg] };
      });
      setSelectedElementId(newImg.id);
      commitChange({ ...design.document, slides: updatedSlides as DesignSlide[] });
    } else if (asset.mediaType === 'video') {
      const newVid: VideoElement = {
        id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: 'video',
        name: asset.title || 'Video Player',
        x: 120,
        y: 120,
        width: 640,
        height: 360,
        rotation: 0,
        zIndex: currentSlide.elements.length + 1,
        opacity: 1,
        assetId: asset.id,
        fit: 'contain',
        muted: true,
        loop: true,
      };
      const updatedSlides = slides.map((slide, sIdx) => {
        if (sIdx !== activeSlideIndex) return slide;
        return { ...slide, elements: [...slide.elements, newVid] };
      });
      setSelectedElementId(newVid.id);
      commitChange({ ...design.document, slides: updatedSlides as DesignSlide[] });
    }
  };

  // Layer Reordering
  const handleLayerOrder = (
    id: string,
    action: 'front' | 'back' | 'forward' | 'backward'
  ) => {
    const elements = [...currentSlide.elements].sort((a, b) => a.zIndex - b.zIndex);
    const index = elements.findIndex((el) => el.id === id);
    if (index === -1) return;

    const removed = elements.splice(index, 1);
    if (removed.length === 0 || !removed[0]) return;
    const target = removed[0];

    if (action === 'front') {
      elements.push(target);
    } else if (action === 'back') {
      elements.unshift(target);
    } else if (action === 'forward') {
      const newIdx = Math.min(elements.length, index + 1);
      elements.splice(newIdx, 0, target);
    } else if (action === 'backward') {
      const newIdx = Math.max(0, index - 1);
      elements.splice(newIdx, 0, target);
    }

    // Reassign normalized z-indices 1..N
    const reindexed = elements.map((el, idx) => ({ ...el, zIndex: idx + 1 }));

    const updatedSlides = slides.map((slide, sIdx) => {
      if (sIdx !== activeSlideIndex) return slide;
      return { ...slide, elements: reindexed };
    });

    commitChange({ ...design.document, slides: updatedSlides as DesignSlide[] });
  };

  // --- Slide Manipulations ---

  const handleAddSlide = () => {
    if (slides.length >= DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN) {
      alert(`Maximum of ${DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN} slides reached.`);
      return;
    }
    const newSlide: DesignSlide = {
      id: `slide_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      durationSeconds: DESIGN_CONSTRAINTS.DEFAULT_SLIDE_DURATION_SECONDS,
      background: { type: 'color', value: '#0f172a' },
      elements: [],
    };
    const updatedSlides = [...slides, newSlide];
    setActiveSlideIndex(updatedSlides.length - 1);
    setSelectedElementId(null);
    commitChange({ ...design.document, slides: updatedSlides });
  };

  const handleDuplicateSlide = (index: number) => {
    if (slides.length >= DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN) return;
    const source = slides[index];
    if (!source) return;
    const clonedElements = source.elements.map((el) => ({
      ...el,
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }));
    const newSlide: DesignSlide = {
      ...source,
      id: `slide_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      durationSeconds: source.durationSeconds || DESIGN_CONSTRAINTS.DEFAULT_SLIDE_DURATION_SECONDS,
      background: { ...source.background },
      elements: clonedElements,
    };
    const updatedSlides = [...slides];
    updatedSlides.splice(index + 1, 0, newSlide);
    setActiveSlideIndex(index + 1);
    commitChange({ ...design.document, slides: updatedSlides });
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) return;
    const updatedSlides = slides.filter((_, idx) => idx !== index);
    const newActive = Math.max(0, Math.min(activeSlideIndex, updatedSlides.length - 1));
    setActiveSlideIndex(newActive);
    setSelectedElementId(null);
    commitChange({ ...design.document, slides: updatedSlides });
  };

  const handleMoveSlide = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= slides.length) return;
    const updatedSlides = [...slides];
    const [moved] = updatedSlides.splice(index, 1);
    if (!moved) return;
    updatedSlides.splice(targetIdx, 0, moved);
    setActiveSlideIndex(targetIdx);
    commitChange({ ...design.document, slides: updatedSlides });
  };

  const handleChangeDuration = (index: number, seconds: number) => {
    const updatedSlides = slides.map((slide, idx) =>
      idx === index ? { ...slide, durationSeconds: seconds } : slide
    );
    commitChange({ ...design.document, slides: updatedSlides });
  };

  const handleUpdateSlideBackground = (bg: DesignSlide['background']) => {
    const updatedSlides = slides.map((slide, idx) =>
      idx === activeSlideIndex ? { ...slide, background: bg } : slide
    );
    commitChange({ ...design.document, slides: updatedSlides });
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* Top Header */}
      <EditorHeader
        title={title}
        onChangeTitle={(newTitle) => commitChange(design.document, newTitle)}
        orientation={design.orientation}
        saveStatus={saveStatus}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={() => handleSave()}
        zoom={zoom}
        onChangeZoom={setZoom}
        showSafeZone={showSafeZone}
        onToggleSafeZone={() => setShowSafeZone(!showSafeZone)}
        onOpenPreview={() => setPreviewModalOpen(true)}
        onRequestOrientationChange={() => setOrientationModalOpen(true)}
        isSaving={isSaving}
      />

      {/* Local Recovery Draft Alert Banner */}
      {recoveryPrompt && recoveryPrompt.hasRecovery && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900 shrink-0 z-30">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Unsaved draft recovered from local cache (saved at{' '}
              {new Date(recoveryPrompt.savedAt).toLocaleTimeString()}).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                commitChange(recoveryPrompt.draftDoc, recoveryPrompt.draftTitle);
                setRecoveryPrompt(null);
              }}
              className="px-2.5 py-1 bg-amber-600 text-white rounded-md font-semibold hover:bg-amber-700 transition-colors"
            >
              Restore Draft
            </button>
            <button
              type="button"
              onClick={() => {
                if (userProfile?.uid && designId) {
                  clearDraftRecovery(userProfile.uid, designId);
                }
                setRecoveryPrompt(null);
              }}
              className="px-2 py-1 text-amber-700 hover:text-amber-900 font-medium"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Toolbar: Add Elements */}
        <AddElementBar
          onAddText={handleAddText}
          onAddShape={handleAddShape}
          onOpenAssetPicker={(mediaType) =>
            setAssetPickerState({ isOpen: true, mediaType, target: 'element' })
          }
          canAddVideo={videoCount < DESIGN_CONSTRAINTS.MAX_VIDEOS_PER_SLIDE}
        />

        {/* Center: Scaled Visual Canvas */}
        <main className="flex-1 overflow-auto bg-slate-900/10 flex items-center justify-center relative">
          <EditorCanvas
            slide={currentSlide}
            dimensions={design.dimensions}
            zoom={zoom}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onUpdateElement={handleUpdateElement}
            onDeleteElement={handleDeleteElement}
            assetsMap={assetsMap}
            showSafeZone={showSafeZone}
          />
        </main>

        {/* Right Inspector: Contextual Properties */}
        <PropertiesPanel
          selectedElement={selectedElement}
          activeSlide={currentSlide}
          onUpdateElement={handleUpdateElement}
          onDeleteElement={handleDeleteElement}
          onUpdateSlideBackground={handleUpdateSlideBackground}
          onUpdateSlideDuration={(sec) => handleChangeDuration(activeSlideIndex, sec)}
          onBringForward={(id) => handleLayerOrder(id, 'forward')}
          onSendBackward={(id) => handleLayerOrder(id, 'backward')}
          onBringToFront={(id) => handleLayerOrder(id, 'front')}
          onSendToBack={(id) => handleLayerOrder(id, 'back')}
          onOpenAssetPicker={(mediaType) =>
            setAssetPickerState({ isOpen: true, mediaType, target: 'element' })
          }
        />
      </div>

      {/* Bottom Horizontal Slide Manager Strip */}
      <SlideThumbnails
        slides={slides}
        dimensions={design.dimensions}
        activeSlideIndex={activeSlideIndex}
        onSelectSlide={(idx) => {
          setActiveSlideIndex(idx);
          setSelectedElementId(null);
        }}
        onAddSlide={handleAddSlide}
        onDuplicateSlide={handleDuplicateSlide}
        onDeleteSlide={handleDeleteSlide}
        onMoveSlide={handleMoveSlide}
        onChangeDuration={handleChangeDuration}
        assetsMap={assetsMap}
      />

      {/* Modals */}
      <DesignPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        document={design.document}
        initialSlideIndex={activeSlideIndex}
      />

      <OrientationConversionModal
        isOpen={orientationModalOpen}
        onClose={() => setOrientationModalOpen(false)}
        designId={design.id}
        expectedRevision={design.revision}
        currentOrientation={design.orientation}
        onConverted={(updatedDesign) => {
          setDesign(updatedDesign);
          setTitle(updatedDesign.title);
          setHistory([{ document: updatedDesign.document, title: updatedDesign.title }]);
          setHistoryIndex(0);
          setSaveStatus('saved');
        }}
      />

      <ConflictModal
        isOpen={conflictModalOpen}
        isProcessing={isSaving}
        onReloadLatest={async () => {
          setConflictModalOpen(false);
          await loadDesignData();
        }}
        onSaveAsCopy={async () => {
          try {
            setIsSaving(true);
            const dup = await api.duplicateDesign({
              designId: design.id,
              newTitle: `${title} (Recovered Copy)`,
            });
            setConflictModalOpen(false);
            navigate(`/content/editor/${dup.design.id}`);
          } catch (err: any) {
            alert(`Failed to save copy: ${err.message}`);
          } finally {
            setIsSaving(false);
          }
        }}
      />

      <EditorAssetPickerModal
        isOpen={assetPickerState.isOpen}
        mediaType={assetPickerState.mediaType}
        onClose={() =>
          setAssetPickerState({ isOpen: false, mediaType: 'image', target: 'element' })
        }
        onSelectAsset={handleSelectMediaAsset}
      />

      <SaveAsTemplateModal
        isOpen={saveTemplateModalOpen}
        onClose={() => setSaveTemplateModalOpen(false)}
        document={design.document}
        defaultTitle={title}
      />
    </div>
  );
};
