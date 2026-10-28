import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

describe('Aura DIMS - Milestone 2 Security Rules Suite', () => {
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

      // Seed baseline test profiles with admin bypass context
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
      // Attempt to read Ops Head profile
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
  });

  describe('Cloud Storage Perimeter', () => {
    it('denies unauthenticated uploads', async () => {
      const ctx = testEnv.unauthenticatedContext();
      const fileRef = ref(ctx.storage(), 'assets/slide.png');
      await assertFails(uploadBytes(fileRef, new Uint8Array([1, 2, 3])));
    });

    it('denies unauthenticated downloads', async () => {
      const ctx = testEnv.unauthenticatedContext();
      const fileRef = ref(ctx.storage(), 'assets/slide.png');
      await assertFails(getBytes(fileRef));
    });

    it('denies direct client uploads without storage authorization milestone', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-1', { role: 'admin', active: true });
      const fileRef = ref(adminCtx.storage(), 'assets/slide.png');
      await assertFails(uploadBytes(fileRef, new Uint8Array([1, 2, 3])));
    });
  });
});
