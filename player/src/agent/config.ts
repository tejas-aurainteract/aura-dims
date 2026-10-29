/**
 * Aura DIMS - Player Configuration & Constants
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology: Always use "digital display" in all user-facing copy and logs.
 */

import * as path from 'node:path';
import * as os from 'node:os';

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

  /** Firebase project & Cloud Function configuration. */
  projectId: string;
  region: string;
  functionsEmulatorHost: string;
  authEmulatorHost: string;
  storageEmulatorHost: string;

  /** Storage limits and safety thresholds. */
  maxPackageSizeBytes: number; // 500 MB default limit
  maxFileSizeBytes: number; // 200 MB max individual asset
  maxFileCount: number; // 100 max assets per publication
  retentionPackagesCount: number; // 2 packages kept (active + previous)

  /** Heartbeat and sync intervals in milliseconds. */
  syncIntervalMs: number; // 15 seconds
  heartbeatIntervalMs: number; // 30 seconds
  appVersion: string;
}

export function loadConfig(overrides?: Partial<PlayerConfig>): PlayerConfig {
  const baseDir = overrides?.dataDir || process.env.AURA_DATA_DIR || path.resolve(process.cwd(), 'player/data');
  const port = overrides?.port || Number(process.env.AURA_PLAYER_PORT || '8090');

  return {
    dataDir: baseDir,
    credentialsDir: path.join(baseDir, 'credentials'),
    packagesDir: path.join(baseDir, 'packages'),
    stagingDir: path.join(baseDir, 'packages', 'staging'),
    versionsDir: path.join(baseDir, 'packages', 'versions'),
    cacheDir: path.join(baseDir, 'cache'),
    logsDir: path.join(baseDir, 'logs'),

    host: '127.0.0.1', // Ground rule: strictly loopback only
    port,

    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'demo-aura-dims',
    region: 'asia-south1',
    functionsEmulatorHost: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001',
    authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
    storageEmulatorHost: process.env.STORAGE_EMULATOR_HOST || '127.0.0.1:9199',

    maxPackageSizeBytes: 500 * 1024 * 1024,
    maxFileSizeBytes: 200 * 1024 * 1024,
    maxFileCount: 100,
    retentionPackagesCount: 2,

    syncIntervalMs: 15_000,
    heartbeatIntervalMs: 30_000,
    appVersion: '1.0.0',
    ...overrides,
  };
}

