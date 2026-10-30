/**
 * Aura DIMS - Designs Catalog View
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Primary visual layout workspace providing:
 * - Search by title
 * - Orientation & status filters (Active vs Archived)
 * - Grid and List view layouts
 * - Miniature slide thumbnail previews
 * - Edit, preview, duplicate, archive, and restore actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '@/lib/api';
import {
  DesignRecord,
  DisplayOrientation,
  DesignStatus,
} from '@aura-dims/display-schema';
import {
  Search,
  LayoutGrid,
  List as ListIcon,
  Monitor,
  Smartphone,
  Edit3,
  Play,
  Copy,
  Archive,
  RotateCcw,
  Palette,
  Loader2,
  Clock,
  Building2,
  User,
} from 'lucide-react';
import { DesignPreviewModal } from '@/components/Editor/DesignPreviewModal';

export interface DesignsViewProps {
  onOpenCreateChoice?: () => void;
}

export const DesignsView: React.FC<DesignsViewProps> = ({ onOpenCreateChoice }) => {
  const navigate = useNavigate();

  // State
  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [orientationFilter, setOrientationFilter] = useState<DisplayOrientation | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'draft' | 'archived' | 'all'>('draft');

  // Preview Modal
  const [previewDesign, setPreviewDesign] = useState<any | null>(null);

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Load designs
  const fetchDesigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listDesigns({
        search: search.trim() || undefined,
        orientation: orientationFilter === 'all' ? undefined : orientationFilter,
        status: statusFilter === 'all' ? undefined : (statusFilter as DesignStatus),
        pageSize: 40,
      });
      setDesigns(res.designs);
    } catch (err: any) {
      console.error('[Aura DIMS] Failed to fetch designs:', err);
      setError(getApiErrorMessage(err, 'Failed to load designs.'));
    } finally {
      setLoading(false);
    }
  }, [search, orientationFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDesigns();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchDesigns]);

  // Actions
  const handlePreview = async (designId: string) => {
    try {
      const res = await api.getDesign({ designId });
      setPreviewDesign(res.design);
    } catch (err: any) {
      alert(`Failed to load preview: ${err.message}`);
    }
  };

  const handleDuplicate = async (designId: string, currentTitle: string) => {
    try {
      setActionLoadingId(designId);
      await api.duplicateDesign({ designId, newTitle: `${currentTitle} (Copy)` });
      await fetchDesigns();
    } catch (err: any) {
      alert(`Failed to duplicate design: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleArchive = async (designId: string, currentStatus: DesignStatus) => {
    try {
      setActionLoadingId(designId);
      const isArchived = currentStatus === 'archived';
      await api.setDesignArchivedStatus({ designId, archived: !isArchived });
      await fetchDesigns();
    } catch (err: any) {
      alert(`Failed to update archive status: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

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
            placeholder="Search designs by title..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg focus:border-teal-500 focus:outline-hidden transition-colors"
          />
        </div>

        {/* Filters & View Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Orientation Filter */}
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

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'draft' | 'archived' | 'all')
            }
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:border-teal-500 focus:outline-hidden capitalize"
          >
            <option value="draft">Active Drafts</option>
            <option value="archived">Archived</option>
            <option value="all">All Statuses</option>
          </select>

          {/* View Toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-teal-700 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-teal-700 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="List View"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-7 h-7 text-teal-600 animate-spin" />
          <span className="text-xs">Loading designs catalog...</span>
        </div>
      ) : error ? (
        <div className="h-64 flex flex-col items-center justify-center text-rose-600 gap-2 bg-rose-50 rounded-xl border border-rose-200 p-6">
          <span className="text-xs font-semibold">{error}</span>
          <button
            type="button"
            onClick={fetchDesigns}
            className="px-3 py-1 text-xs bg-white text-rose-700 border border-rose-300 rounded-md hover:bg-rose-50"
          >
            Retry
          </button>
        </div>
      ) : designs.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3 border-2 border-dashed border-slate-200 rounded-2xl bg-white p-8">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
            <Palette className="w-6 h-6" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-bold text-slate-800">
              No designs found
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {search
                ? 'No designs matched your search criteria.'
                : 'Get started by creating your first digital display visual layout.'}
            </p>
          </div>
          {onOpenCreateChoice && (
            <button
              type="button"
              onClick={onOpenCreateChoice}
              className="mt-1 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-xs"
            >
              Create Content
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {designs.map((design) => {
            const isLandscape = design.orientation === 'landscape';

            return (
              <div
                key={design.id}
                className="group bg-white rounded-2xl border border-slate-200 hover:border-teal-500 hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                {/* Visual Thumbnail Frame */}
                <div
                  className="h-36 bg-slate-900 relative flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => navigate(`/content/editor/${design.id}`)}
                >
                  {/* Decorative background layout placeholder */}
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 group-hover:scale-105 transition-transform duration-300">
                    {isLandscape ? (
                      <Monitor className="w-12 h-12 text-teal-500/40" />
                    ) : (
                      <Smartphone className="w-12 h-12 text-teal-500/40" />
                    )}
                    <span className="text-[10px] text-slate-400 mt-2 font-mono">
                      {design.slideCount} {design.slideCount === 1 ? 'Slide' : 'Slides'} • {design.dimensions.width}×{design.dimensions.height}
                    </span>
                  </div>

                  {/* Orientation Pill Badge */}
                  <div className="absolute top-2 left-2 bg-slate-950/80 text-white font-mono text-[9px] px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1 border border-white/10">
                    {isLandscape ? (
                      <Monitor className="w-2.5 h-2.5 text-teal-400" />
                    ) : (
                      <Smartphone className="w-2.5 h-2.5 text-teal-400" />
                    )}
                    <span className="capitalize">{design.orientation}</span>
                  </div>

                  {/* Status Badge */}
                  {design.status === 'archived' && (
                    <div className="absolute top-2 right-2 bg-amber-500/90 text-white text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-xs">
                      Archived
                    </div>
                  )}
                </div>

                {/* Card Content & Details */}
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3
                      onClick={() => navigate(`/content/editor/${design.id}`)}
                      className="text-xs font-bold text-slate-900 hover:text-teal-700 cursor-pointer truncate"
                      title={design.title}
                    >
                      {design.title}
                    </h3>

                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{design.departmentId}</span>
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[80px]">
                          {design.uploaderDisplayName || 'Admin'}
                        </span>
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Updated {new Date(design.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => navigate(`/content/editor/${design.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-50 text-teal-800 hover:bg-teal-100 transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>

                    <div className="flex items-center gap-1 text-slate-400">
                      <button
                        type="button"
                        onClick={() => handlePreview(design.id)}
                        className="p-1 hover:text-slate-700 rounded-md hover:bg-slate-50"
                        title="Simulate display playback"
                      >
                        <Play className="w-3.5 h-3.5 text-teal-600" />
                      </button>

                      <button
                        type="button"
                        disabled={actionLoadingId === design.id}
                        onClick={() => handleDuplicate(design.id, design.title)}
                        className="p-1 hover:text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-30"
                        title="Duplicate design"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={actionLoadingId === design.id}
                        onClick={() => handleToggleArchive(design.id, design.status)}
                        className="p-1 hover:text-rose-600 rounded-md hover:bg-slate-50 disabled:opacity-30"
                        title={
                          design.status === 'archived'
                            ? 'Restore design'
                            : 'Archive design'
                        }
                      >
                        {design.status === 'archived' ? (
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        ) : (
                          <Archive className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Orientation</th>
                  <th className="px-4 py-3">Slides</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Modified</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {designs.map((design) => (
                  <tr key={design.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div
                        onClick={() => navigate(`/content/editor/${design.id}`)}
                        className="cursor-pointer hover:text-teal-700 truncate max-w-xs"
                      >
                        {design.title}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize font-mono text-[11px]">
                      {design.orientation}
                    </td>
                    <td className="px-4 py-3 font-mono">{design.slideCount}</td>
                    <td className="px-4 py-3">{design.departmentId}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                          design.status === 'draft'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {design.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                      {new Date(design.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/content/editor/${design.id}`)}
                          className="px-2 py-1 text-xs font-semibold rounded bg-teal-50 text-teal-800 hover:bg-teal-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreview(design.id)}
                          className="p-1 hover:text-slate-800"
                          title="Preview"
                        >
                          <Play className="w-3.5 h-3.5 text-teal-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(design.id, design.title)}
                          className="p-1 hover:text-slate-800"
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(design.id, design.status)}
                          className="p-1 hover:text-rose-600"
                          title={design.status === 'archived' ? 'Restore' : 'Archive'}
                        >
                          {design.status === 'archived' ? (
                            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          ) : (
                            <Archive className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview Simulation Modal */}
      {previewDesign && (
        <DesignPreviewModal
          isOpen={!!previewDesign}
          onClose={() => setPreviewDesign(null)}
          document={previewDesign.document}
        />
      )}
    </div>
  );
};
