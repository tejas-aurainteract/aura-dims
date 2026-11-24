import admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'aura-dims' });
}
const db = admin.firestore();
const storage = admin.storage().bucket('aura-dims.firebasestorage.app');

async function inspectUnknown() {
  const pairingSnap = await db.collection('pairingCodes').get();
  console.log(`pairingCodes documents count: ${pairingSnap.size}`);
  pairingSnap.docs.forEach(d => console.log(`  - Doc ID: ${d.id}, Data:`, d.data()));

  try {
    const [renderFiles] = await storage.getFiles({ prefix: 'renders/' });
    console.log(`renders/ storage files count: ${renderFiles.length}`);
    renderFiles.slice(0, 10).forEach(f => console.log(`  - File: ${f.name}`));
  } catch (err) {
    console.log('Error checking renders/ prefix:', err.message);
  }
}

inspectUnknown().catch(console.error);
