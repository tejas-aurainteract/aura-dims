/**
 * Aura DIMS - Player Configuration & Constants
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology: Always use "digital display" in all user-facing copy and logs.
 */

import * as path from 'node:path';

export type PlayerTransportMode = 'emulator' | 'cloud';

export interface PlayerConfig {
  /** Root directory for player runtime state, credentials, packages, and logs. */
  dataDir: string;
  credentialsDir: string;
  packagesDir: string;
  stagingDir: string;
  versionsDir: string;
  cacheDir: string;
  logsDir: string;

  /** Local loopback server configuration. Strictly bound to 127.0.0.1. */
  host: string;
  port: number;

  /** Explicit transport mode: 'emulator' (local dev/tests) or 'cloud' (production digital display). */
  mode: PlayerTransportMode;

  /** Firebase project & Cloud Function configuration. */
  projectId: string;
  region: string;
  firebaseApiKey: string;
  firebaseAuthDomain?: string;
  storageBucket?: string;
  functionsBaseUrl?: string;
  functionsEmulatorHost: string;
  authEmulatorHost: string;
  storageEmulatorHost: string;
  allowedDownloadHosts?: string[];

  /** Storage limits and safety thresholds. */
  maxPackageSizeBytes: number; // 500 MB default limit
  maxFileSizeBytes: number; // 200 MB max individual asset
  maxFileCount: number; // 100 max assets per publication
  retentionPackagesCount: number; // 2 packages kept (active + previous)
  minFreeDiskBytes: number; // Minimum free disk space required before staging

  /** Heartbeat and sync intervals in milliseconds. */
  syncIntervalMs: number; // 15 seconds
  heartbeatIntervalMs: number; // 30 seconds
  appVersion: string;
  rendererVersion: string;
  protocolVersion: string;

  /** Optional path to a root-owned controlled reboot helper script. */
  rebootHelperPath?: string | null;
}

export function validatePlayerConfig(config: PlayerConfig): void {
  if (config.host !== '127.0.0.1' && config.host !== 'localhost') {
    throw new Error(
      `Invalid digital display local server host "${config.host}". Renderer server must bind strictly to loopback (127.0.0.1).`
    );
  }

  if (config.mode !== 'emulator' && config.mode !== 'cloud') {
    throw new Error(
      `Invalid digital display transport mode "${String(config.mode)}". Must be explicitly "emulator" or "cloud".`
    );
  }

  if (config.mode === 'emulator') {
    if (!config.projectId || !config.projectId.startsWith('demo-')) {
      throw new Error(
        `Emulator transport mode requires a "demo-*" projectId (e.g., "demo-aura-dims"), received "${config.projectId}". Refusing to run emulator mode against a non-demo project.`
      );
    }
    if (!config.functionsEmulatorHost || !config.authEmulatorHost) {
      throw new Error(
        'Emulator transport mode requires both functionsEmulatorHost and authEmulatorHost.'
      );
    }
  } else {
    // Cloud mode strict validation: never fall back to demo credentials or emulators
    if (!config.projectId || config.projectId.startsWith('demo-')) {
      throw new Error(
        `Cloud transport mode requires a valid production Firebase projectId (received "${config.projectId}").`
      );
    }
    if (!config.firebaseApiKey || config.firebaseApiKey === 'demo-api-key') {
      throw new Error(
        'Cloud transport mode requires a valid FIREBASE_API_KEY and cannot use "demo-api-key".'
      );
    }
    if (!config.region) {
      throw new Error('Cloud transport mode requires a valid Cloud Functions region.');
    }
    if (config.functionsBaseUrl && !config.functionsBaseUrl.startsWith('https://')) {
      throw new Error(
        `Cloud transport mode requires an HTTPS functionsBaseUrl, received "${config.functionsBaseUrl}".`
      );
    }
  }
}

export function loadConfig(overrides?: Partial<PlayerConfig>): PlayerConfig {
  const baseDir =
    overrides?.dataDir || process.env.AURA_DATA_DIR || path.resolve(process.cwd(), 'player/data');
  const port = overrides?.port || Number(process.env.AURA_PLAYER_PORT || '8090');

  const rawMode = (overrides?.mode || process.env.AURA_TRANSPORT_MODE || 'emulator') as PlayerTransportMode;

  const projectId =
    overrides?.projectId ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    (rawMode === 'emulator' ? 'demo-aura-dims' : '');

  const region = overrides?.region || process.env.FIREBASE_REGION || 'asia-south1';
  const firebaseApiKey =
    overrides?.firebaseApiKey ??
    process.env.FIREBASE_API_KEY ??
    (rawMode === 'emulator' ? 'demo-api-key' : '');

  const config: PlayerConfig = {
    dataDir: baseDir,
    credentialsDir: path.join(baseDir, 'credentials'),
    packagesDir: path.join(baseDir, 'packages'),
    stagingDir: path.join(baseDir, 'packages', 'staging'),
    versionsDir: path.join(baseDir, 'packages', 'versions'),
    cacheDir: path.join(baseDir, 'cache'),
    logsDir: path.join(baseDir, 'logs'),

    host: '127.0.0.1', // Ground rule: strictly loopback only
    port,

    mode: rawMode,
    projectId,
    region,
    firebaseApiKey,
    firebaseAuthDomain:
      overrides?.firebaseAuthDomain ||
      process.env.FIREBASE_AUTH_DOMAIN ||
      (projectId ? `${projectId}.firebaseapp.com` : undefined),
    storageBucket:
      overrides?.storageBucket ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      (projectId ? `${projectId}.firebasestorage.app` : undefined),
    functionsBaseUrl: overrides?.functionsBaseUrl || process.env.FIREBASE_FUNCTIONS_BASE_URL,
    functionsEmulatorHost:
      overrides?.functionsEmulatorHost || process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001',
    authEmulatorHost:
      overrides?.authEmulatorHost || process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
    storageEmulatorHost:
      overrides?.storageEmulatorHost || process.env.STORAGE_EMULATOR_HOST || '127.0.0.1:9199',
    allowedDownloadHosts: overrides?.allowedDownloadHosts,

    maxPackageSizeBytes: 500 * 1024 * 1024,
    maxFileSizeBytes: 200 * 1024 * 1024,
    maxFileCount: 100,
    retentionPackagesCount: 2,
    minFreeDiskBytes: 50 * 1024 * 1024, // 50 MB default minimum free disk space

    syncIntervalMs: 15_000,
    heartbeatIntervalMs: 30_000,
    appVersion: '1.1.0',
    rendererVersion: '1.1.0',
    protocolVersion: '1.1',
    rebootHelperPath: overrides?.rebootHelperPath ?? process.env.AURA_REBOOT_HELPER ?? null,
    ...overrides,
  };

  validatePlayerConfig(config);
  return config;
}
