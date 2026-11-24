import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { spawnSync } from 'node:child_process';

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-aura-dims';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';

console.log('================================================================');
console.log('Phase 1.5 Verification Suite Starting');
console.log(`Target Project: ${process.env.GCLOUD_PROJECT}`);
console.log(`Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log('================================================================\n');

// 1. Seed data
console.log('>>> STEP 1: Seeding realistic test data');
const seedRes = spawnSync('node', ['functions/lib/migrations/seedMigrationTestData.js'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
if (seedRes.status !== 0) {
  console.error('Seeding failed!');
  process.exit(seedRes.status || 1);
}

const app = getApps().length === 0 ? initializeApp({ projectId: process.env.GCLOUD_PROJECT }) : getApps()[0];
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

async function dumpDoc(collectionName, docId) {
  const snap = await db.collection(collectionName).doc(docId).get();
  return snap.exists ? snap.data() : null;
}

async function run() {
  console.log('\n>>> Inspecting Sample Documents BEFORE Migration:');
  const sampleReadyBefore = await dumpDoc('assets', 'asset-img-ready');
  console.log('Sample Ready Asset (before):', JSON.stringify(sampleReadyBefore, null, 2));

  const sampleFailedBefore = await dumpDoc('assets', 'asset-img-failed');
  console.log('Sample Failed Asset (before):', JSON.stringify(sampleFailedBefore, null, 2));

  const sampleArchivedBefore = await dumpDoc('assets', 'asset-img-archived');
  console.log('Sample Archived Asset (before):', JSON.stringify(sampleArchivedBefore, null, 2));

  const sampleDesignBefore = await dumpDoc('designs', 'design-ops-1');
  console.log('Sample Design (before):', JSON.stringify(sampleDesignBefore, null, 2));

  const generalProjectBefore = await dumpDoc('projects', 'proj_general_operations-facilities');
  console.log('General Project for operations-facilities (before):', generalProjectBefore ? 'EXISTS' : 'DOES NOT EXIST');

  // 2. Run --dry-run
  console.log('\n================================================================');
  console.log('>>> STEP 2: Running Migration with --dry-run');
  console.log('================================================================\n');
  const dryRunRes = spawnSync('node', ['functions/lib/migrations/migrateProjectsAndAssets.js', '--dry-run'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (dryRunRes.status !== 0) {
    console.error('Dry-run failed!');
    process.exit(dryRunRes.status || 1);
  }

  // 3. Run --apply (First pass)
  console.log('\n================================================================');
  console.log('>>> STEP 3: Running Migration with --apply (First Pass)');
  console.log('================================================================\n');
  const apply1Res = spawnSync('node', ['functions/lib/migrations/migrateProjectsAndAssets.js', '--apply'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (apply1Res.status !== 0) {
    console.error('Apply (Pass 1) failed!');
    process.exit(apply1Res.status || 1);
  }

  // Inspect documents AFTER first migration pass
  console.log('\n>>> Inspecting Sample Documents AFTER Migration (Pass 1):');
  const sampleReadyAfter = await dumpDoc('assets', 'asset-img-ready');
  console.log('Sample Ready Asset (after):', JSON.stringify(sampleReadyAfter, null, 2));

  const sampleFailedAfter = await dumpDoc('assets', 'asset-img-failed');
  console.log('Sample Failed Asset (after):', JSON.stringify(sampleFailedAfter, null, 2));

  const sampleArchivedAfter = await dumpDoc('assets', 'asset-img-archived');
  console.log('Sample Archived Asset (after):', JSON.stringify(sampleArchivedAfter, null, 2));

  const sampleDesignAfter = await dumpDoc('designs', 'design-ops-1');
  console.log('Sample Design (after):', JSON.stringify(sampleDesignAfter, null, 2));

  const generalProjectAfter = await dumpDoc('projects', 'proj_general_operations-facilities');
  console.log('General Project for operations-facilities (after):', JSON.stringify(generalProjectAfter, null, 2));

  const projectMembers = await db.collection('projects').doc('proj_general_operations-facilities').collection('members').get();
  console.log(`Members enrolled in proj_general_operations-facilities: ${projectMembers.size}`);
  projectMembers.forEach((doc) => {
    console.log(` - Member ${doc.id}: ${JSON.stringify(doc.data())}`);
  });

  // 4. Run --apply (Second pass - Idempotency proof)
  console.log('\n================================================================');
  console.log('>>> STEP 4: Running Migration with --apply (Second Pass - Idempotency Proof)');
  console.log('================================================================\n');
  const apply2Res = spawnSync('node', ['functions/lib/migrations/migrateProjectsAndAssets.js', '--apply'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (apply2Res.status !== 0) {
    console.error('Apply (Pass 2) failed!');
    process.exit(apply2Res.status || 1);
  }

  // 5. Run Vitest Acceptance Tests
  console.log('\n================================================================');
  console.log('>>> STEP 5: Running Vitest Acceptance Tests');
  console.log('================================================================\n');
  const vitestCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const vitestRes = spawnSync(vitestCmd, ['vitest', 'run', 'tests/acceptance/projects-and-heads.test.ts'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (vitestRes.status !== 0) {
    console.error('Vitest acceptance tests failed!');
    process.exit(vitestRes.status || 1);
  }

  console.log('\n================================================================');
  console.log('ALL PHASE 1.5 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('Unexpected error in verification script:', err);
  process.exit(1);
});
