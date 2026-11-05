/**
 * Aura DIMS - Server-Authorized Durable Device Operations & Private Previews
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - Scoped user operation requests (Admin + assigned Department Head; Admin-only for REBOOT)
 * - Transactional single-flight device claiming with lease expiry and retry limits
 * - Device-owned progress and terminal result reporting with idempotency
 * - Post-reconnect reboot verification using bootId / uptime reset evidence
 * - Private on-demand software preview upload, previous-preview cleanup, and time-limited signed URLs
 *
 * Terminology: Always use "digital display" in all user-facing copy and logs.
 */

import * as crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type {
  AssetTransferProgress,
  CacheInventoryItem,
  CacheInventorySummary,
  ClaimDeviceOperationRequest,
  ClaimDeviceOperationResponse,
  DeviceCapabilities,
  DeviceOperationRecord,
  DeviceOperationType,
  DisplayPreviewMetadata,
  GetDisplayPreviewUrlRequest,
  GetDisplayPreviewUrlResponse,
  HardwareMetrics,
  ListDisplayOperationsRequest,
  ListDisplayOperationsResponse,
  ReportDeviceOperationRequest,
  ReportDeviceOperationResponse,
  RequestDisplayOperationRequest,
  RequestDisplayOperationResponse,
  UploadDevicePreviewRequest,
  UploadDevicePreviewResponse,
} from '@aura-dims/display-schema';
import {
  assertAdminCaller,
  buildAuditRecord,
  db,
  getAuthenticatedCaller,
  requireId,
} from './common.js';
import {
  checkRateLimit,
  hashClientKey,
  recordRateLimitHit,
} from './credentials.js';
import { COL, loadAuthorizedDisplay } from './displayModel.js';
import { getConfig } from './operational.js';

const opts = { region: 'asia-south1', cors: true } as const;

const ALLOWED_OPERATION_TYPES = new Set<DeviceOperationType>([
  'SYNC_NOW',
  'REFRESH_RENDERER',
  'CAPTURE_PREVIEW',
  'SAFE_CLEANUP_CACHE',
  'REBOOT',
]);

const ACTIVE_OPERATION_STATES = new Set<DeviceOperationRecord['state']>([
  'queued',
  'claimed',
  'in_progress',
  'awaiting_reconnect',
]);

function operationsCol(displayId: string) {
  return db.collection(COL.displays).doc(displayId).collection('operations');
}

/**
 * Verifies that the caller is the active enrolled device for `displayId`
 * and that the digital display is in `active` lifecycle state.
 */
export async function assertActiveDeviceForDisplay(
  auth: { uid?: string; token?: Record<string, any> } | undefined,
  displayId: string
): Promise<{ deviceUid: string; displayData: FirebaseFirestore.DocumentData }> {
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Device authentication required.');
  }

  const [sDoc, dDoc] = await Promise.all([
    db.collection(COL.secrets).doc(displayId).get(),
    db.collection(COL.displays).doc(displayId).get(),
  ]);

  if (!sDoc.exists || sDoc.data()?.activeDeviceUid !== auth.uid) {
    throw new HttpsError(
      'permission-denied',
      'Device identity does not match this digital display.'
    );
  }

  if (!dDoc.exists) {
    throw new HttpsError('not-found', 'Digital display not found.');
  }

  const displayData = dDoc.data()!;
  if (displayData.lifecycle !== 'active') {
    throw new HttpsError(
      'permission-denied',
      `Digital display is not active (${displayData.lifecycle}).`
    );
  }

  return { deviceUid: auth.uid, displayData };
}

/**
 * Sanitizes and bounds optional real hardware metrics from a digital display heartbeat.
 */
export function sanitizeHardwareMetrics(
  raw: HardwareMetrics | null | undefined,
  serverNowIso: string
): HardwareMetrics | null {
  if (!raw || typeof raw !== 'object') return null;

  const numOrNull = (val: unknown, min: number, max: number): number | null => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    if (val < min || val > max) return null;
    return val;
  };

  const strOrNull = (val: unknown, maxLen: number): string | null => {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed.length > 0 && trimmed.length <= maxLen ? trimmed : null;
  };

  return {
    cpuTempCelsius: numOrNull(raw.cpuTempCelsius, -40, 150),
    memoryUsedBytes: numOrNull(raw.memoryUsedBytes, 0, 1024 * 1024 * 1024 * 1024),
    memoryTotalBytes: numOrNull(raw.memoryTotalBytes, 0, 1024 * 1024 * 1024 * 1024),
    diskFreeBytes: numOrNull(raw.diskFreeBytes, 0, 64 * 1024 * 1024 * 1024 * 1024),
    diskTotalBytes: numOrNull(raw.diskTotalBytes, 0, 64 * 1024 * 1024 * 1024 * 1024),
    osPlatform: strOrNull(raw.osPlatform, 32),
    osRelease: strOrNull(raw.osRelease, 64),
    arch: strOrNull(raw.arch, 32),
    bootId: strOrNull(raw.bootId, 64),
    observedAt: strOrNull(raw.observedAt, 64) || serverNowIso,
  };
}

/**
 * Sanitizes and bounds versioned device capability advertisements.
 */
export function sanitizeCapabilities(
  raw: DeviceCapabilities | null | undefined
): DeviceCapabilities | null {
  if (!raw || typeof raw !== 'object') return null;

  const strArray = <T extends string>(arr: unknown, maxItems: number, allowed?: Set<string>): T[] => {
    if (!Array.isArray(arr)) return [];
    const out: T[] = [];
    for (const item of arr.slice(0, maxItems)) {
      if (typeof item === 'string' && item.trim().length <= 64) {
        if (!allowed || allowed.has(item)) {
          out.push(item as T);
        }
      }
    }
    return out;
  };

  const strOrNull = (val: unknown, maxLen = 240): string | null => {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
  };

  return {
    schemaVersion: '1.0',
    protocolVersion: strOrNull(raw.protocolVersion, 32) || '1.0',
    agentVersion: strOrNull(raw.agentVersion, 32) || '1.0.0',
    rendererVersion: strOrNull(raw.rendererVersion, 32) || '1.0.0',
    visualDesigns: Boolean(raw.visualDesigns),
    supportedMediaTypes: strArray<'image' | 'video'>(
      raw.supportedMediaTypes,
      4,
      new Set(['image', 'video'])
    ),
    supportedOrientations: strArray<'landscape' | 'portrait'>(
      raw.supportedOrientations,
      2,
      new Set(['landscape', 'portrait'])
    ),
    supportedFonts: strArray<string>(raw.supportedFonts, 20),
    capturePreview: Boolean(raw.capturePreview),
    capturePreviewReason: strOrNull(raw.capturePreviewReason),
    refreshRenderer: Boolean(raw.refreshRenderer),
    refreshRendererReason: strOrNull(raw.refreshRendererReason),
    reboot: Boolean(raw.reboot),
    rebootReason: strOrNull(raw.rebootReason),
    safeCacheCleanup: Boolean(raw.safeCacheCleanup ?? true),
  };
}

/**
 * Sanitizes and bounds per-asset transfer progress items (max 100 entries).
 */
export function sanitizeAssetProgress(
  raw: AssetTransferProgress[] | null | undefined
): AssetTransferProgress[] | null {
  if (!Array.isArray(raw)) return null;
  const allowedStages = new Set(['queued', 'downloading', 'verifying', 'ready', 'failed']);
  return raw.slice(0, 100).map((item) => {
    const sizeBytes = Math.max(0, Number(item.sizeBytes || 0));
    const bytesTransferred = Math.max(0, Math.min(sizeBytes || Number.MAX_SAFE_INTEGER, Number(item.bytesTransferred || 0)));
    const progressPercent = Math.max(0, Math.min(100, Number(item.progressPercent || 0)));
    const stage = allowedStages.has(item.stage) ? item.stage : 'queued';
    return {
      publicationId: String(item.publicationId || '').slice(0, 128),
      assetId: String(item.assetId || '').slice(0, 128),
      fileName: String(item.fileName || item.assetId || '').slice(0, 200),
      sizeBytes,
      bytesTransferred,
      progressPercent,
      checksumSha256: String(item.checksumSha256 || '').slice(0, 64).toLowerCase(),
      verifiedChecksumSha256: item.verifiedChecksumSha256
        ? String(item.verifiedChecksumSha256).slice(0, 64).toLowerCase()
        : null,
      stage,
      fromCache: Boolean(item.fromCache),
      updatedAt: String(item.updatedAt || new Date().toISOString()).slice(0, 64),
      errorMessage: item.errorMessage ? String(item.errorMessage).slice(0, 300) : null,
    };
  });
}

/**
 * Sanitizes and bounds cache inventory summary (max 100 items).
 */
export function sanitizeCacheInventory(
  raw: CacheInventorySummary | null | undefined,
  serverNowIso: string
): CacheInventorySummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const allowedRefs = new Set(['active', 'previous', 'staged', 'unreferenced']);
  const items: CacheInventoryItem[] = Array.isArray(raw.items)
    ? raw.items.slice(0, 100).map((it) => ({
        checksumSha256: String(it.checksumSha256 || '').slice(0, 64).toLowerCase(),
        assetIds: Array.isArray(it.assetIds)
          ? it.assetIds.slice(0, 20).map((x) => String(x).slice(0, 128))
          : [],
        fileNames: Array.isArray(it.fileNames)
          ? it.fileNames.slice(0, 20).map((x) => String(x).slice(0, 200))
          : [],
        sizeBytes: Math.max(0, Number(it.sizeBytes || 0)),
        verifiedAt: String(it.verifiedAt || serverNowIso).slice(0, 64),
        lastUsedAt: String(it.lastUsedAt || serverNowIso).slice(0, 64),
        references: Array.isArray(it.references)
          ? (it.references.filter((r) => allowedRefs.has(r)).slice(0, 4) as CacheInventoryItem['references'])
          : ['unreferenced'],
      }))
    : [];

  return {
    reportedAt: String(raw.reportedAt || serverNowIso).slice(0, 64),
    activePublicationId: raw.activePublicationId ? String(raw.activePublicationId).slice(0, 128) : null,
    previousPublicationId: raw.previousPublicationId ? String(raw.previousPublicationId).slice(0, 128) : null,
    stagedPublicationIds: Array.isArray(raw.stagedPublicationIds)
      ? raw.stagedPublicationIds.slice(0, 10).map((x) => String(x).slice(0, 128))
      : [],
    totalItems: Math.max(0, Number(raw.totalItems ?? items.length)),
    totalBytes: Math.max(0, Number(raw.totalBytes || 0)),
    referencedBytes: Math.max(0, Number(raw.referencedBytes || 0)),
    unreferencedBytes: Math.max(0, Number(raw.unreferencedBytes || 0)),
    items,
  };
}

/**
 * Sweeps expired operations, reconciles `awaiting_reconnect` REBOOT operations when
 * heartbeat evidence (`bootId` change or `uptimeSeconds` reset) arrives, and returns
 * the count of queued operations waiting to be claimed.
 */
export async function reconcileAndCountOperationsOnHeartbeat(params: {
  displayId: string;
  deviceUid: string;
  bootId: string | null;
  uptimeSeconds: number | null;
  nowMs?: number;
}): Promise<number> {
  const { displayId, deviceUid, bootId, uptimeSeconds } = params;
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const col = operationsCol(displayId);
  const snaps = await col.orderBy('requestedAt', 'desc').limit(30).get();
  if (snaps.empty) return 0;

  let pendingCount = 0;
  const batch = db.batch();
  let hasWrites = false;

  for (const doc of snaps.docs) {
    const op = doc.data() as DeviceOperationRecord;
    if (!ACTIVE_OPERATION_STATES.has(op.state)) continue;

    const expiresMs = new Date(op.expiresAt).getTime();

    // Reconcile awaiting_reconnect REBOOT first if evidence of reboot is present
    if (op.type === 'REBOOT' && op.state === 'awaiting_reconnect') {
      const bootIdChanged =
        Boolean(op.preRebootBootId && bootId) && op.preRebootBootId !== bootId;
      const uptimeReset =
        typeof op.preRebootUptimeSeconds === 'number' &&
        typeof uptimeSeconds === 'number' &&
        uptimeSeconds < op.preRebootUptimeSeconds;

      if (bootIdChanged || uptimeReset) {
        const summary = `Verified digital display reconnect after OS reboot (uptime ${
          uptimeSeconds ?? 'unknown'
        }s${bootId ? `, bootId ${bootId.slice(0, 8)}` : ''}).`;
        batch.update(doc.ref, {
          state: 'succeeded',
          resultSummary: summary,
          completedAt: nowIso,
          updatedAt: nowIso,
        });
        batch.create(
          db.collection('auditEvents').doc(),
          buildAuditRecord({
            actorId: deviceUid,
            action: 'display.operation_completed',
            targetId: op.id,
            targetType: 'display_operation',
            newState: {
              displayId,
              type: op.type,
              state: 'succeeded',
              resultSummary: summary,
            },
          })
        );
        hasWrites = true;
        continue;
      }
    }

    // Expire past-TTL operations
    if (Number.isFinite(expiresMs) && nowMs >= expiresMs) {
      batch.update(doc.ref, {
        state: 'expired',
        errorCode: 'OPERATION_EXPIRED',
        errorMessage: `Operation expired at ${op.expiresAt}.`,
        completedAt: nowIso,
        updatedAt: nowIso,
      });
      hasWrites = true;
      continue;
    }

    // Check claim lease timeout
    if (
      (op.state === 'claimed' || op.state === 'in_progress') &&
      op.claimExpiresAt &&
      nowMs >= new Date(op.claimExpiresAt).getTime()
    ) {
      if (op.type !== 'REBOOT' && op.attemptCount < op.maxAttempts) {
        batch.update(doc.ref, {
          state: 'queued',
          claimLeaseId: null,
          claimExpiresAt: null,
          updatedAt: nowIso,
        });
        hasWrites = true;
        pendingCount += 1;
      } else {
        batch.update(doc.ref, {
          state: 'failed',
          errorCode: 'CLAIM_LEASE_EXPIRED',
          errorMessage: 'Digital display did not complete the operation before its claim lease expired.',
          completedAt: nowIso,
          updatedAt: nowIso,
        });
        hasWrites = true;
      }
      continue;
    }

    if (op.state === 'queued') {
      pendingCount += 1;
    }
  }

  if (hasWrites) {
    await batch.commit();
  }

  return pendingCount;
}

// ---------------------------------------------------------------------------
// 1. User Callable: requestDisplayOperation
// ---------------------------------------------------------------------------

export const requestDisplayOperation = onCall<
  RequestDisplayOperationRequest,
  Promise<RequestDisplayOperationResponse>
>(opts, async (request) => {
  const caller = await getAuthenticatedCaller(request.auth);
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const rawType = String(request.data?.type || '').trim() as DeviceOperationType;

  if (!ALLOWED_OPERATION_TYPES.has(rawType)) {
    throw new HttpsError(
      'invalid-argument',
      `Unsupported or forbidden digital display operation type: "${rawType}". Arbitrary remote shell execution is prohibited.`
    );
  }

  // REBOOT requires Admin permission and explicit confirmation
  if (rawType === 'REBOOT') {
    await assertAdminCaller(request.auth);
    if (request.data?.confirmed !== true) {
      throw new HttpsError(
        'invalid-argument',
        'Explicit confirmation (confirmed: true) is required before requesting a digital display reboot.'
      );
    }
  }

  // Enforce Admin or assigned Department Head scope
  const displaySnap = await loadAuthorizedDisplay(caller, displayId);
  const displayData = displaySnap.data()!;

  if (displayData.lifecycle !== 'active') {
    throw new HttpsError(
      'failed-precondition',
      `Operations can only be requested for active digital displays (current status: ${displayData.lifecycle}).`
    );
  }

  // Check advertised device capabilities when present
  const reportedCaps = displayData.reported?.capabilities as DeviceCapabilities | undefined | null;
  if (reportedCaps) {
    if (rawType === 'CAPTURE_PREVIEW' && !reportedCaps.capturePreview) {
      throw new HttpsError(
        'failed-precondition',
        reportedCaps.capturePreviewReason ||
          'Preview capture is not supported by this digital display.'
      );
    }
    if (rawType === 'REFRESH_RENDERER' && !reportedCaps.refreshRenderer) {
      throw new HttpsError(
        'failed-precondition',
        reportedCaps.refreshRendererReason ||
          'Renderer refresh is not supported by this digital display.'
      );
    }
    if (rawType === 'REBOOT' && !reportedCaps.reboot) {
      throw new HttpsError(
        'failed-precondition',
        reportedCaps.rebootReason ||
          'Controlled OS reboot is not supported by this digital display.'
      );
    }
  }

  // Rate limit operation requests per caller + display
  const cfg = getConfig();
  const rateKey = hashClientKey('request_display_op', `${caller.uid}:${displayId}`);
  await checkRateLimit(rateKey, cfg.operationRequestWindowSeconds, cfg.operationRequestLimit);
  await recordRateLimitHit(rateKey, cfg.operationRequestWindowSeconds, cfg.operationRequestLimit);

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const ttlSeconds =
    rawType === 'REBOOT' ? cfg.operationRebootTtlSeconds : cfg.operationDefaultTtlSeconds;
  const expiresAtIso = new Date(nowMs + ttlSeconds * 1000).toISOString();
  const idempotencyKey = request.data?.idempotencyKey
    ? String(request.data.idempotencyKey).trim().slice(0, 128)
    : null;
  const reason = request.data?.reason
    ? String(request.data.reason).trim().slice(0, 500)
    : null;

  const col = operationsCol(displayId);

  return db.runTransaction(async (tx) => {
    const recentSnap = await tx.get(col.orderBy('requestedAt', 'desc').limit(25));

    for (const doc of recentSnap.docs) {
      const existing = doc.data() as DeviceOperationRecord;
      if (!ACTIVE_OPERATION_STATES.has(existing.state)) continue;

      // Expire stale operations encountered during transaction
      if (nowMs >= new Date(existing.expiresAt).getTime()) {
        tx.update(doc.ref, {
          state: 'expired',
          errorCode: 'OPERATION_EXPIRED',
          errorMessage: `Operation expired at ${existing.expiresAt}.`,
          completedAt: nowIso,
          updatedAt: nowIso,
        });
        continue;
      }

      // Deduplicate matching active operation type or idempotencyKey
      if (
        existing.type === rawType ||
        (idempotencyKey && existing.idempotencyKey === idempotencyKey)
      ) {
        return {
          operation: existing,
          deduplicated: true,
        };
      }
    }

    const operationId = crypto.randomUUID();
    const newOp: DeviceOperationRecord = {
      id: operationId,
      displayId,
      departmentId: String(displayData.departmentId || ''),
      type: rawType,
      state: 'queued',
      requestedBy: caller.uid,
      requestedByRole: caller.role,
      requestedAt: nowIso,
      expiresAt: expiresAtIso,
      idempotencyKey,
      reason,
      claimedAt: null,
      claimLeaseId: null,
      claimExpiresAt: null,
      attemptCount: 0,
      maxAttempts: rawType === 'REBOOT' ? 1 : 3,
      startedAt: null,
      completedAt: null,
      preRebootBootId:
        rawType === 'REBOOT'
          ? (displayData.reported?.hardwareMetrics?.bootId ??
              displayData.reported?.metrics?.bootId ??
              null)
          : null,
      preRebootUptimeSeconds:
        rawType === 'REBOOT' && typeof displayData.reported?.uptimeSeconds === 'number'
          ? displayData.reported.uptimeSeconds
          : null,
      resultSummary: null,
      errorCode: null,
      errorMessage: null,
      previewMetadata: null,
      cleanupSummary: null,
      updatedAt: nowIso,
    };

    tx.create(col.doc(operationId), newOp);
    tx.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: 'display.operation_requested',
        targetId: operationId,
        targetType: 'display_operation',
        newState: {
          displayId,
          departmentId: newOp.departmentId,
          type: rawType,
          expiresAt: expiresAtIso,
          reason,
        },
      })
    );

    return {
      operation: newOp,
      deduplicated: false,
    };
  });
});

// ---------------------------------------------------------------------------
// 2. User Callable: listDisplayOperations
// ---------------------------------------------------------------------------

export const listDisplayOperations = onCall<
  ListDisplayOperationsRequest,
  Promise<ListDisplayOperationsResponse>
>(opts, async (request) => {
  const caller = await getAuthenticatedCaller(request.auth);
  const displayId = requireId(request.data?.displayId, 'Display ID');
  await loadAuthorizedDisplay(caller, displayId);

  const limit = Math.max(1, Math.min(50, Number(request.data?.limit || 25)));
  const col = operationsCol(displayId);
  const snap = await col.orderBy('requestedAt', 'desc').limit(limit).get();

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const operations: DeviceOperationRecord[] = [];
  const batch = db.batch();
  let hasExpiredUpdates = false;

  for (const doc of snap.docs) {
    const op = doc.data() as DeviceOperationRecord;
    if (
      ACTIVE_OPERATION_STATES.has(op.state) &&
      nowMs >= new Date(op.expiresAt).getTime()
    ) {
      const expiredOp: DeviceOperationRecord = {
        ...op,
        state: 'expired',
        errorCode: 'OPERATION_EXPIRED',
        errorMessage: `Operation expired at ${op.expiresAt}.`,
        completedAt: nowIso,
        updatedAt: nowIso,
      };
      batch.update(doc.ref, {
        state: 'expired',
        errorCode: 'OPERATION_EXPIRED',
        errorMessage: expiredOp.errorMessage,
        completedAt: nowIso,
        updatedAt: nowIso,
      });
      hasExpiredUpdates = true;
      operations.push(expiredOp);
    } else {
      operations.push(op);
    }
  }

  if (hasExpiredUpdates) {
    await batch.commit();
  }

  return { operations };
});

// ---------------------------------------------------------------------------
// 3. Device Callable: claimDeviceOperation
// ---------------------------------------------------------------------------

export const claimDeviceOperation = onCall<
  ClaimDeviceOperationRequest,
  Promise<ClaimDeviceOperationResponse>
>(opts, async (request) => {
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const { deviceUid } = await assertActiveDeviceForDisplay(request.auth, displayId);
  const capabilities = sanitizeCapabilities(request.data?.capabilities);
  const cfg = getConfig();

  const col = operationsCol(displayId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const claimedOp = await db.runTransaction(async (tx) => {
    const snap = await tx.get(col.orderBy('requestedAt', 'asc').limit(30));
    if (snap.empty) return null;

    let candidateDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let candidateOp: DeviceOperationRecord | null = null;

    for (const doc of snap.docs) {
      const op = doc.data() as DeviceOperationRecord;
      if (!ACTIVE_OPERATION_STATES.has(op.state)) continue;

      // 1. Check overall operation TTL expiry
      if (nowMs >= new Date(op.expiresAt).getTime()) {
        tx.update(doc.ref, {
          state: 'expired',
          errorCode: 'OPERATION_EXPIRED',
          errorMessage: `Operation expired at ${op.expiresAt}.`,
          completedAt: nowIso,
          updatedAt: nowIso,
        });
        continue;
      }

      // 2. If an operation is awaiting_reconnect, block new claims until reconciled or expired
      if (op.state === 'awaiting_reconnect') {
        return null;
      }

      // 3. If an operation is currently claimed or in_progress
      if (op.state === 'claimed' || op.state === 'in_progress') {
        const leaseExpiresMs = op.claimExpiresAt
          ? new Date(op.claimExpiresAt).getTime()
          : 0;
        if (leaseExpiresMs > nowMs) {
          // Single-flight: another active lease is still valid
          return null;
        }

        // Lease expired: destructive operations (REBOOT) never auto-retry
        if (op.type === 'REBOOT' || op.attemptCount >= op.maxAttempts) {
          tx.update(doc.ref, {
            state: 'failed',
            errorCode: 'CLAIM_LEASE_EXPIRED',
            errorMessage:
              'Operation claim lease expired before completion and maximum attempts were reached.',
            completedAt: nowIso,
            updatedAt: nowIso,
          });
          continue;
        }

        // Non-destructive operation with remaining attempts can be re-claimed
        if (!candidateDoc) {
          candidateDoc = doc;
          candidateOp = op;
        }
        continue;
      }

      // 4. Queued operation
      if (op.state === 'queued' && !candidateDoc) {
        candidateDoc = doc;
        candidateOp = op;
      }
    }

    if (!candidateDoc || !candidateOp) {
      return null;
    }

    // Check capability compatibility before granting lease
    if (capabilities) {
      let unsupportedReason: string | null = null;
      if (candidateOp.type === 'CAPTURE_PREVIEW' && !capabilities.capturePreview) {
        unsupportedReason =
          capabilities.capturePreviewReason ||
          'Preview capture is not supported on this digital display.';
      } else if (candidateOp.type === 'REFRESH_RENDERER' && !capabilities.refreshRenderer) {
        unsupportedReason =
          capabilities.refreshRendererReason ||
          'Renderer refresh is not supported on this digital display.';
      } else if (candidateOp.type === 'REBOOT' && !capabilities.reboot) {
        unsupportedReason =
          capabilities.rebootReason ||
          'Controlled reboot is not supported on this digital display.';
      }

      if (unsupportedReason) {
        tx.update(candidateDoc.ref, {
          state: 'failed',
          errorCode: 'UNSUPPORTED_CAPABILITY',
          errorMessage: unsupportedReason,
          completedAt: nowIso,
          updatedAt: nowIso,
        });
        tx.create(
          db.collection('auditEvents').doc(),
          buildAuditRecord({
            actorId: deviceUid,
            action: 'display.operation_failed',
            targetId: candidateOp.id,
            targetType: 'display_operation',
            newState: {
              displayId,
              type: candidateOp.type,
              state: 'failed',
              errorCode: 'UNSUPPORTED_CAPABILITY',
              errorMessage: unsupportedReason,
            },
          })
        );
        return null;
      }
    }

    const claimLeaseId = crypto.randomUUID();
    const claimExpiresAt = new Date(
      nowMs + cfg.operationClaimLeaseSeconds * 1000
    ).toISOString();
    const nextAttempt = (candidateOp.attemptCount || 0) + 1;

    const updated: DeviceOperationRecord = {
      ...candidateOp,
      state: 'claimed',
      claimedAt: nowIso,
      claimLeaseId,
      claimExpiresAt,
      attemptCount: nextAttempt,
      updatedAt: nowIso,
    };

    tx.update(candidateDoc.ref, {
      state: 'claimed',
      claimedAt: nowIso,
      claimLeaseId,
      claimExpiresAt,
      attemptCount: nextAttempt,
      updatedAt: nowIso,
    });

    return updated;
  });

  return {
    operation: claimedOp,
    serverTimestamp: nowIso,
  };
});

// ---------------------------------------------------------------------------
// 4. Device Callable: reportDeviceOperation
// ---------------------------------------------------------------------------

export const reportDeviceOperation = onCall<
  ReportDeviceOperationRequest,
  Promise<ReportDeviceOperationResponse>
>(opts, async (request) => {
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const operationId = requireId(request.data?.operationId, 'Operation ID');
  const claimLeaseId = requireId(request.data?.claimLeaseId, 'Claim Lease ID');
  const nextState = request.data?.state;

  const allowedStates = new Set([
    'in_progress',
    'awaiting_reconnect',
    'succeeded',
    'failed',
  ]);
  if (!nextState || !allowedStates.has(nextState)) {
    throw new HttpsError('invalid-argument', `Invalid operation state: "${String(nextState)}".`);
  }

  const { deviceUid } = await assertActiveDeviceForDisplay(request.auth, displayId);
  const opRef = operationsCol(displayId).doc(operationId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cfg = getConfig();

  const updatedOp = await db.runTransaction(async (tx) => {
    const snap = await tx.get(opRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Device operation not found.');
    }

    const op = snap.data() as DeviceOperationRecord;

    // Idempotent re-report for the same lease when already terminal
    if (
      (op.state === 'succeeded' || op.state === 'failed') &&
      op.claimLeaseId === claimLeaseId
    ) {
      return op;
    }

    if (op.claimLeaseId !== claimLeaseId) {
      throw new HttpsError(
        'failed-precondition',
        'Operation claimLeaseId does not match the active lease for this digital display operation.'
      );
    }

    // Safety invariant: A newly claimed REBOOT command can never be marked 'succeeded'
    // prior to entering 'awaiting_reconnect' and verifying a post-reboot reconnect.
    const effectiveState: DeviceOperationRecord['state'] =
      op.type === 'REBOOT' && nextState === 'succeeded' && op.state !== 'awaiting_reconnect'
        ? 'awaiting_reconnect'
        : nextState;

    if (
      nowMs >= new Date(op.expiresAt).getTime() &&
      effectiveState !== 'succeeded' &&
      effectiveState !== 'failed'
    ) {
      const expired: DeviceOperationRecord = {
        ...op,
        state: 'expired',
        errorCode: 'OPERATION_EXPIRED',
        errorMessage: `Operation expired at ${op.expiresAt}.`,
        completedAt: nowIso,
        updatedAt: nowIso,
      };
      tx.update(opRef, {
        state: 'expired',
        errorCode: 'OPERATION_EXPIRED',
        errorMessage: expired.errorMessage,
        completedAt: nowIso,
        updatedAt: nowIso,
      });
      return expired;
    }

    const resultSummary = request.data?.resultSummary
      ? String(request.data.resultSummary).trim().slice(0, 500)
      : op.resultSummary || null;
    const errorCode = request.data?.errorCode
      ? String(request.data.errorCode).trim().slice(0, 64)
      : effectiveState === 'failed'
        ? op.errorCode || 'OPERATION_FAILED'
        : null;
    const errorMessage = request.data?.errorMessage
      ? String(request.data.errorMessage).trim().slice(0, 500)
      : effectiveState === 'failed'
        ? op.errorMessage || 'Operation failed on digital display.'
        : null;

    const isTerminal = effectiveState === 'succeeded' || effectiveState === 'failed';
    const claimExpiresAt =
      effectiveState === 'in_progress'
        ? new Date(nowMs + cfg.operationClaimLeaseSeconds * 1000).toISOString()
        : op.claimExpiresAt || null;

    const updated: DeviceOperationRecord = {
      ...op,
      state: effectiveState,
      startedAt: op.startedAt || nowIso,
      completedAt: isTerminal ? nowIso : null,
      claimExpiresAt,
      resultSummary,
      errorCode,
      errorMessage,
      preRebootBootId:
        request.data?.preRebootBootId !== undefined
          ? request.data.preRebootBootId
          : op.preRebootBootId ?? null,
      preRebootUptimeSeconds:
        request.data?.preRebootUptimeSeconds !== undefined
          ? request.data.preRebootUptimeSeconds
          : op.preRebootUptimeSeconds ?? null,
      cleanupSummary:
        request.data?.cleanupSummary !== undefined
          ? request.data.cleanupSummary
          : op.cleanupSummary ?? null,
      updatedAt: nowIso,
    };

    tx.update(opRef, {
      state: updated.state,
      startedAt: updated.startedAt,
      completedAt: updated.completedAt,
      claimExpiresAt: updated.claimExpiresAt,
      resultSummary: updated.resultSummary,
      errorCode: updated.errorCode,
      errorMessage: updated.errorMessage,
      preRebootBootId: updated.preRebootBootId,
      preRebootUptimeSeconds: updated.preRebootUptimeSeconds,
      cleanupSummary: updated.cleanupSummary,
      updatedAt: nowIso,
    });

    if (isTerminal) {
      tx.create(
        db.collection('auditEvents').doc(),
        buildAuditRecord({
          actorId: deviceUid,
          action:
            effectiveState === 'succeeded'
              ? 'display.operation_completed'
              : 'display.operation_failed',
          targetId: operationId,
          targetType: 'display_operation',
          newState: {
            displayId,
            type: op.type,
            state: effectiveState,
            resultSummary,
            errorCode,
            errorMessage,
          },
        })
      );
    }

    return updated;
  });

  return {
    operation: updatedOp,
    serverReceivedAt: nowIso,
  };
});

// ---------------------------------------------------------------------------
// 5. Device Callable: uploadDevicePreview
// ---------------------------------------------------------------------------

export const uploadDevicePreview = onCall<
  UploadDevicePreviewRequest,
  Promise<UploadDevicePreviewResponse>
>(opts, async (request) => {
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const operationId = requireId(request.data?.operationId, 'Operation ID');
  const claimLeaseId = requireId(request.data?.claimLeaseId, 'Claim Lease ID');
  const mimeType = request.data?.mimeType;

  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw new HttpsError(
      'invalid-argument',
      'Preview mimeType must be "image/jpeg" or "image/png".'
    );
  }

  const imageBase64 = request.data?.imageBase64;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new HttpsError('invalid-argument', 'imageBase64 is required.');
  }

  const buffer = Buffer.from(imageBase64, 'base64');
  if (buffer.length <= 0 || buffer.length > 2 * 1024 * 1024) {
    throw new HttpsError(
      'invalid-argument',
      `Preview image size (${buffer.length} bytes) must be between 1 byte and 2 MB.`
    );
  }

  const { deviceUid, displayData } = await assertActiveDeviceForDisplay(
    request.auth,
    displayId
  );

  const opRef = operationsCol(displayId).doc(operationId);
  const opSnap = await opRef.get();
  if (!opSnap.exists) {
    throw new HttpsError('not-found', 'Preview capture operation not found.');
  }

  const op = opSnap.data() as DeviceOperationRecord;
  if (op.type !== 'CAPTURE_PREVIEW') {
    throw new HttpsError(
      'failed-precondition',
      'Operation is not a CAPTURE_PREVIEW operation.'
    );
  }
  if (op.claimLeaseId !== claimLeaseId) {
    throw new HttpsError(
      'failed-precondition',
      'Operation claimLeaseId does not match the active lease.'
    );
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cfg = getConfig();
  const expiresAtIso = new Date(
    nowMs + cfg.previewRetentionSeconds * 1000
  ).toISOString();

  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const storagePath = `previews/${displayId}/${operationId}.${ext}`;
  const downloadToken = crypto.randomUUID();

  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    contentType: mimeType,
    metadata: {
      metadata: {
        displayId,
        operationId,
        capturedAt: nowIso,
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  // Clean up previous preview file in Storage so previews do not accumulate unboundedly
  const previousPreview = displayData.lastPreview as DisplayPreviewMetadata | undefined | null;
  if (previousPreview?.storagePath && previousPreview.storagePath !== storagePath) {
    try {
      await bucket.file(previousPreview.storagePath).delete({ ignoreNotFound: true });
    } catch {
      // Ignore cleanup error
    }
  }

  const previewMeta: DisplayPreviewMetadata = {
    operationId,
    storagePath,
    mimeType,
    sizeBytes: buffer.length,
    width: typeof request.data?.width === 'number' ? request.data.width : null,
    height: typeof request.data?.height === 'number' ? request.data.height : null,
    capturedAt: nowIso,
    uploadedAt: nowIso,
    expiresAt: expiresAtIso,
    requestedBy: op.requestedBy,
  };

  const summary = `Captured on-demand software preview (${Math.round(
    buffer.length / 1024
  )} KB) from digital display.`;

  const updatedOp: DeviceOperationRecord = {
    ...op,
    state: 'succeeded',
    startedAt: op.startedAt || nowIso,
    completedAt: nowIso,
    resultSummary: summary,
    previewMetadata: previewMeta,
    updatedAt: nowIso,
  };

  const dRef = db.collection(COL.displays).doc(displayId);
  const batch = db.batch();
  batch.update(opRef, {
    state: 'succeeded',
    startedAt: updatedOp.startedAt,
    completedAt: nowIso,
    resultSummary: summary,
    previewMetadata: previewMeta,
    updatedAt: nowIso,
  });
  batch.update(dRef, {
    lastPreview: previewMeta,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(
    db.collection('auditEvents').doc(),
    buildAuditRecord({
      actorId: deviceUid,
      action: 'display.preview_captured',
      targetId: operationId,
      targetType: 'display_preview',
      newState: {
        displayId,
        operationId,
        storagePath,
        sizeBytes: buffer.length,
        expiresAt: expiresAtIso,
      },
    })
  );
  await batch.commit();

  return {
    preview: previewMeta,
    operation: updatedOp,
  };
});

// ---------------------------------------------------------------------------
// 6. User Callable: getDisplayPreviewUrl
// ---------------------------------------------------------------------------

export const getDisplayPreviewUrl = onCall<
  GetDisplayPreviewUrlRequest,
  Promise<GetDisplayPreviewUrlResponse>
>(opts, async (request) => {
  const caller = await getAuthenticatedCaller(request.auth);
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const displaySnap = await loadAuthorizedDisplay(caller, displayId);
  const displayData = displaySnap.data()!;

  const preview = displayData.lastPreview as DisplayPreviewMetadata | undefined | null;
  if (!preview || !preview.storagePath) {
    throw new HttpsError(
      'not-found',
      'No software preview has been captured for this digital display yet.'
    );
  }

  const nowMs = Date.now();
  if (preview.expiresAt && nowMs >= new Date(preview.expiresAt).getTime()) {
    throw new HttpsError(
      'failed-precondition',
      'The most recent software preview for this digital display has expired. Request a new preview capture.'
    );
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(preview.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError(
      'not-found',
      'Preview image file is no longer available in private storage.'
    );
  }

  const urlExpiresAt = new Date(nowMs + 15 * 60 * 1000).toISOString();
  const isEmulator =
    Boolean(process.env.STORAGE_EMULATOR_HOST) ||
    Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST) ||
    process.env.FUNCTIONS_EMULATOR === 'true';
  const rawHost =
    process.env.STORAGE_EMULATOR_HOST ||
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
    '127.0.0.1:9199';
  const storageHost = rawHost.replace(/^https?:\/\//, '');
  const bucketName = bucket.name || 'demo-aura-dims.appspot.com';

  let url: string;
  if (isEmulator) {
    let token = 'aura-dims-preview-token';
    try {
      const [metadata] = await file.getMetadata();
      const m = metadata?.metadata as Record<string, string> | undefined;
      token = m?.firebaseStorageDownloadTokens || token;
    } catch {
      // Ignore metadata error
    }
    url = `http://${storageHost}/v0/b/${bucketName}/o/${encodeURIComponent(
      preview.storagePath
    )}?alt=media&token=${encodeURIComponent(token)}`;
  } else {
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: urlExpiresAt,
    });
    url = signedUrl;
  }

  return {
    url,
    expiresAt: urlExpiresAt,
    preview,
  };
});
