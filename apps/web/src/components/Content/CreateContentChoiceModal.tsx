/**
 * Aura DIMS - Create Content Choice Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Primary creation flow offering:
 * 1. "Start from template" (browse pre-built layouts)
 * 2. "Start from blank" (configure title, orientation, and department)
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  DisplayOrientation,
  Department,
} from '@aura-dims/display-schema';
import {
  X,
  FilePlus,
  LayoutTemplate,
  Monitor,
  Smartphone,
  Loader2,
  ArrowRight,
} from 'lucide-react';

export interface CreateContentChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplatesTab: () => void;
  departments?: Department[];
}

export const CreateContentChoiceModal: React.FC<CreateContentChoiceModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplatesTab,
  departments = [],
}) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [mode, setMode] = useState<'choice' | 'blank'>('choice');
  const [title, setTitle] = useState('');
  const [orientation, setOrientation] = useState<DisplayOrientation>('landscape');
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    userProfile?.departmentId || (departments[0]?.id ?? '')
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateBlank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.createDesign({
        title: title.trim(),
        orientation,
        departmentId: isAdmin ? selectedDeptId : undefined,
      });

      onClose();
      navigate(`/content/editor/${res.design.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create design');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            {mode === 'choice' ? 'Create Content' : 'Start from Blank Canvas'}
          </h2>
          <button
            type="button"
            onClick={() => {
              setMode('choice');
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Choice Step */}
        {mode === 'choice' ? (
          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-500">
              Select how you would like to author your digital display layout:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Option 1: Template */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSelectTemplatesTab();
                }}
                className="group p-5 border-2 border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 rounded-2xl text-left transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 group-hover:scale-110 transition-transform">
                    <LayoutTemplate className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-3 group-hover:text-teal-900">
                    Start from Template
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Choose from verified notice boards, safety alerts, and video announcement templates.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-teal-700">
                  <span>Browse gallery</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Option 2: Blank Canvas */}
              <button
                type="button"
                onClick={() => setMode('blank')}
                className="group p-5 border-2 border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 rounded-2xl text-left transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 group-hover:scale-110 transition-transform">
                    <FilePlus className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-3 group-hover:text-teal-900">
                    Start from Blank
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Design from scratch with custom dimensions, typography, shapes, and media placements.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-teal-700">
                  <span>Configure canvas</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Blank Canvas Configuration Step */
          <form onSubmit={handleCreateBlank} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Design Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Lobby Welcoming Announcement"
                className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-hidden"
              />
            </div>

            {/* Orientation Choice */}
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Display Orientation
              </label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                    orientation === 'landscape'
                      ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/20 text-teal-900 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <Monitor className="w-6 h-6 text-teal-600" />
                  <div className="text-center">
                    <div className="text-xs">Landscape</div>
                    <div className="text-[10px] text-slate-400 font-mono">1920×1080 (16:9)</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                    orientation === 'portrait'
                      ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/20 text-teal-900 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <Smartphone className="w-6 h-6 text-teal-600" />
                  <div className="text-center">
                    <div className="text-xs">Portrait</div>
                    <div className="text-[10px] text-slate-400 font-mono">1080×1920 (9:16)</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Department Selection (Admin Only) */}
            {isAdmin && departments.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Target Department
                </label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
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

            {error && (
              <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
                {error}
              </div>
            )}

            <div className="pt-3 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMode('choice')}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Back to choices
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !title.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Open Visual Editor</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

