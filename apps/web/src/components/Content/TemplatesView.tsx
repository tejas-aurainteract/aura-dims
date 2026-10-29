/**
 * Aura DIMS - Templates Catalog View
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Pre-built and departmental template gallery:
 * - Starter layouts (Notices, Posters, Announcements, Notice Boards)
 * - Landscape (1920×1080) and Portrait (1080×1920) orientations
 * - Instant instantiation into editable departmental designs
 * - Template preview simulation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  TemplateRecord,
  TemplateCategory,
  DisplayOrientation,
  Department,
} from '@aura-dims/display-schema';
import {
  LayoutTemplate,
  Monitor,
  Smartphone,
  Play,
  FilePlus,
  Globe,
  Building2,
  Loader2,
  Search,
  X,
  Sparkles,
} from 'lucide-react';
import { DesignPreviewModal } from '@/components/Editor/DesignPreviewModal';

export interface TemplatesViewProps {
  departments?: Department[];
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  departments = [],
}) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // State
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all');
  const [orientationFilter, setOrientationFilter] = useState<DisplayOrientation | 'all'>('all');

  // Preview Modal
  const [previewTemplate, setPreviewTemplate] = useState<TemplateRecord | null>(null);

  // Instantiation Modal State
  const [selectedTemplateForUse, setSelectedTemplateForUse] = useState<TemplateRecord | null>(null);
  const [instantiateTitle, setInstantiateTitle] = useState('');
  const [instantiateDeptId, setInstantiateDeptId] = useState('');
  const [isInstantiating, setIsInstantiating] = useState(false);
  const [instantiateError, setInstantiateError] = useState<string | null>(null);

  // Load templates
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listTemplates({
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        orientation: orientationFilter === 'all' ? undefined : orientationFilter,
      });
      setTemplates(res.templates);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, orientationFilter]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Open "Use Template" configuration dialog
  const handleOpenUseTemplate = (tmpl: TemplateRecord) => {
    setSelectedTemplateForUse(tmpl);
    setInstantiateTitle(`${tmpl.title} (New Design)`);
    setInstantiateDeptId(userProfile?.departmentId || (departments[0]?.id ?? ''));
    setInstantiateError(null);
  };

  const handleConfirmInstantiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateForUse || !instantiateTitle.trim()) return;

    try {
      setIsInstantiating(true);
      setInstantiateError(null);
      const res = await api.instantiateTemplate({
        templateId: selectedTemplateForUse.id,
        title: instantiateTitle.trim(),
        departmentId: isAdmin ? instantiateDeptId : undefined,
      });

      setSelectedTemplateForUse(null);
      navigate(`/content/editor/${res.design.id}`);
    } catch (err: any) {
      setInstantiateError(err.message || 'Failed to instantiate template');
    } finally {
      setIsInstantiating(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(term) ||
      (t.description && t.description.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-4">
      {/* Search & Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg focus:border-teal-500 focus:outline-hidden transition-colors"
          />
        </div>

        {/* Category & Orientation Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as TemplateCategory | 'all')
            }
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:border-teal-500 focus:outline-hidden capitalize"
          >
            <option value="all">All Categories</option>
            <option value="notice">Notice</option>
            <option value="poster">Poster</option>
            <option value="announcement">Announcement</option>
            <option value="board">Notice Board</option>
          </select>

          <select
            value={orientationFilter}
            onChange={(e) =>
              setOrientationFilter(e.target.value as DisplayOrientation | 'all')
            }
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:border-teal-500 focus:outline-hidden capitalize"
          >
            <option value="all">All Orientations</option>
            <option value="landscape">Landscape (1920×1080)</option>
            <option value="portrait">Portrait (1080×1920)</option>
          </select>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-7 h-7 text-teal-600 animate-spin" />
          <span className="text-xs">Loading template catalog...</span>
        </div>
      ) : error ? (
        <div className="h-64 flex flex-col items-center justify-center text-rose-600 gap-2 bg-rose-50 rounded-xl border border-rose-200 p-6">
          <span className="text-xs font-semibold">{error}</span>
          <button
            type="button"
            onClick={fetchTemplates}
            className="px-3 py-1 text-xs bg-white text-rose-700 border border-rose-300 rounded-md hover:bg-rose-50"
          >
            Retry
          </button>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3 border-2 border-dashed border-slate-200 rounded-2xl bg-white p-8">
          <LayoutTemplate className="w-10 h-10 text-slate-300" />
          <span className="text-sm font-bold text-slate-800">No templates found</span>
          <span className="text-xs text-slate-400">
            No templates matched the selected criteria.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTemplates.map((template) => {
            const isLandscape = template.orientation === 'landscape';

            return (
              <div
                key={template.id}
                className="group bg-white rounded-2xl border border-slate-200 hover:border-teal-500 hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                {/* Visual Thumbnail */}
                <div
                  className="h-36 bg-slate-900 relative flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => handleOpenUseTemplate(template)}
                >
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 group-hover:scale-105 transition-transform duration-300">
                    {isLandscape ? (
                      <Monitor className="w-12 h-12 text-teal-400/40" />
                    ) : (
                      <Smartphone className="w-12 h-12 text-teal-400/40" />
                    )}
                    <span className="text-[10px] text-slate-400 mt-2 font-mono">
                      {template.dimensions.width}×{template.dimensions.height}
                    </span>
                  </div>

                  {/* Orientation Badge */}
                  <div className="absolute top-2 left-2 bg-slate-950/80 text-white font-mono text-[9px] px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1 border border-white/10">
                    {isLandscape ? (
                      <Monitor className="w-2.5 h-2.5 text-teal-400" />
                    ) : (
                      <Smartphone className="w-2.5 h-2.5 text-teal-400" />
                    )}
                    <span className="capitalize">{template.orientation}</span>
                  </div>

                  {/* Scope Badge */}
                  <div className="absolute top-2 right-2 bg-slate-950/80 text-slate-300 text-[9px] font-medium px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1 border border-white/10">
                    {template.scope === 'global' ? (
                      <>
                        <Globe className="w-2.5 h-2.5 text-teal-400" />
                        <span>Global</span>
                      </>
                    ) : (
                      <>
                        <Building2 className="w-2.5 h-2.5 text-amber-400" />
                        <span>{template.departmentId}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                        {template.category}
                      </span>
                    </div>

                    <h3
                      onClick={() => handleOpenUseTemplate(template)}
                      className="text-xs font-bold text-slate-900 mt-1.5 hover:text-teal-700 cursor-pointer line-clamp-1"
                      title={template.title}
                    >
                      {template.title}
                    </h3>

                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {template.description || 'Pre-formatted digital signage layout ready for content.'}
                    </p>
                  </div>

                  {/* Footer Action */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleOpenUseTemplate(template)}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-2xs"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Use Template</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(template)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                      title="Preview template slides"
                    >
                      <Play className="w-3.5 h-3.5 text-teal-600" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Simulation Modal */}
      {previewTemplate && (
        <DesignPreviewModal
          isOpen={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          document={previewTemplate.document}
        />
      )}

      {/* Use Template Modal */}
      {selectedTemplateForUse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Create Design from Template
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTemplateForUse(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmInstantiate} className="p-6 space-y-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Template Source
                </span>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">
                  {selectedTemplateForUse.title} ({selectedTemplateForUse.orientation})
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">
                  New Design Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={instantiateTitle}
                  onChange={(e) => setInstantiateTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-hidden"
                />
              </div>

              {/* Department selector if Admin */}
              {isAdmin && departments.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-700">
                    Target Department
                  </label>
                  <select
                    value={instantiateDeptId}
                    onChange={(e) => setInstantiateDeptId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-hidden"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {instantiateError && (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
                  {instantiateError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateForUse(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInstantiating || !instantiateTitle.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isInstantiating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Open in Visual Editor</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

