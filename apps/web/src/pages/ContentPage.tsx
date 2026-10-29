/**
 * Aura DIMS - Content Management Hub
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Unified Content workspace featuring tabs for:
 * 1. Designs (Visual content layouts - future studio milestone)
 * 2. Media Library (Secure departmental asset repository - fully implemented)
 * 3. Templates (Reusable layout templates - future templates milestone)
 *
 * Includes the "Create content" primary action.
 */

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Palette, FolderOpen, LayoutTemplate } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { MediaLibraryView } from '@/components/Media/MediaLibraryView';
import { UploadMediaModal } from '@/components/Media/UploadMediaModal';

export const ContentPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'media';
  const [isQuickUploadOpen, setIsQuickUploadOpen] = useState(false);

  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6">
      {/* Top Header & "Create content" Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Content</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create, organize, and manage multimedia layouts for digital displays • Aurainteract Private Limited
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (currentTab === 'media') {
              setIsQuickUploadOpen(true);
            } else {
              setTab('designs');
              alert('Visual Content Creator is planned for the next content authoring milestone.');
            }
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Create content</span>
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            type="button"
            onClick={() => setTab('designs')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors ${
              currentTab === 'designs'
                ? 'border-teal-600 text-teal-800 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Palette className="h-4 w-4" />
            <span>Designs</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('media')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors ${
              currentTab === 'media'
                ? 'border-teal-600 text-teal-800 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FolderOpen className="h-4 w-4" />
            <span>Media Library</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('templates')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors ${
              currentTab === 'templates'
                ? 'border-teal-600 text-teal-800 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <LayoutTemplate className="h-4 w-4" />
            <span>Templates</span>
          </button>
        </nav>
      </div>

      {/* Tab Panels */}
      <div>
        {currentTab === 'designs' && (
          <EmptyState
            title="Visual Content Creator Studio"
            moduleName="Designs"
            description="Interactive multi-layer canvas editor for authoring digital display slides. Supports typography, shapes, video regions, layered positioning, asset embedding, and multi-language text rendering."
            icon={Palette}
            futureCapabilities={[
              'Canvas authoring for Landscape (16:9) and Portrait (9:16) aspect ratios',
              'Z-index layer management (bring forward, send backward, lock, hide)',
              'Rich typography with Gujarati, Hindi, and English font families',
              'Dedicated video regions with auto-loop and mute constraints',
              'Separation of editable drafts from published immutable versions',
              'Live pixel-accurate preview simulation of digital displays',
            ]}
          />
        )}

        {currentTab === 'media' && <MediaLibraryView />}

        {currentTab === 'templates' && (
          <EmptyState
            title="Display Layout Templates"
            moduleName="Templates"
            description="Pre-built and reusable layout templates for safety briefings, factory shift updates, visitor welcomes, emergency notices, and operational announcements across digital displays."
            icon={LayoutTemplate}
            futureCapabilities={[
              'Landscape templates (1920×1080) for hallways, cafeterias, and lobbies',
              'Portrait templates (1080×1920) for kiosks and entrance totems',
              'Corporate branding locks (Aurainteract logos, color themes, headers)',
              'Dynamic placeholder fields (date, site name, shift supervisor)',
              'Multilingual template variants for English, Gujarati, and Hindi',
              'Template cloning, archiving, and departmental sharing',
            ]}
          />
        )}
      </div>

      {/* Quick Upload Modal triggered from Top Header */}
      <UploadMediaModal
        isOpen={isQuickUploadOpen}
        onClose={() => setIsQuickUploadOpen(false)}
        departments={[]}
        onUploadSuccess={() => {
          // Re-render handled by MediaLibraryView
          setIsQuickUploadOpen(false);
          setTab('media');
        }}
      />
    </div>
  );
};
