/**
 * Aura DIMS - Projects Workspace & Management
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Enterprise projects catalog supporting departmental asset visibility,
 * role-aware project scoping, and collaborative signage authoring.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Search,
  Filter,
  Users2,
  FileImage,
  Building2,
  AlertCircle,
  Loader2,
  X,
  Archive,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, getApiErrorMessage } from '@/lib/api';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  ALLOWED_PROJECT_CREATOR_ROLES,
  type ProjectRecord,
  type Department,
} from '@aura-dims/display-schema';

export const ProjectsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Array<ProjectRecord & { memberCount?: number; assetCount?: number }>>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');

  // Modal State
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const isAdmin = userProfile?.role === 'admin';
  const canCreateProject = userProfile ? ALLOWED_PROJECT_CREATOR_ROLES.includes(userProfile.role) : false;

  // Load active departments
  useEffect(() => {
    async function loadDepartments() {
      try {
        const q = query(collection(db, 'departments'), orderBy('name', 'asc'));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Department));
        setDepartments(list);
        if (list.length > 0 && !newDepartmentId) {
          const defaultDept = userProfile?.departmentId || list[0]?.id || '';
          setNewDepartmentId(defaultDept);
        }
      } catch (err) {
        console.warn('Failed to load departments:', err);
      }
    }
    loadDepartments();
  }, [userProfile?.departmentId, newDepartmentId]);

  const departmentMap = useMemo(() => {
    const map = new Map<string, Department>();
    departments.forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  // Fetch projects list
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const deptToQuery = isAdmin
        ? selectedDeptId === 'all'
          ? undefined
          : selectedDeptId
        : (userProfile?.departmentId ?? undefined);

      const res = await api.listProjects({
        departmentId: deptToQuery,
        status: statusFilter,
      });
      setProjects(res.projects || []);
    } catch (err: unknown) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to fetch projects'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedDeptId, userProfile?.departmentId, statusFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesDesc = (p.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [projects, searchQuery]);

  const handleOpenCreateModal = () => {
    setNewName('');
    setNewDescription('');
    setNewDepartmentId(userProfile?.departmentId || departments[0]?.id || '');
    setModalError(null);
    setIsNewProjectOpen(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setModalError('Project name is required.');
      return;
    }
    const deptId = isAdmin ? newDepartmentId : userProfile?.departmentId;
    if (!deptId) {
      setModalError('Department is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError(null);
      await api.createProject({
        name: newName.trim(),
        description: newDescription.trim(),
        departmentId: deptId,
      });
      setIsNewProjectOpen(false);
      fetchProjects();
    } catch (err: unknown) {
      setModalError(getApiErrorMessage(err, 'Failed to create project'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Projects</h1>
          <p className="text-xs text-slate-500 mt-1">
            Departmental project workspaces for digital signage media, designs, and broadcast schedules.
          </p>
        </div>
        {canCreateProject && (
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 active:bg-teal-800 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects by name..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Department Filter (Admin only) */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 py-2 px-3 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs rounded-lg border border-slate-200 py-2 px-3 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700"
            >
              <option value="active">Active Projects</option>
              <option value="archived">Archived Projects</option>
              <option value="all">All Statuses</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="rounded-xl bg-red-50 p-4 border border-red-200 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-700 font-medium leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-xs font-medium">Loading project workspaces...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        /* Empty State */
        <div className="py-20 px-4 bg-white rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
            <FolderKanban className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No projects found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchQuery
              ? 'No projects match your search criteria. Try a different query or clear filters.'
              : canCreateProject
              ? 'Get started by creating your first project workspace for this department.'
              : 'You do not belong to any active project workspaces currently.'}
          </p>
          {canCreateProject && !searchQuery && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors shadow-xs"
            >
              <Plus className="h-4 w-4" />
              Create Project
            </button>
          )}
        </div>
      ) : (
        /* Projects Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((p) => {
            const isGeneral = p.isGeneral || p.id.startsWith('proj_general_');
            const dept = departmentMap.get(p.departmentId);
            const isArchived = p.status === 'archived';

            return (
              <div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="group relative bg-white rounded-2xl border border-slate-200 p-5 hover:border-teal-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Card Badges */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isGeneral ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                          General
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          Project
                        </span>
                      )}
                      {isArchived ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Archive className="h-3 w-3" />
                          Archived
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </div>
                    {dept && (
                      <span className="text-[11px] font-medium text-slate-400 truncate max-w-[140px]" title={dept.name}>
                        {dept.name}
                      </span>
                    )}
                  </div>

                  {/* Project Title & Description */}
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-600 transition-colors">
                    {p.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                    {p.description || 'No description provided.'}
                  </p>
                </div>

                {/* Card Footer: Metrics */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600" title="Project Members">
                      <Users2 className="h-3.5 w-3.5 text-slate-400" />
                      {p.memberCount ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600" title="Media Assets">
                      <FileImage className="h-3.5 w-3.5 text-slate-400" />
                      {p.assetCount ?? 0}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-teal-600 group-hover:translate-x-0.5 transition-transform">
                    Open Workspace &rarr;
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Project Modal */}
      {isNewProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-base font-bold text-slate-900">Create New Project</h2>
                <p className="text-xs text-slate-500">Workspace for digital signage media and schedules</p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewProjectOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              {modalError && (
                <div className="rounded-xl bg-red-50 p-3.5 border border-red-200 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-700 font-medium">{modalError}</div>
                </div>
              )}

              {/* Department selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Department</label>
                {isAdmin ? (
                  <select
                    value={newDepartmentId}
                    onChange={(e) => setNewDepartmentId(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={departmentMap.get(userProfile?.departmentId || '')?.name || userProfile?.departmentId || ''}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-slate-50 text-slate-500"
                  />
                )}
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Q4 Promotions, Lobby Welcome Loop"
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Description (optional)</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Purpose of this workspace..."
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsNewProjectOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 active:bg-teal-800 transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Project'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
