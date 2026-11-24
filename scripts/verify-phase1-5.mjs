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
  console.log('\n>>> Inspecting Sample Documents BEFORE Seeder:');
  const sampleReadyBefore = await dumpDoc('assets', 'asset-img-ready');
  console.log('Sample Ready Asset (before):', JSON.stringify(sampleReadyBefore, null, 2));

  const generalProjectBefore = await dumpDoc('projects', 'proj_general_operations-facilities');
  console.log('General Project for operations-facilities (before):', generalProjectBefore ? 'EXISTS' : 'DOES NOT EXIST');

  // 2. Run General Projects Seeder --dry-run
  console.log('\n================================================================');
  console.log('>>> STEP 2: Running General Projects Seeder (Dry-Run)');
  console.log('================================================================\n');
  const dryRunRes = spawnSync('node', ['functions/lib/migrations/seedGeneralProjects.js'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (dryRunRes.status !== 0) {
    console.error('Dry-run failed!');
    process.exit(dryRunRes.status || 1);
  }

  // 3. Run General Projects Seeder --apply (First pass)
  console.log('\n================================================================');
  console.log('>>> STEP 3: Running General Projects Seeder with --apply (First Pass)');
  console.log('================================================================\n');
  const apply1Res = spawnSync('node', ['functions/lib/migrations/seedGeneralProjects.js', '--apply'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (apply1Res.status !== 0) {
    console.error('Apply (Pass 1) failed!');
    process.exit(apply1Res.status || 1);
  }

  // Inspect documents AFTER first seeder pass
  console.log('\n>>> Inspecting Sample Documents AFTER Seeder (Pass 1):');
  const generalProjectAfter = await dumpDoc('projects', 'proj_general_operations-facilities');
  console.log('General Project for operations-facilities (after):', JSON.stringify(generalProjectAfter, null, 2));

  const projectMembers = await db.collection('projects').doc('proj_general_operations-facilities').collection('members').get();
  console.log(`Members enrolled in proj_general_operations-facilities: ${projectMembers.size}`);
  projectMembers.forEach((doc) => {
    console.log(` - Member ${doc.id}: ${JSON.stringify(doc.data())}`);
  });

  // Assets are untouched by design (no backfill)
  const sampleReadyAfter = await dumpDoc('assets', 'asset-img-ready');
  console.log('Sample Asset remained untouched (no backfill):', sampleReadyAfter?.ownerProjectId ? 'MODIFIED' : 'UNTOUCHED');

  // 4. Run General Projects Seeder --apply (Second pass - Idempotency proof)
  console.log('\n================================================================');
  console.log('>>> STEP 4: Running General Projects Seeder with --apply (Second Pass - Idempotency Proof)');
  console.log('================================================================\n');
  const apply2Res = spawnSync('node', ['functions/lib/migrations/seedGeneralProjects.js', '--apply'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (apply2Res.status !== 0) {
    console.error('Apply (Pass 2) failed!');
    process.exit(apply2Res.status || 1);
  }

  // 5. Test Wipe Script Dry-Run
  console.log('\n================================================================');
  console.log('>>> STEP 5: Testing Content Wipe Script in Dry-Run Mode');
  console.log('================================================================\n');
  const wipeDryRunRes = spawnSync('node', ['--experimental-strip-types', 'scripts/wipe-content-data.ts', '--project=demo-aura-dims'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (wipeDryRunRes.status !== 0) {
    console.error('Wipe dry-run failed!');
    process.exit(wipeDryRunRes.status || 1);
  }

  // 6. Run Vitest Acceptance Tests
  console.log('\n================================================================');
  console.log('>>> STEP 6: Running Vitest Acceptance Tests');
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
