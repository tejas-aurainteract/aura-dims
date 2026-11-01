/**
 * Aura DIMS - Server-Authorized Durable Device Operations & Private Previews Test Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Covers:
 * 1. Server-side heartbeat sanitization & payload bounding (metrics, capabilities, asset progress, cache inventory)
 * 2. User & Device authorization boundaries (Admin vs Assigned Dept Head vs Unassigned Dept Head vs Device UID)
 * 3. Rejection of unsupported/forbidden operation types (including TERMINAL and unconfirmed REBOOT)
 * 4. Request idempotency, transactional single-flight device claiming, lease expiry retry, and operation TTL expiry
 * 5. Post-reconnect REBOOT reconciliation via bootId change or uptime reset
 * 6. Private on-demand software preview upload, previous preview cleanup, and scoped signed URL generation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as net from 'node:net';

// Point Firebase Admin SDK strictly at the local demo-aura-dims emulators BEFORE importing functions
process.env.GCLOUD_PROJECT = 'demo-aura-dims';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-aura-dims',
  storageBucket: 'demo-aura-dims.appspot.com',
});
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';

import { db } from '../../functions/src/common';
import {
  sanitizeHardwareMetrics,
  sanitizeCapabilities,
  sanitizeAssetProgress,
  sanitizeCacheInventory,
  requestDisplayOperation,
  listDisplayOperations,
  claimDeviceOperation,
  reportDeviceOperation,
  uploadDevicePreview,
  getDisplayPreviewUrl,
  reconcileAndCountOperationsOnHeartbeat,
} from '../../functions/src/deviceOperations';
import { reportDeviceHeartbeat } from '../../functions/src/fleetAdmin';

function checkPortOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(ok);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function callFn<TReq, TRes>(
  fn: { run: (req: any) => Promise<TRes> },
  data: TReq,
  auth?: { uid: string; token?: Record<string, unknown> }
): Promise<TRes> {
  return fn.run({
    data,
    auth: auth ? { uid: auth.uid, token: auth.token || {} } : undefined,
    rawRequest: {
      ip: '127.0.0.1',
      headers: {},
    },
  });
}

describe('Aura DIMS - Durable Device Operations & Telemetry Sanitization', () => {
  // ==========================================================================
  // 1. Pure Server-Side Telemetry Sanitization & Payload Bounding
  // ==========================================================================
  describe('1. Server-Side Heartbeat Sanitization & Payload Bounding', () => {
    it('keeps unknown hardware metrics null and rejects out-of-range sensor values', () => {
      const serverNow = '2026-10-30T15:00:00.000Z';
      expect(sanitizeHardwareMetrics(null, serverNow)).toBeNull();

      const sanitized = sanitizeHardwareMetrics(
        {
          cpuTempCelsius: 999, // invalid (> 150C)
          memoryUsedBytes: -50, // invalid (< 0)
          memoryTotalBytes: 4 * 1024 * 1024 * 1024,
          diskFreeBytes: 12 * 1024 * 1024 * 1024,
          diskTotalBytes: 32 * 1024 * 1024 * 1024,
          osPlatform: 'linux',
          osRelease: '6.8.0-generic',
          arch: 'x64',
          bootId: 'b7e2f880-1111-2222-3333-444455556666',
          observedAt: '',
        },
        serverNow
      );

      expect(sanitized).not.toBeNull();
      expect(sanitized!.cpuTempCelsius).toBeNull();
      expect(sanitized!.memoryUsedBytes).toBeNull();
      expect(sanitized!.memoryTotalBytes).toBe(4 * 1024 * 1024 * 1024);
      expect(sanitized!.bootId).toBe('b7e2f880-1111-2222-3333-444455556666');
      expect(sanitized!.observedAt).toBe(serverNow);
    });

    it('sanitizes versioned device capabilities and filters unsupported media/orientations', () => {
      const caps = sanitizeCapabilities({
        schemaVersion: '1.0',
        protocolVersion: '2.0',
        agentVersion: '2.0.0',
        rendererVersion: '2.0.0',
        visualDesigns: true,
        supportedMediaTypes: ['image', 'video', 'flash' as any],
        supportedOrientations: ['landscape', 'diagonal' as any],
        supportedFonts: ['Inter', 'Roboto'],
        capturePreview: false,
        capturePreviewReason: 'scrot utility is not installed',
        refreshRenderer: true,
        refreshRendererReason: null,
        reboot: false,
        rebootReason: 'AURA_REBOOT_HELPER not configured',
        safeCacheCleanup: true,
      });

      expect(caps).not.toBeNull();
      expect(caps!.supportedMediaTypes).toEqual(['image', 'video']);
      expect(caps!.supportedOrientations).toEqual(['landscape']);
      expect(caps!.capturePreview).toBe(false);
      expect(caps!.capturePreviewReason).toContain('scrot');
    });

    it('bounds asset transfer progress and cache inventory arrays to at most 100 items', () => {
      const oversizedProgress = Array.from({ length: 135 }, (_, idx) => ({
        publicationId: 'pub-1',
        assetId: `asset-${idx}`,
        fileName: `slide-${idx}.png`,
        sizeBytes: 1000,
        bytesTransferred: 1500, // should clamp to sizeBytes (1000)
        progressPercent: 140, // should clamp to 100
        checksumSha256: 'A'.repeat(64),
        verifiedChecksumSha256: null,
        stage: 'downloading' as const,
        fromCache: false,
        updatedAt: '2026-10-30T15:00:00.000Z',
        errorMessage: null,
      }));

      const sanitizedProgress = sanitizeAssetProgress(oversizedProgress);
      expect(sanitizedProgress).toHaveLength(100);
      expect(sanitizedProgress![0].bytesTransferred).toBe(1000);
      expect(sanitizedProgress![0].progressPercent).toBe(100);
      expect(sanitizedProgress![0].checksumSha256).toBe('a'.repeat(64));

      const oversizedCache = sanitizeCacheInventory(
        {
          reportedAt: '2026-10-30T15:00:00.000Z',
          activePublicationId: 'pub-active',
          previousPublicationId: 'pub-prev',
          stagedPublicationIds: [],
          totalItems: 120,
          totalBytes: 50000,
          referencedBytes: 40000,
          unreferencedBytes: 10000,
          items: Array.from({ length: 120 }, (_, idx) => ({
            checksumSha256: `${idx}`.padStart(64, '0'),
            assetIds: [`asset-${idx}`],
            fileNames: [`file-${idx}.jpg`],
            sizeBytes: 500,
            verifiedAt: '2026-10-30T15:00:00.000Z',
            lastUsedAt: '2026-10-30T15:00:00.000Z',
            references: ['active'],
          })),
        },
        '2026-10-30T15:00:00.000Z'
      );

      expect(oversizedCache).not.toBeNull();
      expect(oversizedCache!.items).toHaveLength(100);
    });
  });

  // ==========================================================================
  // 2. Emulator-Backed End-to-End Device Operations & Preview Lifecycle
  // ==========================================================================
  describe('2. Emulator-Backed Device Operations, Authorization, Lease & Reboot Reconciliation', () => {
    let emulatorsAvailable = false;

    const ADMIN_UID = 'admin-ops-uid-1';
    const ASSIGNED_HEAD_UID = 'head-assigned-uid-1';
    const UNASSIGNED_HEAD_UID = 'head-unassigned-uid-1';
    const OTHER_DEPT_HEAD_UID = 'head-other-dept-uid-1';
    const DEVICE_UID = 'dvc_disp_ops_01';
    const ROGUE_DEVICE_UID = 'dvc_rogue_device_99';

    const DEPT_ID = 'dept-ops-test';
    const OTHER_DEPT_ID = 'dept-other-test';
    const SITE_ID = 'site-ops-test';
    const DISPLAY_ID = 'disp-ops-test-01';

    beforeAll(async () => {
      const [firestoreUp, storageUp] = await Promise.all([
        checkPortOpen('127.0.0.1', 8080),
        checkPortOpen('127.0.0.1', 9199),
      ]);
      emulatorsAvailable = firestoreUp && storageUp;
      if (!emulatorsAvailable) {
        return;
      }

      const nowIso = new Date().toISOString();

      // Seed Departments
      await db.collection('departments').doc(DEPT_ID).set({
        id: DEPT_ID,
        name: 'Hardware Ops Department',
        code: 'HOPS',
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      await db.collection('departments').doc(OTHER_DEPT_ID).set({
        id: OTHER_DEPT_ID,
        name: 'Other Department',
        code: 'OTHR',
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      // Seed Users
      await db.collection('users').doc(ADMIN_UID).set({
        uid: ADMIN_UID,
        email: 'admin.ops@aurainteract.com',
        displayName: 'System Admin',
        role: 'admin',
        departmentId: null,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      await db.collection('users').doc(ASSIGNED_HEAD_UID).set({
        uid: ASSIGNED_HEAD_UID,
        email: 'assigned.head@aurainteract.com',
        displayName: 'Assigned Dept Head',
        role: 'department_head',
        departmentId: DEPT_ID,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      await db.collection('users').doc(UNASSIGNED_HEAD_UID).set({
        uid: UNASSIGNED_HEAD_UID,
        email: 'unassigned.head@aurainteract.com',
        displayName: 'Unassigned Dept Head',
        role: 'department_head',
        departmentId: DEPT_ID,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      await db.collection('users').doc(OTHER_DEPT_HEAD_UID).set({
        uid: OTHER_DEPT_HEAD_UID,
        email: 'other.head@aurainteract.com',
        displayName: 'Other Dept Head',
        role: 'department_head',
        departmentId: OTHER_DEPT_ID,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      // Seed Site & Enrolled Digital Display
      await db.collection('sites').doc(SITE_ID).set({
        id: SITE_ID,
        name: 'Bengaluru Campus',
        location: 'Bengaluru',
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      await db.collection('displays').doc(DISPLAY_ID).set({
        id: DISPLAY_ID,
        name: 'Lobby Hardware Test Digital Display',
        siteId: SITE_ID,
        departmentId: DEPT_ID,
        locationDescription: 'Main Lobby',
        groupIds: [],
        orientation: 'landscape',
        configuredResolution: { width: 1920, height: 1080 },
        lifecycle: 'active',
        enrolledAt: nowIso,
        lastHeartbeatAt: nowIso,
        reported: {
          appVersion: '2.0.0',
          hostname: 'aura-player-01',
          resolution: { width: 1920, height: 1080 },
          orientation: 'landscape',
          timezone: 'Asia/Kolkata',
          uptimeSeconds: 5000,
          hardwareMetrics: {
            cpuTempCelsius: 49.5,
            memoryUsedBytes: 1024 * 1024 * 512,
            memoryTotalBytes: 1024 * 1024 * 2048,
            diskFreeBytes: 1024 * 1024 * 1024 * 10,
            diskTotalBytes: 1024 * 1024 * 1024 * 32,
            osPlatform: 'linux',
            osRelease: '6.8.0',
            arch: 'x64',
            bootId: 'boot-initial-1111',
            observedAt: nowIso,
          },
          capabilities: {
            schemaVersion: '1.0',
            protocolVersion: '2.0',
            agentVersion: '2.0.0',
            rendererVersion: '2.0.0',
            visualDesigns: true,
            supportedMediaTypes: ['image', 'video'],
            supportedOrientations: ['landscape', 'portrait'],
            supportedFonts: ['Inter', 'Roboto', 'Playfair Display', 'JetBrains Mono', 'Noto Sans'],
            capturePreview: true,
            capturePreviewReason: null,
            refreshRenderer: true,
            refreshRendererReason: null,
            reboot: true,
            rebootReason: null,
            safeCacheCleanup: true,
          },
        },
        createdBy: ADMIN_UID,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      // Seed authoritative display assignment for ASSIGNED_HEAD_UID only
      await db
        .collection('displayAssignments')
        .doc(`${DISPLAY_ID}__${ASSIGNED_HEAD_UID}`)
        .set({
          displayId: DISPLAY_ID,
          uid: ASSIGNED_HEAD_UID,
          departmentId: DEPT_ID,
          assignedBy: ADMIN_UID,
          assignedAt: nowIso,
        });

      // Seed active device secret binding
      await db.collection('displaySecrets').doc(DISPLAY_ID).set({
        displayId: DISPLAY_ID,
        activeDeviceUid: DEVICE_UID,
        credentialGeneration: 1,
        enrolledAt: nowIso,
      });
    }, 30000);

    it('enforces user scope: assigned Department Head can queue SYNC_NOW/CAPTURE_PREVIEW but is denied REBOOT; unassigned and cross-dept Department Heads are denied all operations', async (ctx) => {
      if (!emulatorsAvailable) return ctx.skip();

      // 1. Unassigned Department Head in the same department -> PERMISSION_DENIED
      await expect(
        callFn(
          requestDisplayOperation,
          {
            displayId: DISPLAY_ID,
            type: 'SYNC_NOW',
            idempotencyKey: 'unassigned-sync-1',
          },
          { uid: UNASSIGNED_HEAD_UID }
        )
      ).rejects.toThrow();

      // 2. Cross-department Department Head -> PERMISSION_DENIED
      await expect(
        callFn(
          requestDisplayOperation,
          {
            displayId: DISPLAY_ID,
            type: 'SYNC_NOW',
            idempotencyKey: 'other-dept-sync-1',
          },
          { uid: OTHER_DEPT_HEAD_UID }
        )
      ).rejects.toThrow();

      // 3. Assigned Department Head -> allowed for SYNC_NOW, denied for REBOOT and TERMINAL
      const syncRes = await callFn(
        requestDisplayOperation,
        {
          displayId: DISPLAY_ID,
          type: 'SYNC_NOW',
          idempotencyKey: 'assigned-sync-idem-1',
          reason: 'Manual verification sync',
        },
        { uid: ASSIGNED_HEAD_UID }
      );
      expect(syncRes.operation.type).toBe('SYNC_NOW');
      expect(syncRes.operation.state).toBe('queued');
      expect(syncRes.deduplicated).toBe(false);

      // Duplicate idempotencyKey returns existing operation with deduplicated: true
      const dupRes = await callFn(
        requestDisplayOperation,
        {
          displayId: DISPLAY_ID,
          type: 'SYNC_NOW',
          idempotencyKey: 'assigned-sync-idem-1',
        },
        { uid: ASSIGNED_HEAD_UID }
      );
      expect(dupRes.operation.id).toBe(syncRes.operation.id);
      expect(dupRes.deduplicated).toBe(true);

      // Assigned Department Head cannot request REBOOT (Admin-only)
      await expect(
        callFn(
          requestDisplayOperation,
          {
            displayId: DISPLAY_ID,
            type: 'REBOOT',
            idempotencyKey: 'dept-head-reboot-attempt',
            confirmed: true,
          },
          { uid: ASSIGNED_HEAD_UID }
        )
      ).rejects.toThrow(/Only System Administrators/);

      // Arbitrary shell / TERMINAL is rejected for all callers
      await expect(
        callFn(
          requestDisplayOperation,
          {
            displayId: DISPLAY_ID,
            type: 'TERMINAL' as any,
            idempotencyKey: 'terminal-attempt',
          },
          { uid: ADMIN_UID }
        )
      ).rejects.toThrow(/Unsupported or forbidden/);
    });

    it('supports transactional device claiming, progress reporting, lease expiry retry, and blocks cross-device spoofing', async (ctx) => {
      if (!emulatorsAvailable) return ctx.skip();

      // Rogue device UID is rejected from claiming operations on DISPLAY_ID
      await expect(
        callFn(
          claimDeviceOperation,
          { displayId: DISPLAY_ID },
          { uid: ROGUE_DEVICE_UID, token: { principal: 'device' } }
        )
      ).rejects.toThrow(/Device identity does not match/);

      // Authorized device claims the queued SYNC_NOW operation
      const claimRes = await callFn(
        claimDeviceOperation,
        { displayId: DISPLAY_ID },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(claimRes.operation).not.toBeNull();
      const op = claimRes.operation!;
      expect(op.type).toBe('SYNC_NOW');
      expect(op.state).toBe('claimed');
      expect(op.claimLeaseId).toBeTruthy();

      // Single-flight enforcement: second claim while first is active returns null
      const secondClaim = await callFn(
        claimDeviceOperation,
        { displayId: DISPLAY_ID },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(secondClaim.operation).toBeNull();

      // Device reports succeeded with matching lease
      const reportRes = await callFn(
        reportDeviceOperation,
        {
          displayId: DISPLAY_ID,
          operationId: op.id,
          claimLeaseId: op.claimLeaseId!,
          state: 'succeeded',
          resultSummary: 'Completed immediate sync cycle.',
        },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(reportRes.operation.state).toBe('succeeded');

      // Idempotent terminal re-report succeeds without error
      const repeatReport = await callFn(
        reportDeviceOperation,
        {
          displayId: DISPLAY_ID,
          operationId: op.id,
          claimLeaseId: op.claimLeaseId!,
          state: 'succeeded',
          resultSummary: 'Completed immediate sync cycle.',
        },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(repeatReport.operation.state).toBe('succeeded');
    });

    it('re-queues non-destructive operations on claim lease timeout and expires past-TTL operations', async (ctx) => {
      if (!emulatorsAvailable) return ctx.skip();

      const refreshOp = await callFn(
        requestDisplayOperation,
        {
          displayId: DISPLAY_ID,
          type: 'REFRESH_RENDERER',
          idempotencyKey: 'refresh-lease-timeout-1',
        },
        { uid: ASSIGNED_HEAD_UID }
      );

      const claimed = await callFn(
        claimDeviceOperation,
        { displayId: DISPLAY_ID },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(claimed.operation?.id).toBe(refreshOp.operation.id);
      expect(claimed.operation?.attemptCount).toBe(1);

      // Advance simulated clock past claim lease expiry (90s) but before operation TTL (900s)
      const futureAfterLeaseMs = Date.now() + 120 * 1000;
      const pendingCount = await reconcileAndCountOperationsOnHeartbeat({
        displayId: DISPLAY_ID,
        deviceUid: DEVICE_UID,
        bootId: 'boot-initial-1111',
        uptimeSeconds: 5120,
        nowMs: futureAfterLeaseMs,
      });
      expect(pendingCount).toBeGreaterThanOrEqual(1);

      // Device can now claim the re-queued operation on attempt #2
      const reclaimed = await callFn(
        claimDeviceOperation,
        { displayId: DISPLAY_ID },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(reclaimed.operation?.id).toBe(refreshOp.operation.id);
      expect(reclaimed.operation?.attemptCount).toBe(2);

      // Advance simulated clock past operation TTL (900s) -> transitions to expired
      const futureAfterTtlMs = Date.now() + 1000 * 1000;
      await reconcileAndCountOperationsOnHeartbeat({
        displayId: DISPLAY_ID,
        deviceUid: DEVICE_UID,
        bootId: 'boot-initial-1111',
        uptimeSeconds: 6000,
        nowMs: futureAfterTtlMs,
      });

      const listRes = await callFn(
        listDisplayOperations,
        { displayId: DISPLAY_ID, limit: 10 },
        { uid: ASSIGNED_HEAD_UID }
      );
      const expiredOp = listRes.operations.find((o) => o.id === refreshOp.operation.id);
      expect(expiredOp?.state).toBe('expired');
    });

    it('uploads private software preview, updates lastPreview, and issues scoped signed URLs only to authorized users', async (ctx) => {
      if (!emulatorsAvailable) return ctx.skip();

      // Assigned Department Head requests CAPTURE_PREVIEW
      const previewOpRes = await callFn(
        requestDisplayOperation,
        {
          displayId: DISPLAY_ID,
          type: 'CAPTURE_PREVIEW',
          idempotencyKey: 'capture-preview-1',
        },
        { uid: ASSIGNED_HEAD_UID }
      );
      const previewOpId = previewOpRes.operation.id;

      // Device claims CAPTURE_PREVIEW and uploads a valid PNG
      const claimed = await callFn(
        claimDeviceOperation,
        { displayId: DISPLAY_ID },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(claimed.operation?.id).toBe(previewOpId);

      // Minimal valid PNG header + payload
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x07, 0x80, 0x00, 0x00, 0x04, 0x38,
      ]);
      const uploadRes = await callFn(
        uploadDevicePreview,
        {
          displayId: DISPLAY_ID,
          operationId: previewOpId,
          claimLeaseId: claimed.operation!.claimLeaseId!,
          imageBase64: pngBytes.toString('base64'),
          mimeType: 'image/png',
          width: 1920,
          height: 1080,
          capturedAt: new Date().toISOString(),
          activePublicationId: 'pub-test-1',
        },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );

      expect(uploadRes.preview.storagePath).toContain(`previews/${DISPLAY_ID}/`);
      expect(uploadRes.preview.sizeBytes).toBe(pngBytes.length);

      await callFn(
        reportDeviceOperation,
        {
          displayId: DISPLAY_ID,
          operationId: previewOpId,
          claimLeaseId: claimed.operation!.claimLeaseId!,
          state: 'succeeded',
          resultSummary: 'Uploaded software preview.',
        },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );

      // Assigned Department Head can request signed preview URL
      const urlRes = await callFn(
        getDisplayPreviewUrl,
        { displayId: DISPLAY_ID },
        { uid: ASSIGNED_HEAD_UID }
      );
      expect(urlRes.url).toBeTruthy();
      expect(urlRes.preview.operationId).toBe(previewOpId);

      // Unassigned Department Head is denied preview URL access
      await expect(
        callFn(
          getDisplayPreviewUrl,
          { displayId: DISPLAY_ID },
          { uid: UNASSIGNED_HEAD_UID }
        )
      ).rejects.toThrow();
    });

    it('enforces Admin confirmation on REBOOT, transitions to awaiting_reconnect, and completes only after post-reboot heartbeat evidence', async (ctx) => {
      if (!emulatorsAvailable) return ctx.skip();

      // Unconfirmed REBOOT is rejected even for Admin
      await expect(
        callFn(
          requestDisplayOperation,
          {
            displayId: DISPLAY_ID,
            type: 'REBOOT',
            idempotencyKey: 'reboot-unconfirmed',
            confirmed: false,
          },
          { uid: ADMIN_UID }
        )
      ).rejects.toThrow(/Explicit confirmation/);

      // Confirmed REBOOT succeeds
      const rebootReq = await callFn(
        requestDisplayOperation,
        {
          displayId: DISPLAY_ID,
          type: 'REBOOT',
          idempotencyKey: 'reboot-confirmed-1',
          confirmed: true,
          reason: 'Scheduled kernel maintenance verification',
        },
        { uid: ADMIN_UID }
      );
      expect(rebootReq.operation.type).toBe('REBOOT');
      expect(rebootReq.operation.state).toBe('queued');
      expect(rebootReq.operation.preRebootBootId).toBe('boot-initial-1111');

      // Device claims REBOOT and reports awaiting_reconnect
      const claimed = await callFn(
        claimDeviceOperation,
        { displayId: DISPLAY_ID },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(claimed.operation?.id).toBe(rebootReq.operation.id);

      // Attempting to report 'succeeded' directly for REBOOT without awaiting_reconnect is coerced to awaiting_reconnect
      const reportRes = await callFn(
        reportDeviceOperation,
        {
          displayId: DISPLAY_ID,
          operationId: claimed.operation!.id,
          claimLeaseId: claimed.operation!.claimLeaseId!,
          state: 'succeeded',
          resultSummary: 'Invoking OS reboot helper; awaiting reconnect verification.',
        },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );
      expect(reportRes.operation.state).toBe('awaiting_reconnect');

      // Heartbeat with SAME bootId and HIGHER uptime does NOT mark reboot succeeded yet
      await callFn(
        reportDeviceHeartbeat,
        {
          displayId: DISPLAY_ID,
          appVersion: '2.0.0',
          diagnostics: {
            uptimeSeconds: 5010,
            availableStorageBytes: 10000000000,
          },
          hardwareMetrics: {
            cpuTempCelsius: 48.0,
            memoryUsedBytes: 512000000,
            memoryTotalBytes: 2048000000,
            diskFreeBytes: 10000000000,
            diskTotalBytes: 32000000000,
            osPlatform: 'linux',
            osRelease: '6.8.0',
            arch: 'x64',
            bootId: 'boot-initial-1111',
            observedAt: new Date().toISOString(),
          },
        },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );

      const listBeforeReconnect = await callFn(
        listDisplayOperations,
        { displayId: DISPLAY_ID, limit: 10 },
        { uid: ADMIN_UID }
      );
      const stillAwaiting = listBeforeReconnect.operations.find(
        (o) => o.id === rebootReq.operation.id
      );
      expect(stillAwaiting?.state).toBe('awaiting_reconnect');

      // Heartbeat with NEW bootId and reset uptime reconciles REBOOT to succeeded
      await callFn(
        reportDeviceHeartbeat,
        {
          displayId: DISPLAY_ID,
          appVersion: '2.0.0',
          diagnostics: {
            uptimeSeconds: 22,
            availableStorageBytes: 10000000000,
          },
          hardwareMetrics: {
            cpuTempCelsius: 44.0,
            memoryUsedBytes: 400000000,
            memoryTotalBytes: 2048000000,
            diskFreeBytes: 10000000000,
            diskTotalBytes: 32000000000,
            osPlatform: 'linux',
            osRelease: '6.8.0',
            arch: 'x64',
            bootId: 'boot-post-reboot-2222',
            observedAt: new Date().toISOString(),
          },
        },
        { uid: DEVICE_UID, token: { principal: 'device', displayId: DISPLAY_ID } }
      );

      // Verify operation is now marked succeeded
      const listRes = await callFn(
        listDisplayOperations,
        { displayId: DISPLAY_ID, limit: 10 },
        { uid: ADMIN_UID }
      );
      const reconciled = listRes.operations.find((o) => o.id === rebootReq.operation.id);
      expect(reconciled).toBeDefined();
      expect(reconciled!.state).toBe('succeeded');
      expect(reconciled!.resultSummary).toContain(
        'Verified digital display reconnect after OS reboot'
      );
    });
  });
});
