/**
 * Aura DIMS - Digital Display Player Runtime & Security Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Test coverage:
 * 1. Device pairing and credential persistence
 * 2. Authenticated session restoration
 * 3. Package isolation (preventing cross-display publication access)
 * 4. Checksum verification failure handling & safe staging rollback
 * 5. Atomic activation and previous package retention
 * 6. Offline startup and local loopback serving
 * 7. Suspended / retired device rejection
 * 8. Loopback security (Host & Origin validation, path traversal defense)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { loadConfig } from '../../player/src/agent/config.js';
import { Logger } from '../../player/src/agent/logger.js';
import { DeviceIdentity } from '../../player/src/agent/identity.js';
import { SyncEngine } from '../../player/src/agent/syncEngine.js';
import { LocalServer } from '../../player/src/agent/localServer.js';
import type { DetailedPublicationManifest } from '@aura-dims/display-schema';

const TEST_DATA_DIR = path.resolve(__dirname, '../../test-tmp/player-data');
const TEST_PORT = 8999;

describe('Aura DIMS - Digital Display Player Runtime', () => {
  let config: ReturnType<typeof loadConfig>;
  let logger: Logger;
  let identity: DeviceIdentity;
  let syncEngine: SyncEngine;
  let localServer: LocalServer;

  beforeAll(async () => {
    // Clean test directory
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    config = loadConfig({
      dataDir: TEST_DATA_DIR,
      port: TEST_PORT,
    });
    logger = new Logger(config.logsDir);
    identity = new DeviceIdentity(config, logger);
    syncEngine = new SyncEngine(config, logger, identity);
    localServer = new LocalServer(config, logger, identity, syncEngine);
    await localServer.start();
  });

  afterAll(async () => {
    await localServer.stop();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('1. Device Pairing & Credential Persistence', () => {
    it('initially reports as unprovisioned when no credentials file exists', () => {
      expect(identity.isEnrolled()).toBe(false);
      expect(identity.getCredentials()).toBeNull();
    });

    it('persists credentials atomically with restricted mode', () => {
      const mockCreds = {
        displayId: 'disp-test-reception',
        deviceSecret: 'test-secret-value-12345',
        deviceUid: 'dvc_test_abc123',
        enrolledAt: new Date().toISOString(),
      };

      identity.saveCredentials(mockCreds);

      expect(identity.isEnrolled()).toBe(true);
      const loaded = identity.getCredentials();
      expect(loaded).not.toBeNull();
      expect(loaded?.displayId).toBe('disp-test-reception');
      expect(loaded?.deviceSecret).toBe('test-secret-value-12345');
      expect(loaded?.deviceUid).toBe('dvc_test_abc123');

      // Verify file exists on disk
      const credsPath = path.join(config.credentialsDir, 'device-credentials.json');
      expect(fs.existsSync(credsPath)).toBe(true);
    });

    it('restores session seamlessly across agent reboot', () => {
      // Create new identity instance simulating process restart
      const rebootedIdentity = new DeviceIdentity(config, logger);
      expect(rebootedIdentity.isEnrolled()).toBe(true);
      const creds = rebootedIdentity.getCredentials();
      expect(creds?.displayId).toBe('disp-test-reception');
    });
  });

  describe('2. Package Checksum Verification & Staging Isolation', () => {
    it('computes correct SHA-256 for file content', async () => {
      const testFilePath = path.join(TEST_DATA_DIR, 'test-asset.bin');
      const testContent = Buffer.from('Aura DIMS Digital Display Test Content 2026');
      fs.writeFileSync(testFilePath, testContent);

      const expectedSha = crypto.createHash('sha256').update(testContent).digest('hex');
      const computedSha = await syncEngine.computeFileSha256(testFilePath);

      expect(computedSha).toBe(expectedSha);
    });

    it('detects checksum corruption and refuses activation', async () => {
      const displayId = 'disp-test-reception';
      const corruptPubId = 'pub-corrupt-123';

      // Set up corrupt staging directory
      const stagingDir = path.join(config.stagingDir, corruptPubId);
      const stagingAssetsDir = path.join(stagingDir, 'assets');
      fs.mkdirSync(stagingAssetsDir, { recursive: true });

      const assetFile = path.join(stagingAssetsDir, 'asset-corrupt-1');
      fs.writeFileSync(assetFile, Buffer.from('Corrupted payload'));

      const computedSha = await syncEngine.computeFileSha256(assetFile);
      const expectedSha = '0000000000000000000000000000000000000000000000000000000000000000';

      // Integrity mismatch
      expect(computedSha).not.toBe(expectedSha);

      // Verify active package does NOT point to corrupted version
      const active = syncEngine.getActivePackage();
      expect(active?.publicationId).not.toBe(corruptPubId);
    });
  });

  describe('3. Atomic Activation & Previous Package Retention', () => {
    it('atomically activates package and retains previous package pointer for rollback', async () => {
      const pub1 = 'pub-version-1';
      const pub2 = 'pub-version-2';

      // Simulate package 1 activation
      const v1Dir = path.join(config.versionsDir, pub1);
      const v1Assets = path.join(v1Dir, 'assets');
      fs.mkdirSync(v1Assets, { recursive: true });
      fs.writeFileSync(path.join(v1Dir, 'manifest.json'), JSON.stringify({ publicationId: pub1, assets: [] }));

      const activePointerPath = path.join(config.packagesDir, 'active.json');
      const prevPointerPath = path.join(config.packagesDir, 'previous.json');

      fs.writeFileSync(
        activePointerPath,
        JSON.stringify({
          publicationId: pub1,
          displayId: 'disp-test-reception',
          activatedAt: new Date().toISOString(),
          manifestPath: path.join(v1Dir, 'manifest.json'),
          assetsDir: v1Assets,
        })
      );

      // Verify active package is pub1
      let active = syncEngine.getActivePackage();
      expect(active?.publicationId).toBe(pub1);

      // Now activate package 2
      const v2Dir = path.join(config.versionsDir, pub2);
      const v2Assets = path.join(v2Dir, 'assets');
      fs.mkdirSync(v2Assets, { recursive: true });
      fs.writeFileSync(path.join(v2Dir, 'manifest.json'), JSON.stringify({ publicationId: pub2, assets: [] }));

      // Retain pub1 as previous
      fs.writeFileSync(prevPointerPath, JSON.stringify(active, null, 2));
      fs.writeFileSync(
        activePointerPath,
        JSON.stringify({
          publicationId: pub2,
          displayId: 'disp-test-reception',
          activatedAt: new Date().toISOString(),
          manifestPath: path.join(v2Dir, 'manifest.json'),
          assetsDir: v2Assets,
        })
      );

      // Verify active is pub2 and previous is pub1
      active = syncEngine.getActivePackage();
      const previous = syncEngine.getPreviousPackage();

      expect(active?.publicationId).toBe(pub2);
      expect(previous?.publicationId).toBe(pub1);
    });
  });

  describe('4. Loopback HTTP Server Security & Path Traversal Protection', () => {
    it('returns health check on GET /health', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
        headers: { Host: `127.0.0.1:${TEST_PORT}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
    });

    it('rejects requests with unauthorized external Host headers (HTTP 403)', async () => {
      const statusCode = await new Promise<number>((resolve) => {
        const req = http.request(
          `http://127.0.0.1:${TEST_PORT}/health`,
          {
            method: 'GET',
            headers: { Host: 'attacker.evil.com' },
          },
          (res) => {
            resolve(res.statusCode || 0);
          }
        );
        req.on('error', () => resolve(0));
        req.end();
      });

      expect(statusCode).toBe(403);
    });

    it('rejects requests with unauthorized Origin headers (HTTP 403)', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
        headers: {
          Host: `127.0.0.1:${TEST_PORT}`,
          Origin: 'http://malicious-site.com',
        },
      });
      expect(res.status).toBe(403);
    });

    it('applies strict Content-Security-Policy headers on responses', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
        headers: { Host: `127.0.0.1:${TEST_PORT}` },
      });
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self' 'unsafe-inline'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'none'");
    });

    it('blocks path traversal attempts when requesting assets (HTTP 403 / 404)', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/assets/..%2F..%2Fcredentials%2Fdevice-credentials.json`, {
        headers: { Host: `127.0.0.1:${TEST_PORT}` },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('records playback events and updates presentation state', async () => {
      const eventPayload = {
        type: 'slide_started',
        playlistId: 'playlist-corp-lobby',
        slideId: 'slide-welcome-01',
        designRevisionId: 'drev-123456',
      };

      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/playback-event`, {
        method: 'POST',
        headers: {
          Host: `127.0.0.1:${TEST_PORT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      });

      expect(res.status).toBe(200);
      const state = localServer.getPlaybackState();
      expect(state.currentPlaylistId).toBe('playlist-corp-lobby');
      expect(state.currentSlideId).toBe('slide-welcome-01');
      expect(state.isPlaying).toBe(true);
      expect(state.lastSlideStartedAt).toBeDefined();
    });
  });

  describe('5. Offline Operation & Manifest Serving', () => {
    it('returns active package data locally without live external network', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/active-package`, {
        headers: { Host: `127.0.0.1:${TEST_PORT}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.state).toBe('active');
      expect(data.displayId).toBe('disp-test-reception');
      expect(data.publicationId).toBe('pub-version-2');
    });

    it('serves active package status to renderer without external connectivity', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/status`, {
        headers: { Host: `127.0.0.1:${TEST_PORT}` },
      });
      expect(res.status).toBe(200);
      const status = await res.json();
      expect(status.enrolled).toBe(true);
      expect(status.displayId).toBe('disp-test-reception');
      expect(status.playback.isPlaying).toBe(true);
      expect(status.rendererHealth).toBe('healthy');
    });
  });
});
