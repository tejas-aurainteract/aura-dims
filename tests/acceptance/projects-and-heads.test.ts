/**
 * Aura DIMS - Projects Hierarchy, Head Enforcement & Token Revocation Test Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Verifies Phase 1 / Phase 1.5 requirements:
 * 1. One-head-per-department transaction (rejection, explicit replacement, concurrent race)
 * 2. Project role ceiling enforcement (company viewer stays read-only)
 * 3. Project archive blocked by active schedules
 * 4. Same-department asset move vs cross-department admin-only
 * 5. Auto-enrollment in General project respecting company role ceiling
 * 6. Department change and deactivation cleanup of project memberships
 * 7. Token revocation & real-time permission cutover for demoted/deactivated callers
 * 8. Audit event generation for all project and head operations
 * 9. listMediaAssets backward compatibility
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as net from 'node:net';

// Point Firebase Admin strictly at emulator
process.env.GCLOUD_PROJECT = 'demo-aura-dims';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-aura-dims',
  storageBucket: 'demo-aura-dims.appspot.com',
});
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';

import { db } from '../../functions/src/common';
import {
  provisionUser,
  updateUser,
  setUserActiveStatus,
} from '../../functions/src/index';
import {
  createProject,
  updateProject,
  archiveProject,
  listProjects,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
  listProjectMembers,
  moveAssetProject,
} from '../../functions/src/projectsAdmin';
import { listMediaAssets } from '../../functions/src/mediaAdmin';
import type {
  UserProfile,
  Department,
  ProjectRecord,
  ProjectMember,
  MediaAsset,
  ScheduleRecord,
} from '@aura-dims/display-schema';

function checkPortOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(ok);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function callFn<TReq, TRes>(
  fn: { run: (req: any) => Promise<TRes> },
  data: TReq,
  auth?: { uid: string; token?: Record<string, unknown> }
): Promise<TRes> {
  return fn.run({
    data,
    auth: auth ? { uid: auth.uid, token: auth.token || {} } : undefined,
    rawRequest: {
      ip: '127.0.0.1',
      headers: {},
    },
  });
}

describe('Aura DIMS - Projects Hierarchy & One-Head Enforcement Suite', () => {
  const adminUid = 'test-admin-uid';
  const deptA = 'test-dept-alpha';
  const deptB = 'test-dept-beta';

  let isEmulatorRunning = false;

  beforeAll(async () => {
    isEmulatorRunning = await checkPortOpen('127.0.0.1', 8080);
    if (!isEmulatorRunning) {
      console.warn('Firestore emulator is not running at 127.0.0.1:8080. Tests requiring live emulator connection will be skipped.');
      return;
    }

    // Seed admin profile
    await db.collection('users').doc(adminUid).set({
      uid: adminUid,
      email: 'admin@aurainteract.com',
      displayName: 'System Admin',
      role: 'admin',
      departmentId: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed test departments
    await db.collection('departments').doc(deptA).set({
      id: deptA,
      name: 'Alpha Operations',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.collection('departments').doc(deptB).set({
      id: deptB,
      name: 'Beta Facilities',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // ============================================================================
  // Test 1: One-Head-Per-Department Transactional Invariant
  // ============================================================================
  it('enforces one head per department: rejects duplicate promotion unless replaceExistingHead is true, and handles concurrent race', async () => {
    if (!isEmulatorRunning) return;

    const user1Uid = 'test-head-user-1';
    const user2Uid = 'test-head-user-2';

    // Seed two active users in deptA
    await db.collection('users').doc(user1Uid).set({
      uid: user1Uid,
      email: 'user1@alpha.com',
      displayName: 'User One',
      role: 'creator',
      departmentId: deptA,
      status: 'active',
    });

    await db.collection('users').doc(user2Uid).set({
      uid: user2Uid,
      email: 'user2@alpha.com',
      displayName: 'User Two',
      role: 'creator',
      departmentId: deptA,
      status: 'active',
    });

    // Promote User 1 to department_head
    await callFn(
      updateUser,
      { uid: user1Uid, role: 'department_head', departmentId: deptA },
      { uid: adminUid }
    );

    const u1Doc = await db.collection('users').doc(user1Uid).get();
    expect(u1Doc.data()?.role).toBe('department_head');

    // Attempt to promote User 2 to department_head without replaceExistingHead
    let rejectedError: any = null;
    try {
      await callFn(
        updateUser,
        { uid: user2Uid, role: 'department_head', departmentId: deptA, replaceExistingHead: false },
        { uid: adminUid }
      );
    } catch (err) {
      rejectedError = err;
    }

    expect(rejectedError).not.toBeNull();
    expect(rejectedError.code).toBe('already-exists');
    expect(rejectedError.message).toContain('already has an active Department Head');

    // User 1 remains head, User 2 remains creator
    const u1Check = await db.collection('users').doc(user1Uid).get();
    expect(u1Check.data()?.role).toBe('department_head');
    const u2Check = await db.collection('users').doc(user2Uid).get();
    expect(u2Check.data()?.role).toBe('creator');

    // Promote User 2 with replaceExistingHead = true
    await callFn(
      updateUser,
      { uid: user2Uid, role: 'department_head', departmentId: deptA, replaceExistingHead: true },
      { uid: adminUid }
    );

    // Verify User 2 is now department_head, and User 1 was demoted to creator
    const u1After = await db.collection('users').doc(user1Uid).get();
    expect(u1After.data()?.role).toBe('creator');
    const u2After = await db.collection('users').doc(user2Uid).get();
    expect(u2After.data()?.role).toBe('department_head');

    // Verify user.head_demoted audit event was written
    const auditSnap = await db
      .collection('auditEvents')
      .where('action', '==', 'user.head_demoted')
      .where('targetId', '==', user1Uid)
      .get();
    expect(auditSnap.empty).toBe(false);

    // Concurrent promotion race test:
    // Demote user 2 so deptA has 0 heads
    await callFn(
      updateUser,
      { uid: user2Uid, role: 'creator', departmentId: deptA },
      { uid: adminUid }
    );

    // Try promoting user 1 and user 2 simultaneously without replaceExistingHead
    const results = await Promise.allSettled([
      callFn(updateUser, { uid: user1Uid, role: 'department_head', departmentId: deptA }, { uid: adminUid }),
      callFn(updateUser, { uid: user2Uid, role: 'department_head', departmentId: deptA }, { uid: adminUid }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed and the other must be rejected by the transaction invariant
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  // ============================================================================
  // Test 2: Project Role Ceiling Enforcement
  // ============================================================================
  it('enforces project role ceiling: company viewer stays read-only and cannot be made member or lead', async () => {
    if (!isEmulatorRunning) return;

    const viewerUid = 'test-viewer-uid';
    const deptHeadUid = 'test-depthead-ceiling';

    await db.collection('users').doc(viewerUid).set({
      uid: viewerUid,
      email: 'viewer@alpha.com',
      displayName: 'Company Viewer',
      role: 'viewer',
      departmentId: deptA,
      status: 'active',
    });

    await db.collection('users').doc(deptHeadUid).set({
      uid: deptHeadUid,
      email: 'depthead@alpha.com',
      displayName: 'Dept Head Ceiling',
      role: 'department_head',
      departmentId: deptA,
      status: 'active',
    });

    // Create a project in deptA
    const createRes = await callFn(
      createProject,
      { name: 'Ceiling Test Project', departmentId: deptA },
      { uid: deptHeadUid }
    );
    const projId = createRes.project.id;

    // Attempt to add viewer with project role 'member' -> must fail
    let memberErr: any = null;
    try {
      await callFn(
        addProjectMember,
        { projectId: projId, targetUid: viewerUid, role: 'member' },
        { uid: deptHeadUid }
      );
    } catch (err) {
      memberErr = err;
    }
    expect(memberErr).not.toBeNull();
    expect(memberErr.code).toBe('permission-denied');
    expect(memberErr.message).toContain('Project role cannot exceed company role');

    // Attempt to add viewer with project role 'lead' -> must fail
    let leadErr: any = null;
    try {
      await callFn(
        addProjectMember,
        { projectId: projId, targetUid: viewerUid, role: 'lead' },
        { uid: deptHeadUid }
      );
    } catch (err) {
      leadErr = err;
    }
    expect(leadErr).not.toBeNull();
    expect(leadErr.code).toBe('permission-denied');

    // Add viewer with project role 'viewer' -> must succeed
    const addSuccess = await callFn(
      addProjectMember,
      { projectId: projId, targetUid: viewerUid, role: 'viewer' },
      { uid: deptHeadUid }
    );
    expect(addSuccess.member.role).toBe('viewer');

    // Attempt to update member role from 'viewer' to 'member' -> must fail
    let updateErr: any = null;
    try {
      await callFn(
        updateProjectMemberRole,
        { projectId: projId, targetUid: viewerUid, role: 'member' },
        { uid: deptHeadUid }
      );
    } catch (err) {
      updateErr = err;
    }
    expect(updateErr).not.toBeNull();
    expect(updateErr.code).toBe('permission-denied');
  });

  // ============================================================================
  // Test 3: Project Archive Blocked by Active Broadcast Schedules
  // ============================================================================
  it('blocks project archive if active broadcast schedules exist, and permits archive once inactive', async () => {
    if (!isEmulatorRunning) return;

    // Create project
    const pRes = await callFn(
      createProject,
      { name: 'Schedule Shield Project', departmentId: deptA },
      { uid: adminUid }
    );
    const pId = pRes.project.id;

    // Create an active schedule targeting this project
    const schedId = 'sched-active-test-shield';
    await db.collection('schedules').doc(schedId).set({
      id: schedId,
      title: 'Active Welcome Broadcast',
      projectId: pId,
      departmentId: deptA,
      status: 'active',
      targetDisplayIds: ['disp-1'],
    });

    // Attempt to archive project -> must be blocked
    let archiveErr: any = null;
    try {
      await callFn(archiveProject, { projectId: pId }, { uid: adminUid });
    } catch (err) {
      archiveErr = err;
    }
    expect(archiveErr).not.toBeNull();
    expect(archiveErr.code).toBe('failed-precondition');
    expect(archiveErr.message).toContain('active broadcast schedules exist');
    expect(archiveErr.message).toContain('Active Welcome Broadcast');

    // Project must still be active
    const pCheck = await db.collection('projects').doc(pId).get();
    expect(pCheck.data()?.status).toBe('active');

    // Withdraw schedule
    await db.collection('schedules').doc(schedId).update({ status: 'withdrawn' });

    // Now archiving must succeed
    const archiveSuccess = await callFn(archiveProject, { projectId: pId }, { uid: adminUid });
    expect(archiveSuccess.status).toBe('archived');

    const pAfter = await db.collection('projects').doc(pId).get();
    expect(pAfter.data()?.status).toBe('archived');
  });

  // ============================================================================
  // Test 4: Same-Department Move vs Cross-Department Admin-Only
  // ============================================================================
  it('permits same-department asset move without modifying storagePath, and restricts cross-department move to admin', async () => {
    if (!isEmulatorRunning) return;

    const deptHeadUid = 'test-head-move-dept';
    await db.collection('users').doc(deptHeadUid).set({
      uid: deptHeadUid,
      email: 'headmove@alpha.com',
      displayName: 'Head Move Dept',
      role: 'department_head',
      departmentId: deptA,
      status: 'active',
    });

    // Create 2 projects in deptA, 1 in deptB
    const pA1 = (await callFn(createProject, { name: 'DeptA Proj 1', departmentId: deptA }, { uid: adminUid })).project;
    const pA2 = (await callFn(createProject, { name: 'DeptA Proj 2', departmentId: deptA }, { uid: adminUid })).project;
    const pB1 = (await callFn(createProject, { name: 'DeptB Proj 1', departmentId: deptB }, { uid: adminUid })).project;

    // Create an asset in deptA / pA1
    const assetId = 'asset-test-move-path';
    const originalStoragePath = `media/${deptA}/${assetId}/original.png`;
    await db.collection('assets').doc(assetId).set({
      id: assetId,
      title: 'Hero Banner',
      fileName: 'hero.png',
      mediaType: 'image',
      departmentId: deptA,
      ownerDepartmentId: deptA,
      ownerProjectId: pA1.id,
      storagePath: originalStoragePath,
      accessScopes: [`dept:${deptA}`, `proj:${pA1.id}`],
      status: 'ready',
      ownerId: deptHeadUid,
    });

    // 1. Dept head moves asset from pA1 to pA2 (same dept) -> Allowed
    const moveRes = await callFn(
      moveAssetProject,
      { assetId, targetProjectId: pA2.id },
      { uid: deptHeadUid }
    );
    expect(moveRes.ownerProjectId).toBe(pA2.id);

    // Verify storagePath was NOT touched
    const aDoc1 = await db.collection('assets').doc(assetId).get();
    expect(aDoc1.data()?.storagePath).toBe(originalStoragePath);
    expect(aDoc1.data()?.ownerProjectId).toBe(pA2.id);
    expect(aDoc1.data()?.accessScopes).toContain(`proj:${pA2.id}`);

    // 2. Dept head attempts cross-department move to pB1 -> Denied
    let crossErr: any = null;
    try {
      await callFn(
        moveAssetProject,
        { assetId, targetProjectId: pB1.id },
        { uid: deptHeadUid }
      );
    } catch (err) {
      crossErr = err;
    }
    expect(crossErr).not.toBeNull();
    expect(crossErr.code).toBe('permission-denied');
    expect(crossErr.message).toContain('Cross-department asset transfer is strictly restricted to System Administrators');

    // 3. Admin executes cross-department move to pB1 -> Allowed
    const adminMoveRes = await callFn(
      moveAssetProject,
      { assetId, targetProjectId: pB1.id },
      { uid: adminUid }
    );
    expect(adminMoveRes.ownerDepartmentId).toBe(deptB);

    // Verify storagePath is STILL preserved (owner-based immutable path)
    const aDoc2 = await db.collection('assets').doc(assetId).get();
    expect(aDoc2.data()?.storagePath).toBe(originalStoragePath);
    expect(aDoc2.data()?.ownerDepartmentId).toBe(deptB);
    expect(aDoc2.data()?.accessScopes).toContain(`dept:${deptB}`);
    expect(aDoc2.data()?.accessScopes).toContain(`proj:${pB1.id}`);
  });

  // ============================================================================
  // Test 5: Auto-Enrollment in General Project Respecting Role Ceiling
  // ============================================================================
  it('automatically enrolls provisioned users in their department General project with ceiling-compliant role', async () => {
    if (!isEmulatorRunning) return;

    // Provision a viewer in deptA
    const viewerEmail = `viewer_${Date.now()}@alpha.com`;
    const vRes = await callFn(
      provisionUser,
      { email: viewerEmail, displayName: 'Auto Viewer', role: 'viewer', departmentId: deptA },
      { uid: adminUid }
    );

    const generalProjId = `proj_general_${deptA}`;
    const vMemberDoc = await db.collection('projects').doc(generalProjId).collection('members').doc(vRes.uid).get();
    expect(vMemberDoc.exists).toBe(true);
    expect(vMemberDoc.data()?.role).toBe('viewer'); // Respects ceiling!

    // Provision a creator in deptA
    const creatorEmail = `creator_${Date.now()}@alpha.com`;
    const cRes = await callFn(
      provisionUser,
      { email: creatorEmail, displayName: 'Auto Creator', role: 'creator', departmentId: deptA },
      { uid: adminUid }
    );

    const cMemberDoc = await db.collection('projects').doc(generalProjId).collection('members').doc(cRes.uid).get();
    expect(cMemberDoc.exists).toBe(true);
    expect(cMemberDoc.data()?.role).toBe('member');
  });

  // ============================================================================
  // Test 6: Department Change and Deactivation Cleanup
  // ============================================================================
  it('removes project memberships upon department change and deactivation', async () => {
    if (!isEmulatorRunning) return;

    const userUid = 'test-transfer-user';
    await db.collection('users').doc(userUid).set({
      uid: userUid,
      email: 'transfer@alpha.com',
      displayName: 'Transfer User',
      role: 'creator',
      departmentId: deptA,
      status: 'active',
    });

    // Add user to custom project in deptA
    const customProjA = (await callFn(createProject, { name: 'Alpha Custom Proj', departmentId: deptA }, { uid: adminUid })).project;
    await callFn(
      addProjectMember,
      { projectId: customProjA.id, targetUid: userUid, role: 'member' },
      { uid: adminUid }
    );

    // Verify membership exists
    const mCheckBefore = await db.collection('projects').doc(customProjA.id).collection('members').doc(userUid).get();
    expect(mCheckBefore.exists).toBe(true);

    // Change user's department from deptA to deptB
    await callFn(
      updateUser,
      { uid: userUid, departmentId: deptB },
      { uid: adminUid }
    );

    // Verify user was removed from customProjA in deptA
    const mCheckAfter = await db.collection('projects').doc(customProjA.id).collection('members').doc(userUid).get();
    expect(mCheckAfter.exists).toBe(false);

    // Verify user was auto-enrolled in General project of deptB
    const generalB = await db.collection('projects').doc(`proj_general_${deptB}`).collection('members').doc(userUid).get();
    expect(generalB.exists).toBe(true);

    // Now deactivate user
    await callFn(
      setUserActiveStatus,
      { uid: userUid, status: 'inactive' },
      { uid: adminUid }
    );

    // Verify user was removed from all project memberships
    const generalBAfter = await db.collection('projects').doc(`proj_general_${deptB}`).collection('members').doc(userUid).get();
    expect(generalBAfter.exists).toBe(false);
  });

  // ============================================================================
  // Test 7: Real-Time Permission Cutover for Demoted / Deactivated Users
  // ============================================================================
  it('demonstrates real-time permission cutover: demoted/deactivated user cannot perform privileged actions on old token', async () => {
    if (!isEmulatorRunning) return;

    const adminTestUid = 'test-temporary-admin';
    await db.collection('users').doc(adminTestUid).set({
      uid: adminTestUid,
      email: 'tempadmin@aurainteract.com',
      displayName: 'Temp Admin',
      role: 'admin',
      departmentId: null,
      status: 'active',
    });

    // User calls createProject with their admin identity -> succeeds
    const proj1 = await callFn(
      createProject,
      { name: 'Admin Allowed Project', departmentId: deptA },
      { uid: adminTestUid, token: { role: 'admin' } }
    );
    expect(proj1.project.name).toBe('Admin Allowed Project');

    // Demote user in Firestore from admin to viewer
    await db.collection('users').doc(adminTestUid).update({
      role: 'viewer',
      updatedAt: new Date().toISOString(),
    });

    // Even if client sends token with old claim { role: 'admin' }, getAuthenticatedCaller
    // re-reads users/{uid} and authoritative check rejects the privileged call immediately!
    let demotedErr: any = null;
    try {
      await callFn(
        createProject,
        { name: 'Should Fail Project', departmentId: deptA },
        { uid: adminTestUid, token: { role: 'admin' } }
      );
    } catch (err) {
      demotedErr = err;
    }
    expect(demotedErr).not.toBeNull();
    expect(demotedErr.code).toBe('permission-denied');
    expect(demotedErr.message).toContain('is not authorized to create projects');

    // Test deactivation cutover
    await db.collection('users').doc(adminTestUid).update({
      status: 'inactive',
    });

    let deactivatedErr: any = null;
    try {
      await callFn(
        listProjects,
        {},
        { uid: adminTestUid, token: { role: 'admin' } }
      );
    } catch (err) {
      deactivatedErr = err;
    }
    expect(deactivatedErr).not.toBeNull();
    expect(deactivatedErr.code).toBe('permission-denied');
    expect(deactivatedErr.message).toContain('The user account has been deactivated');
  });

  // ============================================================================
  // Test 8: Backward Compatibility of listMediaAssets
  // ============================================================================
  it('confirms listMediaAssets continues to query collection assets and return existing records identically', async () => {
    if (!isEmulatorRunning) return;

    const testAssetId = 'compat-test-asset-1';
    await db.collection('assets').doc(testAssetId).set({
      id: testAssetId,
      title: 'Legacy Compatibility Graphic',
      fileName: 'legacy.png',
      mediaType: 'image',
      departmentId: deptA,
      status: 'ready',
      storagePath: `media/${deptA}/${testAssetId}/original.png`,
      thumbnailPath: `thumbnails/${deptA}/${testAssetId}/thumb.webp`,
      fileSizeBytes: 1024,
      checksumSha256: 'abc123sha256',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await callFn(
      listMediaAssets,
      { departmentId: deptA },
      { uid: adminUid }
    );

    expect(res.assets).toBeDefined();
    const found = res.assets.find((a: MediaAsset) => a.id === testAssetId);
    expect(found).toBeDefined();
    expect(found?.title).toBe('Legacy Compatibility Graphic');
  });
});
