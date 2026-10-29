import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

describe('Aura DIMS - Security Rules Suite', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const firestoreRules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
    const storageRules = readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: 'demo-rules-test',
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: firestoreRules,
      },
      storage: {
        host: '127.0.0.1',
        port: 9199,
        rules: storageRules,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
      await testEnv.clearStorage();

      // Seed baseline test documents with admin bypass context
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        // 1. Admin Profile
        await setDoc(doc(db, 'users/admin-1'), {
          uid: 'admin-1',
          email: 'admin@aurainteract.com',
          displayName: 'System Admin',
          role: 'admin',
          departmentId: null,
          status: 'active',
        });

        // 2. Department Head HR
        await setDoc(doc(db, 'users/head-hr'), {
          uid: 'head-hr',
          email: 'hrhead@aurainteract.com',
          displayName: 'HR Head',
          role: 'department_head',
          departmentId: 'dept-hr',
          status: 'active',
        });

        // 3. User in HR Department
        await setDoc(doc(db, 'users/user-hr-2'), {
          uid: 'user-hr-2',
          email: 'hrstaff@aurainteract.com',
          displayName: 'HR Staff',
          role: 'department_head',
          departmentId: 'dept-hr',
          status: 'active',
        });

        // 4. Department Head Operations
        await setDoc(doc(db, 'users/head-ops'), {
          uid: 'head-ops',
          email: 'opshead@aurainteract.com',
          displayName: 'Ops Head',
          role: 'department_head',
          departmentId: 'dept-ops',
          status: 'active',
        });

        // 5. Inactive User
        await setDoc(doc(db, 'users/inactive-user'), {
          uid: 'inactive-user',
          email: 'inactive@aurainteract.com',
          displayName: 'Inactive User',
          role: 'department_head',
          departmentId: 'dept-hr',
          status: 'inactive',
        });

        // 6. Departments
        await setDoc(doc(db, 'departments/dept-hr'), {
          id: 'dept-hr',
          name: 'Human Resources',
          code: 'HR',
          status: 'active',
        });

        await setDoc(doc(db, 'departments/dept-ops'), {
          id: 'dept-ops',
          name: 'Operations',
          code: 'OPS',
          status: 'active',
        });

        await setDoc(doc(db, 'departments/dept-archived'), {
          id: 'dept-archived',
          name: 'Archived Dept',
          code: 'ARCH',
          status: 'inactive',
        });

        // 7. Audit log
        await setDoc(doc(db, 'auditEvents/audit-1'), {
          actorId: 'admin-1',
          action: 'user.provision',
          targetId: 'head-hr',
          timestamp: new Date().toISOString(),
        });

        // 8. Media Assets in Firestore
        await setDoc(doc(db, 'assets/asset-hr-1'), {
          id: 'asset-hr-1',
          name: 'hr-handbook.png',
          fileName: 'hr-handbook.png',
          fileSizeBytes: 1024 * 50,
          mimeType: 'image/png',
          mediaType: 'image',
          storagePath: 'media/dept-hr/asset-hr-1/hr-handbook.png',
          thumbnailPath: 'thumbnails/dept-hr/asset-hr-1/thumb.webp',
          departmentId: 'dept-hr',
          ownerId: 'head-hr',
          status: 'ready',
          title: 'HR Handbook Cover',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'assets/asset-ops-1'), {
          id: 'asset-ops-1',
          name: 'ops-floor-plan.png',
          fileName: 'ops-floor-plan.png',
          fileSizeBytes: 1024 * 80,
          mimeType: 'image/png',
          mediaType: 'image',
          storagePath: 'media/dept-ops/asset-ops-1/ops-floor-plan.png',
          thumbnailPath: 'thumbnails/dept-ops/asset-ops-1/thumb.webp',
          departmentId: 'dept-ops',
          ownerId: 'head-ops',
          status: 'ready',
          title: 'Floor Plan Ops',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'assets/asset-intent-hr'), {
          id: 'asset-intent-hr',
          name: 'pending-slide.png',
          fileName: 'pending-slide.png',
          fileSizeBytes: 1024 * 20,
          mimeType: 'image/png',
          mediaType: 'image',
          stagingPath: 'staging/dept-hr/asset-intent-hr/pending-slide.png',
          departmentId: 'dept-hr',
          ownerId: 'head-hr',
          status: 'awaiting_upload',
          title: 'Pending HR Slide',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // 9. Designs in Firestore
        await setDoc(doc(db, 'designs/design-hr-1'), {
          id: 'design-hr-1',
          title: 'HR Welcome Presentation',
          departmentId: 'dept-hr',
          ownerId: 'head-hr',
          orientation: 'landscape',
          status: 'draft',
          revision: 1,
          slideCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'designs/design-ops-1'), {
          id: 'design-ops-1',
          title: 'Ops Shift Schedule',
          departmentId: 'dept-ops',
          ownerId: 'head-ops',
          orientation: 'portrait',
          status: 'draft',
          revision: 1,
          slideCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // 10. Templates in Firestore
        await setDoc(doc(db, 'templates/template-global-1'), {
          id: 'template-global-1',
          title: 'Global Notice Board',
          scope: 'global',
          departmentId: null,
          orientation: 'landscape',
          category: 'notice',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'templates/template-hr-1'), {
          id: 'template-hr-1',
          title: 'HR Department Poster',
          scope: 'department',
          departmentId: 'dept-hr',
          orientation: 'portrait',
          category: 'poster',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'templates/template-ops-1'), {
          id: 'template-ops-1',
          title: 'Ops Machinery Notice',
          scope: 'department',
          departmentId: 'dept-ops',
          orientation: 'landscape',
          category: 'announcement',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // 11. Design Revisions in Firestore
        await setDoc(doc(db, 'designRevisions/rev-hr-1'), {
          id: 'rev-hr-1',
          designId: 'design-hr-1',
          revisionNumber: 1,
          departmentId: 'dept-hr',
          creatorUid: 'head-hr',
          orientation: 'landscape',
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'designRevisions/rev-ops-1'), {
          id: 'rev-ops-1',
          designId: 'design-ops-1',
          revisionNumber: 1,
          departmentId: 'dept-ops',
          creatorUid: 'head-ops',
          orientation: 'portrait',
          createdAt: new Date().toISOString(),
        });

        // 12. Playlists in Firestore
        await setDoc(doc(db, 'playlists/pl-hr-1'), {
          id: 'pl-hr-1',
          name: 'HR Lobby Loop',
          departmentId: 'dept-hr',
          orientation: 'landscape',
          status: 'draft',
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'playlists/pl-ops-1'), {
          id: 'pl-ops-1',
          name: 'Ops Floor Loop',
          departmentId: 'dept-ops',
          orientation: 'portrait',
          status: 'draft',
          createdAt: new Date().toISOString(),
        });

        // 13. Playlist Revisions in Firestore
        await setDoc(doc(db, 'playlistRevisions/prev-hr-1'), {
          id: 'prev-hr-1',
          playlistId: 'pl-hr-1',
          revisionNumber: 1,
          departmentId: 'dept-hr',
          orientation: 'landscape',
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'playlistRevisions/prev-ops-1'), {
          id: 'prev-ops-1',
          playlistId: 'pl-ops-1',
          revisionNumber: 1,
          departmentId: 'dept-ops',
          orientation: 'portrait',
          createdAt: new Date().toISOString(),
        });

        // 14. Approvals in Firestore
        await setDoc(doc(db, 'approvals/apr-hr-1'), {
          id: 'apr-hr-1',
          scheduleId: 'sch-hr-1',
          playlistRevisionId: 'prev-hr-1',
          departmentId: 'dept-hr',
          status: 'pending_review',
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'approvals/apr-ops-1'), {
          id: 'apr-ops-1',
          scheduleId: 'sch-ops-1',
          playlistRevisionId: 'prev-ops-1',
          departmentId: 'dept-ops',
          status: 'pending_review',
          createdAt: new Date().toISOString(),
        });

        // 15. Schedules in Firestore
        await setDoc(doc(db, 'schedules/sch-hr-1'), {
          id: 'sch-hr-1',
          name: 'HR Broadcast Rule',
          departmentId: 'dept-hr',
          playlistRevisionId: 'prev-hr-1',
          status: 'active',
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'schedules/sch-ops-1'), {
          id: 'sch-ops-1',
          name: 'Ops Broadcast Rule',
          departmentId: 'dept-ops',
          playlistRevisionId: 'prev-ops-1',
          status: 'active',
          createdAt: new Date().toISOString(),
        });

        // 16. Publications in Firestore
        await setDoc(doc(db, 'publications/pub-hr-1'), {
          id: 'pub-hr-1',
          scheduleId: 'sch-hr-1',
          departmentId: 'dept-hr',
          status: 'prepared',
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'publications/pub-ops-1'), {
          id: 'pub-ops-1',
          scheduleId: 'sch-ops-1',
          departmentId: 'dept-ops',
          status: 'prepared',
          createdAt: new Date().toISOString(),
        });

        // 17. Digital Displays & Assignments in Firestore
        await setDoc(doc(db, 'displays/disp-hr-1'), {
          id: 'disp-hr-1',
          name: 'HR Lobby Digital Display',
          departmentId: 'dept-hr',
          orientation: 'landscape',
          status: 'active',
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'displays/disp-ops-1'), {
          id: 'disp-ops-1',
          name: 'Ops Shopfloor Digital Display',
          departmentId: 'dept-ops',
          orientation: 'portrait',
          status: 'active',
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'displayAssignments/asgn-hr-1'), {
          id: 'asgn-hr-1',
          displayId: 'disp-hr-1',
          departmentId: 'dept-hr',
          userId: 'head-hr',
          createdAt: new Date().toISOString(),
        });

        // Seed storage files with security rules bypassed
        const storage = context.storage();
        await uploadBytes(
          ref(storage, 'media/dept-hr/asset-hr-1/hr-handbook.png'),
          new Uint8Array([1, 2, 3, 4]),
          { contentType: 'image/png' }
        );
        await uploadBytes(
          ref(storage, 'media/dept-ops/asset-ops-1/ops-floor-plan.png'),
          new Uint8Array([5, 6, 7, 8]),
          { contentType: 'image/png' }
        );
        await uploadBytes(
          ref(storage, 'thumbnails/dept-hr/asset-hr-1/thumb.webp'),
          new Uint8Array([9, 10]),
          { contentType: 'image/webp' }
        );
      });
    }
  });

  describe('Unauthenticated Access Control', () => {
    it('denies unauthenticated read to /users', async () => {
      const context = testEnv.unauthenticatedContext();
      await assertFails(getDoc(doc(context.firestore(), 'users/admin-1')));
    });

    it('denies unauthenticated write to /users', async () => {
      const context = testEnv.unauthenticatedContext();
      await assertFails(setDoc(doc(context.firestore(), 'users/hacker'), { role: 'admin' }));
    });

    it('denies unauthenticated read to /departments', async () => {
      const context = testEnv.unauthenticatedContext();
      await assertFails(getDoc(doc(context.firestore(), 'departments/dept-hr')));
    });

    it('denies unauthenticated read to /auditEvents', async () => {
      const context = testEnv.unauthenticatedContext();
      await assertFails(getDoc(doc(context.firestore(), 'auditEvents/audit-1')));
    });

    it('denies unauthenticated read to /assets', async () => {
      const context = testEnv.unauthenticatedContext();
      await assertFails(getDoc(doc(context.firestore(), 'assets/asset-hr-1')));
    });

    it('denies unauthenticated write to /assets', async () => {
      const context = testEnv.unauthenticatedContext();
      await assertFails(
        setDoc(doc(context.firestore(), 'assets/tampered'), { title: 'Hack' })
      );
    });
  });

  describe('Admin Authorization Rules', () => {
    it('allows Admin to read any user profile', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'users/head-hr')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'users/head-ops')));
    });

    it('allows Admin to read all departments including inactive', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'departments/dept-archived')));
    });

    it('allows Admin to read audit events', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'auditEvents/audit-1')));
    });

    it('denies Admin direct client writes to /users (must use Cloud Functions)', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'users/head-hr'), { role: 'admin' }, { merge: true })
      );
    });

    it('denies Admin direct client writes to /auditEvents (must be append-only via backend)', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'auditEvents/audit-fake'), { action: 'tampered' })
      );
    });

    it('allows Admin to read media assets across any department', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'assets/asset-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'assets/asset-ops-1')));
    });

    it('denies Admin direct client writes to /assets (must use Cloud Functions)', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'assets/asset-new'), {
          title: 'Direct Write By Admin',
          departmentId: 'dept-hr',
        })
      );
      await assertFails(
        updateDoc(doc(adminCtx.firestore(), 'assets/asset-hr-1'), { title: 'Direct Edit' })
      );
      await assertFails(deleteDoc(doc(adminCtx.firestore(), 'assets/asset-hr-1')));
    });
  });

  describe('Department Head Scoped Access Control', () => {
    it('allows Department Head to read their own profile', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'users/head-hr')));
    });

    it('allows Department Head to read users in their own department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'users/user-hr-2')));
    });

    it('DENIES Department Head from reading users in another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'users/head-ops')));
    });

    it('DENIES Department Head from reading audit events', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'auditEvents/audit-1')));
    });

    it('DENIES Department Head from modifying user profile or self-escalating role', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(
        setDoc(doc(hrHeadCtx.firestore(), 'users/head-hr'), { role: 'admin' }, { merge: true })
      );
    });

    it('DENIES Department Head from reading inactive departments other than their own', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'departments/dept-archived')));
    });

    it('allows Department Head to read media assets in their active department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'assets/asset-hr-1')));
    });

    it('DENIES Department Head from reading media assets in another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'assets/asset-ops-1')));
    });

    it('allows uploading owner to read awaiting_upload staging intent', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'assets/asset-intent-hr')));
    });

    it('DENIES Department Head direct client writes to /assets (must use Cloud Functions)', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(
        setDoc(doc(hrHeadCtx.firestore(), 'assets/asset-new'), {
          title: 'Direct Client Asset',
          departmentId: 'dept-hr',
        })
      );
      await assertFails(
        updateDoc(doc(hrHeadCtx.firestore(), 'assets/asset-hr-1'), { title: 'Unauthorized Edit' })
      );
      await assertFails(deleteDoc(doc(hrHeadCtx.firestore(), 'assets/asset-hr-1')));
    });
  });

  describe('Cloud Storage Perimeter & Departmental Media Isolation', () => {
    it('denies unauthenticated uploads and downloads', async () => {
      const ctx = testEnv.unauthenticatedContext();
      const fileRef = ref(ctx.storage(), 'media/dept-hr/asset-hr-1/hr-handbook.png');
      await assertFails(uploadBytes(fileRef, new Uint8Array([1, 2, 3])));
      await assertFails(getBytes(fileRef));
    });

    it('allows Department Head to upload to allocated staging path with valid intent', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      const fileRef = ref(hrHeadCtx.storage(), 'staging/dept-hr/asset-intent-hr/pending-slide.png');
      await assertSucceeds(
        uploadBytes(fileRef, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/png' })
      );
    });

    it('DENIES staging upload if content type is unsupported (e.g. application/pdf)', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      const fileRef = ref(hrHeadCtx.storage(), 'staging/dept-hr/asset-intent-hr/pending-slide.png');
      await assertFails(
        uploadBytes(fileRef, new Uint8Array([1, 2, 3, 4]), { contentType: 'application/pdf' })
      );
    });

    it('DENIES staging upload if target department does not match user token', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      // Trying to upload into dept-ops staging
      const fileRef = ref(hrHeadCtx.storage(), 'staging/dept-ops/asset-intent-hr/pending-slide.png');
      await assertFails(
        uploadBytes(fileRef, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/png' })
      );
    });

    it('DENIES direct client write to permanent media/ path (Cloud Functions only)', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      const fileRef = ref(hrHeadCtx.storage(), 'media/dept-hr/asset-hr-1/direct-bypass.png');
      await assertFails(
        uploadBytes(fileRef, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/png' })
      );
    });

    it('DENIES direct client write to thumbnails/ path (Cloud Functions only)', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      const fileRef = ref(adminCtx.storage(), 'thumbnails/dept-hr/asset-hr-1/direct-thumb.webp');
      await assertFails(
        uploadBytes(fileRef, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/webp' })
      );
    });

    it('allows Department Head to read media from their active department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      const fileRef = ref(hrHeadCtx.storage(), 'media/dept-hr/asset-hr-1/hr-handbook.png');
      await assertSucceeds(getBytes(fileRef));
    });

    it('DENIES Department Head from reading media from another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      // Trying to read Ops media
      const fileRef = ref(hrHeadCtx.storage(), 'media/dept-ops/asset-ops-1/ops-floor-plan.png');
      await assertFails(getBytes(fileRef));
    });

    it('allows Admin to read media across any department', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      const hrRef = ref(adminCtx.storage(), 'media/dept-hr/asset-hr-1/hr-handbook.png');
      const opsRef = ref(adminCtx.storage(), 'media/dept-ops/asset-ops-1/ops-floor-plan.png');
      await assertSucceeds(getBytes(hrRef));
      await assertSucceeds(getBytes(opsRef));
    });
  });

  describe('Visual Designs Collection (/designs)', () => {
    it('allows Admin to read designs across all departments', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'designs/design-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'designs/design-ops-1')));
    });

    it('allows Department Head to read designs from own department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'designs/design-hr-1')));
    });

    it('DENIES Department Head from reading designs from another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'designs/design-ops-1')));
    });

    it('DENIES unauthenticated and inactive users from reading designs', async () => {
      const unauthCtx = testEnv.unauthenticatedContext();
      await assertFails(getDoc(doc(unauthCtx.firestore(), 'designs/design-hr-1')));

      const inactiveCtx = testEnv.authenticatedContext('inactive-user', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: false,
      });
      await assertFails(getDoc(doc(inactiveCtx.firestore(), 'designs/design-hr-1')));
    });

    it('DENIES direct client writes to /designs (mutations must go through Cloud Functions)', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'designs/direct-bypass'), {
          title: 'Direct Client Bypass',
        })
      );
      await assertFails(
        updateDoc(doc(adminCtx.firestore(), 'designs/design-hr-1'), {
          title: 'Hacked Title',
        })
      );
      await assertFails(deleteDoc(doc(adminCtx.firestore(), 'designs/design-hr-1')));
    });
  });

  describe('Reusable Templates Collection (/templates)', () => {
    it('allows Admin to read templates across all scopes and departments', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'templates/template-global-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'templates/template-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'templates/template-ops-1')));
    });

    it('allows Department Head to read global templates', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'templates/template-global-1')));
    });

    it('allows Department Head to read own departmental templates', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'templates/template-hr-1')));
    });

    it('DENIES Department Head from reading templates of another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'templates/template-ops-1')));
    });

    it('DENIES direct client writes to /templates (mutations must go through Cloud Functions)', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'templates/direct-bypass'), {
          title: 'Direct Client Bypass Template',
        })
      );
    });
  });

  describe('Design Revisions Collection (/designRevisions)', () => {
    it('allows Admin to read design revisions across all departments', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'designRevisions/rev-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'designRevisions/rev-ops-1')));
    });

    it('allows Department Head to read design revisions from own department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'designRevisions/rev-hr-1')));
    });

    it('DENIES Department Head from reading design revisions from another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'designRevisions/rev-ops-1')));
    });

    it('DENIES direct client writes to /designRevisions (mutations must go through Cloud Functions)', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'designRevisions/rev-direct'), {
          revisionNumber: 99,
        })
      );
    });
  });

  describe('Playlists & Playlist Revisions Collections (/playlists & /playlistRevisions)', () => {
    it('allows Admin to read playlists across all departments', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'playlists/pl-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'playlists/pl-ops-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'playlistRevisions/prev-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'playlistRevisions/prev-ops-1')));
    });

    it('allows Department Head to read playlists and playlist revisions from own department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'playlists/pl-hr-1')));
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'playlistRevisions/prev-hr-1')));
    });

    it('DENIES Department Head from reading playlists and revisions from another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'playlists/pl-ops-1')));
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'playlistRevisions/prev-ops-1')));
    });

    it('DENIES direct client writes to /playlists and /playlistRevisions', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'playlists/pl-direct'), {
          name: 'Hacked Playlist',
        })
      );
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'playlistRevisions/prev-direct'), {
          revisionNumber: 2,
        })
      );
    });
  });

  describe('Editorial Approvals Collection (/approvals)', () => {
    it('allows Admin to read approval requests across all departments', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'approvals/apr-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'approvals/apr-ops-1')));
    });

    it('allows Department Head to read approval requests from own department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'approvals/apr-hr-1')));
    });

    it('DENIES Department Head from reading approval requests from another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'approvals/apr-ops-1')));
    });

    it('DENIES direct client writes to /approvals (must go through Cloud Functions review/submit endpoints)', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'approvals/apr-direct'), {
          status: 'approved',
        })
      );
      await assertFails(
        updateDoc(doc(adminCtx.firestore(), 'approvals/apr-hr-1'), {
          status: 'approved',
        })
      );
    });
  });

  describe('Schedules & Publications Collections (/schedules & /publications)', () => {
    it('allows Admin to read schedules and publications across all departments', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'schedules/sch-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'schedules/sch-ops-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'publications/pub-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'publications/pub-ops-1')));
    });

    it('allows Department Head to read schedules and publications from own department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'schedules/sch-hr-1')));
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'publications/pub-hr-1')));
    });

    it('DENIES Department Head from reading schedules and publications from another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'schedules/sch-ops-1')));
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'publications/pub-ops-1')));
    });

    it('DENIES direct client writes to /schedules and /publications', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'schedules/sch-direct'), {
          name: 'Direct Bypass Schedule',
        })
      );
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'publications/pub-direct'), {
          status: 'published',
        })
      );
    });
  });

  describe('Digital Displays and Assignments (/displays & /displayAssignments)', () => {
    it('allows Admin to read digital displays across all departments', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'displays/disp-hr-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'displays/disp-ops-1')));
      await assertSucceeds(getDoc(doc(adminCtx.firestore(), 'displayAssignments/asgn-hr-1')));
    });

    it('allows Department Head to read digital displays and assignments for own department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'displays/disp-hr-1')));
      await assertSucceeds(getDoc(doc(hrHeadCtx.firestore(), 'displayAssignments/asgn-hr-1')));
    });

    it('DENIES Department Head from reading digital displays in another department', async () => {
      const hrHeadCtx = testEnv.authenticatedContext('head-hr', {
        role: 'department_head',
        departmentId: 'dept-hr',
        active: true,
      });
      await assertFails(getDoc(doc(hrHeadCtx.firestore(), 'displays/disp-ops-1')));
    });

    it('DENIES direct client writes to /displays and /displayAssignments', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'displays/disp-direct'), {
          name: 'Hacked Digital Display',
        })
      );
      await assertFails(
        setDoc(doc(adminCtx.firestore(), 'displayAssignments/asgn-direct'), {
          displayId: 'disp-hr-1',
        })
      );
    });

    it('DENIES digital display device identities from accessing administrative and departmental documents', async () => {
      const deviceCtx = testEnv.authenticatedContext('dvc_disp_hr_1', {
        role: 'device',
        principal: 'device',
        displayId: 'disp-hr-1',
      });

      // Digital display tokens cannot read users, departments, approvals, or general media assets
      await assertFails(getDoc(doc(deviceCtx.firestore(), 'users/admin-1')));
      await assertFails(getDoc(doc(deviceCtx.firestore(), 'approvals/appr-hr-1')));
      await assertFails(getDoc(doc(deviceCtx.firestore(), 'assets/asset-hr-1')));
      await assertFails(getDoc(doc(deviceCtx.firestore(), 'displays/disp-ops-1')));

      // Direct client writes are strictly denied for devices
      await assertFails(
        setDoc(doc(deviceCtx.firestore(), 'displays/disp-hr-1'), {
          reported: { appVersion: 'hacked' },
        })
      );
    });
  });
});
