/**
 * Aura DIMS - Create / Edit Signage Playlist Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Enforces single orientation per playlist, calculates cumulative duration,
 * and allows reordering of visual designs for digital displays.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Clock,
  Monitor,
  Smartphone,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type {
  PlaylistRecord,
  PlaylistItem,
  DisplayOrientation,
  DesignRecord,
} from '@aura-dims/display-schema';

interface CreatePlaylistModalProps {
  playlist?: PlaylistRecord | null;
  departmentId: string;
  onClose: () => void;
  onSaved: () => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  playlist,
  departmentId,
  onClose,
  onSaved,
}) => {
  const { userProfile } = useAuth();
  const isEditing = !!playlist;

  const [title, setTitle] = useState(playlist?.title || '');
  const [description, setDescription] = useState(playlist?.description || '');
  const [orientation, setOrientation] = useState<DisplayOrientation>(
    playlist?.orientation || 'landscape'
  );
  const [items, setItems] = useState<PlaylistItem[]>(playlist?.items || []);

  const [availableDesigns, setAvailableDesigns] = useState<DesignRecord[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch designs matching the chosen orientation
  useEffect(() => {
    const fetchDesigns = async () => {
      setLoadingDesigns(true);
      try {
        const res = await api.listDesigns({
          departmentId: userProfile?.role === 'admin' ? undefined : departmentId,
          orientation,
        });
        setAvailableDesigns(res.designs);
        if (res.designs.length > 0 && res.designs[0]) {
          setSelectedDesignId(res.designs[0].id);
        } else {
          setSelectedDesignId('');
        }
      } catch (err: any) {
        console.error('Failed to load designs for playlist:', err);
      } finally {
        setLoadingDesigns(false);
      }
    };

    fetchDesigns();
  }, [orientation, departmentId, userProfile?.role]);

  const handleAddDesign = () => {
    if (!selectedDesignId) return;
    const design = availableDesigns.find((d) => d.id === selectedDesignId);
    if (!design) return;

    if (design.orientation !== orientation) {
      setError(
        `This playlist is formatted for ${orientation} digital displays. To broadcast ${design.orientation} designs, please create a separate playlist with matching orientation.`
      );
      return;
    }

    const newItem: PlaylistItem = {
      id: crypto.randomUUID(),
      designId: design.id,
      title: design.title,
      orientation: design.orientation,
      slideCount: design.slideCount || 1,
      durationSeconds: (design as any).totalDurationSeconds || (design.slideCount || 1) * 10,
      order: items.length + 1,
    };

    setItems([...items, newItem]);
    setError(null);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    const temp = newItems[index - 1]!;
    newItems[index - 1] = newItems[index]!;
    newItems[index] = temp;
    // Re-assign order numbers
    newItems.forEach((it, idx) => (it.order = idx + 1));
    setItems(newItems);
  };

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    const temp = newItems[index + 1]!;
    newItems[index + 1] = newItems[index]!;
    newItems[index] = temp;
    newItems.forEach((it, idx) => (it.order = idx + 1));
    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, idx) => idx !== index);
    newItems.forEach((it, idx) => (it.order = idx + 1));
    setItems(newItems);
  };

  const totalDuration = items.reduce((acc, it) => acc + (it.durationSeconds || 10), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a playlist title.');
      return;
    }
    if (items.length === 0) {
      setError('A playlist must contain at least one visual design.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditing) {
        await api.updatePlaylist({
          playlistId: playlist.id,
          title: title.trim(),
          description: description.trim(),
          items,
          revision: playlist.revision,
        });
      } else {
        await api.createPlaylist({
          title: title.trim(),
          description: description.trim(),
          departmentId,
          orientation,
          items,
        });
      }
      onSaved();
    } catch (err: any) {
      console.error('Failed to save playlist:', err);
      setError(err?.message || 'Failed to save playlist. Concurrency conflict or validation error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing ? 'Edit Playlist' : 'Create Signage Playlist'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sequence visual layouts into an ordered broadcast for digital displays
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title and Orientation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Playlist Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Lobby Morning Broadcast"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Digital Display Orientation <span className="text-rose-500">*</span>
              </label>
              {isEditing ? (
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 font-medium">
                  {orientation === 'landscape' ? 'Landscape (1920×1080)' : 'Portrait (1080×1920)'}
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Locked to preserve display compatibility
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOrientation('landscape');
                      setItems([]); // Clear items on orientation change
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${
                      orientation === 'landscape'
                        ? 'border-teal-600 bg-teal-50/50 text-teal-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Monitor className="h-4 w-4" />
                    <span>Landscape</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrientation('portrait');
                      setItems([]);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${
                      orientation === 'portrait'
                        ? 'border-teal-600 bg-teal-50/50 text-teal-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Smartphone className="h-4 w-4" />
                    <span>Portrait</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context or broadcast instructions for scheduling operators..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Add Design Selector */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Add Visual Design ({orientation === 'landscape' ? 'Landscape' : 'Portrait'})
              </label>
              <span className="text-[11px] text-slate-500">
                Only matching {orientation} layouts can be added
              </span>
            </div>

            <div className="flex gap-2">
              <select
                value={selectedDesignId}
                onChange={(e) => setSelectedDesignId(e.target.value)}
                disabled={loadingDesigns || availableDesigns.length === 0}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              >
                {loadingDesigns ? (
                  <option>Loading designs...</option>
                ) : availableDesigns.length === 0 ? (
                  <option>No matching {orientation} designs found</option>
                ) : (
                  availableDesigns.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.slideCount || 1} slides)
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                onClick={handleAddDesign}
                disabled={!selectedDesignId}
                className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Ordered Playlist Items List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">
                Playlist Sequence ({items.length} items)
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                <Clock className="h-3 w-3" />
                <span>Total Duration: {totalDuration}s</span>
              </span>
            </div>

            {items.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                No designs added yet. Select a design above and click "Add".
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {items.map((it, idx) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{it.title}</p>
                        <p className="text-[11px] text-slate-400">
                          {it.slideCount} slides • {it.durationSeconds}s playback dwell
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        title="Move up"
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(idx)}
                        disabled={idx === items.length - 1}
                        title="Move down"
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        title="Remove from playlist"
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Playlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
