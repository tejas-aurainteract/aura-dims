/**
 * Aura DIMS - Content Management Hub
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Unified Content workspace featuring tabs for:
 * 1. Designs (Visual content layouts - fully functional visual studio)
 * 2. Media Library (Secure departmental asset repository)
 * 3. Templates (Reusable digital display layout templates)
 *
 * Includes the "Create content" primary action.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Palette, FolderOpen, LayoutTemplate } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Department } from '@aura-dims/display-schema';
import { useAuth } from '@/contexts/AuthContext';

import { DesignsView } from '@/components/Content/DesignsView';
import { MediaLibraryView } from '@/components/Media/MediaLibraryView';
import { TemplatesView } from '@/components/Content/TemplatesView';
import { CreateContentChoiceModal } from '@/components/Content/CreateContentChoiceModal';
import { UploadMediaModal } from '@/components/Media/UploadMediaModal';

export const ContentPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'designs';
  const { userProfile } = useAuth();

  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [isMediaUploadOpen, setIsMediaUploadOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const snap = await getDocs(collection(db, 'departments'));
        const depts: Department[] = [];
        snap.forEach((doc) => {
          depts.push({ id: doc.id, ...(doc.data() as any) });
        });
        setDepartments(depts);
      } catch (err) {
        console.warn('[Aura DIMS] Could not fetch departments:', err);
      }
    };
    if (userProfile?.role === 'admin') {
      loadDepartments();
    }
  }, [userProfile?.role]);

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

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {currentTab === 'media' ? (
            <button
              type="button"
              onClick={() => setIsMediaUploadOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Upload media</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsChoiceModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create content</span>
            </button>
          )}
        </div>
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
          <DesignsView onOpenCreateChoice={() => setIsChoiceModalOpen(true)} />
        )}

        {currentTab === 'media' && <MediaLibraryView />}

        {currentTab === 'templates' && (
          <TemplatesView departments={departments} />
        )}
      </div>

      {/* Create Content Choice Modal */}
      <CreateContentChoiceModal
        isOpen={isChoiceModalOpen}
        onClose={() => setIsChoiceModalOpen(false)}
        onSelectTemplatesTab={() => setTab('templates')}
        departments={departments}
      />

      {/* Upload Media Modal */}
      <UploadMediaModal
        isOpen={isMediaUploadOpen}
        onClose={() => setIsMediaUploadOpen(false)}
        departments={departments}
        onUploadSuccess={() => {
          setIsMediaUploadOpen(false);
          setTab('media');
        }}
      />
    </div>
  );
};
