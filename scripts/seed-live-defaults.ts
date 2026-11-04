/**
 * Aura DIMS - Live Production Baseline Seeder
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Populates initial Enterprise Sites and Departments in the live Firestore database.
 * Safe & Idempotent: checks for existence before creating.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'aura-dims';

async function main() {
  console.log('========================================================');
  console.log(' Aura DIMS - Production Sites & Departments Seeder');
  console.log(' Company: Aurainteract Private Limited');
  console.log(` Target Project: ${PROJECT_ID}`);
  console.log('========================================================\n');

  const app = getApps().length === 0 ? initializeApp({ projectId: PROJECT_ID }) : getApps()[0]!;
  const db = getFirestore(app);

  // 1. Enterprise Sites
  const defaultSites = [
    {
      id: 'site-surat-tech',
      name: 'Surat Tech Complex',
      location: 'Surat, Gujarat, India',
    },
    {
      id: 'site-ahmedabad-hq',
      name: 'Ahmedabad Corporate HQ',
      location: 'Ahmedabad, Gujarat, India',
    },
  ];

  console.log('--- Checking Enterprise Sites ---');
  for (const s of defaultSites) {
    const ref = db.collection('sites').doc(s.id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        id: s.id,
        name: s.name,
        nameLower: s.name.toLowerCase(),
        location: s.location,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[CREATED] Site: ${s.name} (ID: ${s.id})`);
    } else {
      console.log(`[EXISTS] Site: ${s.name} (ID: ${s.id})`);
    }
  }

  // 2. Departments
  const defaultDepartments = [
    {
      id: 'dept-operations',
      name: 'Operations & Facilities',
      code: 'OPS',
      description: 'Operations, logistics, and plant digital displays',
    },
    {
      id: 'dept-hr',
      name: 'Human Resources',
      code: 'HR',
      description: 'Company-wide internal notices and events',
    },
    {
      id: 'dept-it',
      name: 'Information Technology',
      code: 'IT',
      description: 'IT infrastructure and digital signage fleet',
    },
  ];

  console.log('\n--- Checking Departments ---');
  for (const d of defaultDepartments) {
    const ref = db.collection('departments').doc(d.id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        id: d.id,
        name: d.name,
        code: d.code,
        description: d.description,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[CREATED] Department: ${d.name} (${d.code})`);
    } else {
      console.log(`[EXISTS] Department: ${d.name} (${d.code})`);
    }
  }

  console.log('\n[SUCCESS] Baseline sites and departments are verified in Firestore!');
}

main().catch((err) => {
  if (err?.message?.includes('default credentials')) {
    console.error('\n[AUTHENTICATION REQUIRED]');
    console.error('To run admin scripts locally against live Firestore, authenticate using either:');
    console.error('  1. Google Cloud CLI: run `gcloud auth application-default login`');
    console.error('  2. Or download a Service Account JSON from Firebase Console -> Project Settings -> Service accounts,');
    console.error('     and set: $env:GOOGLE_APPLICATION_CREDENTIALS = "path/to/key.json"');
    console.error('\nAlternatively, add your first site and department directly via Firebase Console or via the "+ Add Site" button in the web UI.');
  } else {
    console.error('\n[ERROR] Seeding failed:', err);
  }
  process.exit(1);
});

