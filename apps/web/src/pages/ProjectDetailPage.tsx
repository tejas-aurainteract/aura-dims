/**
 * Aura DIMS - Project Detail Workspace
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scoped project workspace coordinating:
 * 1. Project metadata, renaming, and schedule-guarded archiving
 * 2. Scoped media assets, visual designs, playlists, and broadcast schedules for digital displays
 * 3. Role-ceiling validated project membership management (lead, member, viewer)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  FolderKanban,
  Palette,
  ListMusic,
  Calendar,
  Users2,
  Building2,
  AlertCircle,
  Loader2,
  X,
  Archive,
  Pencil,
  Trash2,
  Info,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, getApiErrorMessage } from '@/lib/api';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import type {
  ProjectRecord,
  ProjectMember,
  ProjectMemberRole,
  UserProfile,
  Department,
} from '@aura-dims/display-schema';

import { MediaLibraryView } from '@/components/Media/MediaLibraryView';
import { DesignsView } from '@/components/Content/DesignsView';
import { PlaylistsView } from '@/components/Playlists/PlaylistsView';
import { SchedulesListView } from '@/components/Schedules/SchedulesListView';

type ActiveTab = 'assets' | 'designs' | 'playlists' | 'schedules' | 'members';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as ActiveTab) || 'assets';
  const { userProfile } = useAuth();

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [deptUsers, setDeptUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit Project Modal
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Archive Project Modal
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [blockingSchedules, setBlockingSchedules] = useState<string[]>([]);

  // Member Management Modals & Actions
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const [selectedProjectRole, setSelectedProjectRole] = useState<ProjectMemberRole>('member');
  const [memberActionLoading, setMemberActionLoading] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);

  const isAdmin = userProfile?.role === 'admin';
  const isDeptHead = userProfile?.role === 'department_head' && userProfile?.departmentId === project?.departmentId;
  const isGeneral = Boolean(project?.isGeneral || project?.id?.startsWith('proj_general_'));

  const myMembership = useMemo(() => {
    return members.find((m) => m.uid === userProfile?.uid);
  }, [members, userProfile?.uid]);

  const isProjectLead = isAdmin || isDeptHead || myMembership?.role === 'lead';
  const isContributor = isProjectLead || myMembership?.role === 'member';
  const isViewer = !isContributor;

  const canEdit = isContributor;
  const canPublish = isProjectLead;
  const isReadOnly = isViewer;

  // General projects are read-only for regular members; only Admin & HOD can manage General
  const canManageProject = (isAdmin || isDeptHead || isProjectLead) && (!isGeneral || isAdmin || isDeptHead);
  const canArchiveProject = (isAdmin || isDeptHead) && !isGeneral;

  const setTab = (tab: ActiveTab) => {
    setSearchParams({ tab });
  };

  // Load project details
  const fetchProjectData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const pDoc = await getDoc(doc(db, 'projects', projectId));
      if (!pDoc.exists()) {
        setErrorMessage('Project not found or you do not have permission to view it.');
        setLoading(false);
        return;
      }
      const data = { id: pDoc.id, ...pDoc.data() } as ProjectRecord;
      setProject(data);
      setEditName(data.name);
      setEditDescription(data.description || '');

      // Load Department Name
      if (data.departmentId) {
        try {
          const dDoc = await getDoc(doc(db, 'departments', data.departmentId));
          if (dDoc.exists()) {
            setDepartment({ id: dDoc.id, ...dDoc.data() } as Department);
          }
        } catch (e) {
          console.warn('[Aura DIMS] Could not fetch department details:', e);
        }
      }

      // Load Members
      try {
        const memRes = await api.listProjectMembers({ projectId });
        setMembers(memRes.members || []);
      } catch (e) {
        console.warn('[Aura DIMS] Could not fetch project members:', e);
      }
    } catch (err: any) {
      console.error('[Aura DIMS] Failed to load project:', err);
      setErrorMessage(getApiErrorMessage(err, 'Failed to load project details.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjectData();
  }, [fetchProjectData]);

  // Load users in department for "+ Add Member" modal
  const fetchDeptUsers = useCallback(async () => {
    if (!project?.departmentId) return;
    try {
      let q;
      if (isAdmin) {
        q = query(collection(db, 'users'));
      } else {
        q = query(collection(db, 'users'), where('departmentId', '==', project.departmentId));
      }
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as UserProfile))
        .filter((u) => u.status === 'active' && (isAdmin || u.departmentId === project.departmentId));
      setDeptUsers(list);
      if (list.length > 0 && !selectedUserUid) {
        const available = list.filter((u) => !members.some((m) => m.uid === u.uid));
        if (available.length > 0 && available[0]) {
          setSelectedUserUid(available[0].uid);
        }
      }
    } catch (err) {
      console.warn('[Aura DIMS] Could not fetch department users:', err);
    }
  }, [project?.departmentId, isAdmin, members, selectedUserUid]);

  useEffect(() => {
    if (isAddMemberOpen) {
      fetchDeptUsers();
    }
  }, [isAddMemberOpen, fetchDeptUsers]);

  // Update Project (Rename / Description)
  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const res = await api.updateProject({
        projectId: project.id,
        name: isGeneral ? undefined : editName.trim(),
        description: editDescription.trim(),
      });
      setProject(res.project);
      setIsEditOpen(false);
    } catch (err: any) {
      setUpdateError(getApiErrorMessage(err, 'Failed to update project.'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Archive Project
  const handleArchiveProject = async () => {
    if (!project) return;
    setIsArchiving(true);
    setArchiveError(null);
    setBlockingSchedules([]);
    try {
      await api.archiveProject({ projectId: project.id });
      setIsArchiveOpen(false);
      fetchProjectData();
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Failed to archive project.');
      setArchiveError(msg);

      // Check for blocking active schedules error formatted as:
      // "Cannot archive project while active broadcast schedules exist: [Schedule A, Schedule B]..."
      const match = msg.match(/active broadcast schedules exist:\s*\[(.*?)\]/i);
      if (match && match[1]) {
        const list = match[1].split(',').map((s) => s.trim()).filter(Boolean);
        setBlockingSchedules(list);
      }
    } finally {
      setIsArchiving(false);
    }
  };

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !selectedUserUid) return;
    setMemberActionLoading(true);
    setMemberActionError(null);
    try {
      await api.addProjectMember({
        projectId: project.id,
        targetUid: selectedUserUid,
        role: selectedProjectRole,
      });
      setIsAddMemberOpen(false);
      setSelectedUserUid('');
      // Refresh members
      const memRes = await api.listProjectMembers({ projectId: project.id });
      setMembers(memRes.members || []);
    } catch (err: any) {
      setMemberActionError(getApiErrorMessage(err, 'Failed to add project member.'));
    } finally {
      setMemberActionLoading(false);
    }
  };

  // Update Member Role
  const handleUpdateMemberRole = async (targetUid: string, role: ProjectMemberRole) => {
    if (!project) return;
    setMemberActionLoading(true);
    setMemberActionError(null);
    try {
      await api.updateProjectMemberRole({
        projectId: project.id,
        targetUid,
        role,
      });
      const memRes = await api.listProjectMembers({ projectId: project.id });
      setMembers(memRes.members || []);
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Failed to update member role.');
      alert(msg);
    } finally {
      setMemberActionLoading(false);
    }
  };

  // Remove Member
  const handleRemoveMember = async (targetUid: string, displayName?: string) => {
    if (!project) return;
    const confirmRemove = window.confirm(
      `Remove ${displayName || 'this member'} from ${project.name}?`
    );
    if (!confirmRemove) return;

    setMemberActionLoading(true);
    setMemberActionError(null);
    try {
      await api.removeProjectMember({
        projectId: project.id,
        targetUid,
      });
      const memRes = await api.listProjectMembers({ projectId: project.id });
      setMembers(memRes.members || []);
    } catch (err: any) {
      alert(getApiErrorMessage(err, 'Failed to remove member.'));
    } finally {
      setMemberActionLoading(false);
    }
  };

  // Eligible users to add (active users in department not yet in project)
  const availableUsersToAdd = useMemo(() => {
    const existingUids = new Set(members.map((m) => m.uid));
    return deptUsers.filter((u) => !existingUids.has(u.uid));
  }, [deptUsers, members]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin mb-3 text-teal-600" />
        <p className="text-xs font-medium">Loading project workspace...</p>
      </div>
    );
  }

  if (errorMessage || !project) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white p-8 rounded-2xl border border-slate-200 text-center shadow-xs">
        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">Project Workspace Unavailable</h2>
        <p className="text-xs text-slate-500 mb-6">{errorMessage || 'Project could not be found.'}</p>
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return to Projects</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation & Header */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Projects</span>
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{project.name}</h1>
              {isGeneral && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200/60">
                  General Project
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  project.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {project.status === 'active' ? 'Active' : 'Archived'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-medium text-slate-700">{department?.name || project.departmentId}</span>
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                ID: {project.id}
              </span>
              <span>•</span>
              <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
            </div>

            {project.description && (
              <p className="text-xs text-slate-600 max-w-3xl pt-1">{project.description}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
            {canManageProject && project.status === 'active' && (
              <button
                type="button"
                onClick={() => setIsEditOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit details</span>
              </button>
            )}

            {canArchiveProject && project.status === 'active' && (
              <button
                type="button"
                onClick={() => {
                  setArchiveError(null);
                  setBlockingSchedules([]);
                  setIsArchiveOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors shadow-2xs"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archive project</span>
              </button>
            )}

            {isGeneral && (
              <div
                title="The default General project cannot be archived"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-400 bg-slate-50 rounded-xl border border-slate-200/80 cursor-not-allowed"
              >
                <Info className="h-3.5 w-3.5" />
                <span>Protected default project</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Workspace Tabs Navigation */}
      <div className="border-b border-slate-200 bg-white px-2 rounded-xl border">
        <nav className="flex space-x-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('assets')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'assets'
                ? 'border-teal-600 text-teal-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FolderKanban className="h-4 w-4" />
            <span>Assets</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('designs')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'designs'
                ? 'border-teal-600 text-teal-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Palette className="h-4 w-4" />
            <span>Designs</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('playlists')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'playlists'
                ? 'border-teal-600 text-teal-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <ListMusic className="h-4 w-4" />
            <span>Playlists</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('schedules')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'schedules'
                ? 'border-teal-600 text-teal-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Schedules</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('members')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'members'
                ? 'border-teal-600 text-teal-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Users2 className="h-4 w-4" />
            <span>Members</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-semibold">
              {members.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Tab Panes */}
      <div>
        {activeTab === 'assets' && (
          <MediaLibraryView projectId={project.id} canUpload={canEdit} isReadOnly={isReadOnly} />
        )}

        {activeTab === 'designs' && (
          <DesignsView projectId={project.id} canEdit={canEdit} isReadOnly={isReadOnly} />
        )}

        {activeTab === 'playlists' && (
          <PlaylistsView projectId={project.id} canEdit={canEdit} isReadOnly={isReadOnly} />
        )}

        {activeTab === 'schedules' && (
          <SchedulesListView
            projectId={project.id}
            canEdit={canEdit}
            canPublish={canPublish}
            isReadOnly={isReadOnly}
          />
        )}

        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Project Team Members</h2>
                <p className="text-xs text-slate-500">
                  Members who have access to view and collaborate on assets and compositions in this project.
                </p>
              </div>

              {canManageProject && project.status === 'active' && (
                <button
                  type="button"
                  onClick={() => {
                    setMemberActionError(null);
                    setIsAddMemberOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-xs self-start sm:self-auto"
                >
                  <Users2 className="h-4 w-4" />
                  <span>Add member</span>
                </button>
              )}
            </div>

            {/* Members Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Company Role</th>
                    <th className="py-3 px-4">Project Role</th>
                    <th className="py-3 px-4">Added</th>
                    {canManageProject && project.status === 'active' && (
                      <th className="py-3 px-4 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <tr key={m.uid} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{m.userDisplayName || 'User'}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{m.userEmail || m.uid}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="capitalize px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                          {m.userCompanyRole ? m.userCompanyRole.replace('_', ' ') : 'User'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {canManageProject && project.status === 'active' ? (
                          <select
                            value={m.role}
                            disabled={memberActionLoading}
                            onChange={(e) =>
                              handleUpdateMemberRole(m.uid, e.target.value as ProjectMemberRole)
                            }
                            className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-teal-500 focus:border-teal-500 cursor-pointer"
                          >
                            <option value="lead">Publisher</option>
                            <option value="member">Contributor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              m.role === 'lead'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200/60'
                                : m.role === 'member'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {m.role === 'lead' ? 'Publisher' : m.role === 'member' ? 'Contributor' : 'Viewer'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {m.addedAt ? new Date(m.addedAt).toLocaleDateString() : '—'}
                      </td>
                      {canManageProject && project.status === 'active' && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            title="Remove member"
                            disabled={memberActionLoading}
                            onClick={() => handleRemoveMember(m.uid, m.userDisplayName)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No members assigned yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Project Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Edit Project Details</h3>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {updateError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{updateError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
                <input
                  type="text"
                  value={editName}
                  disabled={isGeneral}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={60}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-teal-500 focus:border-teal-500"
                />
                {isGeneral && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    The default General project name cannot be changed.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 focus:outline-teal-500 focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating || (!isGeneral && !editName.trim())}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archive Project Confirmation Modal */}
      {isArchiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Archive className="h-4 w-4 text-rose-600" />
                <span>Archive Project</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsArchiveOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to archive <strong>{project.name}</strong>? Archiving blocks new uploads
              and modifications to compositions within this project. Active broadcast publications will continue
              uninterrupted on digital displays.
            </p>

            {/* Error & Blocking Schedules Surface */}
            {archiveError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                <div className="text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="font-semibold">Archiving Blocked by Active Schedules</span>
                </div>
                <p className="text-[11px] text-rose-600">
                  Projects with active broadcast schedules cannot be archived. Please withdraw or reassign the following schedules before archiving:
                </p>
                {blockingSchedules.length > 0 ? (
                  <ul className="list-disc list-inside text-[11px] font-mono text-rose-800 space-y-0.5 pl-1">
                    {blockingSchedules.map((title, idx) => (
                      <li key={idx}>{title}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] font-mono text-rose-800 break-words">{archiveError}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsArchiveOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isArchiving}
                onClick={handleArchiveProject}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isArchiving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirm archive</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users2 className="h-4 w-4 text-teal-600" />
                <span>Add Project Member</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddMemberOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {memberActionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">Role Ceiling or Permission Error</span>
                  <span>{memberActionError}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select User</label>
                {availableUsersToAdd.length > 0 ? (
                  <select
                    value={selectedUserUid}
                    onChange={(e) => setSelectedUserUid(e.target.value)}
                    required
                    className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white focus:outline-teal-500 focus:border-teal-500"
                  >
                    {availableUsersToAdd.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName || u.email} ({u.role.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-400 italic py-2">
                    All active users in this department are already enrolled in this project.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Role</label>
                <select
                  value={selectedProjectRole}
                  onChange={(e) => setSelectedProjectRole(e.target.value as ProjectMemberRole)}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white focus:outline-teal-500 focus:border-teal-500"
                >
                  <option value="lead">Publisher (Can edit content and publish to digital displays)</option>
                  <option value="member">Contributor (Can create and edit content, cannot publish)</option>
                  <option value="viewer">Viewer (Read-only access)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1 flex items-start gap-1">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Department Heads assign project roles (Publisher, Contributor, or Viewer) per project.
                  </span>
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberActionLoading || !selectedUserUid || availableUsersToAdd.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {memberActionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Add member</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
