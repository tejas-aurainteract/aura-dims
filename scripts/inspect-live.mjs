import admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'aura-dims' });
}
const db = admin.firestore();

async function inspect() {
  const deptsSnap = await db.collection('departments').get();
  console.log('=== DEPARTMENTS FOUND ===');
  const depts = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  depts.forEach(d => console.log(`- ID: ${d.id}, Name: ${d.name}, Status: ${d.status}`));

  const usersSnap = await db.collection('users').get();
  console.log('\n=== ACTIVE USERS WITH DEPARTMENTS ===');
  const users = usersSnap.docs.map(u => ({ uid: u.id, ...u.data() }));
  users.forEach(u => {
    console.log(`- UID: ${u.uid}, Email: ${u.email}, Role: ${u.role}, Dept: ${u.departmentId}, Status: ${u.status}`);
  });

  const headsByDept = {};
  users.filter(u => u.status === 'active' && u.role === 'department_head' && u.departmentId).forEach(u => {
    headsByDept[u.departmentId] = (headsByDept[u.departmentId] || []).concat(u);
  });

  console.log('\n=== MULTI-HEAD CHECK ===');
  let anomalies = 0;
  for (const [deptId, heads] of Object.entries(headsByDept)) {
    if (heads.length > 1) {
      anomalies++;
      console.log(`⚠️ ANOMALY in dept ${deptId}: ${heads.length} heads found:`);
      heads.forEach(h => console.log(`   - ${h.displayName || h.email} (${h.uid})`));
    }
  }
  if (anomalies === 0) {
    console.log('No multi-head anomalies found in active departments.');
  }

  const existingProjectsSnap = await db.collection('projects').get();
  console.log('\n=== EXISTING PROJECTS ===');
  existingProjectsSnap.docs.forEach(p => console.log(`- ${p.id}: ${p.data().name} (Dept: ${p.data().departmentId})`));
}

inspect().catch(console.error);
