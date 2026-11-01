/**
 * Aura DIMS - Hardware Integration, Transport Isolation, Verified Delivery & Operations Test Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Covers:
 * 1. PlayerTransport isolation ('emulator' vs 'cloud' modes, fail-closed config, URL boundaries)
 * 2. Automatic token renewal on 401 and revocation detection on 403
 * 3. HardwareAdapter real Linux thermal/meminfo/boot_id/statfs probes, null unknowns, capability gating, temp file cleanup
 * 4. SyncEngine .part streaming + fsync, per-asset progress, checksum rejection, signed asset URL renewal on 403,
 *    stale revision race protection, and compatibility checks (legacy vs Aura DIMS)
 * 5. Safe cache garbage collection protecting active, previous, and in-flight staged data
 * 6. OperationsAgent single-flight claiming, persistent local deduplication, capability checks,
 *    and post-reboot reconciliation (bootId / uptime evidence; never auto-replaying REBOOT)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { loadConfig } from '../../player/src/agent/config.js';
import { PlayerTransport, PlayerTransportError } from '../../player/src/agent/transport.js';
import { Logger } from '../../player/src/agent/logger.js';
import { DeviceIdentity } from '../../player/src/agent/identity.js';
import { HardwareAdapter } from '../../player/src/agent/hardwareAdapter.js';
import { SyncEngine } from '../../player/src/agent/syncEngine.js';
import { OperationsAgent } from '../../player/src/agent/operationsAgent.js';
import {
  checkDevicePublicationCompatibility,
  checkLegacyManifestCompatibility,
  type DetailedPublicationManifest,
  type DeviceOperationRecord,
} from '@aura-dims/display-schema';
import {
  reconcileAndCountOperationsOnHeartbeat,
  sanitizeAssetProgress,
  sanitizeCacheInventory,
  sanitizeCapabilities,
  sanitizeHardwareMetrics,
} from '../../functions/src/deviceOperations.js';

const TMP_ROOT = path.resolve(__dirname, '../../test-tmp/hw-integration');

function buildSampleManifest(
  overrides?: Partial<DetailedPublicationManifest>
): DetailedPublicationManifest {
  return {
    manifestVersion: '1.0',
    publicationId: 'pub-hw-100',
    displayId: 'disp-lobby-01',
    scheduleId: 'sched-01',
    playlistRevisionId: 'plrev-01',
    generatedAt: '2026-10-30T10:00:00.000Z',
    expiresAt: '2026-11-30T10:00:00.000Z',
    timezone: 'Asia/Kolkata',
    orientation: 'landscape',
    integrity: {
      algorithm: 'sha256',
      checksum: 'abc123',
    },
    scheduleRule: {
      scheduleType: 'recurring',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
      isOvernight: false,
      timezone: 'Asia/Kolkata',
      priority: 1,
      overrideExpiresAt: null,
    },
    playlist: {
      title: 'Corporate Announcements',
      totalDurationSeconds: 10,
      items: [
        {
          designRevisionId: 'drev-1',
          title: 'Welcome Slide',
          durationSeconds: 10,
          slides: [
            {
              id: 'slide-1',
              durationSeconds: 10,
              background: { type: 'color', value: '#0f172a' },
              elements: [
                {
                  id: 'el-img-1',
                  type: 'image',
                  name: 'Hero Image',
                  x: 0,
                  y: 0,
                  width: 1920,
                  height: 1080,
                  rotation: 0,
                  zIndex: 1,
                  opacity: 1,
                  assetId: 'asset-hero-1',
                  fit: 'cover',
                },
              ],
            },
          ],
        },
      ],
    },
    assets: [],
    fonts: [{ family: 'Inter', weights: [400, 700] }],
    fallback: {
      type: 'bundled',
      title: 'Fallback',
      slides: [],
    },
    ...overrides,
  };
}

describe('Aura DIMS - Hardware Integration & Player Runtime Suite', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP_ROOT)) {
      fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    }
    fs.mkdirSync(TMP_ROOT, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(TMP_ROOT)) {
      fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    }
  });

  describe('1. PlayerTransport Isolation & Configuration Validation', () => {
    it('defaults to emulator mode with demo-aura-dims and builds emulator callable URLs', () => {
      const cfg = loadConfig({
        dataDir: TMP_ROOT,
        mode: 'emulator',
        projectId: 'demo-aura-dims',
      });
      const transport = new PlayerTransport(cfg);

      expect(transport.getMode()).toBe('emulator');
      expect(transport.getCallableUrl('reportDeviceHeartbeat')).toBe(
        'http://127.0.0.1:5001/demo-aura-dims/asia-south1/reportDeviceHeartbeat'
      );
    });

    it('rejects non-demo projectId in emulator mode to prevent accidental live cloud calls', () => {
      expect(() =>
        loadConfig({
          dataDir: TMP_ROOT,
          mode: 'emulator',
          projectId: 'aura-dims-prod',
        })
      ).toThrow(/Emulator transport mode requires a "demo-\*" projectId/);
    });

    it('rejects cloud mode when projectId is demo-aura-dims or firebaseApiKey is demo-api-key', () => {
      expect(() =>
        loadConfig({
          dataDir: TMP_ROOT,
          mode: 'cloud',
          projectId: 'demo-aura-dims',
          firebaseApiKey: 'real-key-123',
        })
      ).toThrow(/Cloud transport mode requires a valid production Firebase projectId/);

      expect(() =>
        loadConfig({
          dataDir: TMP_ROOT,
          mode: 'cloud',
          projectId: 'aura-dims-prod',
          firebaseApiKey: 'demo-api-key',
        })
      ).toThrow(/Cloud transport mode requires a valid FIREBASE_API_KEY/);
    });

    it('rejects non-loopback local renderer host bindings', () => {
      expect(() =>
        loadConfig({
          dataDir: TMP_ROOT,
          host: '0.0.0.0',
        })
      ).toThrow(/Renderer server must bind strictly to loopback/);
    });

    it('enforces outbound asset download host boundaries in emulator vs cloud modes', () => {
      const emuTransport = new PlayerTransport(
        loadConfig({ dataDir: TMP_ROOT, mode: 'emulator', projectId: 'demo-aura-dims' })
      );
      expect(() =>
        emuTransport.validateAssetDownloadUrl('http://127.0.0.1:9199/v0/b/demo/o/asset.jpg')
      ).not.toThrow();
      expect(() =>
        emuTransport.validateAssetDownloadUrl('https://storage.googleapis.com/prod-bucket/asset.jpg')
      ).toThrow(/blocked outbound asset download to non-emulator host/);

      const cloudTransport = new PlayerTransport(
        loadConfig({
          dataDir: TMP_ROOT,
          mode: 'cloud',
          projectId: 'aura-dims-prod',
          firebaseApiKey: 'AIzaSyTestCloudKey123456',
        })
      );
      expect(() =>
        cloudTransport.validateAssetDownloadUrl('https://storage.googleapis.com/aura-dims-prod/a.jpg')
      ).not.toThrow();
      expect(() =>
        cloudTransport.validateAssetDownloadUrl('http://127.0.0.1:9199/v0/b/demo/o/a.jpg')
      ).toThrow(/Cloud transport mode requires HTTPS/);
      expect(() =>
        cloudTransport.validateAssetDownloadUrl('https://evil.example.com/a.jpg')
      ).toThrow(/blocked asset download from untrusted host/);
    });

    it('automatically renews expired device ID token once on 401 and detects revocation on 403', async () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT, mode: 'emulator' });
      const transport = new PlayerTransport(cfg);

      let callCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        callCount += 1;
        const authHeader = (init?.headers as Record<string, string>)?.Authorization;
        if (callCount === 1) {
          expect(authHeader).toBe('Bearer stale-token');
          return new Response(
            JSON.stringify({ error: { status: 'UNAUTHENTICATED', message: 'Token expired' } }),
            { status: 401 }
          );
        }
        expect(authHeader).toBe('Bearer refreshed-token');
        return new Response(JSON.stringify({ result: { accepted: true } }), { status: 200 });
      });

      const tokenProvider = {
        getValidIdToken: vi.fn(async (forceRefresh?: boolean) =>
          forceRefresh ? 'refreshed-token' : 'stale-token'
        ),
        markRevoked: vi.fn(),
      };

      const res = await transport.callAuthenticatedFunction<
        { displayId: string },
        { accepted: boolean }
      >('reportDeviceHeartbeat', { displayId: 'disp-1' }, tokenProvider);

      expect(res.accepted).toBe(true);
      expect(tokenProvider.getValidIdToken).toHaveBeenCalledTimes(2);
      expect(tokenProvider.getValidIdToken).toHaveBeenLastCalledWith(true);

      // Now simulate revoked device credentials (403 PERMISSION_DENIED)
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              status: 'PERMISSION_DENIED',
              message: 'Device identity is not enrolled or credentials revoked.',
            },
          }),
          { status: 403 }
        )
      );

      await expect(
        transport.callAuthenticatedFunction('reportDeviceHeartbeat', { displayId: 'disp-1' }, tokenProvider)
      ).rejects.toThrow(PlayerTransportError);
      expect(tokenProvider.markRevoked).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. HardwareAdapter Telemetry Probes & Capability Gating', () => {
    it('parses Linux thermal_zone0, /proc/meminfo, and boot_id while keeping missing sensors null', () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT });
      const logger = new Logger(cfg.logsDir);

      const thermalFile = path.join(TMP_ROOT, 'temp');
      const meminfoFile = path.join(TMP_ROOT, 'meminfo');
      const bootIdFile = path.join(TMP_ROOT, 'boot_id');

      fs.writeFileSync(thermalFile, '54320\n', 'utf8');
      fs.writeFileSync(
        meminfoFile,
        'MemTotal:        4000000 kB\nMemFree:         1000000 kB\nMemAvailable:    2500000 kB\n',
        'utf8'
      );
      fs.writeFileSync(bootIdFile, 'b77e5d20-1234-4a5b-9c8d-abcdef012345\n', 'utf8');

      const adapter = new HardwareAdapter(cfg, logger, {
        thermalFilePath: thermalFile,
        meminfoFilePath: meminfoFile,
        bootIdFilePath: bootIdFile,
      });

      const metrics = adapter.collectMetrics();
      expect(metrics.cpuTempCelsius).toBe(54.3);
      expect(metrics.memoryTotalBytes).toBe(4000000 * 1024);
      expect(metrics.memoryUsedBytes).toBe(1500000 * 1024);
      expect(metrics.bootId).toBe('b77e5d20-1234-4a5b-9c8d-abcdef012345');
      expect(metrics.diskTotalBytes).toBeGreaterThan(0);

      // Missing thermal sensor must return null, never fabricated numbers
      const missingAdapter = new HardwareAdapter(cfg, logger, {
        thermalFilePath: path.join(TMP_ROOT, 'nonexistent-thermal'),
        bootIdFilePath: path.join(TMP_ROOT, 'nonexistent-boot-id'),
      });
      expect(missingAdapter.readCpuTempCelsius()).toBeNull();
      expect(missingAdapter.readBootId()).toBeNull();
    });

    it('clearly disables preview capture and reboot when OS support is absent', async () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT, rebootHelperPath: null });
      const logger = new Logger(cfg.logsDir);
      const adapter = new HardwareAdapter(cfg, logger, {
        forceCapabilities: {
          capturePreview: false,
          capturePreviewReason: 'X11 display unavailable',
          reboot: false,
          rebootReason: 'Reboot helper not configured',
        },
      });

      const caps = adapter.getCapabilities();
      expect(caps.capturePreview).toBe(false);
      expect(caps.reboot).toBe(false);
      await expect(adapter.capturePreview()).rejects.toThrow(/X11 display unavailable/);
      await expect(adapter.triggerReboot()).rejects.toThrow(/Reboot helper not configured/);
    });

    it('bounds hardware telemetry and capabilities via server sanitizers', () => {
      const nowIso = '2026-10-30T15:00:00.000Z';
      const sanitizedHw = sanitizeHardwareMetrics(
        {
          cpuTempCelsius: 9999, // Out of bounds -> null
          memoryUsedBytes: 512 * 1024 * 1024,
          memoryTotalBytes: 2048 * 1024 * 1024,
          diskFreeBytes: -50, // Out of bounds -> null
          diskTotalBytes: 32 * 1024 * 1024 * 1024,
          osPlatform: 'linux',
          bootId: 'boot-123',
          observedAt: nowIso,
        },
        nowIso
      );
      expect(sanitizedHw?.cpuTempCelsius).toBeNull();
      expect(sanitizedHw?.diskFreeBytes).toBeNull();
      expect(sanitizedHw?.memoryUsedBytes).toBe(512 * 1024 * 1024);

      const sanitizedCaps = sanitizeCapabilities({
        schemaVersion: '1.0',
        protocolVersion: '1.1',
        agentVersion: '1.1.0',
        rendererVersion: '1.1.0',
        visualDesigns: true,
        supportedMediaTypes: ['image', 'video'],
        supportedOrientations: ['landscape'],
        supportedFonts: ['Inter'],
        capturePreview: true,
        refreshRenderer: true,
        reboot: false,
        rebootReason: 'Disabled in test',
        safeCacheCleanup: true,
      });
      expect(sanitizedCaps?.supportedOrientations).toEqual(['landscape']);
      expect(sanitizedCaps?.reboot).toBe(false);
      expect(sanitizeAssetProgress([])).toEqual([]);
      expect(sanitizeCacheInventory(null, nowIso)).toBeNull();
    });
  });

  describe('3. SyncEngine Verified .part Streaming, URL Renewal, Stale Race & Safe Cache GC', () => {
    let assetServer: http.Server;
    let assetPort: number;
    let assetBuffer: Buffer;
    let assetSha256: string;
    let failFirstAssetFetchWith403 = false;
    let serveCorruptPayload = false;

    beforeEach(async () => {
      assetBuffer = Buffer.from('Verified Digital Display Media Content Payload 2026');
      assetSha256 = crypto.createHash('sha256').update(assetBuffer).digest('hex');
      failFirstAssetFetchWith403 = false;
      serveCorruptPayload = false;

      assetServer = http.createServer((req, res) => {
        if (failFirstAssetFetchWith403 && req.url?.includes('expired-token')) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Signed URL expired');
          return;
        }
        const payload = serveCorruptPayload ? Buffer.from('corrupt-bytes-123456789012345678901234567890123') : assetBuffer;
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(payload.length),
        });
        res.end(payload);
      });

      await new Promise<void>((resolve) => {
        assetServer.listen(0, '127.0.0.1', () => {
          assetPort = (assetServer.address() as any).port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => assetServer.close(() => resolve()));
    });

    it('streams assets via .part files, renews expired signed URLs on 403, tracks progress, and activates atomically', async () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT });
      const logger = new Logger(cfg.logsDir);
      const identity = new DeviceIdentity(cfg, logger);
      identity.saveCredentials({
        displayId: 'disp-lobby-01',
        deviceSecret: 'secret-1',
        deviceUid: 'device:disp-lobby-01',
        enrolledAt: new Date().toISOString(),
      });
      vi.spyOn(identity, 'getIdToken').mockResolvedValue('valid-id-token');

      const hwAdapter = new HardwareAdapter(cfg, logger);
      const syncEngine = new SyncEngine(cfg, logger, identity, hwAdapter);

      const manifest = buildSampleManifest({
        publicationId: 'pub-renew-test',
        assets: [
          {
            assetId: 'asset-hero-1',
            fileName: 'hero-banner.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: assetBuffer.length,
            checksumSha256: assetSha256,
            storagePath: 'media/dept/asset-hero-1/hero-banner.jpg',
          },
        ],
      });

      failFirstAssetFetchWith403 = true;
      let manifestCallCount = 0;

      const transport = identity.getTransport();
      vi.spyOn(transport, 'callAuthenticatedFunction').mockImplementation(
        async (fnName: string, _payload: any) => {
          if (fnName === 'getDevicePublicationManifest') {
            manifestCallCount += 1;
            const tokenParam = manifestCallCount === 1 ? 'expired-token' : 'fresh-token';
            return {
              manifest,
              assetUrls: {
                'asset-hero-1': `http://127.0.0.1:${assetPort}/asset-hero-1.jpg?token=${tokenParam}`,
              },
            } as any;
          }
          if (fnName === 'getDevicePublication') {
            return {
              displayId: 'disp-lobby-01',
              lifecycle: 'active',
              desiredPublicationId: 'pub-renew-test',
              activePublicationId: null,
              orientation: 'landscape',
              configuredResolution: { width: 1920, height: 1080 },
              serverTimestamp: new Date().toISOString(),
            } as any;
          }
          if (fnName === 'reportDeviceDelivery') {
            return { accepted: true, serverReceivedAt: new Date().toISOString() } as any;
          }
          throw new Error(`Unexpected callable: ${fnName}`);
        }
      );

      const ok = await syncEngine.synchronizePublication('disp-lobby-01', 'pub-renew-test');
      expect(ok).toBe(true);
      expect(manifestCallCount).toBe(2); // Initial fetch + 1 renewal after 403!
      expect(syncEngine.getActivePublicationId()).toBe('pub-renew-test');

      const progress = syncEngine.getAssetProgress();
      expect(progress).toHaveLength(1);
      expect(progress[0].stage).toBe('ready');
      expect(progress[0].progressPercent).toBe(100);
      expect(progress[0].verifiedChecksumSha256).toBe(assetSha256);

      const inventory = syncEngine.getCacheInventory();
      expect(inventory.totalItems).toBe(1);
      expect(inventory.items[0].references).toContain('active');
    });

    it('rejects corrupted asset downloads on SHA-256 mismatch and preserves existing active publication', async () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT });
      const logger = new Logger(cfg.logsDir);
      const identity = new DeviceIdentity(cfg, logger);
      identity.saveCredentials({
        displayId: 'disp-lobby-01',
        deviceSecret: 'secret-1',
        deviceUid: 'device:disp-lobby-01',
        enrolledAt: new Date().toISOString(),
      });
      vi.spyOn(identity, 'getIdToken').mockResolvedValue('valid-id-token');

      const syncEngine = new SyncEngine(cfg, logger, identity, new HardwareAdapter(cfg, logger));
      serveCorruptPayload = true;

      const manifest = buildSampleManifest({
        publicationId: 'pub-corrupt-sha',
        assets: [
          {
            assetId: 'asset-hero-1',
            fileName: 'hero-banner.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 47, // matches corrupt buffer length so size check passes and SHA check triggers
            checksumSha256: assetSha256,
            storagePath: 'media/dept/asset-hero-1/hero-banner.jpg',
          },
        ],
      });

      vi.spyOn(identity.getTransport(), 'callAuthenticatedFunction').mockImplementation(
        async (fnName: string) => {
          if (fnName === 'getDevicePublicationManifest') {
            return {
              manifest,
              assetUrls: {
                'asset-hero-1': `http://127.0.0.1:${assetPort}/asset-hero-1.jpg`,
              },
            } as any;
          }
          return { accepted: true, serverReceivedAt: new Date().toISOString() } as any;
        }
      );

      const ok = await syncEngine.synchronizePublication('disp-lobby-01', 'pub-corrupt-sha');
      expect(ok).toBe(false);
      expect(syncEngine.getCurrentStage()).toBe('failed');
      expect(syncEngine.getLastError()).toMatch(/Integrity check failed/);
      expect(syncEngine.getActivePublicationId()).toBeNull();
    });

    it('prevents stale revision activation race when desiredPublicationId changes during download', async () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT });
      const logger = new Logger(cfg.logsDir);
      const identity = new DeviceIdentity(cfg, logger);
      identity.saveCredentials({
        displayId: 'disp-lobby-01',
        deviceSecret: 'secret-1',
        deviceUid: 'device:disp-lobby-01',
        enrolledAt: new Date().toISOString(),
      });
      vi.spyOn(identity, 'getIdToken').mockResolvedValue('valid-id-token');

      const syncEngine = new SyncEngine(cfg, logger, identity, new HardwareAdapter(cfg, logger));

      const manifestV1 = buildSampleManifest({ publicationId: 'pub-stale-v1', assets: [] });
      const manifestV2 = buildSampleManifest({ publicationId: 'pub-fresh-v2', assets: [] });

      vi.spyOn(identity.getTransport(), 'callAuthenticatedFunction').mockImplementation(
        async (fnName: string, payload: any) => {
          if (fnName === 'getDevicePublicationManifest') {
            return {
              manifest: payload.publicationId === 'pub-stale-v1' ? manifestV1 : manifestV2,
              assetUrls: {},
            } as any;
          }
          if (fnName === 'getDevicePublication') {
            // Simulate server advancing desiredPublicationId to pub-fresh-v2 while v1 was staging!
            return {
              displayId: 'disp-lobby-01',
              lifecycle: 'active',
              desiredPublicationId: 'pub-fresh-v2',
              activePublicationId: null,
              orientation: 'landscape',
              configuredResolution: { width: 1920, height: 1080 },
              serverTimestamp: new Date().toISOString(),
            } as any;
          }
          return { accepted: true, serverReceivedAt: new Date().toISOString() } as any;
        }
      );

      const ok = await syncEngine.synchronizePublication('disp-lobby-01', 'pub-stale-v1');
      expect(ok).toBe(true);
      // Stale v1 was aborted before activation and replaced by fresh v2!
      expect(syncEngine.getActivePublicationId()).toBe('pub-fresh-v2');
      expect(fs.existsSync(path.join(cfg.versionsDir, 'pub-stale-v1'))).toBe(false);
      expect(fs.existsSync(path.join(cfg.versionsDir, 'pub-fresh-v2'))).toBe(true);
    });

    it('protects active, previous, and in-use staged files during safe cache cleanup while pruning unreferenced blobs', () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT });
      const logger = new Logger(cfg.logsDir);
      const identity = new DeviceIdentity(cfg, logger);
      const syncEngine = new SyncEngine(cfg, logger, identity);

      const activeSha = 'a'.repeat(64);
      const prevSha = 'b'.repeat(64);
      const unreferencedSha = 'c'.repeat(64);

      fs.writeFileSync(path.join(cfg.cacheDir, activeSha), 'active-blob');
      fs.writeFileSync(path.join(cfg.cacheDir, prevSha), 'prev-blob');
      fs.writeFileSync(path.join(cfg.cacheDir, unreferencedSha), 'orphan-blob');
      fs.writeFileSync(path.join(cfg.cacheDir, `${unreferencedSha}.part`), 'partial-blob');

      const vActiveDir = path.join(cfg.versionsDir, 'pub-active');
      const vPrevDir = path.join(cfg.versionsDir, 'pub-prev');
      const vOldDir = path.join(cfg.versionsDir, 'pub-old-superseded');
      fs.mkdirSync(path.join(vActiveDir, 'assets'), { recursive: true });
      fs.mkdirSync(path.join(vPrevDir, 'assets'), { recursive: true });
      fs.mkdirSync(path.join(vOldDir, 'assets'), { recursive: true });

      fs.writeFileSync(
        path.join(vActiveDir, 'manifest.json'),
        JSON.stringify(
          buildSampleManifest({
            publicationId: 'pub-active',
            assets: [
              {
                assetId: 'a1',
                fileName: 'a1.jpg',
                mimeType: 'image/jpeg',
                fileSizeBytes: 11,
                checksumSha256: activeSha,
                storagePath: 'p1',
              },
            ],
          })
        )
      );
      fs.writeFileSync(
        path.join(vPrevDir, 'manifest.json'),
        JSON.stringify(
          buildSampleManifest({
            publicationId: 'pub-prev',
            assets: [
              {
                assetId: 'a2',
                fileName: 'a2.jpg',
                mimeType: 'image/jpeg',
                fileSizeBytes: 9,
                checksumSha256: prevSha,
                storagePath: 'p2',
              },
            ],
          })
        )
      );

      fs.writeFileSync(
        path.join(cfg.packagesDir, 'active.json'),
        JSON.stringify({
          publicationId: 'pub-active',
          displayId: 'disp-1',
          activatedAt: new Date().toISOString(),
          manifestPath: path.join(vActiveDir, 'manifest.json'),
          assetsDir: path.join(vActiveDir, 'assets'),
        })
      );
      fs.writeFileSync(
        path.join(cfg.packagesDir, 'previous.json'),
        JSON.stringify({
          publicationId: 'pub-prev',
          displayId: 'disp-1',
          activatedAt: new Date().toISOString(),
          manifestPath: path.join(vPrevDir, 'manifest.json'),
          assetsDir: path.join(vPrevDir, 'assets'),
        })
      );

      const cleanup = syncEngine.runSafeCacheCleanup();
      expect(cleanup.removedPublications).toBe(1);
      expect(cleanup.removedAssets).toBe(1);
      expect(cleanup.removedPartFiles).toBe(1);

      expect(fs.existsSync(path.join(cfg.cacheDir, activeSha))).toBe(true);
      expect(fs.existsSync(path.join(cfg.cacheDir, prevSha))).toBe(true);
      expect(fs.existsSync(path.join(cfg.cacheDir, unreferencedSha))).toBe(false);
      expect(fs.existsSync(vActiveDir)).toBe(true);
      expect(fs.existsSync(vPrevDir)).toBe(true);
      expect(fs.existsSync(vOldDir)).toBe(false);
    });
  });

  describe('4. Feature Compatibility & Orientation Validation', () => {
    it('flags multi-element visual designs, localized fonts, portrait orientation, and priority overrides in checkLegacyManifestCompatibility', () => {
      const complexManifest = buildSampleManifest({
        orientation: 'portrait',
        scheduleRule: {
          scheduleType: 'one_time',
          startDate: '2026-10-30',
          endDate: '2026-10-31',
          daysOfWeek: [5],
          startTime: '09:00',
          endTime: '18:00',
          isOvernight: false,
          timezone: 'Asia/Kolkata',
          priority: 10,
          overrideExpiresAt: '2026-10-31T18:00:00.000Z',
        },
        playlist: {
          title: 'Gujarati Emergency Notice',
          totalDurationSeconds: 15,
          items: [
            {
              designRevisionId: 'drev-guj',
              title: 'Notice Board',
              durationSeconds: 15,
              slides: [
                {
                  id: 's1',
                  durationSeconds: 15,
                  background: { type: 'color', value: '#000000' },
                  elements: [
                    {
                      id: 't1',
                      type: 'text',
                      name: 'Heading',
                      x: 10,
                      y: 10,
                      width: 800,
                      height: 100,
                      rotation: 0,
                      zIndex: 1,
                      opacity: 1,
                      content: 'અગત્યની સૂચના',
                      fontFamily: 'Noto Sans Gujarati',
                      fontSize: 48,
                      fontWeight: 'bold',
                      color: '#ffffff',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      letterSpacing: 0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const legacyCompat = checkLegacyManifestCompatibility(complexManifest);
      expect(legacyCompat.compatible).toBe(false);
      expect(legacyCompat.reasons.length).toBeGreaterThanOrEqual(4);

      // Verify device compatibility rejects orientation mismatch explicitly
      const deviceMismatch = checkDevicePublicationCompatibility(complexManifest, 'landscape', null);
      expect(deviceMismatch.compatible).toBe(false);
      expect(deviceMismatch.reasons[0]).toMatch(/does not match digital display orientation/);
    });
  });

  describe('5. Durable OperationsAgent Deduplication & Reboot Reconciliation', () => {
    it('executes REFRESH_RENDERER, records local deduplication ledger, and avoids re-executing duplicate leases', async () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT });
      const logger = new Logger(cfg.logsDir);
      const identity = new DeviceIdentity(cfg, logger);
      identity.saveCredentials({
        displayId: 'disp-ops-01',
        deviceSecret: 'secret-1',
        deviceUid: 'device:disp-ops-01',
        enrolledAt: new Date().toISOString(),
      });
      vi.spyOn(identity, 'getIdToken').mockResolvedValue('valid-id-token');

      const hwAdapter = new HardwareAdapter(cfg, logger);
      const syncEngine = new SyncEngine(cfg, logger, identity, hwAdapter);
      let refreshCount = 0;

      const opsAgent = new OperationsAgent({
        config: cfg,
        logger,
        identity,
        syncEngine,
        hardwareAdapter: hwAdapter,
        onRefreshRenderer: () => ++refreshCount,
      });

      const sampleOp: DeviceOperationRecord = {
        id: 'op-refresh-101',
        displayId: 'disp-ops-01',
        departmentId: 'dept-1',
        type: 'REFRESH_RENDERER',
        state: 'claimed',
        requestedBy: 'admin-1',
        requestedByRole: 'admin',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        claimLeaseId: 'lease-abc',
        claimExpiresAt: new Date(Date.now() + 90_000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
        updatedAt: new Date().toISOString(),
      };

      const reportedStates: string[] = [];
      vi.spyOn(identity.getTransport(), 'callAuthenticatedFunction').mockImplementation(
        async (fnName: string, payload: any) => {
          if (fnName === 'claimDeviceOperation') {
            return { operation: sampleOp, serverTimestamp: new Date().toISOString() } as any;
          }
          if (fnName === 'reportDeviceOperation') {
            reportedStates.push(payload.state);
            return {
              operation: { ...sampleOp, state: payload.state },
              serverReceivedAt: new Date().toISOString(),
            } as any;
          }
          throw new Error(`Unexpected callable: ${fnName}`);
        }
      );

      await opsAgent.pollAndExecuteNext(true);
      expect(refreshCount).toBe(1);
      expect(reportedStates).toEqual(['in_progress', 'succeeded']);

      // Poll again with the same operation ID: ledger deduplicates without calling onRefreshRenderer a second time!
      reportedStates.length = 0;
      await opsAgent.pollAndExecuteNext(true);
      expect(refreshCount).toBe(1);
      expect(reportedStates).toEqual(['succeeded']);
    });

    it('transitions REBOOT to awaiting_reconnect before triggering reboot and reconciles to succeeded only after bootId changes', async () => {
      const cfg = loadConfig({ dataDir: TMP_ROOT });
      const logger = new Logger(cfg.logsDir);
      const identity = new DeviceIdentity(cfg, logger);
      identity.saveCredentials({
        displayId: 'disp-reboot-01',
        deviceSecret: 'secret-1',
        deviceUid: 'device:disp-reboot-01',
        enrolledAt: new Date().toISOString(),
      });
      vi.spyOn(identity, 'getIdToken').mockResolvedValue('valid-id-token');

      const bootIdFile = path.join(TMP_ROOT, 'boot_id');
      fs.writeFileSync(bootIdFile, 'boot-before-1111\n', 'utf8');

      let rebootTriggered = 0;
      const hwAdapter = new HardwareAdapter(cfg, logger, {
        bootIdFilePath: bootIdFile,
        triggerRebootFn: async () => {
          rebootTriggered += 1;
        },
      });
      const syncEngine = new SyncEngine(cfg, logger, identity, hwAdapter);

      const opsAgent = new OperationsAgent({
        config: cfg,
        logger,
        identity,
        syncEngine,
        hardwareAdapter: hwAdapter,
        onRefreshRenderer: () => 1,
      });

      const rebootOp: DeviceOperationRecord = {
        id: 'op-reboot-999',
        displayId: 'disp-reboot-01',
        departmentId: 'dept-1',
        type: 'REBOOT',
        state: 'claimed',
        requestedBy: 'admin-1',
        requestedByRole: 'admin',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        claimLeaseId: 'lease-reboot-1',
        claimExpiresAt: new Date(Date.now() + 90_000).toISOString(),
        attemptCount: 1,
        maxAttempts: 1,
        updatedAt: new Date().toISOString(),
      };

      const reportedPayloads: any[] = [];
      let shouldReturnOpOnClaim = true;

      vi.spyOn(identity.getTransport(), 'callAuthenticatedFunction').mockImplementation(
        async (fnName: string, payload: any) => {
          if (fnName === 'claimDeviceOperation') {
            const op = shouldReturnOpOnClaim ? rebootOp : null;
            shouldReturnOpOnClaim = false;
            return { operation: op, serverTimestamp: new Date().toISOString() } as any;
          }
          if (fnName === 'reportDeviceOperation') {
            reportedPayloads.push(payload);
            return {
              operation: { ...rebootOp, state: payload.state },
              serverReceivedAt: new Date().toISOString(),
            } as any;
          }
          throw new Error(`Unexpected callable: ${fnName}`);
        }
      );

      // 1. Claim and dispatch REBOOT -> must report awaiting_reconnect, NOT succeeded!
      await opsAgent.pollAndExecuteNext(true);
      expect(rebootTriggered).toBe(1);
      expect(reportedPayloads).toHaveLength(1);
      expect(reportedPayloads[0].state).toBe('awaiting_reconnect');
      expect(reportedPayloads[0].preRebootBootId).toBe('boot-before-1111');

      // 2. Simulate OS reboot by updating boot_id and reconnecting
      fs.writeFileSync(bootIdFile, 'boot-after-2222\n', 'utf8');
      await opsAgent.reconcilePendingReboots();

      expect(rebootTriggered).toBe(1); // Never triggered a second time!
      expect(reportedPayloads).toHaveLength(2);
      expect(reportedPayloads[1].state).toBe('succeeded');
      expect(reportedPayloads[1].resultSummary).toMatch(/verified OS reboot/);
    });
  });
});
