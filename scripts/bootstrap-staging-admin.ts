/**
 * Aura DIMS - Controlled Staging Administrator Bootstrap Script
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Requirements:
 * 1. Requires explicit confirmation flag (AURA_STAGING_CONFIRM=true).
 * 2. Connects to the designated staging Firebase project using Google Application Default Credentials.
 * 3. Does NOT hardcode passwords.
 * 4. Generates a secure password reset link for initial account setup.
 * 5. Idempotent and safely repeatable.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const STAGING_PROJECT_ID = process.env.AURA_STAGING_PROJECT_ID || 'aura-dims-staging';
const ADMIN_EMAIL = process.env.AURA_STAGING_ADMIN_EMAIL || 'admin.staging@aurainteract.com';
const ADMIN_NAME = 'Staging System Administrator';

async function main() {
  console.log('\n========================================================');
  console.log(' Aura DIMS - Controlled Staging Admin Bootstrap');
  console.log(' Company: Aurainteract Private Limited');
  console.log('========================================================\n');

  if (process.env.AURA_STAGING_CONFIRM !== 'true') {
    console.error('[ABORTED] Staging bootstrap requires explicit safety flag:');
    console.error('Run with: AURA_STAGING_CONFIRM=true AURA_STAGING_PROJECT_ID=<projectId> node scripts/bootstrap-staging-admin.ts\n');
    process.exit(1);
  }

  console.log(`Target Staging Project : ${STAGING_PROJECT_ID}`);
  console.log(`Target Admin Email     : ${ADMIN_EMAIL}`);

  const app = getApps().length === 0
    ? initializeApp({ projectId: STAGING_PROJECT_ID })
    : getApps()[0]!;

  const auth = getAuth(app);
  const db = getFirestore(app);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(ADMIN_EMAIL);
    console.log(`[INFO] Existing Auth account found (UID: ${userRecord.uid}).`);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      console.log(`[INFO] Creating new Auth account for ${ADMIN_EMAIL}...`);
      userRecord = await auth.createUser({
        email: ADMIN_EMAIL,
        displayName: ADMIN_NAME,
        emailVerified: true,
      });
      console.log(`[SUCCESS] Auth user created (UID: ${userRecord.uid}).`);
    } else {
      throw err;
    }
  }

  // Set Admin custom claims
  console.log(`[INFO] Applying custom claims: role='admin', active=true...`);
  await auth.setCustomUserClaims(userRecord.uid, {
    role: 'admin',
    departmentId: null,
    active: true,
  });

  // Transactionally record user document and maintain systemMetadata/counts
  console.log(`[INFO] Verifying Firestore user profile...`);
  const userRef = db.collection('users').doc(userRecord.uid);
  const countsRef = db.collection('systemMetadata').doc('counts');

  await db.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    const countsDoc = await tx.get(countsRef);

    let activeAdminCount = 0;
    let totalUserCount = 0;
    if (countsDoc.exists) {
      const c = countsDoc.data() || {};
      activeAdminCount = Number(c.activeAdminCount || 0);
      totalUserCount = Number(c.totalUserCount || 0);
    }

    if (!userDoc.exists) {
      activeAdminCount += 1;
      totalUserCount += 1;
      tx.set(userRef, {
        uid: userRecord.uid,
        email: ADMIN_EMAIL,
        displayName: ADMIN_NAME,
        role: 'admin',
        departmentId: null,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(countsRef, {
        activeAdminCount,
        totalUserCount,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      tx.update(userRef, {
        role: 'admin',
        status: 'active',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  // Generate password reset link
  const resetLink = await auth.generatePasswordResetLink(ADMIN_EMAIL);
  console.log('\n--------------------------------------------------------');
  console.log('[SUCCESS] Staging Administrator account successfully provisioned!');
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log('To set the administrator password securely, complete setup via:');
  console.log(resetLink);
  console.log('--------------------------------------------------------\n');
}

main().catch((err) => {
  console.error('[ERROR] Staging bootstrap failed:', err);
  process.exit(1);
});

