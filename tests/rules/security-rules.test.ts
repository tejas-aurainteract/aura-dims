import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

describe('Aura DIMS - Deny-By-Default Security Rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const firestoreRules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
    const storageRules = readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: 'demo-aura-dims',
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: firestoreRules,
      },
      storage: {
        host: '127.0.0.1',
        port: 9199,
        rules: storageRules,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
      await testEnv.clearStorage();
    }
  });

  describe('Cloud Firestore Rules', () => {
    it('rejects unauthenticated reads to digital display documents', async () => {
      const context = testEnv.unauthenticatedContext();
      const displayDoc = doc(context.firestore(), 'displays/display-01');
      await assertFails(getDoc(displayDoc));
    });

    it('rejects unauthenticated writes to digital display documents', async () => {
      const context = testEnv.unauthenticatedContext();
      const displayDoc = doc(context.firestore(), 'displays/display-01');
      await assertFails(
        setDoc(displayDoc, {
          name: 'Lobby Display',
          orientation: 'landscape',
        })
      );
    });

    it('rejects authenticated users attempting to self-assign admin roles or user documents', async () => {
      const authedContext = testEnv.authenticatedContext('user-attacker-1');
      const userDoc = doc(authedContext.firestore(), 'users/user-attacker-1');
      await assertFails(
        setDoc(userDoc, {
          email: 'attacker@aurainteract.com',
          role: 'admin',
        })
      );
    });

    it('rejects authenticated users attempting to read publication manifests directly', async () => {
      const authedContext = testEnv.authenticatedContext('user-head-1');
      const pubDoc = doc(authedContext.firestore(), 'publications/pub-01');
      await assertFails(getDoc(pubDoc));
    });

    it('rejects authenticated users attempting to write audit log entries directly', async () => {
      const authedContext = testEnv.authenticatedContext('user-head-1');
      const auditCol = collection(authedContext.firestore(), 'auditEvents');
      await assertFails(
        addDoc(auditCol, {
          actorId: 'user-head-1',
          action: 'delete_display',
          timestamp: new Date().toISOString(),
        })
      );
    });
  });

  describe('Cloud Storage Rules', () => {
    it('rejects unauthenticated media uploads', async () => {
      const context = testEnv.unauthenticatedContext();
      const fileRef = ref(context.storage(), 'assets/unauthorized-image.png');
      const dummyData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      await assertFails(uploadBytes(fileRef, dummyData));
    });

    it('rejects unauthenticated media downloads', async () => {
      const context = testEnv.unauthenticatedContext();
      const fileRef = ref(context.storage(), 'assets/welcome-slide.png');
      await assertFails(getBytes(fileRef));
    });

    it('rejects authenticated users from writing to storage bucket without explicit role permission', async () => {
      const authedContext = testEnv.authenticatedContext('user-uploader-1');
      const fileRef = ref(authedContext.storage(), 'assets/safety-briefing.mp4');
      const dummyData = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
      await assertFails(uploadBytes(fileRef, dummyData));
    });
  });
});

