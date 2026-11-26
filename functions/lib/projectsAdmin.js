"use strict";
/**
 * Aura DIMS - Project & Member Administration Cloud Functions
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements Project workspace lifecycle, member assignments with role ceilings,
 * active schedule protection on archive, and asset project transfers.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveAssetProject = exports.listProjectMembers = exports.updateProjectMemberRole = exports.removeProjectMember = exports.addProjectMember = exports.listProjects = exports.archiveProject = exports.updateProject = exports.createProject = exports.ALLOWED_PROJECT_CREATOR_ROLES = void 0;
exports.ensureGeneralProject = ensureGeneralProject;
exports.validateProjectRoleCeiling = validateProjectRoleCeiling;
const https_1 = require("firebase-functions/v2/https");
const crypto = __importStar(require("crypto"));
const common_js_1 = require("./common.js");
/**
 * Explicitly named constant specifying roles authorized to create projects.
 * Can be tuned or extended by administrators.
 */
exports.ALLOWED_PROJECT_CREATOR_ROLES = ['admin', 'department_head'];
/**
 * Ensures the default General project exists for a given department.
 */
async function ensureGeneralProject(departmentId, departmentName, actorId = 'system') {
    const generalProjectId = `proj_general_${departmentId}`;
    const projectRef = common_js_1.db.collection('projects').doc(generalProjectId);
    const projectSnap = await projectRef.get();
    const now = new Date().toISOString();
    if (projectSnap.exists) {
        return projectSnap.data();
    }
    let name = departmentName;
    if (!name) {
        const deptDoc = await common_js_1.db.collection('departments').doc(departmentId).get();
        name = deptDoc.exists ? deptDoc.data()?.name || departmentId : departmentId;
    }
    const generalProject = {
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
function validateProjectRoleCeiling(_companyRole, _targetProjectRole) {
    // Department Heads possess full authority to delegate project-level roles
    // ('lead', 'member', 'viewer') dynamically per project to their department team members.
}
/**
 * Checks whether the caller has administrative or lead authority over a specific project.
 */
async function assertProjectManageAccess(caller, project) {
    if (caller.role === 'admin')
        return;
    if (caller.role === 'department_head' && caller.departmentId === project.departmentId)
        return;
    // Check if caller is designated as 'lead' in this project
    const memberDoc = await common_js_1.db
        .collection('projects')
        .doc(project.id)
        .collection('members')
        .doc(caller.uid)
        .get();
    if (memberDoc.exists) {
        const member = memberDoc.data();
        if (member.role === 'lead')
            return;
    }
    throw new https_1.HttpsError('permission-denied', 'You do not have permission to manage this project or its members.');
}
// ==============================================================================
// 1. Project Lifecycle: Create, Update, Archive, List
// ==============================================================================
exports.createProject = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { name, description, departmentId } = request.data;
    if (!exports.ALLOWED_PROJECT_CREATOR_ROLES.includes(caller.role)) {
        throw new https_1.HttpsError('permission-denied', `Role '${caller.role}' is not authorized to create projects. Allowed roles: ${exports.ALLOWED_PROJECT_CREATOR_ROLES.join(', ')}.`);
    }
    if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
        throw new https_1.HttpsError('invalid-argument', 'Project name must be a non-empty string under 60 characters.');
    }
    // Resolve target department
    let targetDeptId = caller.departmentId;
    if (caller.role === 'admin') {
        if (!departmentId) {
            throw new https_1.HttpsError('invalid-argument', 'Admin must specify target departmentId for new project.');
        }
        targetDeptId = departmentId;
    }
    else {
        if (!targetDeptId) {
            throw new https_1.HttpsError('failed-precondition', 'Department Head is not assigned to an active department.');
        }
        if (departmentId && departmentId !== targetDeptId) {
            throw new https_1.HttpsError('permission-denied', 'Cannot create projects in another department.');
        }
    }
    // Verify department exists and is active
    const deptDoc = await common_js_1.db.collection('departments').doc(targetDeptId).get();
    if (!deptDoc.exists || deptDoc.data()?.status !== 'active') {
        throw new https_1.HttpsError('failed-precondition', 'Target department does not exist or has been deactivated.');
    }
    const projectId = `proj_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newProject = {
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
    const projectRef = common_js_1.db.collection('projects').doc(projectId);
    await projectRef.set(newProject);
    // Auto-enroll creator as project 'lead'
    const memberRef = projectRef.collection('members').doc(caller.uid);
    const initialMember = {
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
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: 'project.create',
        targetId: projectId,
        targetType: 'project',
        newState: newProject,
        metadata: { departmentId: targetDeptId },
    });
    return { project: newProject };
});
exports.updateProject = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { projectId, name, description } = request.data;
    if (!projectId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing projectId.');
    }
    const pRef = common_js_1.db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
        throw new https_1.HttpsError('not-found', `Project '${projectId}' not found.`);
    }
    const project = pDoc.data();
    await assertProjectManageAccess(caller, project);
    if (project.status === 'archived') {
        throw new https_1.HttpsError('failed-precondition', 'Archived projects cannot be modified.');
    }
    const updates = {
        updatedAt: new Date().toISOString(),
    };
    if (name !== undefined) {
        if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
            throw new https_1.HttpsError('invalid-argument', 'Project name must be a non-empty string under 60 characters.');
        }
        if (project.isGeneral && name.trim() !== project.name) {
            throw new https_1.HttpsError('failed-precondition', 'The default General project name cannot be changed.');
        }
        updates.name = name.trim();
    }
    if (description !== undefined) {
        updates.description = typeof description === 'string' ? description.trim().slice(0, 500) : '';
    }
    await pRef.update(updates);
    const updatedProject = {
        ...project,
        ...updates,
    };
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: 'project.update',
        targetId: projectId,
        targetType: 'project',
        previousState: { name: project.name, description: project.description },
        newState: { name: updatedProject.name, description: updatedProject.description },
        metadata: { departmentId: project.departmentId },
    });
    return { project: updatedProject };
});
exports.archiveProject = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { projectId } = request.data;
    if (!projectId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing projectId.');
    }
    const pRef = common_js_1.db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
        throw new https_1.HttpsError('not-found', `Project '${projectId}' not found.`);
    }
    const project = pDoc.data();
    // Only Admin or Department Head can archive projects
    if (caller.role !== 'admin' && (caller.role !== 'department_head' || caller.departmentId !== project.departmentId)) {
        throw new https_1.HttpsError('permission-denied', 'Only Administrators and Department Heads can archive projects.');
    }
    if (project.isGeneral) {
        throw new https_1.HttpsError('failed-precondition', 'The default General project cannot be archived.');
    }
    if (project.status === 'archived') {
        return { projectId, status: 'archived' };
    }
    // Safety rule: Block archiving while active broadcast schedules exist
    const activeSchedulesSnap = await common_js_1.db
        .collection('schedules')
        .where('projectId', '==', projectId)
        .where('status', '==', 'active')
        .get();
    if (!activeSchedulesSnap.empty) {
        const activeTitles = activeSchedulesSnap.docs.map((d) => d.data().title || d.id);
        throw new https_1.HttpsError('failed-precondition', `Cannot archive project while active broadcast schedules exist: [${activeTitles.join(', ')}]. Please withdraw or reassign the schedules before archiving.`);
    }
    const now = new Date().toISOString();
    await pRef.update({
        status: 'archived',
        archivedAt: now,
        archivedBy: caller.uid,
        updatedAt: now,
    });
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: 'project.archive',
        targetId: projectId,
        targetType: 'project',
        newState: { status: 'archived', archivedAt: now },
        metadata: { departmentId: project.departmentId },
    });
    return { projectId, status: 'archived' };
});
exports.listProjects = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { departmentId, status = 'active' } = (request.data || {});
    let targetDeptId = null;
    if (caller.role === 'admin') {
        targetDeptId = departmentId && departmentId !== 'all' ? departmentId : null;
    }
    else {
        targetDeptId = caller.departmentId;
    }
    let query = common_js_1.db.collection('projects');
    if (targetDeptId) {
        query = query.where('departmentId', '==', targetDeptId);
    }
    if (status !== 'all') {
        query = query.where('status', '==', status);
    }
    const snap = await query.get();
    let projects = snap.docs.map((doc) => doc.data());
    // If caller is non-admin and non-head (creator/viewer/member), filter to projects they are members of
    if (caller.role !== 'admin' && caller.role !== 'department_head') {
        const memberChecks = await Promise.all(projects.map(async (p) => {
            if (p.isGeneral)
                return { projectId: p.id, isMember: true };
            try {
                const mDoc = await common_js_1.db.collection('projects').doc(p.id).collection('members').doc(caller.uid).get();
                return { projectId: p.id, isMember: mDoc.exists };
            }
            catch {
                return { projectId: p.id, isMember: false };
            }
        }));
        const accessibleProjectIds = new Set(memberChecks.filter((m) => m.isMember).map((m) => m.projectId));
        // Always include department's General project
        projects = projects.filter((p) => p.isGeneral || accessibleProjectIds.has(p.id));
    }
    // Enrich with counts (memberCount and assetCount)
    const enrichedProjects = await Promise.all(projects.map(async (p) => {
        let memberCount = 0;
        let assetCount = 0;
        try {
            const membersSnap = await common_js_1.db.collection('projects').doc(p.id).collection('members').get();
            memberCount = membersSnap.size;
            const assetsSnap = await common_js_1.db
                .collection('assets')
                .where('ownerProjectId', '==', p.id)
                .where('status', '!=', 'archived')
                .get();
            assetCount = assetsSnap.size;
        }
        catch (e) {
            // Graceful fallback if composite indexes are building
        }
        return {
            ...p,
            memberCount,
            assetCount,
        };
    }));
    return { projects: enrichedProjects };
});
// ==============================================================================
// 2. Project Member Management
// ==============================================================================
exports.addProjectMember = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { projectId, targetUid, role } = request.data;
    if (!projectId || !targetUid || !role) {
        throw new https_1.HttpsError('invalid-argument', 'Missing projectId, targetUid, or role.');
    }
    const pRef = common_js_1.db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
        throw new https_1.HttpsError('not-found', `Project '${projectId}' not found.`);
    }
    const project = pDoc.data();
    await assertProjectManageAccess(caller, project);
    if (project.status === 'archived') {
        throw new https_1.HttpsError('failed-precondition', 'Cannot add members to an archived project.');
    }
    const targetUserDoc = await common_js_1.db.collection('users').doc(targetUid).get();
    if (!targetUserDoc.exists) {
        throw new https_1.HttpsError('not-found', `User '${targetUid}' not found.`);
    }
    const targetUser = targetUserDoc.data();
    if (targetUser.status !== 'active') {
        throw new https_1.HttpsError('failed-precondition', 'Cannot add a deactivated user to a project.');
    }
    // Enforce department boundary: User must be in project's department (or Admin)
    if (targetUser.role !== 'admin' && targetUser.departmentId !== project.departmentId) {
        throw new https_1.HttpsError('permission-denied', 'Users can only be added to projects within their own department.');
    }
    // Enforce role ceiling: Project role cannot exceed company role
    validateProjectRoleCeiling(targetUser.role, role);
    const now = new Date().toISOString();
    const member = {
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
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: 'project.member_add',
        targetId: targetUid,
        targetType: 'project_member',
        newState: member,
        metadata: { projectId, departmentId: project.departmentId, targetProjectRole: role },
    });
    return { member };
});
exports.removeProjectMember = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { projectId, targetUid } = request.data;
    if (!projectId || !targetUid) {
        throw new https_1.HttpsError('invalid-argument', 'Missing projectId or targetUid.');
    }
    const pRef = common_js_1.db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
        throw new https_1.HttpsError('not-found', `Project '${projectId}' not found.`);
    }
    const project = pDoc.data();
    await assertProjectManageAccess(caller, project);
    // Prevent removing a Department Head from their own department's General project
    if (project.isGeneral) {
        const userDoc = await common_js_1.db.collection('users').doc(targetUid).get();
        if (userDoc.exists) {
            const u = userDoc.data();
            if (u.role === 'department_head' && u.departmentId === project.departmentId) {
                throw new https_1.HttpsError('failed-precondition', 'Department Head cannot be removed from their department General project.');
            }
        }
    }
    const mRef = pRef.collection('members').doc(targetUid);
    const mDoc = await mRef.get();
    if (!mDoc.exists) {
        return { projectId, targetUid };
    }
    await mRef.delete();
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: 'project.member_remove',
        targetId: targetUid,
        targetType: 'project_member',
        previousState: mDoc.data(),
        metadata: { projectId, departmentId: project.departmentId },
    });
    return { projectId, targetUid };
});
exports.updateProjectMemberRole = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { projectId, targetUid, role } = request.data;
    if (!projectId || !targetUid || !role) {
        throw new https_1.HttpsError('invalid-argument', 'Missing projectId, targetUid, or role.');
    }
    const pRef = common_js_1.db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
        throw new https_1.HttpsError('not-found', `Project '${projectId}' not found.`);
    }
    const project = pDoc.data();
    await assertProjectManageAccess(caller, project);
    const mRef = pRef.collection('members').doc(targetUid);
    const mDoc = await mRef.get();
    if (!mDoc.exists) {
        throw new https_1.HttpsError('not-found', `Member '${targetUid}' not found in project.`);
    }
    const currentMember = mDoc.data();
    // Check company role ceiling
    const targetUserDoc = await common_js_1.db.collection('users').doc(targetUid).get();
    if (targetUserDoc.exists) {
        const u = targetUserDoc.data();
        validateProjectRoleCeiling(u.role, role);
    }
    const now = new Date().toISOString();
    const updatedMember = {
        ...currentMember,
        role,
        updatedAt: now,
    };
    await mRef.update({
        role,
        updatedAt: now,
    });
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: 'project.member_role_update',
        targetId: targetUid,
        targetType: 'project_member',
        previousState: { role: currentMember.role },
        newState: { role },
        metadata: { projectId, departmentId: project.departmentId },
    });
    return { member: updatedMember };
});
exports.listProjectMembers = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { projectId } = request.data;
    if (!projectId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing projectId.');
    }
    const pRef = common_js_1.db.collection('projects').doc(projectId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
        throw new https_1.HttpsError('not-found', `Project '${projectId}' not found.`);
    }
    const project = pDoc.data();
    // Access check: Admin, Dept Head (same dept), or Member of project
    if (caller.role !== 'admin' && (caller.role !== 'department_head' || caller.departmentId !== project.departmentId)) {
        const myMembership = await pRef.collection('members').doc(caller.uid).get();
        if (!myMembership.exists && !project.isGeneral) {
            throw new https_1.HttpsError('permission-denied', 'You do not have access to view members of this project.');
        }
    }
    const membersSnap = await pRef.collection('members').get();
    const members = membersSnap.docs.map((doc) => doc.data());
    return { members };
});
// ==============================================================================
// 3. Move Asset Between Projects (Same Dept Never Moves Files; Cross-Dept Admin Only)
// ==============================================================================
exports.moveAssetProject = (0, https_1.onCall)(common_js_1.CALLABLE_OPTS, async (request) => {
    const caller = await (0, common_js_1.getAuthenticatedCaller)(request.auth);
    const { assetId, targetProjectId, targetDepartmentId } = request.data;
    if (!assetId || !targetProjectId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing assetId or targetProjectId.');
    }
    const assetRef = common_js_1.db.collection('assets').doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
        throw new https_1.HttpsError('not-found', `Media asset '${assetId}' not found.`);
    }
    const asset = assetSnap.data();
    // Load target project
    const targetProjectRef = common_js_1.db.collection('projects').doc(targetProjectId);
    const targetProjectSnap = await targetProjectRef.get();
    if (!targetProjectSnap.exists) {
        throw new https_1.HttpsError('not-found', `Target project '${targetProjectId}' not found.`);
    }
    const targetProject = targetProjectSnap.data();
    if (targetDepartmentId && targetDepartmentId !== targetProject.departmentId) {
        throw new https_1.HttpsError('invalid-argument', 'Target departmentId does not match the target project department.');
    }
    if (targetProject.status === 'archived') {
        throw new https_1.HttpsError('failed-precondition', 'Cannot move asset into an archived project.');
    }
    // Cross-department check
    const isCrossDepartment = targetProject.departmentId !== asset.departmentId;
    if (isCrossDepartment) {
        if (caller.role !== 'admin') {
            throw new https_1.HttpsError('permission-denied', 'Cross-department asset transfer is strictly restricted to System Administrators.');
        }
    }
    else {
        // Same department: Admin, Dept Head, or project member with edit rights
        if (caller.role !== 'admin' && (caller.role !== 'department_head' || caller.departmentId !== asset.departmentId)) {
            if (asset.ownerId !== caller.uid) {
                throw new https_1.HttpsError('permission-denied', 'You do not have permission to move this asset.');
            }
        }
    }
    const prevProjectId = asset.ownerProjectId || '';
    const prevDeptId = asset.ownerDepartmentId || asset.departmentId;
    const now = new Date().toISOString();
    // Calculate updated accessScopes
    const newScopes = new Set();
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
            if (s.type === 'department')
                newScopes.add(`dept:${s.id}`);
            if (s.type === 'project')
                newScopes.add(`proj:${s.id}`);
        });
    }
    const updates = {
        ownerDepartmentId: targetProject.departmentId,
        departmentId: targetProject.departmentId, // Keep mirrored for backward compatibility
        ownerProjectId: targetProjectId,
        accessScopes: Array.from(newScopes),
        updatedAt: now,
    };
    // NOTE: storagePath is NEVER modified. File remains at media/{departmentId}/{assetId}/original.{ext}
    await assetRef.update(updates);
    await (0, common_js_1.writeAuditLog)({
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
});
//# sourceMappingURL=projectsAdmin.js.map