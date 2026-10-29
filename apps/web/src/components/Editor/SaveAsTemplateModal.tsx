/**
 * Aura DIMS - Save Design As Template Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Allows saving a validated design document as a reusable template.
 */

import React, { useState } from 'react';
import {
  DesignDocument,
  TemplateCategory,
  TemplateScope,
} from '@aura-dims/display-schema';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutTemplate, X, Loader2, Check } from 'lucide-react';

export interface SaveAsTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DesignDocument;
  defaultTitle?: string;
}

export const SaveAsTemplateModal: React.FC<SaveAsTemplateModalProps> = ({
  isOpen,
  onClose,
  document,
  defaultTitle = '',
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [title, setTitle] = useState(defaultTitle ? `${defaultTitle} (Template)` : '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('notice');
  const [scope, setScope] = useState<TemplateScope>(isAdmin ? 'global' : 'department');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setLoading(true);
      setError(null);
      await api.createTemplate({
        title: title.trim(),
        description: description.trim(),
        category,
        scope,
        departmentId: scope === 'department' ? userProfile?.departmentId || undefined : undefined,
        document,
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Save as Reusable Template
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700">
              Template Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Operations Briefing"
              className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">
              Description
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief guidance on when to use this template..."
              className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-hidden capitalize"
              >
                <option value="notice">Notice</option>
                <option value="poster">Poster</option>
                <option value="announcement">Announcement</option>
                <option value="board">Notice Board</option>
              </select>
            </div>

            {isAdmin && (
              <div>
                <label className="text-xs font-semibold text-slate-700">Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as TemplateScope)}
                  className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-hidden capitalize"
                >
                  <option value="global">Global (All Departments)</option>
                  <option value="department">Department Only</option>
                </select>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl border border-emerald-200 flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Template saved successfully!</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-xs"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Template</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

