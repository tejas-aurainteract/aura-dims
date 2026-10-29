/**
 * Aura DIMS - Minimal Staging Fixtures Seeder
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Seeds a clean, isolated staging environment with:
 * - 2 Departments (Manufacturing & Engineering)
 * - 2 Department Heads
 * - 1 Site (Surat Tech Complex)
 * - 2 Digital Displays (1 Landscape 1920x1080, 1 Portrait 1080x1920)
 * - Display assignments
 *
 * Idempotent: Skips records that already exist.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const STAGING_PROJECT_ID = process.env.AURA_STAGING_PROJECT_ID || 'aura-dims-staging';

async function main() {
  console.log('\n========================================================');
  console.log(' Aura DIMS - Staging Test Dataset Seeder');
  console.log(' Company: Aurainteract Private Limited');
  console.log('========================================================\n');

  if (process.env.AURA_STAGING_CONFIRM !== 'true') {
    console.error('[ABORTED] Staging seeding requires explicit confirmation flag:');
    console.error('Run with: AURA_STAGING_CONFIRM=true AURA_STAGING_PROJECT_ID=<projectId> node scripts/seed-staging.ts\n');
    process.exit(1);
  }

  const app = getApps().length === 0
    ? initializeApp({ projectId: STAGING_PROJECT_ID })
    : getApps()[0]!;

  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`[INFO] Connecting to project: ${STAGING_PROJECT_ID}`);

  // 1. Departments
  const departments = [
    { code: 'STG-MFG', name: 'Manufacturing Operations (Staging)', description: 'Staging test department for plant operations' },
    { code: 'STG-ENG', name: 'Product Engineering (Staging)', description: 'Staging test department for R&D displays' },
  ];

  const deptIds: Record<string, string> = {};
  for (const dept of departments) {
    const existing = await db.collection('departments').where('code', '==', dept.code).limit(1).get();
    if (!existing.empty) {
      deptIds[dept.code] = existing.docs[0].id;
      console.log(`[EXISTS] Department '${dept.name}' (ID: ${deptIds[dept.code]})`);
    } else {
      const ref = db.collection('departments').doc();
      await ref.set({
        id: ref.id,
        name: dept.name,
        code: dept.code,
        description: dept.description,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      deptIds[dept.code] = ref.id;
      console.log(`[CREATED] Department '${dept.name}' (ID: ${ref.id})`);
    }
  }

  // 2. Department Heads
  const heads = [
    { email: 'head.mfg.staging@aurainteract.com', name: 'Staging MFG Lead', deptCode: 'STG-MFG' },
    { email: 'head.eng.staging@aurainteract.com', name: 'Staging ENG Lead', deptCode: 'STG-ENG' },
  ];

  const headUids: Record<string, string> = {};
  for (const h of heads) {
    let uid: string;
    try {
      const u = await auth.getUserByEmail(h.email);
      uid = u.uid;
      console.log(`[EXISTS] Auth user '${h.email}' (UID: ${uid})`);
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        const u = await auth.createUser({
          email: h.email,
          displayName: h.name,
          emailVerified: true,
        });
        uid = u.uid;
        console.log(`[CREATED] Auth user '${h.email}' (UID: ${uid})`);
      } else {
        throw err;
      }
    }
    headUids[h.deptCode] = uid;

    const deptId = deptIds[h.deptCode]!;
    await auth.setCustomUserClaims(uid, {
      role: 'department_head',
      departmentId: deptId,
      active: true,
    });

    await db.collection('users').doc(uid).set({
      uid,
      email: h.email,
      displayName: h.name,
      role: 'department_head',
      departmentId: deptId,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  // 3. Site
  let siteId: string;
  const siteQuery = await db.collection('sites').where('name', '==', 'Surat Tech Complex - Staging Lab').limit(1).get();
  if (!siteQuery.empty) {
    siteId = siteQuery.docs[0].id;
    console.log(`[EXISTS] Site 'Surat Tech Complex - Staging Lab' (ID: ${siteId})`);
  } else {
    const siteRef = db.collection('sites').doc();
    await siteRef.set({
      id: siteRef.id,
      name: 'Surat Tech Complex - Staging Lab',
      location: 'Surat, Gujarat, India',
      timezone: 'Asia/Kolkata',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    siteId = siteRef.id;
    console.log(`[CREATED] Site 'Surat Tech Complex - Staging Lab' (ID: ${siteId})`);
  }

  // 4. Digital Displays
  const displays = [
    {
      name: 'STG Display Landscape 01',
      orientation: 'landscape' as const,
      resolution: { width: 1920, height: 1080 },
      location: 'Assembly Floor Hall B',
      deptCode: 'STG-MFG',
    },
    {
      name: 'STG Display Portrait 01',
      orientation: 'portrait' as const,
      resolution: { width: 1080, height: 1920 },
      location: 'R&D Labs Entrance Totem',
      deptCode: 'STG-ENG',
    },
  ];

  for (const d of displays) {
    const deptId = deptIds[d.deptCode]!;
    const headUid = headUids[d.deptCode]!;
    const existing = await db.collection('displays').where('name', '==', d.name).limit(1).get();

    let displayId: string;
    if (!existing.empty) {
      displayId = existing.docs[0].id;
      console.log(`[EXISTS] Digital display '${d.name}' (ID: ${displayId})`);
    } else {
      const dispRef = db.collection('displays').doc();
      displayId = dispRef.id;
      await dispRef.set({
        id: displayId,
        name: d.name,
        siteId,
        departmentId: deptId,
        locationDescription: d.location,
        orientation: d.orientation,
        configuredResolution: d.resolution,
        lifecycle: 'pending_enrollment',
        connectivity: 'never_connected',
        lastHeartbeatAt: null,
        activePublicationId: null,
        desiredPublicationId: null,
        deliveryStage: 'idle',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[CREATED] Digital display '${d.name}' (${d.orientation}, ID: ${displayId})`);
    }

    // Assignment
    const assignId = `${displayId}_${headUid}`;
    const assignRef = db.collection('displayAssignments').doc(assignId);
    const assignDoc = await assignRef.get();
    if (!assignDoc.exists) {
      await assignRef.set({
        id: assignId,
        displayId,
        uid: headUid,
        departmentId: deptId,
        assignedBy: 'system-bootstrap',
        assignedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[ASSIGNED] Digital display '${d.name}' -> Department Head (${d.deptCode})`);
    }
  }

  console.log('\n[SUCCESS] Staging dataset initialization completed idempotently.\n');
}

main().catch((err) => {
  console.error('[ERROR] Staging seeding failed:', err);
  process.exit(1);
});

