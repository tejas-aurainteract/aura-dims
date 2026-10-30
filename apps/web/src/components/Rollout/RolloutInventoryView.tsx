/**
 * Aura DIMS - Rollout Inventory & Planned Installations View
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Strictly use "digital display" in all user-facing copy.
 *
 * Distinct Boundary:
 * Planned installations are tracked here across expansion waves 0 to 4.
 * They are NEVER counted as registered, online, commissioned, or active fleet displays.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Tv,
  MapPin,
  Building,
  User,
  RefreshCw,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  PlannedInstallation,
  CommissioningStatus,
  DisplayOrientation,
} from '@aura-dims/display-schema';

interface RolloutInventoryViewProps {
  sites: Record<string, string>;
  departments: Record<string, string>;
  onConvertedToOperational?: () => void;
  onOpenBulkImport: () => void;
}

export const RolloutInventoryView: React.FC<RolloutInventoryViewProps> = ({
  sites,
  departments,
  onConvertedToOperational,
  onOpenBulkImport,
}) => {
  const [installations, setInstallations] = useState<PlannedInstallation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [waveFilter, setWaveFilter] = useState<'all' | number>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CommissioningStatus>('all');

  // Plan New Installation Modal state
  const [isPlanModalOpen, setIsPlanModalOpen] = useState<boolean>(false);
  const [formInstallationRef, setFormInstallationRef] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formSiteId, setFormSiteId] = useState<string>('');
  const [formDeptId, setFormDeptId] = useState<string>('');
  const [formLocation, setFormLocation] = useState<string>('');
  const [formOrientation, setFormOrientation] = useState<DisplayOrientation>('landscape');
  const [formWave, setFormWave] = useState<number>(1);
  const [formOwner, setFormOwner] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Convert state
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const fetchPlanned = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPlannedInstallations({
        wave: waveFilter === 'all' ? undefined : waveFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setInstallations(res.installations || []);
    } catch (err: any) {
      console.error('[Aura DIMS] Failed to fetch planned installations:', err);
      setError(getApiErrorMessage(err, 'Failed to load rollout inventory records.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanned();
  }, [waveFilter, statusFilter]);

  const filteredInstallations = useMemo(() => {
    return installations.filter((item) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesRef = item.installationRef.toLowerCase().includes(q);
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesLoc = item.locationDescription.toLowerCase().includes(q);
        const matchesOwner = (item.installationOwner || '').toLowerCase().includes(q);
        if (!matchesRef && !matchesName && !matchesLoc && !matchesOwner) return false;
      }
      return true;
    });
  }, [installations, searchTerm]);

  // KPIs strictly for Planned Rollout
  const rolloutKpis = useMemo(() => {
    const total = installations.length;
    const wave0 = installations.filter((i) => i.installationWave === 0).length;
    const wave1 = installations.filter((i) => i.installationWave === 1).length;
    const wave2 = installations.filter((i) => i.installationWave === 2).length;
    const wave3 = installations.filter((i) => i.installationWave === 3).length;
    const wave4 = installations.filter((i) => i.installationWave === 4).length;
    const blocked = installations.filter((i) => i.commissioningStatus === 'blocked').length;
    const inProgress = installations.filter((i) => i.commissioningStatus === 'in_progress').length;
    const commissioned = installations.filter((i) => i.commissioningStatus === 'commissioned').length;

    return { total, wave0, wave1, wave2, wave3, wave4, blocked, inProgress, commissioned };
  }, [installations]);

  const handlePlanInstallation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInstallationRef.trim() || !formName.trim() || !formSiteId || !formDeptId) {
      setFormError('Please fill all mandatory fields (Ref, Name, Site, Department).');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      await api.createPlannedInstallation({
        installationRef: formInstallationRef.trim(),
        name: formName.trim(),
        siteId: formSiteId,
        departmentId: formDeptId,
        locationDescription: formLocation.trim(),
        orientation: formOrientation,
        configuredResolution:
          formOrientation === 'landscape'
            ? { width: 1920, height: 1080 }
            : { width: 1080, height: 1920 },
        installationWave: formWave,
        installationOwner: formOwner.trim() || 'Unassigned',
        notes: formNotes.trim() || undefined,
      });

      setIsPlanModalOpen(false);
      setFormInstallationRef('');
      setFormName('');
      setFormLocation('');
      setFormNotes('');
      setFormOwner('');
      fetchPlanned();
    } catch (err: any) {
      setFormError(getApiErrorMessage(err, 'Failed to create planned digital display record.'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleConvertToOperational = async (plannedId: string, name: string) => {
    if (!window.confirm(`Convert planned record "${name}" to an operational digital display awaiting physical enrollment?`)) {
      return;
    }

    setConvertingId(plannedId);
    try {
      await api.convertPlannedToRegistered({ plannedInstallationId: plannedId });
      fetchPlanned();
      if (onConvertedToOperational) {
        onConvertedToOperational();
      }
    } catch (err: any) {
      alert(getApiErrorMessage(err, 'Could not convert planned installation.'));
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-slate-900 to-teal-950/40 border border-slate-800 rounded-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-400" />
            <h2 className="text-base font-bold text-white">Controlled Expansion Inventory (~20 Displays Target)</h2>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Staging and rollout governance for hardware before activation. Tracks mounting, cabling, waves, and commissioning readiness.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenBulkImport}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-teal-400" />
            Bulk CSV Import
          </button>
          <button
            onClick={() => {
              setIsPlanModalOpen(true);
              setFormError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Plan Installation
          </button>
        </div>
      </div>

      {/* Wave Breakdown Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Total Planned</span>
          <span className="text-xl font-bold text-white mt-1 block">{rolloutKpis.total}</span>
          <span className="text-[10px] text-slate-500">Target ~20 units</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-medium text-teal-400 uppercase tracking-wider block">Wave 0 (Pilot)</span>
          <span className="text-xl font-bold text-teal-400 mt-1 block">{rolloutKpis.wave0}</span>
          <span className="text-[10px] text-slate-500">2 displays verified</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-medium text-sky-400 uppercase tracking-wider block">Wave 1</span>
          <span className="text-xl font-bold text-sky-400 mt-1 block">{rolloutKpis.wave1}</span>
          <span className="text-[10px] text-slate-500">5 displays</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-medium text-indigo-400 uppercase tracking-wider block">Wave 2</span>
          <span className="text-xl font-bold text-indigo-400 mt-1 block">{rolloutKpis.wave2}</span>
          <span className="text-[10px] text-slate-500">5 displays</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-medium text-purple-400 uppercase tracking-wider block">Wave 3</span>
          <span className="text-xl font-bold text-purple-400 mt-1 block">{rolloutKpis.wave3}</span>
          <span className="text-[10px] text-slate-500">4 displays</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-medium text-pink-400 uppercase tracking-wider block">Wave 4</span>
          <span className="text-xl font-bold text-pink-400 mt-1 block">{rolloutKpis.wave4}</span>
          <span className="text-[10px] text-slate-500">4 displays</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search planned installation ref, name, location, or owner..."
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Wave Filter */}
          <select
            value={waveFilter}
            onChange={(e) => setWaveFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Waves</option>
            <option value="0">Wave 0 (Pilot - 2 Displays)</option>
            <option value="1">Wave 1 (5 Displays)</option>
            <option value="2">Wave 2 (5 Displays)</option>
            <option value="3">Wave 3 (4 Displays)</option>
            <option value="4">Wave 4 (4 Displays)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Commissioning Statuses</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="commissioned">Commissioned</option>
            <option value="blocked">Blocked</option>
          </select>

          <button
            onClick={fetchPlanned}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            title="Refresh rollout list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Planned Installations Table */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full mb-3" />
          <p className="text-slate-400 text-xs">Loading rollout inventory...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-950/20 border border-rose-800/40 rounded-xl text-rose-300 text-xs text-center">
          {error}
        </div>
      ) : filteredInstallations.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">No planned installations recorded</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Plan an individual digital display installation or import bulk CSV metadata to populate rollout waves.
          </p>
        </div>
      ) : (
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60 divide-y divide-slate-800/80">
          {filteredInstallations.map((item) => (
            <div
              key={item.id}
              className="p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-900/40 transition-colors"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                    {item.installationRef}
                  </span>
                  <h3 className="text-sm font-bold text-white">{item.name}</h3>
                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-medium">
                    Wave {item.installationWave}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800/80 text-slate-400">
                    {item.orientation} ({item.configuredResolution.width}×{item.configuredResolution.height})
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    {sites[item.siteId] || item.siteId}
                    {item.locationDescription && ` • ${item.locationDescription}`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-slate-500" />
                    {departments[item.departmentId] || item.departmentId}
                  </span>
                  {item.installationOwner && (
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      {item.installationOwner}
                    </span>
                  )}
                </div>

                {item.notes && (
                  <p className="text-[11px] text-slate-500 italic">
                    Note: {item.notes}
                  </p>
                )}
              </div>

              {/* Status and Action */}
              <div className="flex items-center gap-3 shrink-0">
                <div>
                  {item.commissioningStatus === 'commissioned' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Commissioned
                    </span>
                  ) : item.commissioningStatus === 'in_progress' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      In Progress
                    </span>
                  ) : item.commissioningStatus === 'blocked' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Blocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      Planned
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleConvertToOperational(item.id, item.name)}
                  disabled={convertingId === item.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-medium transition-colors"
                  title="Promote to active fleet awaiting enrollment"
                >
                  <Tv className="w-3.5 h-3.5" />
                  {convertingId === item.id ? 'Promoting...' : 'Promote to Fleet'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plan New Installation Modal */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Plan Digital Display Installation</h3>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handlePlanInstallation} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Unique Installation Reference *
                </label>
                <input
                  type="text"
                  value={formInstallationRef}
                  onChange={(e) => setFormInstallationRef(e.target.value)}
                  placeholder="e.g. BLR-HQ-L03-D05"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Digital Display Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. 3rd Floor Finance Notice Board"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Site *</label>
                  <select
                    value={formSiteId}
                    onChange={(e) => setFormSiteId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                    required
                  >
                    <option value="">-- Select Site --</option>
                    {Object.entries(sites).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Department *</label>
                  <select
                    value={formDeptId}
                    onChange={(e) => setFormDeptId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                    required
                  >
                    <option value="">-- Select Department --</option>
                    {Object.entries(departments).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Orientation</label>
                  <select
                    value={formOrientation}
                    onChange={(e) => setFormOrientation(e.target.value as DisplayOrientation)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="landscape">Landscape (1920×1080)</option>
                    <option value="portrait">Portrait (1080×1920)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Expansion Wave</label>
                  <select
                    value={formWave}
                    onChange={(e) => setFormWave(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value={0}>Wave 0 (Pilot - 2 displays)</option>
                    <option value={1}>Wave 1 (5 displays)</option>
                    <option value={2}>Wave 2 (5 displays)</option>
                    <option value={3}>Wave 3 (4 displays)</option>
                    <option value={4}>Wave 4 (4 displays)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Location Description
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. Next to Coffee Machine, West Wing"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Installation Owner (Email or Name)
                </label>
                <input
                  type="text"
                  value={formOwner}
                  onChange={(e) => setFormOwner(e.target.value)}
                  placeholder="e.g. hardware-team@aurainteract.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Installation & Cabling Notes
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Ethernet drop required, VESA 200 mounting plate"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium shadow-sm transition-colors"
                >
                  {formSubmitting ? 'Saving...' : 'Save Planned Installation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
