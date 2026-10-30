/**
 * Aura DIMS - Playlists Hub View
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Ordered signage playlist manager containing frozen or draft visual design compositions.
 * Enforces single-orientation compatibility per playlist (Landscape or Portrait).
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ListMusic,
  Plus,
  Search,
  Eye,
  Clock,
  Archive,
  Layers,
  Monitor,
  Smartphone,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, getApiErrorMessage } from '@/lib/api';
import type { PlaylistRecord, DisplayOrientation } from '@aura-dims/display-schema';
import { CreatePlaylistModal } from './CreatePlaylistModal';
import { PlaylistPreviewModal } from './PlaylistPreviewModal';

interface PlaylistsViewProps {
  departmentId?: string;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({ departmentId }) => {
  const { userProfile } = useAuth();
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [orientationFilter, setOrientationFilter] = useState<'all' | DisplayOrientation>('all');
  const [showArchived, setShowArchived] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistRecord | null>(null);
  const [previewingPlaylist, setPreviewingPlaylist] = useState<PlaylistRecord | null>(null);

  const activeDepartmentId = departmentId || userProfile?.departmentId || '';

  const fetchPlaylists = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPlaylists({
        departmentId: userProfile?.role === 'admin' ? departmentId : activeDepartmentId,
        orientation: orientationFilter === 'all' ? undefined : orientationFilter,
        includeArchived: showArchived,
      });
      setPlaylists(res.playlists);
    } catch (err: any) {
      console.error('[Aura DIMS] Failed to fetch playlists:', err);
      setError(getApiErrorMessage(err, 'Failed to load playlists.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, [userProfile?.departmentId, departmentId, orientationFilter, showArchived]);

  const handleArchiveToggle = async (playlist: PlaylistRecord) => {
    try {
      await api.setPlaylistArchivedStatus({
        playlistId: playlist.id,
        isArchived: !playlist.isArchived,
      });
      fetchPlaylists();
    } catch (err: any) {
      alert(`Archive action failed: ${err.message}`);
    }
  };

  const filteredPlaylists = useMemo(() => {
    return playlists.filter((p) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        p.title.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
      return matchesSearch;
    });
  }, [playlists, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Action Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search playlists by name or description..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Orientation Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setOrientationFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                orientationFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Orientations
            </button>
            <button
              type="button"
              onClick={() => setOrientationFilter('landscape')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                orientationFilter === 'landscape'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>Landscape</span>
            </button>
            <button
              type="button"
              onClick={() => setOrientationFilter('portrait')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                orientationFilter === 'portrait'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Portrait</span>
            </button>
          </div>

          {/* Archived Toggle */}
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>Show Archived</span>
          </label>

          <button
            type="button"
            onClick={() => {
              setEditingPlaylist(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Create playlist</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-teal-600 mb-3" />
          <p className="text-xs text-slate-500">Loading playlists for digital displays...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchPlaylists}
            className="ml-auto underline font-medium hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      ) : filteredPlaylists.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3">
            <ListMusic className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No playlists found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            {searchQuery
              ? `No playlists match the filter "${searchQuery}".`
              : 'Create your first ordered playlist to sequence visual designs for your digital displays.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingPlaylist(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New playlist</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlaylists.map((p) => {
            const isLandscape = p.orientation === 'landscape';
            return (
              <div
                key={p.id}
                className={`bg-white border rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between ${
                  p.isArchived ? 'opacity-70 border-amber-200 bg-amber-50/20' : 'border-slate-200'
                }`}
              >
                <div>
                  {/* Orientation & Duration Header */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        isLandscape ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {isLandscape ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                      <span>{isLandscape ? 'Landscape (1920×1080)' : 'Portrait (1080×1920)'}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span>{p.totalDurationSeconds}s total</span>
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 truncate" title={p.title}>
                    {p.title}
                  </h3>
                  {p.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                  )}

                  {/* Items summary */}
                  <div className="mt-3 py-2 px-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-slate-400" />
                      <span>{p.items?.length || 0} designs</span>
                    </span>
                    <span className="text-[11px] text-slate-400">Rev #{p.revision || 1}</span>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    Updated {new Date(p.updatedAt).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewingPlaylist(p)}
                      title="Preview playlist playback simulation"
                      className="p-1.5 rounded-lg text-slate-600 hover:text-teal-600 hover:bg-slate-100 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlaylist(p);
                        setIsCreateModalOpen(true);
                      }}
                      title="Edit playlist items"
                      className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(p)}
                      title={p.isArchived ? 'Restore playlist' : 'Archive playlist'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        p.isArchived
                          ? 'text-amber-600 hover:bg-amber-100'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Playlist Modal */}
      {isCreateModalOpen && (
        <CreatePlaylistModal
          playlist={editingPlaylist}
          departmentId={activeDepartmentId}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingPlaylist(null);
          }}
          onSaved={() => {
            setIsCreateModalOpen(false);
            setEditingPlaylist(null);
            fetchPlaylists();
          }}
        />
      )}

      {/* Preview Simulation Modal */}
      {previewingPlaylist && (
        <PlaylistPreviewModal
          playlist={previewingPlaylist}
          onClose={() => setPreviewingPlaylist(null)}
        />
      )}
    </div>
  );
};
