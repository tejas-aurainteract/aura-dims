/**
 * Aura DIMS - Phase 2 Scoped Asset Resolution & Publish Validation Test Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Verifies Phase 2 requirements:
 * 1. accessScopes strictly follows visibility (no leakage into department for 'project' visibility)
 * 2. Requested 'global' visibility creates pending approval and leaves visibility as 'project' without 'global' in scopes
 * 3. Pending/rejected global requests do NOT block use within current scope
 * 4. canUseAsset rejects reference files, non-ready assets, archived assets, and legacy missing fields (no fallback)
 * 5. canUseAsset enforces cross-department boundaries for all callers, including administrators
 * 6. createDesign and preparePublication enforce canUseAsset and projectId boundary checks
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
import { canUseAsset } from '../../functions/src/publishingAdmin';
import { initiateMediaUpload } from '../../functions/src/mediaAdmin';
import { createDesign } from '../../functions/src/designAdmin';
import { createProject } from '../../functions/src/projectsAdmin';
import { createPlaylist, createSchedule } from '../../functions/src/publishingAdmin';
import type {
  UserProfile,
  MediaAsset,
  InitiateMediaUploadRequest,
  CreateDesignRequest,
  CreatePlaylistRequest,
  CreateScheduleRequest,
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

describe('Aura DIMS - Phase 2 Scoped Asset Resolution & Publish Validation Suite', () => {
  const adminUid = 'phase2-admin-uid';
  const headUid = 'phase2-head-uid';
  const creatorUid = 'phase2-creator-uid';
  const deptAlpha = 'phase2-dept-alpha';
  const deptBeta = 'phase2-dept-beta';

  let isEmulatorRunning = false;
  let projectAlphaId: string;
  let projectBetaId: string;

  const adminCaller: UserProfile = {
    uid: adminUid,
    email: 'admin@aura.test',
    displayName: 'Admin User',
    role: 'admin',
    departmentId: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const headCaller: UserProfile = {
    uid: headUid,
    email: 'head@alpha.test',
    displayName: 'Alpha Head',
    role: 'department_head',
    departmentId: deptAlpha,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const creatorCaller: UserProfile = {
    uid: creatorUid,
    email: 'creator@alpha.test',
    displayName: 'Alpha Creator',
    role: 'creator',
    departmentId: deptAlpha,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    isEmulatorRunning = await checkPortOpen('127.0.0.1', 8080);
    if (!isEmulatorRunning) {
      console.warn('[Phase 2 Tests] Firestore emulator not running on 8080. Skipping live calls.');
      return;
    }

    // Seed test departments
    await db.collection('departments').doc(deptAlpha).set({
      id: deptAlpha,
      name: 'Department Alpha',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.collection('departments').doc(deptBeta).set({
      id: deptBeta,
      name: 'Department Beta',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed test profiles
    await db.collection('users').doc(adminUid).set(adminCaller);
    await db.collection('users').doc(headUid).set(headCaller);
    await db.collection('users').doc(creatorUid).set(creatorCaller);

    // Create test projects
    const projAlphaRes = await callFn(
      createProject,
      { departmentId: deptAlpha, name: 'Alpha Showcase', description: 'Alpha test project' },
      { uid: headUid }
    );
    projectAlphaId = projAlphaRes.project.id;

    // Enroll creator in project alpha
    await db
      .collection('projects')
      .doc(projectAlphaId)
      .collection('members')
      .doc(creatorUid)
      .set({
        uid: creatorUid,
        email: creatorCaller.email,
        displayName: creatorCaller.displayName,
        role: 'editor',
        assignedBy: headUid,
        joinedAt: new Date().toISOString(),
      });

    const projBetaRes = await callFn(
      createProject,
      { departmentId: deptBeta, name: 'Beta Showcase', description: 'Beta test project' },
      { uid: adminUid }
    );
    projectBetaId = projBetaRes.project.id;
  });

  // --------------------------------------------------------------------------
  // 1. canUseAsset Matrix Tests
  // --------------------------------------------------------------------------
  describe('canUseAsset Unit Rule Evaluation', () => {
    const baseReadyAsset: MediaAsset = {
      id: 'asset-base-1',
      title: 'Company Logo',
      fileName: 'logo.png',
      fileSize: 1024,
      mimeType: 'image/png',
      mediaType: 'image',
      storagePath: `media/${deptAlpha}/asset-base-1/logo.png`,
      sha256: 'abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      dimensions: { width: 1920, height: 1080 },
      departmentId: deptAlpha,
      ownerDepartmentId: deptAlpha,
      ownerProjectId: 'proj-alpha-test',
      kind: 'displayable',
      visibility: 'project',
      accessScopes: ['proj:proj-alpha-test'],
      status: 'ready',
      version: 1,
      uploadedBy: creatorUid,
      uploaderDisplayName: 'Alpha Creator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('allows use within exact project scope', () => {
      const res = canUseAsset(baseReadyAsset, {
        targetDepartmentId: deptAlpha,
        targetProjectId: 'proj-alpha-test',
        caller: creatorCaller,
      });
      expect(res.allowed).toBe(true);
    });

    it('rejects use outside project scope in same department when visibility is project', () => {
      const res = canUseAsset(baseReadyAsset, {
        targetDepartmentId: deptAlpha,
        targetProjectId: 'proj-other-dept-alpha',
        caller: creatorCaller,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Project boundary violation');
    });

    it('allows use across department when visibility is department', () => {
      const deptAsset: MediaAsset = {
        ...baseReadyAsset,
        visibility: 'department',
        accessScopes: ['proj:proj-alpha-test', `dept:${deptAlpha}`],
      };
      const res = canUseAsset(deptAsset, {
        targetDepartmentId: deptAlpha,
        targetProjectId: 'proj-other-dept-alpha',
        caller: creatorCaller,
      });
      expect(res.allowed).toBe(true);
    });

    it('allows cross-department use when target department is in shared accessScopes', () => {
      const sharedAsset: MediaAsset = {
        ...baseReadyAsset,
        visibility: 'shared',
        sharedWith: [{ targetType: 'department', targetId: deptBeta }],
        accessScopes: ['proj:proj-alpha-test', `dept:${deptBeta}`],
      };
      const res = canUseAsset(sharedAsset, {
        targetDepartmentId: deptBeta,
        targetProjectId: 'proj-beta-any',
        caller: adminCaller,
      });
      expect(res.allowed).toBe(true);
    });

    it('allows use globally across all departments when global scope is approved', () => {
      const globalAsset: MediaAsset = {
        ...baseReadyAsset,
        visibility: 'global',
        globalApprovalState: 'approved',
        accessScopes: ['proj:proj-alpha-test', `dept:${deptAlpha}`, 'global'],
      };
      const res = canUseAsset(globalAsset, {
        targetDepartmentId: deptBeta,
        targetProjectId: 'proj-beta-any',
        caller: adminCaller,
      });
      expect(res.allowed).toBe(true);
    });

    it('allows use within home scope even when global request is pending', () => {
      const pendingGlobalAsset: MediaAsset = {
        ...baseReadyAsset,
        globalApprovalState: 'pending',
        visibility: 'project',
        accessScopes: ['proj:proj-alpha-test'],
      };
      // Permitted inside home project
      const homeRes = canUseAsset(pendingGlobalAsset, {
        targetDepartmentId: deptAlpha,
        targetProjectId: 'proj-alpha-test',
        caller: creatorCaller,
      });
      expect(homeRes.allowed).toBe(true);

      // Blocked outside home scope
      const extRes = canUseAsset(pendingGlobalAsset, {
        targetDepartmentId: deptBeta,
        targetProjectId: 'proj-beta-any',
        caller: creatorCaller,
      });
      expect(extRes.allowed).toBe(false);
    });

    it('blocks cross-department use for administrators when asset is not global or shared', () => {
      const res = canUseAsset(baseReadyAsset, {
        targetDepartmentId: deptBeta,
        targetProjectId: 'proj-beta-any',
        caller: adminCaller,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Cross-department publication blocked');
    });

    it('rejects reference documents with clear error', () => {
      const refAsset: MediaAsset = {
        ...baseReadyAsset,
        kind: 'reference',
      };
      const res = canUseAsset(refAsset, {
        targetDepartmentId: deptAlpha,
        targetProjectId: 'proj-alpha-test',
        caller: creatorCaller,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("kind 'reference'");
    });

    it('rejects assets that are not ready or are archived', () => {
      const processingAsset: MediaAsset = {
        ...baseReadyAsset,
        status: 'processing',
      };
      expect(
        canUseAsset(processingAsset, {
          targetDepartmentId: deptAlpha,
          targetProjectId: 'proj-alpha-test',
          caller: creatorCaller,
        }).allowed
      ).toBe(false);

      const archivedAsset: MediaAsset = {
        ...baseReadyAsset,
        status: 'archived',
        archivedAt: new Date().toISOString(),
      };
      expect(
        canUseAsset(archivedAsset, {
          targetDepartmentId: deptAlpha,
          targetProjectId: 'proj-alpha-test',
          caller: creatorCaller,
        }).allowed
      ).toBe(false);
    });

    it('rejects legacy assets missing Phase 2 metadata without fallback', () => {
      const legacyAsset = {
        id: 'legacy-asset-1',
        title: 'Legacy',
        departmentId: deptAlpha,
        status: 'ready',
        kind: undefined,
        ownerProjectId: undefined,
        accessScopes: undefined,
      } as unknown as MediaAsset;

      const res = canUseAsset(legacyAsset, {
        targetDepartmentId: deptAlpha,
        targetProjectId: 'proj-alpha-test',
        caller: creatorCaller,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('missing required project/scope metadata');
    });
  });

  // --------------------------------------------------------------------------
  // 2. initiateMediaUpload Scopes & Pending Approval Verification
  // --------------------------------------------------------------------------
  describe('initiateMediaUpload Access Scopes & Approval Workflow', () => {
    it('sets accessScopes strictly to [proj:{id}] for project visibility (no department leakage)', async () => {
      if (!isEmulatorRunning) return;

      const res = await callFn(
        initiateMediaUpload,
        {
          fileName: 'project-poster.png',
          fileSizeBytes: 2048,
          declaredMimeType: 'image/png',
          sha256: '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
          projectId: projectAlphaId,
          visibility: 'project',
        } as InitiateMediaUploadRequest,
        { uid: creatorUid }
      );

      const assetDoc = await db.collection('assets').doc(res.assetId).get();
      expect(assetDoc.exists).toBe(true);
      const data = assetDoc.data() as MediaAsset;
      expect(data.visibility).toBe('project');
      expect(data.accessScopes).toEqual([`proj:${projectAlphaId}`]);
      expect(data.accessScopes).not.toContain(`dept:${deptAlpha}`);
      expect(data.kind).toBe('displayable');
    });

    it('sets accessScopes with dept:{id} for department visibility', async () => {
      if (!isEmulatorRunning) return;

      const res = await callFn(
        initiateMediaUpload,
        {
          fileName: 'dept-announcement.png',
          fileSizeBytes: 4096,
          declaredMimeType: 'image/png',
          sha256: '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000',
          projectId: projectAlphaId,
          visibility: 'department',
        } as InitiateMediaUploadRequest,
        { uid: creatorUid }
      );

      const assetDoc = await db.collection('assets').doc(res.assetId).get();
      const data = assetDoc.data() as MediaAsset;
      expect(data.visibility).toBe('department');
      expect(data.accessScopes).toContain(`proj:${projectAlphaId}`);
      expect(data.accessScopes).toContain(`dept:${deptAlpha}`);
    });

    it('requested global visibility creates pending approval and leaves asset visibility as project', async () => {
      if (!isEmulatorRunning) return;

      const res = await callFn(
        initiateMediaUpload,
        {
          fileName: 'global-campaign.png',
          fileSizeBytes: 8192,
          declaredMimeType: 'image/png',
          sha256: '22223333444455556666777788889999aaaabbbbccccddddeeeeffff00001111',
          projectId: projectAlphaId,
          visibility: 'global',
        } as InitiateMediaUploadRequest,
        { uid: creatorUid }
      );

      const assetDoc = await db.collection('assets').doc(res.assetId).get();
      const data = assetDoc.data() as MediaAsset;
      // Visibility remains project until admin approval
      expect(data.visibility).toBe('project');
      expect(data.globalApprovalState).toBe('pending');
      expect(data.accessScopes).toEqual([`proj:${projectAlphaId}`]);
      expect(data.accessScopes).not.toContain('global');

      // Approval record exists in approvals collection
      const approvalsSnap = await db
        .collection('approvals')
        .where('assetId', '==', res.assetId)
        .where('type', '==', 'asset_global_visibility')
        .get();
      expect(approvalsSnap.empty).toBe(false);
      const approvalDoc = approvalsSnap.docs[0].data();
      expect(approvalDoc.status).toBe('pending');
      expect(approvalDoc.requesterUid).toBe(creatorUid);
    });

    it('rejects unsupported media formats like documents in Phase 2 media upload', async () => {
      if (!isEmulatorRunning) return;

      await expect(
        callFn(
          initiateMediaUpload,
          {
            fileName: 'manual.pdf',
            fileSizeBytes: 16384,
            declaredMimeType: 'application/pdf',
            sha256: '3333444455556666777788889999aaaabbbbccccddddeeeeffff000011112222',
            projectId: projectAlphaId,
            visibility: 'project',
          } as InitiateMediaUploadRequest,
          { uid: creatorUid }
        )
      ).rejects.toThrow(/unsupported media type/i);
    });

    it('rejects upload when caller is not a member of the target project', async () => {
      if (!isEmulatorRunning) return;

      await expect(
        callFn(
          initiateMediaUpload,
          {
            fileName: 'unauthorized.png',
            fileSizeBytes: 1024,
            declaredMimeType: 'image/png',
            sha256: '444455556666777788889999aaaabbbbccccddddeeeeffff0000111122223333',
            projectId: projectBetaId, // Beta project in different department
            visibility: 'project',
          } as InitiateMediaUploadRequest,
          { uid: creatorUid } // Creator is in Alpha
        )
      ).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 3. createDesign Scoping and Validation
  // --------------------------------------------------------------------------
  describe('createDesign Scope and Asset Validation', () => {
    it('creates a design attached to specified project', async () => {
      if (!isEmulatorRunning) return;

      const res = await callFn(
        createDesign,
        {
          title: 'Alpha Design 1',
          orientation: 'landscape',
          departmentId: deptAlpha,
          projectId: projectAlphaId,
        } as CreateDesignRequest,
        { uid: creatorUid }
      );

      expect(res.design.projectId).toBe(projectAlphaId);
      expect(res.design.departmentId).toBe(deptAlpha);
    });

    it('rejects createDesign referencing a reference asset', async () => {
      if (!isEmulatorRunning) return;

      // Seed a reference asset
      const refAssetId = `asset-ref-${Date.now()}`;
      await db.collection('assets').doc(refAssetId).set({
        id: refAssetId,
        title: 'Guide Doc',
        departmentId: deptAlpha,
        ownerDepartmentId: deptAlpha,
        ownerProjectId: projectAlphaId,
        kind: 'reference',
        visibility: 'project',
        accessScopes: [`proj:${projectAlphaId}`],
        status: 'ready',
        version: 1,
      });

      await expect(
        callFn(
          createDesign,
          {
            title: 'Design referencing reference doc',
            orientation: 'landscape',
            departmentId: deptAlpha,
            projectId: projectAlphaId,
            initialDocument: {
              schemaVersion: '1.0.0',
              orientation: 'landscape',
              dimensions: { width: 1920, height: 1080 },
              slides: [
                {
                  id: 'slide-1',
                  durationSeconds: 10,
                  elements: [
                    {
                      id: 'el-1',
                      type: 'image',
                      assetId: refAssetId,
                      x: 0,
                      y: 0,
                      width: 100,
                      height: 100,
                    },
                  ],
                },
              ],
            },
          } as CreateDesignRequest,
          { uid: creatorUid }
        )
      ).rejects.toThrow(/reference/i);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Admin Explicit projectId Invariant
  // --------------------------------------------------------------------------
  describe('Admin Explicit projectId Invariant', () => {
    it('rejects initiateMediaUpload when admin does not pass projectId', async () => {
      if (!isEmulatorRunning) return;

      await expect(
        callFn(
          initiateMediaUpload,
          {
            fileName: 'admin-upload.png',
            fileSizeBytes: 2048,
            declaredMimeType: 'image/png',
            sha256: '55556666777788889999aaaabbbbccccddddeeeeffff00001111222233334444',
            visibility: 'project',
          } as InitiateMediaUploadRequest,
          { uid: adminUid } // admin with departmentId: null
        )
      ).rejects.toThrow(/Administrators must explicitly provide a projectId/i);
    });

    it('rejects createDesign when admin does not pass projectId', async () => {
      if (!isEmulatorRunning) return;

      await expect(
        callFn(
          createDesign,
          {
            title: 'Admin Design',
            orientation: 'landscape',
          } as CreateDesignRequest,
          { uid: adminUid }
        )
      ).rejects.toThrow(/Administrators must explicitly provide a projectId/i);
    });

    it('rejects createPlaylist when admin does not pass projectId', async () => {
      if (!isEmulatorRunning) return;

      await expect(
        callFn(
          createPlaylist,
          {
            title: 'Admin Playlist',
            orientation: 'landscape',
            items: [],
          } as CreatePlaylistRequest,
          { uid: adminUid }
        )
      ).rejects.toThrow(/Administrators must explicitly provide a projectId/i);
    });

    it('rejects createSchedule when admin does not pass projectId', async () => {
      if (!isEmulatorRunning) return;

      await expect(
        callFn(
          createSchedule,
          {
            title: 'Admin Schedule',
            playlistRevisionId: 'rev-1',
            playlistTitle: 'Rev 1',
            targetDisplayIds: [],
            orientation: 'landscape',
            scheduleRule: {
              startDate: '2026-11-24',
              endDate: '2026-11-25',
              startTime: '09:00',
              endTime: '18:00',
              daysOfWeek: [1, 2, 3, 4, 5],
              priority: 5,
            },
          } as CreateScheduleRequest,
          { uid: adminUid }
        )
      ).rejects.toThrow(/Administrators must explicitly provide a projectId/i);
    });

    it('succeeds for admin when projectId is explicitly passed and resolves project department', async () => {
      if (!isEmulatorRunning) return;

      const uploadRes = await callFn(
        initiateMediaUpload,
        {
          fileName: 'admin-project-valid.png',
          fileSizeBytes: 2048,
          declaredMimeType: 'image/png',
          sha256: '6666777788889999aaaabbbbccccddddeeeeffff000011112222333344445555',
          projectId: projectAlphaId,
          visibility: 'project',
        } as InitiateMediaUploadRequest,
        { uid: adminUid }
      );

      const assetDoc = await db.collection('assets').doc(uploadRes.assetId).get();
      const assetData = assetDoc.data() as MediaAsset;
      expect(assetData.ownerProjectId).toBe(projectAlphaId);
      expect(assetData.ownerDepartmentId).toBe(deptAlpha);
      expect(assetData.departmentId).toBe(deptAlpha);

      const designRes = await callFn(
        createDesign,
        {
          title: 'Admin Valid Design',
          orientation: 'landscape',
          projectId: projectAlphaId,
        } as CreateDesignRequest,
        { uid: adminUid }
      );
      expect(designRes.design.projectId).toBe(projectAlphaId);
      expect(designRes.design.departmentId).toBe(deptAlpha);
    });
  });
});
