import admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'aura-dims' });
}
const db = admin.firestore();
const storage = admin.storage().bucket('aura-dims.firebasestorage.app');

async function verify() {
  console.log('=== STEP 3: READ-ONLY VERIFICATION ===\n');

  // 1. Departments and their General Projects
  console.log('1. DEPARTMENTS & GENERAL PROJECTS:');
  const deptsSnap = await db.collection('departments').get();
  for (const d of deptsSnap.docs) {
    const deptId = d.id;
    const projId = `proj_general_${deptId}`;
    const pDoc = await db.collection('projects').doc(projId).get();
    console.log(`- Dept [${deptId}]: "${d.data().name}"`);
    if (pDoc.exists) {
      console.log(`  ✓ General Project: ${projId} exists`);
      const membersSnap = await pDoc.ref.collection('members').get();
      console.log(`    Members count: ${membersSnap.size}`);
      membersSnap.docs.forEach(m => {
        console.log(`      * ${m.data().userDisplayName || m.data().userEmail} (${m.id}) -> Role: ${m.data().role}`);
      });
    } else {
      console.error(`  ❌ Missing General Project: ${projId}`);
    }
  }

  // 2. Wiped content collections check
  console.log('\n2. WIPED COLLECTIONS CHECK (Must be 0):');
  const wipedCols = [
    'assets',
    'designs',
    'designRevisions',
    'playlists',
    'playlistRevisions',
    'schedules',
    'approvals',
    'publications',
  ];
  for (const col of wipedCols) {
    const snap = await db.collection(col).get();
    console.log(`- Collection "${col}": ${snap.size} documents ${snap.size === 0 ? '✓ (EMPTY)' : '❌ (NOT EMPTY)'}`);
  }

  // 3. Storage prefixes check
  console.log('\n3. STORAGE PREFIXES CHECK (Must be 0):');
  const prefixes = [
    'media/',
    'staging/',
    'thumbnails/',
    'publications/',
    'packages/',
    'previews/',
    'renders/',
  ];
  for (const prefix of prefixes) {
    const [files] = await storage.getFiles({ prefix });
    console.log(`- Prefix "${prefix}": ${files.length} files ${files.length === 0 ? '✓ (EMPTY)' : '❌ (NOT EMPTY)'}`);
  }

  // 4. Displays publication pointers check
  console.log('\n4. DIGITAL DISPLAYS STATUS & PLAYBACK POINTERS:');
  const dispSnap = await db.collection('displays').get();
  console.log(`Total displays: ${dispSnap.size}`);
  for (const d of dispSnap.docs) {
    const data = d.data();
    const opsSnap = await d.ref.collection('operations').get();
    const prevSnap = await d.ref.collection('previews').get();
    console.log(`- Display [${d.id}]: "${data.name}"`);
    console.log(`  desiredPublicationId: ${data.desiredPublicationId} ${data.desiredPublicationId === null ? '✓ (NULL)' : '❌'}`);
    console.log(`  publishedScheduleId: ${data.publishedScheduleId} ${data.publishedScheduleId === null ? '✓ (NULL)' : '❌'}`);
    console.log(`  publishedScheduleRule: ${data.publishedScheduleRule} ${data.publishedScheduleRule === null ? '✓ (NULL)' : '❌'}`);
    console.log(`  Subcollection operations: ${opsSnap.size} ${opsSnap.size === 0 ? '✓ (EMPTY)' : '❌'}`);
    console.log(`  Subcollection previews: ${prevSnap.size} ${prevSnap.size === 0 ? '✓ (EMPTY)' : '❌'}`);
  }

  // 5. Preserved infrastructure collections check
  console.log('\n5. PRESERVED INFRASTRUCTURE COLLECTIONS:');
  const keepCols = ['users', 'departments', 'displays', 'projects', 'auditEvents', 'pairingCodes', 'sites'];
  for (const col of keepCols) {
    const snap = await db.collection(col).get();
    console.log(`- Preserved Collection "${col}": ${snap.size} documents ✓ (PRESERVED)`);
  }

  // Step 4: Multi-Head Check
  console.log('\n=== STEP 4: MULTI-HEAD CHECK (READ-ONLY) ===');
  const usersSnap = await db.collection('users').get();
  const headsByDept = {};
  usersSnap.docs.forEach(uDoc => {
    const u = uDoc.data();
    if (u.status === 'active' && u.role === 'department_head' && u.departmentId) {
      headsByDept[u.departmentId] = (headsByDept[u.departmentId] || []).concat({ uid: uDoc.id, ...u });
    }
  });

  let anomalies = 0;
  for (const d of deptsSnap.docs) {
    const heads = headsByDept[d.id] || [];
    console.log(`- Department "${d.data().name}" (${d.id}): ${heads.length} Department Head(s)`);
    heads.forEach(h => console.log(`    * ${h.displayName || h.email} (${h.uid})`));
    if (heads.length > 1) {
      anomalies++;
    }
  }

  if (anomalies === 0) {
    console.log('\n✓ Invariant Holds: No department has more than one Department Head.');
  } else {
    console.log(`\n⚠️ Warning: ${anomalies} department(s) have multiple active Department Heads.`);
  }
}

verify().catch(console.error);
