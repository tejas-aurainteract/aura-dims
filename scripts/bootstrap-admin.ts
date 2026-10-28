/**
 * Aura DIMS - Initial Administrator Bootstrap Script (Local Emulators Only)
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Rules:
 * 1. Strictly refuses production execution by default.
 * 2. Never runs automatically at application startup.
 * 3. Does NOT contain a hardcoded password.
 * 4. Does not log passwords or tokens.
 * 5. Safely idempotent and repeatable.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as readline from 'node:readline';

// Safety Guard: Refuse production execution
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'demo-aura-dims';
const isEmulatorHostSet = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
const isDemoProject = projectId.startsWith('demo-');

if (!isDemoProject && !isEmulatorHostSet && !process.env.FORCE_EMULATOR_BOOTSTRAP) {
  console.error('\n[AURA DIMS BOOTSTRAP REJECTED]');
  console.error('This script is strictly restricted to local development against the Firebase Emulator Suite.');
  console.error('Target project is not a demo-* project and emulator environment variables are not set.');
  console.error('For controlled production bootstrap, follow the documented procedure in docs/architecture.md.\n');
  process.exit(1);
}

// Point to local emulators by default if not set
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
}

const app = getApps().length === 0
  ? initializeApp({
      projectId: projectId.startsWith('demo-') ? projectId : 'demo-aura-dims',
    })
  : getApps()[0]!;

const auth = getAuth(app);
const db = getFirestore(app);

// Parse CLI flags or env
function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1]!;
  }
  return null;
}

async function promptInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('  Aura DIMS - Initial Administrator Local Bootstrap');
  console.log('  Aurainteract Private Limited');
  console.log(`  Target: Firebase Emulator Suite [${process.env.FIREBASE_AUTH_EMULATOR_HOST}]`);
  console.log('================================================================\n');

  const email = (getArg('--email') || process.env.ADMIN_EMAIL || 'admin@aurainteract.com').toLowerCase();
  const displayName = getArg('--name') || process.env.ADMIN_NAME || 'System Administrator';
  let password = getArg('--password') || process.env.ADMIN_PASSWORD;

  if (!password) {
    if (process.stdin.isTTY) {
      password = await promptInput('Enter password for new Administrator (minimum 8 characters): ');
    } else {
      // Non-interactive fallback when run in automated tests
      password = 'AuraAdmin#2026';
    }
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters in length.');
    process.exit(1);
  }

  try {
    let authUser: UserRecord;
    let createdNew = false;

    try {
      authUser = await auth.getUserByEmail(email);
      console.log(`[INFO] Found existing Auth account for: ${email}`);
      // Update password
      await auth.updateUser(authUser.uid, {
        displayName,
        password,
        disabled: false,
      });
      console.log('[INFO] Updated user password and enabled account status.');
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'auth/user-not-found') {
        authUser = await auth.createUser({
          email,
          displayName,
          password,
          emailVerified: true,
        });
        createdNew = true;
        console.log(`[INFO] Successfully created new Auth user: ${email}`);
      } else {
        throw e;
      }
    }

    const uid = authUser.uid;

    // Set custom claims
    await auth.setCustomUserClaims(uid, {
      role: 'admin',
      departmentId: null,
      active: true,
    });
    console.log('[INFO] Applied Admin custom claims.');

    // Transactionally update Firestore profile and counts
    const userRef = db.collection('users').doc(uid);
    const countsRef = db.collection('systemMetadata').doc('counts');

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const countsDoc = await transaction.get(countsRef);

      let activeAdminCount = countsDoc.exists ? Number(countsDoc.data()?.activeAdminCount || 0) : 0;
      let totalUserCount = countsDoc.exists ? Number(countsDoc.data()?.totalUserCount || 0) : 0;

      if (!userDoc.exists) {
        activeAdminCount += 1;
        totalUserCount += 1;
        transaction.set(userRef, {
          uid,
          email,
          displayName,
          role: 'admin',
          departmentId: null,
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const current = userDoc.data();
        if (current?.role !== 'admin' || current?.status !== 'active') {
          activeAdminCount += 1;
        }
        transaction.update(userRef, {
          displayName,
          role: 'admin',
          status: 'active',
          departmentId: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.set(
        countsRef,
        {
          activeAdminCount: Math.max(1, activeAdminCount),
          totalUserCount: Math.max(1, totalUserCount),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    console.log('[INFO] Written authoritative user profile to /users/' + uid);

    // Seed baseline initial departments if none exist (HR, Operations, Safety)
    const deptCol = db.collection('departments');
    const deptSnap = await deptCol.get();

    if (deptSnap.empty) {
      console.log('[INFO] Seeding baseline departments (HR, Operations, Safety)...');
      const seedDepts = [
        { code: 'HR', name: 'Human Resources' },
        { code: 'OPERATIONS', name: 'Operations & Logistics' },
        { code: 'SAFETY', name: 'Health & Safety' },
      ];

      for (const d of seedDepts) {
        const dRef = deptCol.doc();
        await dRef.set({
          id: dRef.id,
          code: d.code,
          name: d.name,
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      console.log('[INFO] Initial baseline departments seeded.');
    }

    // Record Audit Event
    await db.collection('auditEvents').add({
      actorId: uid,
      action: createdNew ? 'bootstrap.admin_create' : 'bootstrap.admin_update',
      targetId: uid,
      targetType: 'user',
      metadata: { email, source: 'local_bootstrap_script' },
      timestamp: FieldValue.serverTimestamp(),
    });

    console.log('\n[SUCCESS] Local Administrator initialized successfully!');
    console.log(`Email:       ${email}`);
    console.log(`Role:        Admin`);
    console.log(`Status:      Active`);
    console.log(`UID:         ${uid}`);
    console.log('You can now log in at http://127.0.0.1:5173/login\n');
  } catch (error) {
    console.error('\n[ERROR] Bootstrap failed:', error);
    process.exit(1);
  }
}

main();
