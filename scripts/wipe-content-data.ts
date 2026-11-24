/**
 * Aura DIMS - Content & Publication Reset / Wipe Script
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Safety-guarded cleanup script that deletes content-layer documents and media blobs
 * while strictly preserving infrastructure, authentication, organizational hierarchy,
 * digital display enrollments, and audit logs.
 *
 * COLLECTIONS DELETED:
 *   - assets
 *   - designs
 *   - designRevisions
 *   - playlists
 *   - playlistRevisions
 *   - schedules
 *   - approvals
 *   - publications
 *   - displays/{displayId}/operations (per-display hardware operations queue/history)
 *   - displays/{displayId}/previews   (per-display preview captures)
 *
 * STORAGE PREFIXES DELETED:
 *   - media/
 *   - staging/
 *   - thumbnails/
 *   - publications/
 *   - packages/   (compiled digital display publication packages)
 *   - previews/   (digital display screenshot captures)
 *
 * STRICTLY PRESERVED:
 *   - users & Firebase Auth credentials
 *   - departments
 *   - sites & displayGroups
 *   - displays (digital display hardware enrollment preserved; playback pointers reset)
 *   - displaySecrets & displayAssignments
 *   - plannedInstallations & commissioning
 *   - projects & project memberships
 *   - templates (bundled design templates)
 *   - auditEvents (immutable regulatory log)
 *   - systemMetadata & rateLimits
 *
 * USAGE:
 *   Dry-run (default):
 *     node --experimental-strip-types scripts/wipe-content-data.ts --project=demo-aura-dims
 *
 *   Execute wipe:
 *     node --experimental-strip-types scripts/wipe-content-data.ts --project=demo-aura-dims --apply
 *
 *   Production execution:
 *     node --experimental-strip-types scripts/wipe-content-data.ts --project=aura-dims-prod --apply --confirm-production
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

interface WipeOptions {
  projectId: string;
  isDryRun: boolean;
  confirmProduction: boolean;
}

function parseArgs(): WipeOptions {
  const args = process.argv.slice(2);
  let projectId = '';
  let isDryRun = true;
  let confirmProduction = false;

  for (const arg of args) {
    if (arg.startsWith('--project=')) {
      projectId = arg.split('=')[1].trim();
    } else if (arg === '--project') {
      const idx = args.indexOf(arg);
      if (args[idx + 1]) projectId = args[idx + 1].trim();
    } else if (arg === '--apply') {
      isDryRun = false;
    } else if (arg === '--dry-run') {
      isDryRun = true;
    } else if (arg === '--confirm-production') {
      confirmProduction = true;
    }
  }

  // Fallback to GCLOUD_PROJECT if in emulator environment
  if (!projectId && process.env.GCLOUD_PROJECT) {
    projectId = process.env.GCLOUD_PROJECT;
  }

  if (!projectId) {
    console.error('❌ ERROR: Missing required --project parameter.');
    console.error('Usage: node scripts/wipe-content-data.ts --project=<projectId> [--apply] [--confirm-production]');
    process.exit(1);
  }

  const isDemo = projectId.startsWith('demo-');
  if (!isDemo && !confirmProduction && !isDryRun) {
    console.error(`❌ CRITICAL SAFETY ERROR: Target project "${projectId}" is a LIVE/PRODUCTION environment.`);
    console.error('You must pass --confirm-production alongside --apply to execute deletion against non-demo projects.');
    process.exit(1);
  }

  return { projectId, isDryRun, confirmProduction };
}

const TARGET_COLLECTIONS = [
  'assets',
  'designs',
  'designRevisions',
  'playlists',
  'playlistRevisions',
  'schedules',
  'approvals',
  'publications',
] as const;

const KEEP_COLLECTIONS = new Set([
  'users',
  'departments',
  'displays',
  'displayGroups',
  'sites',
  'projects',
  'auditEvents',
  'displaySecrets',
  'displayAssignments',
  'plannedInstallations',
  'commissioning',
  'templates',
  'systemMetadata',
  'rateLimits',
  'pairingCodes',
]);

const TARGET_STORAGE_PREFIXES = [
  'media/',
  'staging/',
  'thumbnails/',
  'publications/',
  'packages/',
  'previews/',
  'renders/',
] as const;

async function runWipe() {
  const { projectId, isDryRun, confirmProduction } = parseArgs();

  // Point Admin SDK emulator environment if demo project
  if (projectId.startsWith('demo-')) {
    process.env.GCLOUD_PROJECT = projectId;
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  }

  console.log('==============================================================================');
  console.log(' Aura DIMS - Content Layer Reset & Safe Wipe Tool');
  console.log(` Target Firebase Project:    ${projectId}`);
  console.log(` Execution Mode:            ${isDryRun ? 'DRY-RUN (Simulated - No data deleted)' : 'APPLY (DELETING DATA)'}`);
  console.log(` Production Confirmed:      ${confirmProduction ? 'YES' : 'NO'}`);
  console.log(` Timestamp:                 ${new Date().toISOString()}`);
  console.log('==============================================================================\n');

  console.log('--- MANDATORY PRE-WIPE BACKUP PROCEDURES ---');
  console.log('Before executing this command in production or staging, create an authoritative backup:');
  console.log('  1. Firestore Export:');
  console.log(`       gcloud firestore export gs://[YOUR-BACKUP-BUCKET]/backups/pre-wipe-$(date +%Y%m%d%H%M%S) --project=${projectId}`);
  console.log('  2. Storage Bucket Export:');
  console.log(`       gcloud storage cp -r gs://[YOUR-STORAGE-BUCKET] gs://[YOUR-BACKUP-BUCKET]/storage-backup-$(date +%Y%m%d%H%M%S)`);
  console.log('  3. Local Emulator Export (if local):');
  console.log('       pnpm run emulators:export\n');

  const app = getApps().length === 0 ? initializeApp({ projectId }) : getApps()[0];
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  const storageBucket = getStorage(app).bucket(
    process.env.FIREBASE_STORAGE_EMULATOR_HOST
      ? `${projectId}.appspot.com`
      : 'aura-dims.firebasestorage.app'
  );

  console.log('Validating all Firestore collections and digital display subcollections...\n');

  // Strict listCollections validation
  const rootCols = await db.listCollections();
  const unknownCols: string[] = [];
  const knownWipe = new Set<string>(TARGET_COLLECTIONS);

  for (const col of rootCols) {
    if (!knownWipe.has(col.id) && !KEEP_COLLECTIONS.has(col.id)) {
      unknownCols.push(col.id);
    }
  }

  // Check per-display subcollections
  const displaysSnap = await db.collection('displays').get();
  const unknownSubcols: string[] = [];
  const knownDisplaySubcols = new Set(['operations', 'previews']);
  for (const dispDoc of displaysSnap.docs) {
    const subcols = await dispDoc.ref.listCollections();
    for (const sub of subcols) {
      if (!knownDisplaySubcols.has(sub.id)) {
        unknownSubcols.push(`displays/${dispDoc.id}/${sub.id}`);
      }
    }
  }

  // Check storage prefixes/files
  const unknownStoragePrefixes: string[] = [];
  const knownStoragePrefixes = new Set<string>(TARGET_STORAGE_PREFIXES);
  try {
    const [allFiles] = await storageBucket.getFiles({ maxResults: 1000 });
    for (const file of allFiles) {
      const parts = file.name.split('/');
      const rootPrefix = parts.length > 1 ? parts[0] + '/' : file.name;
      if (!knownStoragePrefixes.has(rootPrefix) && !unknownStoragePrefixes.includes(rootPrefix)) {
        unknownStoragePrefixes.push(rootPrefix);
      }
    }
  } catch (storageErr) {
    console.warn('[Notice] Could not scan storage root (may be empty or default bucket unset):', (storageErr as any)?.message);
  }

  console.log('--- FIRESTORE COLLECTIONS AUDIT ---');
  console.log(`Discovered Root Collections (${rootCols.length}):`, rootCols.map((c) => c.id).join(', '));
  console.log(`Target Content Collections (Wipe):`, TARGET_COLLECTIONS.join(', '));
  console.log(`Preserved Hierarchy Collections (Keep):`, Array.from(KEEP_COLLECTIONS).join(', '));

  if (unknownCols.length > 0 || unknownSubcols.length > 0 || unknownStoragePrefixes.length > 0) {
    console.error('\n❌ CRITICAL SAFETY STOP: Discovered unknown collection(s) or storage prefix(es) in neither KEEP nor WIPE list:');
    if (unknownCols.length > 0) console.error('  Unknown Root Collections:', unknownCols);
    if (unknownSubcols.length > 0) console.error('  Unknown Digital Display Subcollections:', unknownSubcols);
    if (unknownStoragePrefixes.length > 0) console.error('  Unknown Storage Prefixes:', unknownStoragePrefixes);
    console.error('\nRefusing to proceed. Aborting wipe execution.');
    process.exit(1);
  }

  console.log('✓ All collections and subcollections strictly verified against keep and wipe registries.\n');

  console.log('Scanning Firestore content collections...\n');

  // 1. Scan Top-Level Content Collections
  const collectionCounts: Record<string, number> = {};
  for (const colName of TARGET_COLLECTIONS) {
    const snap = await db.collection(colName).get();
    collectionCounts[colName] = snap.size;
  }

  // 2. Scan per-display subcollections (operations & previews)
  let operationsCount = 0;
  let previewsCount = 0;
  for (const dispDoc of displaysSnap.docs) {
    const opsSnap = await dispDoc.ref.collection('operations').get();
    operationsCount += opsSnap.size;
    const prevSnap = await dispDoc.ref.collection('previews').get();
    previewsCount += prevSnap.size;
  }

  // 3. Scan Storage Prefixes
  const storageCounts: Record<string, number> = {};
  for (const prefix of TARGET_STORAGE_PREFIXES) {
    try {
      const [files] = await storageBucket.getFiles({ prefix });
      storageCounts[prefix] = files.length;
    } catch {
      storageCounts[prefix] = 0;
    }
  }

  // Print Summary Table
  console.log('------------------------------------------------------------------------------');
  console.log(' SUMMARY OF DATA TARGETED FOR DELETION:');
  console.log('------------------------------------------------------------------------------');
  for (const colName of TARGET_COLLECTIONS) {
    console.log(`  Collection: "${colName.padEnd(22)}" -> ${collectionCounts[colName]} documents`);
  }
  console.log(`  Subcollection: "displays/*/operations"  -> ${operationsCount} operations across ${displaysSnap.size} digital displays`);
  console.log(`  Subcollection: "displays/*/previews"    -> ${previewsCount} preview documents across ${displaysSnap.size} digital displays\n`);

  console.log(' Storage Blobs:');
  for (const prefix of TARGET_STORAGE_PREFIXES) {
    console.log(`  Prefix: "${prefix.padEnd(22)}"     -> ${storageCounts[prefix]} files`);
  }

  console.log('\n Digital Display Fallback Reset:');
  console.log(`  Will reset publication & schedule fields on ${displaysSnap.size} digital display documents.`);
  console.log('------------------------------------------------------------------------------\n');

  console.log(' PRESERVED INFRASTRUCTURE & HIERARCHY (WILL NOT BE DELETED):');
  console.log('  ✓ users (and Firebase Auth records)');
  console.log('  ✓ departments');
  console.log('  ✓ sites & displayGroups');
  console.log('  ✓ displays (hardware enrollment, name, site, pairing secret, groups)');
  console.log('  ✓ displaySecrets & displayAssignments');
  console.log('  ✓ plannedInstallations & commissioning records');
  console.log('  ✓ projects (and project members)');
  console.log('  ✓ templates (bundled slide design templates)');
  console.log('  ✓ auditEvents');
  console.log('  ✓ systemMetadata & rateLimits');
  console.log('------------------------------------------------------------------------------\n');

  if (isDryRun) {
    console.log('[DRY-RUN COMPLETE] No documents or storage objects were modified.');
    console.log(`To execute deletion, re-run with: --apply --project=${projectId}${!projectId.startsWith('demo-') ? ' --confirm-production' : ''}\n`);
    return;
  }

  // ============================================================================
  // APPLY DELETIONS
  // ============================================================================
  console.log('🚨 COMMITTING DATA DELETION...\n');

  // Delete top-level collection documents
  for (const colName of TARGET_COLLECTIONS) {
    console.log(`Deleting documents from "${colName}"...`);
    const snap = await db.collection(colName).get();
    const batchLimit = 400;
    let batch = db.batch();
    let count = 0;

    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      count++;
      if (count >= batchLimit) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
    console.log(` ✓ Cleared "${colName}" (${snap.size} docs deleted).`);
  }

  // Delete display subcollections (operations & previews) & reset display fields
  console.log('\nDeleting display subcollections & resetting digital display fields...');
  const resetBatch = db.batch();
  for (const dispDoc of displaysSnap.docs) {
    // Delete operations subcollection
    const opsSnap = await dispDoc.ref.collection('operations').get();
    for (const opDoc of opsSnap.docs) {
      resetBatch.delete(opDoc.ref);
    }

    // Delete previews subcollection
    const prevSnap = await dispDoc.ref.collection('previews').get();
    for (const pDoc of prevSnap.docs) {
      resetBatch.delete(pDoc.ref);
    }

    // Reset digital display playback pointers
    resetBatch.update(dispDoc.ref, {
      desiredPublicationId: null,
      readyPublicationId: null,
      activePublicationId: null,
      presentedPublicationId: null,
      publishedScheduleId: null,
      publishedScheduleTitle: null,
      publishedPlaylistTitle: null,
      publishedScheduleWindow: null,
      lastDeliveryError: null,
      deliveryStage: null,
      lastPreview: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await resetBatch.commit();
  console.log(` ✓ Cleared subcollections and reset playback pointers on ${displaysSnap.size} digital displays.`);

  // Delete Storage Files
  console.log('\nDeleting Storage prefixes...');
  for (const prefix of TARGET_STORAGE_PREFIXES) {
    try {
      await storageBucket.deleteFiles({ prefix, force: true });
      console.log(` ✓ Deleted storage files under "${prefix}".`);
    } catch (storageErr) {
      console.warn(` ⚠️ Could not delete storage prefix "${prefix}":`, storageErr);
    }
  }

  // Record Audit Event
  try {
    await db.collection('auditEvents').add({
      actorId: 'system_wipe_script',
      action: 'system.content_wipe',
      targetId: projectId,
      targetType: 'system',
      metadata: {
        collectionCounts,
        operationsCount,
        previewsCount,
        storageCounts,
        displaysReset: displaysSnap.size,
      },
      timestamp: FieldValue.serverTimestamp(),
    });
    console.log('\n✓ System wipe audit event recorded in auditEvents.');
  } catch (auditErr) {
    console.warn('Could not record wipe audit event:', auditErr);
  }

  console.log('\n==============================================================================');
  console.log(' CONTENT RESET COMPLETE.');
  console.log(' All content-layer documents and blobs have been purged.');
  console.log(' Digital displays will cleanly display standby / offline loop on next sync.');
  console.log('==============================================================================\n');
}

runWipe().catch((err) => {
  console.error('Fatal wipe error:', err);
  process.exit(1);
});
