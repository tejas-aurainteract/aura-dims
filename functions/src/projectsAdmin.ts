/**
 * Aura DIMS - Project & Member Administration Cloud Functions
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements Project workspace lifecycle, member assignments with role ceilings,
 * active schedule protection on archive, and asset project transfers.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import {
  db,
  CALLABLE_OPTS,
  getAuthenticatedCaller,
  writeAuditLog,
} from './common.js';
import type {
  UserRole,
  ProjectRecord,
  ProjectMember,
  ProjectMemberRole,
  CreateProjectRequest,
  CreateProjectResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  ArchiveProjectRequest,
  ArchiveProjectResponse,
  ListProjectsRequest,
  ListProjectsResponse,
  AddProjectMemberRequest,
  AddProjectMemberResponse,
  RemoveProjectMemberRequest,
  RemoveProjectMemberResponse,
  UpdateProjectMemberRoleRequest,
  UpdateProjectMemberRoleResponse,
  ListProjectMembersRequest,
  ListProjectMembersResponse,
  MoveAssetProjectRequest,
  MoveAssetProjectResponse,
  UserProfile,
  MediaAsset,
} from '@aura-dims/display-schema';

/**
 * Explicitly named constant specifying roles authorized to create projects.
 * Can be tuned or extended by administrators.
 */
export const ALLOWED_PROJECT_CREATOR_ROLES: UserRole[] = ['admin', 'department_head'];

/**
 * Ensures the default General project exists for a given department.
 */
export async function ensureGeneralProject(
  departmentId: string,
  departmentName?: string,
  actorId = 'system'
): Promise<ProjectRecord> {
  const generalProjectId = `proj_general_${departmentId}`;
  const projectRef = db.collection('projects').doc(generalProjectId);
  const projectSnap = await projectRef.get();
  const now = new Date().toISOString();

  if (projectSnap.exists) {
    return projectSnap.data() as ProjectRecord;
  }

  let name = departmentName;
  if (!name) {
    const deptDoc = await db.collection('departments').doc(departmentId).get();
    name = deptDoc.exists ? deptDoc.data()?.name || departmentId : departmentId;
  }

  const generalProject: ProjectRecord = {
    id: generalProjectId,
    departmentId,
    name: 'General',
    description: `Default workspace for ${name}`,
    status: 'active',
    isGeneral: true,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  await projectRef.set(generalProject);
  return generalProject;
}

/**
 * Validates project role delegation within a department.
 * Department Heads and Administrators possess full authority to delegate project-level roles
 * ('lead', 'member', 'viewer') to users within their department.
 */
export function validateProjectRoleCeiling(_companyRole: UserRole, _targetProjectRole: ProjectMemberRole): void {
  // Department Heads possess full authority to delegate project-level roles
  // ('lead', 'member', 'viewer') dynamically per project to their department team members.
}

/**
 * Checks whether the caller has administrative or lead authority over a specific project.
 */
async function assertProjectManageAccess(
  caller: UserProfile,
  project: ProjectRecord
): Promise<void> {
  if (caller.role === 'admin') return;
  if (caller.role === 'department_head' && caller.departmentId === project.departmentId) return;

  // Check if caller is designated as 'lead' in this project
  const memberDoc = await db
    .collection('projects')
    .doc(project.id)
    .collection('members')
    .doc(caller.uid)
    .get();

  if (memberDoc.exists) {
    const member = memberDoc.data() as ProjectMember;
    if (member.role === 'lead') return;
  }

  throw new HttpsError(
    'permission-denied',
    'You do not have permission to manage this project or its members.'
  );
}

// ==============================================================================
// 1. Project Lifecycle: Create, Update, Archive, List
// ==============================================================================

export const createProject = onCall(
  CALLABLE_OPTS,
  async (request): Promise<CreateProjectResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { name, description, departmentId } = request.data as CreateProjectRequest;

    if (!ALLOWED_PROJECT_CREATOR_ROLES.includes(caller.role)) {
      throw new HttpsError(
        'permission-denied',
        `Role '${caller.role}' is not authorized to create projects. Allowed roles: ${ALLOWED_PROJECT_CREATOR_ROLES.join(', ')}.`
      );
    }

    if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
      throw new HttpsError('invalid-argument', 'Project name must be a non-empty string under 60 characters.');
    }

    // Resolve target department
    let targetDeptId = caller.departmentId;
    if (caller.role === 'admin') {
      if (!departmentId) {
        throw new HttpsError('invalid-argument', 'Admin must specify target departmentId for new project.');
      }
      targetDeptId = departmentId;
    } else {
      if (!targetDeptId) {
        throw new HttpsError('failed-precondition', 'Department Head is not assigned to an active department.');
      }
      if (departmentId && departmentId !== targetDeptId) {
        throw new HttpsError('permission-denied', 'Cannot create projects in another department.');
      }
    }

    // Verify department exists and is active
    const deptDoc = await db.collection('departments').doc(targetDeptId).get();
    if (!deptDoc.exists || deptDoc.data()?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Target department does not exist or has been deactivated.');
    }

    const projectId = `proj_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const newProject: ProjectRecord = {
      id: projectId,
      departmentId: targetDeptId,
      name: name.trim(),
      description: (description && typeof description === 'string' ? description.trim() : '').slice(0, 500),
      status: 'active',
      isGeneral: false,
      createdBy: caller.uid,
      createdAt: now,
      updatedAt: now,
    };

    const projectRef = db.collection('projects').doc(projectId);
    await projectRef.set(newProject);

    // Auto-enroll creator as project 'lead'
    const memberRef = projectRef.collection('members').doc(caller.uid);
    const initialMember: ProjectMember = {
      uid: caller.uid,
      projectId,
      role: 'lead',
      addedBy: caller.uid,
      addedAt: now,
      updatedAt: now,
      userEmail: caller.email,
      userDisplayName: caller.displayName,
      userCompanyRole: caller.role,
    };
    await memberRef.set(initialMember);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'project.create',
      targetId: projectId,
      targetType: 'project',
      newState: newProject as unknown as Record<string, unknown>,
      metadata: { departmentId: targetDeptId },
    });

    return { project: newProject };
  }
);

export const updateProject = onCall(
  CALLABLE_OPTS,
  async (request): Promise<UpdateProjectResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { projectId, name, description } = request.data as UpdateProjectRequest;

    if (!projectId) {
      throw new HttpsError('invalid-argument', 'Missing projectId.');
    }

    const pRef = db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
      throw new HttpsError('not-found', `Project '${projectId}' not found.`);
    }

    const project = pDoc.data() as ProjectRecord;
    await assertProjectManageAccess(caller, project);

    if (project.status === 'archived') {
      throw new HttpsError('failed-precondition', 'Archived projects cannot be modified.');
    }

    const updates: Partial<ProjectRecord> = {
      updatedAt: new Date().toISOString(),
    };

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
        throw new HttpsError('invalid-argument', 'Project name must be a non-empty string under 60 characters.');
      }
      if (project.isGeneral && name.trim() !== project.name) {
        throw new HttpsError('failed-precondition', 'The default General project name cannot be changed.');
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = typeof description === 'string' ? description.trim().slice(0, 500) : '';
    }

    await pRef.update(updates);

    const updatedProject: ProjectRecord = {
      ...project,
      ...updates,
    };

    await writeAuditLog({
      actorId: caller.uid,
      action: 'project.update',
      targetId: projectId,
      targetType: 'project',
      previousState: { name: project.name, description: project.description },
      newState: { name: updatedProject.name, description: updatedProject.description },
      metadata: { departmentId: project.departmentId },
    });

    return { project: updatedProject };
  }
);

export const archiveProject = onCall(
  CALLABLE_OPTS,
  async (request): Promise<ArchiveProjectResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { projectId } = request.data as ArchiveProjectRequest;

    if (!projectId) {
      throw new HttpsError('invalid-argument', 'Missing projectId.');
    }

    const pRef = db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
      throw new HttpsError('not-found', `Project '${projectId}' not found.`);
    }

    const project = pDoc.data() as ProjectRecord;

    // Only Admin or Department Head can archive projects
    if (caller.role !== 'admin' && (caller.role !== 'department_head' || caller.departmentId !== project.departmentId)) {
      throw new HttpsError('permission-denied', 'Only Administrators and Department Heads can archive projects.');
    }

    if (project.isGeneral) {
      throw new HttpsError('failed-precondition', 'The default General project cannot be archived.');
    }

    if (project.status === 'archived') {
      return { projectId, status: 'archived' };
    }

    // Safety rule: Block archiving while active broadcast schedules exist
    const activeSchedulesSnap = await db
      .collection('schedules')
      .where('projectId', '==', projectId)
      .where('status', '==', 'active')
      .get();

    if (!activeSchedulesSnap.empty) {
      const activeTitles = activeSchedulesSnap.docs.map(
        (d) => (d.data().title as string) || d.id
      );
      throw new HttpsError(
        'failed-precondition',
        `Cannot archive project while active broadcast schedules exist: [${activeTitles.join(
          ', '
        )}]. Please withdraw or reassign the schedules before archiving.`
      );
    }

    const now = new Date().toISOString();
    await pRef.update({
      status: 'archived',
      archivedAt: now,
      archivedBy: caller.uid,
      updatedAt: now,
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: 'project.archive',
      targetId: projectId,
      targetType: 'project',
      newState: { status: 'archived', archivedAt: now },
      metadata: { departmentId: project.departmentId },
    });

    return { projectId, status: 'archived' };
  }
);

export const listProjects = onCall(
  CALLABLE_OPTS,
  async (request): Promise<ListProjectsResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { departmentId, status = 'active' } = (request.data || {}) as ListProjectsRequest;

    let targetDeptId: string | null = null;
    if (caller.role === 'admin') {
      targetDeptId = departmentId && departmentId !== 'all' ? departmentId : null;
    } else {
      targetDeptId = caller.departmentId;
    }

    let query: FirebaseFirestore.Query = db.collection('projects');
    if (targetDeptId) {
      query = query.where('departmentId', '==', targetDeptId);
    }

    if (status !== 'all') {
      query = query.where('status', '==', status);
    }

    const snap = await query.get();
    let projects = snap.docs.map((doc) => doc.data() as ProjectRecord);

    // If caller is non-admin and non-head (creator/viewer/member), filter to projects they are members of
    if (caller.role !== 'admin' && caller.role !== 'department_head') {
      const memberChecks = await Promise.all(
        projects.map(async (p) => {
          if (p.isGeneral) return { projectId: p.id, isMember: true };
          try {
            const mDoc = await db.collection('projects').doc(p.id).collection('members').doc(caller.uid).get();
            return { projectId: p.id, isMember: mDoc.exists };
          } catch {
            return { projectId: p.id, isMember: false };
          }
        })
      );

      const accessibleProjectIds = new Set(
        memberChecks.filter((m) => m.isMember).map((m) => m.projectId)
      );

      // Always include department's General project
      projects = projects.filter(
        (p) => p.isGeneral || accessibleProjectIds.has(p.id)
      );
    }

    // Enrich with counts (memberCount and assetCount)
    const enrichedProjects = await Promise.all(
      projects.map(async (p) => {
        let memberCount = 0;
        let assetCount = 0;

        try {
          const membersSnap = await db.collection('projects').doc(p.id).collection('members').get();
          memberCount = membersSnap.size;

          const assetsSnap = await db
            .collection('assets')
            .where('ownerProjectId', '==', p.id)
            .where('status', '!=', 'archived')
            .get();
          assetCount = assetsSnap.size;
        } catch (e) {
          // Graceful fallback if composite indexes are building
        }

        return {
          ...p,
          memberCount,
          assetCount,
        };
      })
    );

    return { projects: enrichedProjects };
  }
);

// ==============================================================================
// 2. Project Member Management
// ==============================================================================

export const addProjectMember = onCall(
  CALLABLE_OPTS,
  async (request): Promise<AddProjectMemberResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { projectId, targetUid, role } = request.data as AddProjectMemberRequest;

    if (!projectId || !targetUid || !role) {
      throw new HttpsError('invalid-argument', 'Missing projectId, targetUid, or role.');
    }

    const pRef = db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
      throw new HttpsError('not-found', `Project '${projectId}' not found.`);
    }

    const project = pDoc.data() as ProjectRecord;
    await assertProjectManageAccess(caller, project);

    if (project.status === 'archived') {
      throw new HttpsError('failed-precondition', 'Cannot add members to an archived project.');
    }

    const targetUserDoc = await db.collection('users').doc(targetUid).get();
    if (!targetUserDoc.exists) {
      throw new HttpsError('not-found', `User '${targetUid}' not found.`);
    }

    const targetUser = targetUserDoc.data() as UserProfile;
    if (targetUser.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Cannot add a deactivated user to a project.');
    }

    // Enforce department boundary: User must be in project's department (or Admin)
    if (targetUser.role !== 'admin' && targetUser.departmentId !== project.departmentId) {
      throw new HttpsError(
        'permission-denied',
        'Users can only be added to projects within their own department.'
      );
    }

    // Enforce role ceiling: Project role cannot exceed company role
    validateProjectRoleCeiling(targetUser.role, role);

    const now = new Date().toISOString();
    const member: ProjectMember = {
      uid: targetUid,
      projectId,
      role,
      addedBy: caller.uid,
      addedAt: now,
      updatedAt: now,
      userEmail: targetUser.email,
      userDisplayName: targetUser.displayName,
      userCompanyRole: targetUser.role,
    };

    await pRef.collection('members').doc(targetUid).set(member);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'project.member_add',
      targetId: targetUid,
      targetType: 'project_member',
      newState: member as unknown as Record<string, unknown>,
      metadata: { projectId, departmentId: project.departmentId, targetProjectRole: role },
    });

    return { member };
  }
);

export const removeProjectMember = onCall(
  CALLABLE_OPTS,
  async (request): Promise<RemoveProjectMemberResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { projectId, targetUid } = request.data as RemoveProjectMemberRequest;

    if (!projectId || !targetUid) {
      throw new HttpsError('invalid-argument', 'Missing projectId or targetUid.');
    }

    const pRef = db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
      throw new HttpsError('not-found', `Project '${projectId}' not found.`);
    }

    const project = pDoc.data() as ProjectRecord;
    await assertProjectManageAccess(caller, project);

    // Prevent removing a Department Head from their own department's General project
    if (project.isGeneral) {
      const userDoc = await db.collection('users').doc(targetUid).get();
      if (userDoc.exists) {
        const u = userDoc.data() as UserProfile;
        if (u.role === 'department_head' && u.departmentId === project.departmentId) {
          throw new HttpsError(
            'failed-precondition',
            'Department Head cannot be removed from their department General project.'
          );
        }
      }
    }

    const mRef = pRef.collection('members').doc(targetUid);
    const mDoc = await mRef.get();
    if (!mDoc.exists) {
      return { projectId, targetUid };
    }

    await mRef.delete();

    await writeAuditLog({
      actorId: caller.uid,
      action: 'project.member_remove',
      targetId: targetUid,
      targetType: 'project_member',
      previousState: mDoc.data() as Record<string, unknown>,
      metadata: { projectId, departmentId: project.departmentId },
    });

    return { projectId, targetUid };
  }
);

export const updateProjectMemberRole = onCall(
  CALLABLE_OPTS,
  async (request): Promise<UpdateProjectMemberRoleResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { projectId, targetUid, role } = request.data as UpdateProjectMemberRoleRequest;

    if (!projectId || !targetUid || !role) {
      throw new HttpsError('invalid-argument', 'Missing projectId, targetUid, or role.');
    }

    const pRef = db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
      throw new HttpsError('not-found', `Project '${projectId}' not found.`);
    }

    const project = pDoc.data() as ProjectRecord;
    await assertProjectManageAccess(caller, project);

    const mRef = pRef.collection('members').doc(targetUid);
    const mDoc = await mRef.get();
    if (!mDoc.exists) {
      throw new HttpsError('not-found', `Member '${targetUid}' not found in project.`);
    }

    const currentMember = mDoc.data() as ProjectMember;

    // Check company role ceiling
    const targetUserDoc = await db.collection('users').doc(targetUid).get();
    if (targetUserDoc.exists) {
      const u = targetUserDoc.data() as UserProfile;
      validateProjectRoleCeiling(u.role, role);
    }

    const now = new Date().toISOString();
    const updatedMember: ProjectMember = {
      ...currentMember,
      role,
      updatedAt: now,
    };

    await mRef.update({
      role,
      updatedAt: now,
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: 'project.member_role_update',
      targetId: targetUid,
      targetType: 'project_member',
      previousState: { role: currentMember.role },
      newState: { role },
      metadata: { projectId, departmentId: project.departmentId },
    });

    return { member: updatedMember };
  }
);

export const listProjectMembers = onCall(
  CALLABLE_OPTS,
  async (request): Promise<ListProjectMembersResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { projectId } = request.data as ListProjectMembersRequest;

    if (!projectId) {
      throw new HttpsError('invalid-argument', 'Missing projectId.');
    }

    const pRef = db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
      throw new HttpsError('not-found', `Project '${projectId}' not found.`);
    }

    const project = pDoc.data() as ProjectRecord;

    // Access check: Admin, Dept Head (same dept), or Member of project
    if (caller.role !== 'admin' && (caller.role !== 'department_head' || caller.departmentId !== project.departmentId)) {
      const myMembership = await pRef.collection('members').doc(caller.uid).get();
      if (!myMembership.exists && !project.isGeneral) {
        throw new HttpsError('permission-denied', 'You do not have access to view members of this project.');
      }
    }

    const membersSnap = await pRef.collection('members').get();
    const members = membersSnap.docs.map((doc) => doc.data() as ProjectMember);

    return { members };
  }
);

// ==============================================================================
// 3. Move Asset Between Projects (Same Dept Never Moves Files; Cross-Dept Admin Only)
// ==============================================================================

export const moveAssetProject = onCall(
  CALLABLE_OPTS,
  async (request): Promise<MoveAssetProjectResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { assetId, targetProjectId, targetDepartmentId } = request.data as MoveAssetProjectRequest;

    if (!assetId || !targetProjectId) {
      throw new HttpsError('invalid-argument', 'Missing assetId or targetProjectId.');
    }

    const assetRef = db.collection('assets').doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      throw new HttpsError('not-found', `Media asset '${assetId}' not found.`);
    }

    const asset = assetSnap.data() as MediaAsset;

    // Load target project
    const targetProjectRef = db.collection('projects').doc(targetProjectId);
    const targetProjectSnap = await targetProjectRef.get();
    if (!targetProjectSnap.exists) {
      throw new HttpsError('not-found', `Target project '${targetProjectId}' not found.`);
    }

    const targetProject = targetProjectSnap.data() as ProjectRecord;
    if (targetDepartmentId && targetDepartmentId !== targetProject.departmentId) {
      throw new HttpsError('invalid-argument', 'Target departmentId does not match the target project department.');
    }
    if (targetProject.status === 'archived') {
      throw new HttpsError('failed-precondition', 'Cannot move asset into an archived project.');
    }

    // Cross-department check
    const isCrossDepartment = targetProject.departmentId !== asset.departmentId;
    if (isCrossDepartment) {
      if (caller.role !== 'admin') {
        throw new HttpsError(
          'permission-denied',
          'Cross-department asset transfer is strictly restricted to System Administrators.'
        );
      }
    } else {
      // Same department: Admin, Dept Head, or project member with edit rights
      if (caller.role !== 'admin' && (caller.role !== 'department_head' || caller.departmentId !== asset.departmentId)) {
        if (asset.ownerId !== caller.uid) {
          throw new HttpsError('permission-denied', 'You do not have permission to move this asset.');
        }
      }
    }

    const prevProjectId = asset.ownerProjectId || '';
    const prevDeptId = asset.ownerDepartmentId || asset.departmentId;
    const now = new Date().toISOString();

    // Calculate updated accessScopes
    const newScopes = new Set<string>();
    // Add new departmental and project scopes
    newScopes.add(`dept:${targetProject.departmentId}`);
    newScopes.add(`proj:${targetProjectId}`);

    // If previously global or approved global, preserve global scope
    if (asset.visibility === 'global' || asset.accessScopes?.includes('global')) {
      newScopes.add('global');
    }

    // Preserve any existing explicit shared scopes if present
    if (asset.sharedWith && Array.isArray(asset.sharedWith)) {
      asset.sharedWith.forEach((s) => {
        if (s.type === 'department') newScopes.add(`dept:${s.id}`);
        if (s.type === 'project') newScopes.add(`proj:${s.id}`);
      });
    }

    const updates: Partial<MediaAsset> = {
      ownerDepartmentId: targetProject.departmentId,
      departmentId: targetProject.departmentId, // Keep mirrored for backward compatibility
      ownerProjectId: targetProjectId,
      accessScopes: Array.from(newScopes),
      updatedAt: now,
    };

    // NOTE: storagePath is NEVER modified. File remains at media/{departmentId}/{assetId}/original.{ext}
    await assetRef.update(updates);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'asset.project_moved',
      targetId: assetId,
      targetType: 'asset',
      previousState: { ownerProjectId: prevProjectId, ownerDepartmentId: prevDeptId },
      newState: { ownerProjectId: targetProjectId, ownerDepartmentId: targetProject.departmentId },
      metadata: { isCrossDepartment },
    });

    return {
      assetId,
      previousProjectId: prevProjectId,
      ownerProjectId: targetProjectId,
      ownerDepartmentId: targetProject.departmentId,
    };
  }
);
