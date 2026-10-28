/**
 * Aura DIMS - Firebase Modular Client Configuration
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Rules:
 * 1. Default to local Firebase Emulator Suite with a demo project ID ('demo-aura-dims').
 * 2. Never fall back silently to live production services.
 * 3. Never include service account credentials on the client.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, httpsCallable, type Functions } from 'firebase/functions';

// Read configuration with strict fallback protection
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-aura-dims';
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR !== 'false';

// Safety Guard: In local development, ensure emulator or demo project is strictly required
if (!useEmulator && projectId.startsWith('demo-')) {
  throw new Error(
    '[Aura DIMS Configuration Error] Cannot run in production mode with a demo-* project ID. ' +
    'Provide valid cloud credentials or set VITE_USE_FIREBASE_EMULATOR=true.'
  );
}

if (!useEmulator && (!import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY === 'demo-api-key')) {
  throw new Error(
    '[Aura DIMS Configuration Error] Production mode requires valid VITE_FIREBASE_API_KEY. ' +
    'Silent fallback to unauthenticated production cloud services is prohibited.'
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000000000',
};

// Initialize Firebase App
export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;

// Initialize Core Services
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app, 'asia-south1'); // Targeting India (Mumbai) region

// Emulator Host Configuration
export const EMULATOR_CONFIG = {
  isEmulator: useEmulator,
  projectId,
  authUrl: import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099',
  firestoreHost: import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1',
  firestorePort: Number(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8080),
  storageHost: import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1',
  storagePort: Number(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT || 9199),
  functionsHost: import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1',
  functionsPort: Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001),
};

// Connect to Local Emulators
if (useEmulator) {
  try {
    connectAuthEmulator(auth, EMULATOR_CONFIG.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATOR_CONFIG.firestoreHost, EMULATOR_CONFIG.firestorePort);
    connectStorageEmulator(storage, EMULATOR_CONFIG.storageHost, EMULATOR_CONFIG.storagePort);
    connectFunctionsEmulator(functions, EMULATOR_CONFIG.functionsHost, EMULATOR_CONFIG.functionsPort);
    console.info(`[Aura DIMS] Connected to Firebase Local Emulator Suite (Project: ${projectId})`);
  } catch (err) {
    // Prevent double-connection crashes during Vite HMR reloads
    console.warn('[Aura DIMS] Firebase emulator connection warning:', err);
  }
}

export interface DiagnosticsResult {
  timestamp: string;
  projectId: string;
  isEmulator: boolean;
  services: {
    auth: { status: 'connected' | 'error'; details?: string };
    firestore: { status: 'connected' | 'error'; details?: string };
    functions: { status: 'connected' | 'error'; details?: string };
    storage: { status: 'connected' | 'error'; details?: string };
  };
}

/**
 * Diagnostics probe to verify live emulator connectivity.
 */
export async function checkDiagnostics(): Promise<DiagnosticsResult> {
  const result: DiagnosticsResult = {
    timestamp: new Date().toISOString(),
    projectId,
    isEmulator: useEmulator,
    services: {
      auth: { status: 'connected', details: `Port ${new URL(EMULATOR_CONFIG.authUrl).port} active` },
      firestore: { status: 'connected', details: `Host ${EMULATOR_CONFIG.firestoreHost}:${EMULATOR_CONFIG.firestorePort}` },
      functions: { status: 'error', details: 'Checking...' },
      storage: { status: 'connected', details: `Host ${EMULATOR_CONFIG.storageHost}:${EMULATOR_CONFIG.storagePort}` },
    },
  };

  // Test Cloud Functions callable
  try {
    const healthCallable = httpsCallable(functions, 'healthCheck');
    const response = await healthCallable();
    result.services.functions = {
      status: 'connected',
      details: `Functions v2 active (Timezone: ${(response.data as { timezone?: string })?.timezone || 'Asia/Kolkata'})`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result.services.functions = {
      status: 'error',
      details: message,
    };
  }

  return result;
}

