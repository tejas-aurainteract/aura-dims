/**
 * Aura DIMS - Canvas Orientation Conversion Modal
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Explains and confirms orientation conversion between Landscape (1920x1080)
 * and Portrait (1080x1920). Ensures layout is not silently distorted.
 */

import React, { useState } from 'react';
import { DisplayOrientation } from '@aura-dims/display-schema';
import { api } from '@/lib/api';
import {
  Monitor,
  Smartphone,
  AlertTriangle,
  ArrowRight,
  X,
  Loader2,
} from 'lucide-react';

export interface OrientationConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  designId: string;
  expectedRevision: number;
  currentOrientation: DisplayOrientation;
  onConverted: (convertedDoc: any) => void;
}

export const OrientationConversionModal: React.FC<OrientationConversionModalProps> = ({
  isOpen,
  onClose,
  designId,
  expectedRevision,
  currentOrientation,
  onConverted,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetOrientation: DisplayOrientation =
    currentOrientation === 'landscape' ? 'portrait' : 'landscape';

  const handleConvert = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.convertDesignOrientation({
        designId,
        targetOrientation,
        expectedRevision,
      });
      onConverted(res.design);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to convert canvas orientation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Convert Canvas Orientation
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

        <div className="p-6 space-y-4">
          {/* Comparison diagram */}
          <div className="flex items-center justify-center gap-4 py-2">
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200 bg-slate-50">
              {currentOrientation === 'landscape' ? (
                <Monitor className="w-8 h-8 text-slate-700" />
              ) : (
                <Smartphone className="w-8 h-8 text-slate-700" />
              )}
              <span className="text-xs font-semibold capitalize text-slate-800">
                {currentOrientation}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {currentOrientation === 'landscape' ? '1920×1080' : '1080×1920'}
              </span>
            </div>

            <ArrowRight className="w-5 h-5 text-teal-600" />

            <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-teal-500 bg-teal-50/50">
              {targetOrientation === 'landscape' ? (
                <Monitor className="w-8 h-8 text-teal-700" />
              ) : (
                <Smartphone className="w-8 h-8 text-teal-700" />
              )}
              <span className="text-xs font-semibold capitalize text-teal-900">
                {targetOrientation}
              </span>
              <span className="text-[10px] text-teal-600 font-mono">
                {targetOrientation === 'landscape' ? '1920×1080' : '1080×1920'}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-600 space-y-2 bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 leading-relaxed">
            <p className="font-semibold text-amber-900">
              Explicit conversion preserves your content without stretching:
            </p>
            <ul className="list-disc list-inside space-y-1 text-amber-800 text-[11px]">
              <li>Canvas dimensions will change to {targetOrientation === 'landscape' ? '1920×1080' : '1080×1920'}.</li>
              <li>Elements will be proportionally scaled and clamped within the new boundaries.</li>
              <li>You can manually fine-tune text and positions after conversion.</li>
            </ul>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConvert}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-xs"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Converting...</span>
              </>
            ) : (
              <span>Convert to {targetOrientation}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
