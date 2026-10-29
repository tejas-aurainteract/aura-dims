/**
 * Aura DIMS - Digital Display Playback Timeline Simulator
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Runs the deterministic schedule evaluator for a specific digital display
 * at any historical or future instant calibrated to Asia/Kolkata.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Monitor,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  DigitalDisplay,
  ScheduleEvaluationResult,
} from '@aura-dims/display-schema';

interface DisplayScheduleSimulatorModalProps {
  displays: DigitalDisplay[];
  onClose: () => void;
}

export const DisplayScheduleSimulatorModal: React.FC<DisplayScheduleSimulatorModalProps> = ({
  displays,
  onClose,
}) => {
  const [selectedDisplayId, setSelectedDisplayId] = useState(displays[0]?.id || '');
  const [simDate, setSimDate] = useState(new Date().toISOString().slice(0, 10));
  const [simTime, setSimTime] = useState('10:00');
  const [evaluation, setEvaluation] = useState<ScheduleEvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = async () => {
    if (!selectedDisplayId) return;
    setLoading(true);
    setError(null);
    try {
      const targetIso = `${simDate}T${simTime}:00+05:30`;
      const res = await api.evaluateSchedulePreview({
        displayId: selectedDisplayId,
        targetIsoString: targetIso,
      });
      setEvaluation(res.evaluation);
    } catch (err: any) {
      console.error('Simulation evaluation failed:', err);
      setError(err?.message || 'Failed to simulate schedule evaluation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDisplayId) {
      runSimulation();
    }
  }, [selectedDisplayId, simDate, simTime]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Digital Display Timeline Simulator
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulates deterministic schedule evaluation in Asia/Kolkata (UTC+05:30)
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

        {/* Form Controls */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Digital Display
            </label>
            <select
              value={selectedDisplayId}
              onChange={(e) => setSelectedDisplayId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.orientation} • {d.locationDescription})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Date (Asia/Kolkata)
              </label>
              <input
                type="date"
                value={simDate}
                onChange={(e) => setSimDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Time (HH:mm)
              </label>
              <input
                type="time"
                value={simTime}
                onChange={(e) => setSimTime(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Evaluation Result Output */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-900 block mb-2">
              Simulated Display Output at {simDate} {simTime} (Asia/Kolkata):
            </span>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Evaluating schedule rules and priorities...
              </div>
            ) : !evaluation ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No evaluation computed yet.
              </div>
            ) : evaluation.status === 'active' ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Scheduled Broadcast Active</span>
                  </span>
                  {evaluation.isAdminOverride && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800">
                      Emergency Override
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-800">
                  <p>
                    <strong>Winning Schedule:</strong> {evaluation.schedule.title}
                  </p>
                  <p className="text-slate-600 mt-0.5">
                    <strong>Active Playlist:</strong> {evaluation.schedule.playlistTitle}
                  </p>
                  <p className="text-slate-500 text-[11px] mt-1">
                    Priority level {evaluation.schedule.scheduleRule.priority} / 10 • Effective window:{' '}
                    {evaluation.schedule.scheduleRule.startTime}–{evaluation.schedule.scheduleRule.endTime}
                  </p>
                </div>
              </div>
            ) : evaluation.status === 'conflict' ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800">
                  <AlertCircle className="h-4 w-4" />
                  <span>Collision Block Detected</span>
                </span>
                <p className="text-xs text-rose-700">{evaluation.message}</p>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Monitor className="h-4 w-4 text-slate-500" />
                    <span>Corporate Fallback Content</span>
                  </span>
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-semibold">
                    Idle Period
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  No active scheduled broadcast at this instant. Digital display runs the bundled corporate neutral fallback slide ("Aura DIMS • Aurainteract Private Limited").
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
