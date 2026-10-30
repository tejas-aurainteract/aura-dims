/**
 * Aura DIMS - Bulk Digital Display Registration (CSV Import)
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Strictly use "digital display" in all user-facing copy.
 *
 * Features:
 * - Download CSV template with reference schema
 * - Client file size & row count validation (max 2MB, max 50 rows)
 * - Server preflight validation preview with row-level error reporting
 * - Mode selection: Planned Installations (Rollout Inventory) vs Operational Fleet (Pending Enrollment)
 * - Per-row execution confirmation report
 */

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Layers,
  Tv,
  ArrowRight,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  BulkImportPreflightResponse,
  BulkImportExecuteResponse,
} from '@aura-dims/display-schema';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

const CSV_TEMPLATE = `installationRef,name,siteIdentifier,locationDescription,departmentIdentifier,orientation,resolution,groupIdentifiers,installationWave,installationOwner,notes
BLR-HQ-L01-D01,Executive Boardroom Display,Main Campus,Level 1 Boardroom East,Engineering,landscape,1920x1080,lobby-tier1,1,facilities@aurainteract.com,HDMI 2.1 cable recessed
BLR-HQ-L02-D02,Cafeteria Portrait Kiosk,Main Campus,Level 2 Dining Atrium,Marketing,portrait,1080x1920,cafeteria-notices,2,ops@aurainteract.com,Vesa 400x400 bracket
`;

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preflightLoading, setPreflightLoading] = useState<boolean>(false);
  const [preflightData, setPreflightData] = useState<BulkImportPreflightResponse | null>(null);
  const [importMode, setImportMode] = useState<'planned' | 'operational'>('planned');
  const [executeLoading, setExecuteLoading] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<BulkImportExecuteResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aura-dims-digital-displays-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (selectedFile: File) => {
    setErrorMessage(null);
    setPreflightData(null);
    setExecutionResult(null);

    if (!selectedFile.name.endsWith('.csv')) {
      setErrorMessage('Please select a valid .csv file.');
      return;
    }

    if (selectedFile.size > 2 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 2MB limit. Please upload a smaller file.');
      return;
    }

    try {
      const text = await selectedFile.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        setErrorMessage('The uploaded CSV file contains no data rows.');
        return;
      }
      if (lines.length - 1 > 50) {
        setErrorMessage(`The CSV contains ${lines.length - 1} rows. Maximum allowed per batch is 50 digital displays.`);
        return;
      }

      // Automatically run preflight validation
      setPreflightLoading(true);
      try {
        const response = await api.preflightBulkDisplayImport({ csvText: text });
        setPreflightData(response);
      } catch (err: any) {
        setErrorMessage(getApiErrorMessage(err, 'Failed to validate digital display metadata.'));
      } finally {
        setPreflightLoading(false);
      }
    } catch {
      setErrorMessage('Failed to read the selected file.');
    }
  };

  const handleExecuteImport = async () => {
    if (!preflightData) return;

    const validRowsToImport = preflightData.rows
      .filter((r) => r.valid && r.parsed)
      .map((r) => ({
        installationRef: r.parsed!.installationRef,
        name: r.parsed!.name,
        siteId: r.parsed!.siteId,
        departmentId: r.parsed!.departmentId,
        locationDescription: r.parsed!.locationDescription,
        orientation: r.parsed!.orientation,
        configuredResolution: r.parsed!.configuredResolution,
        groupIds: r.parsed!.groupIds,
        installationOwner: r.parsed!.installationOwner,
        installationWave: r.parsed!.installationWave,
        notes: r.parsed!.notes,
      }));

    if (validRowsToImport.length === 0) {
      setErrorMessage('No valid digital display rows to import.');
      return;
    }

    setExecuteLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.executeBulkDisplayImport({
        rows: validRowsToImport,
        registerAsOperational: importMode === 'operational',
      });
      setExecutionResult(res);
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to execute bulk digital display import.'));
    } finally {
      setExecuteLoading(false);
    }
  };

  const handleReset = () => {
    setPreflightData(null);
    setExecutionResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/10 rounded-lg text-teal-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Bulk Digital Display Registration</h2>
              <p className="text-xs text-slate-400">
                Import digital display records from CSV into Rollout Inventory or Active Fleet.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-200">
          {errorMessage && (
            <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Execution Result View */}
          {executionResult ? (
            <div className="space-y-6 py-4">
              <div className="p-5 bg-emerald-950/30 border border-emerald-800/50 rounded-2xl text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-base font-bold text-white">Bulk Import Execution Finished</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  {executionResult.successCount} digital displays registered as{' '}
                  <span className="font-semibold text-emerald-300">
                    {importMode === 'planned' ? 'Planned Installations' : 'Operational Digital Displays'}
                  </span>
                  .
                  {executionResult.failureCount > 0 && ` ${executionResult.failureCount} rows failed.`}
                </p>
              </div>

              {/* Row-by-row Outcome */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  Execution Report
                </div>
                <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                  {executionResult.results.map((row, idx) => (
                    <div key={idx} className="px-4 py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        {row.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <div>
                          <span className="font-medium text-white">{row.installationRef}</span>
                          <span className="text-slate-400 ml-2">{row.name}</span>
                          {row.displayId && (
                            <span className="text-slate-500 ml-2 text-[11px]">Display ID: {row.displayId}</span>
                          )}
                          {row.plannedInstallationId && (
                            <span className="text-slate-500 ml-2 text-[11px]">Plan ID: {row.plannedInstallationId}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        {row.success ? (
                          <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Success
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {row.error || 'Failed'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Upload or Download Template */}
              {!preflightData && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Need the CSV Template?</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Download the structured format with mandatory headers and example digital display rows.
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors shrink-0"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      Download Template CSV
                    </button>
                  </div>

                  {/* Dropzone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-teal-500/70 bg-slate-950/40 hover:bg-slate-900/40 rounded-2xl p-8 text-center cursor-pointer transition-colors"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const sel = e.target.files?.[0];
                        if (sel) handleFileChange(sel);
                      }}
                    />
                    <div className="w-12 h-12 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center mx-auto mb-3">
                      <Upload className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">Select digital displays CSV to upload</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Drag and drop your prepared CSV file here, or click to browse. Max 2MB, up to 50 rows per batch.
                    </p>
                  </div>
                </div>
              )}

              {/* Preflight Loading */}
              {preflightLoading && (
                <div className="py-12 text-center">
                  <div className="inline-block animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full mb-3" />
                  <p className="text-sm text-slate-300">Validating digital display metadata and references...</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Verifying sites, departments, resolutions, and checking duplicate installation refs.
                  </p>
                </div>
              )}

              {/* Step 2: Preflight Review & Mode Selection */}
              {preflightData && (
                <div className="space-y-6">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Total Rows</span>
                      <span className="text-xl font-bold text-white mt-1 block">{preflightData.totalRows}</span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                      <span className="text-[11px] text-emerald-400 uppercase tracking-wider block">Valid Rows</span>
                      <span className="text-xl font-bold text-emerald-400 mt-1 block">{preflightData.validRowsCount}</span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                      <span className="text-[11px] text-rose-400 uppercase tracking-wider block">Invalid Rows</span>
                      <span className="text-xl font-bold text-rose-400 mt-1 block">{preflightData.invalidRowsCount}</span>
                    </div>
                  </div>

                  {/* Destination Mode Radio */}
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Target Destination
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          importMode === 'planned'
                            ? 'bg-teal-500/10 border-teal-500/50 text-teal-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          value="planned"
                          checked={importMode === 'planned'}
                          onChange={() => setImportMode('planned')}
                          className="mt-1 text-teal-600 focus:ring-teal-500"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-white text-xs">
                            <Layers className="w-3.5 h-3.5 text-teal-400" />
                            Rollout Inventory (Planned)
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                            Recommended. Retains planned digital displays in staging waves without inflating live operational fleet metrics.
                          </p>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          importMode === 'operational'
                            ? 'bg-teal-500/10 border-teal-500/50 text-teal-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          value="operational"
                          checked={importMode === 'operational'}
                          onChange={() => setImportMode('operational')}
                          className="mt-1 text-teal-600 focus:ring-teal-500"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-white text-xs">
                            <Tv className="w-3.5 h-3.5 text-teal-400" />
                            Active Fleet (Pending Enrollment)
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                            Registers digital display records immediately. Generates pairing requirements on the operational fleet board.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Preflight Row Preview Table */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <div className="bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex justify-between items-center">
                      <span>Row Validation Preview</span>
                      <span className="text-[11px] text-slate-500 lowercase">
                        {preflightData.rows.length} records parsed
                      </span>
                    </div>
                    <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
                      {preflightData.rows.map((r) => (
                        <div key={r.rowIndex} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {r.valid ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                              )}
                              <span className="font-semibold text-white">
                                {r.parsed?.name || `Row #${r.rowIndex}`}
                              </span>
                              <span className="text-slate-500">[{r.raw?.installationRef || 'No Ref'}]</span>
                              {r.parsed && (
                                <span className="text-slate-400 text-[11px]">
                                  • {r.parsed.orientation} ({r.parsed.configuredResolution.width}×{r.parsed.configuredResolution.height})
                                  • Wave {r.parsed.installationWave}
                                </span>
                              )}
                            </div>
                            {r.errors.length > 0 && (
                              <div className="text-[11px] text-rose-400 pl-6 space-y-0.5">
                                {r.errors.map((err, i) => (
                                  <div key={i}>• {err}</div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            {r.valid ? (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                Ready
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                                Invalid
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                    >
                      Choose Different File
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-slate-400 hover:text-white text-xs font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleExecuteImport}
                        disabled={preflightData.validRowsCount === 0 || executeLoading}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs shadow-sm transition-colors"
                      >
                        {executeLoading ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Importing Digital Displays...
                          </>
                        ) : (
                          <>
                            Import {preflightData.validRowsCount} Digital Displays
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
