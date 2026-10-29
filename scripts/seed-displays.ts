/**
 * Aura DIMS - Seed Digital Displays, Sites & Departmental Assignments
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Seeds baseline enterprise sites, active digital displays (landscape and portrait),
 * and assigns them explicitly to Department Heads.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'demo-aura-dims';
if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = getApps().length === 0 ? initializeApp({ projectId }) : getApps()[0]!;
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  console.log('Seeding enterprise sites and digital displays...');

  // 1. Resolve HR department
  const hrSnap = await db.collection('departments').where('code', '==', 'HR').limit(1).get();
  let hrDeptId = 'hr-dept';
  if (!hrSnap.empty) {
    hrDeptId = hrSnap.docs[0].id;
  } else {
    const hrRef = db.collection('departments').doc('dept-hr');
    await hrRef.set({
      id: hrRef.id,
      code: 'HR',
      name: 'Human Resources',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    hrDeptId = hrRef.id;
  }

  // 2. Ensure HR Department Head exists
  let hrHeadUid = '';
  try {
    const userRec = await auth.getUserByEmail('hr.head@aurainteract.com');
    hrHeadUid = userRec.uid;
  } catch {
    const created = await auth.createUser({
      email: 'hr.head@aurainteract.com',
      password: 'AuraAdmin#2026',
      displayName: 'Priya Sharma (HR Head)',
    });
    hrHeadUid = created.uid;
  }

  await db.collection('users').doc(hrHeadUid).set(
    {
      uid: hrHeadUid,
      email: 'hr.head@aurainteract.com',
      displayName: 'Priya Sharma',
      role: 'department_head',
      departmentId: hrDeptId,
      status: 'active',
      canDirectPublish: false, // requires Admin approval by default
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // 3. Sites
  const sites = [
    {
      id: 'site-ahmedabad-hq',
      name: 'Ahmedabad Corporate Headquarters',
      location: 'Ahmedabad, Gujarat',
    },
    {
      id: 'site-vadodara-plant',
      name: 'Vadodara Manufacturing Complex',
      location: 'Vadodara, Gujarat',
    },
  ];

  for (const s of sites) {
    await db.collection('sites').doc(s.id).set(
      {
        id: s.id,
        name: s.name,
        location: s.location,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  // 4. Digital Displays
  const displays = [
    {
      id: 'disp-ahd-reception',
      name: 'Reception Lobby Display',
      siteId: 'site-ahmedabad-hq',
      locationDescription: 'Main Reception & Visitor Waiting Lounge',
      departmentId: hrDeptId,
      orientation: 'landscape',
      configuredResolution: { width: 1920, height: 1080 },
      lifecycle: 'active',
      lastHeartbeatAt: new Date().toISOString(),
    },
    {
      id: 'disp-ahd-cafeteria',
      name: 'Executive Dining Display',
      siteId: 'site-ahmedabad-hq',
      locationDescription: 'Cafeteria & Common Breakout Area',
      departmentId: hrDeptId,
      orientation: 'landscape',
      configuredResolution: { width: 1920, height: 1080 },
      lifecycle: 'active',
      lastHeartbeatAt: new Date().toISOString(),
    },
    {
      id: 'disp-vad-totem-1',
      name: 'Plant 1 Entrance Totem',
      siteId: 'site-vadodara-plant',
      locationDescription: 'Security Gate 1 Employee Turnstiles',
      departmentId: hrDeptId,
      orientation: 'portrait',
      configuredResolution: { width: 1080, height: 1920 },
      lifecycle: 'active',
      lastHeartbeatAt: new Date().toISOString(),
    },
    {
      id: 'disp-vad-hall',
      name: 'Assembly Hall Totem',
      siteId: 'site-vadodara-plant',
      locationDescription: 'Assembly Bay 2 Briefing Station',
      departmentId: hrDeptId,
      orientation: 'portrait',
      configuredResolution: { width: 1080, height: 1920 },
      lifecycle: 'active',
      lastHeartbeatAt: new Date().toISOString(),
    },
  ];

  for (const d of displays) {
    await db.collection('displays').doc(d.id).set(
      {
        ...d,
        groupIds: [],
        reported: null,
        enrolledAt: new Date().toISOString(),
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Assign to HR Department Head
    const assignId = `${d.id}__${hrHeadUid}`;
    await db.collection('displayAssignments').doc(assignId).set(
      {
        id: assignId,
        displayId: d.id,
        uid: hrHeadUid,
        departmentId: hrDeptId,
        assignedBy: 'system',
        assignedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  console.log('Successfully seeded 2 sites, 4 active digital displays, and HR Head assignments!');
}

main().catch(console.error);

