/**
 * Aura DIMS - Settings & Department Management
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Provides system-wide localization settings (Timezone Asia/Kolkata, languages),
 * and Administrator Department Management.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clock,
  Languages,
  Building2,
  Plus,
  Edit2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Power,
  Globe,
  Sliders,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { api } from '@/lib/api';
import type { Department, DepartmentStatus } from '@aura-dims/display-schema';

export const SettingsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'system';

  // Department State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState<boolean>(true);
  const [deptError, setDeptError] = useState<string | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // Form State
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Fetch departments when Admin
  useEffect(() => {
    if (!isAdmin) return;

    setLoadingDepts(true);
    const q = query(collection(db, 'departments'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Department[];
        setDepartments(list);
        setLoadingDepts(false);
      },
      (err) => {
        console.error('Error fetching departments:', err);
        setDeptError('Failed to load departments from Firestore.');
        setLoadingDepts(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setActionSuccess(null);

    if (!deptName.trim() || !deptCode.trim()) {
      setFormError('Please enter both department name and code.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.createDepartment({
        name: deptName.trim(),
        code: deptCode.trim().toUpperCase(),
      });
      setIsCreateModalOpen(false);
      setDeptName('');
      setDeptCode('');
      setActionSuccess('Department created successfully.');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create department.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept) return;
    setFormError(null);
    setActionSuccess(null);

    try {
      setIsSubmitting(true);
      await api.updateDepartment({
        id: editingDept.id,
        name: deptName.trim(),
        code: deptCode.trim().toUpperCase(),
      });
      setIsEditModalOpen(false);
      setEditingDept(null);
      setDeptName('');
      setDeptCode('');
      setActionSuccess('Department updated successfully.');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update department.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleDepartmentStatus = async (dept: Department) => {
    const nextStatus: DepartmentStatus = dept.status === 'active' ? 'inactive' : 'active';
    const confirmMessage =
      nextStatus === 'inactive'
        ? `Are you sure you want to deactivate department "${dept.name}"? Users assigned to this department will not be able to manage its resources.`
        : `Activate department "${dept.name}"?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await api.setDepartmentStatus({
        id: dept.id,
        status: nextStatus,
      });
      setActionSuccess(
        `Department ${dept.name} is now ${nextStatus}. (${res.affectedUserCount} assigned users affected)`
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update department status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          System defaults, localization preferences, and organizational departments • Aurainteract Private Limited
        </p>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-xs text-teal-600 hover:text-teal-800 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'system' })}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors ${
              currentTab === 'system'
                ? 'border-teal-600 text-teal-800 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>System & Localization</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'departments' })}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors ${
                currentTab === 'departments'
                  ? 'border-teal-600 text-teal-800 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Departments ({departments.length})</span>
            </button>
          )}
        </nav>
      </div>

      {/* Tab 1: System & Localization */}
      {currentTab === 'system' && (
        <div className="space-y-6">
          {/* Scheduling Timezone Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                <Clock className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900">
                  Default Scheduling Timezone
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  All digital display players evaluate daypart schedules, publication manifests, and slide transitions autonomously against this regional hardware clock.
                </p>
                <div className="pt-2 flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg">
                    Asia/Kolkata
                  </span>
                  <span className="text-xs text-slate-500">
                    Indian Standard Time (IST, UTC+05:30)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Supported Content Languages Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100">
                <Languages className="h-5 w-5" />
              </div>
              <div className="space-y-3 flex-1">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Supported Content Languages
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Aura DIMS templates and the visual content studio support multilingual text rendering for Indian enterprise sites:
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="font-semibold text-slate-900">English (en)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Primary system & UI language</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="font-semibold text-slate-900">Gujarati (gu)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Regional: Ahmedabad, Vadodara, Surat, Rajkot</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="font-semibold text-slate-900">Hindi (hi)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">National: Multi-site factory & safety notices</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Organization Details */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Company & Platform Identity</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aurainteract Private Limited
                </p>
                <div className="mt-3 text-xs text-slate-600 space-y-1 font-mono text-[11px]">
                  <div>Product: Aura DIMS (Aura Digital Information Management System)</div>
                  <div>Application: Enterprise Digital Signage & Content Management</div>
                  <div>Platform Architecture: Firebase Web SDK + Cloud Functions v2 + Firestore RBAC</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Departments (Admin Only) */}
      {currentTab === 'departments' && isAdmin && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Department Directory</h2>
              <p className="text-xs text-slate-500">
                Departments define user boundaries and digital display ownership.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeptName('');
                setDeptCode('');
                setFormError(null);
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create Department</span>
            </button>
          </div>

          {deptError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{deptError}</span>
            </div>
          )}

          {loadingDepts ? (
            <div className="py-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              <span>Loading departments...</span>
            </div>
          ) : departments.length === 0 ? (
            <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center">
              <Building2 className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <div className="text-xs font-semibold text-slate-800">No departments configured</div>
              <p className="text-[11px] text-slate-400 mt-1">
                Create a department to assign Department Heads and categorize digital displays.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Department Name</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {departments.map((dept) => (
                    <tr key={dept.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {dept.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {dept.name}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            dept.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {dept.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDept(dept);
                            setDeptName(dept.name);
                            setDeptCode(dept.code);
                            setFormError(null);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Edit department name/code"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDepartmentStatus(dept)}
                          className={`p-1 rounded-lg transition-colors ${
                            dept.status === 'active'
                              ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                              : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                          }`}
                          title={dept.status === 'active' ? 'Deactivate department' : 'Activate department'}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Department Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Create New Department</h3>

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Department Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Human Resources"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Department Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HR"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 uppercase font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Department Modal */}
      {isEditModalOpen && editingDept && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Edit Department</h3>

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleUpdateDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Department Name</label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Department Code</label>
                <input
                  type="text"
                  required
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 uppercase font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
