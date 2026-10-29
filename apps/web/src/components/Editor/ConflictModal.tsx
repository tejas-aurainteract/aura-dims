/**
 * Aura DIMS - Concurrency Conflict Resolution Dialog
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Handles revision mismatch when another session or user has updated
 * the design document. Protects against silent overwrites.
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react';

export interface ConflictModalProps {
  isOpen: boolean;
  onReloadLatest: () => void;
  onSaveAsCopy: () => void;
  isProcessing: boolean;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  onReloadLatest,
  onSaveAsCopy,
  isProcessing,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900">
              Concurrent Edit Detected
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Another administrator or session has updated this design since you opened it. Overwriting it now would discard their revisions.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-2">
            <div className="font-semibold text-slate-800">Choose how to resolve:</div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px]">
              <li>
                <strong>Reload Latest Version:</strong> Discards your local unsaved changes and fetches the newest version from the server.
              </li>
              <li>
                <strong>Save as New Copy:</strong> Keeps your changes by creating a separate duplicate design, preserving both versions.
              </li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onReloadLatest}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Latest</span>
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onSaveAsCopy}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-xs"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Save as New Copy</span>
          </button>
        </div>
      </div>
    </div>
  );
};

