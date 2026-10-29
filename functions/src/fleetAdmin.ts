/**
 * Aura DIMS - Admin fleet management callables
 * Sites, display groups, display records, lifecycle, enrollment codes, assignments.
 * Every callable authorizes the caller explicitly (Admin SDK bypasses rules).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import type {
  CreateSiteRequest,
  UpdateSiteRequest,
  SetSiteStatusRequest,
  SiteResponse,
  Site,
  CreateDisplayGroupRequest,
  UpdateDisplayGroupRequest,
  SetDisplayGroupStatusRequest,
  DisplayGroupResponse,
  DisplayGroup,
  RegisterDisplayRequest,
  UpdateDisplayRequest,
  DisplayMutationResponse,
  SetDisplayLifecycleRequest,
  GeneratePairingCodeRequest,
  GeneratePairingCodeResponse,
  ResetEnrollmentRequest,
  AssignDisplayUserRequest,
  UnassignDisplayUserRequest,
  AssignmentMutationResponse,
  ListUserAssignmentsRequest,
  ListUserAssignmentsResponse,
  DisplayOrientation,
  Resolution,
  RedeemPairingCodeRequest,
  RedeemPairingCodeResponse,
  DeviceSignInRequest,
  DeviceSignInResponse,
  GetDevicePublicationRequest,
  GetDevicePublicationResponse,
  GetDevicePublicationManifestRequest,
  GetDevicePublicationManifestResponse,
  ReportDeviceDeliveryRequest,
  ReportDeviceDeliveryResponse,
  DeviceHeartbeatRequest,
  DeviceHeartbeatResponse,
  ListDisplaysRequest,
  ListDisplaysResponse,
  GetDisplayRequest,
  GetDisplayResponse,
  EnrollmentState,
  DetailedPublicationManifest,
  PublicationRecord,
  DisplayReportedState,
  AssignmentView,
} from '@aura-dims/display-schema';
import { db, REGION, assertAdminCaller, getAuthenticatedCaller, writeAuditLog, buildAuditRecord, toIso, requireString, requireId } from './common.js';
import { getConfig, nextLifecycle, NON_RETIRED_LIFECYCLES } from './operational.js';
import { generatePairingCode, pairingCodeVerifier, generateDeviceSecret, deviceSecretVerifier, verifiersEqual, newDeviceUid, hashClientKey, checkRateLimit, recordRateLimitHit, clientAddress } from './credentials.js';
import {
  COL,
  assignmentId,
  buildViews,
  serializeAssignment,
  buildAssignmentViews,
  revokeIncompatibleForDisplay,
  thresholds,
  loadAuthorizedDisplay,
} from './displayModel.js';

const opts = { cors: true, region: REGION };

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateOrientation(value: unknown): DisplayOrientation {
  if (value !== 'portrait' && value !== 'landscape') {
    throw new HttpsError('invalid-argument', 'Orientation must be "portrait" or "landscape".');
  }
  return value;
}

function validateResolution(value: unknown): Resolution {
  const r = value as Resolution | undefined;
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 64 && (n as number) <= 16384;
  if (!r || !ok(r.width) || !ok(r.height)) {
    throw new HttpsError('invalid-argument', 'Configured resolution must be whole pixels between 64 and 16384.');
  }
  return { width: r.width, height: r.height };
}

function validateGroupIdList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new HttpsError('invalid-argument', 'groupIds must be an array of at most 20 group IDs.');
  }
  const ids = value.map((v) => requireId(v, 'groupId'));
  return [...new Set(ids)];
}

function siteFromSnap(snap: DocumentSnapshot): Site {
  const d = snap.data() || {};
  return {
    id: snap.id,
    name: d.name,
    location: d.location,
    status: d.status,
    createdBy: d.createdBy || '',
    createdAt: toIso(d.createdAt) || '',
    updatedAt: toIso(d.updatedAt) || '',
  };
}

function groupFromSnap(snap: DocumentSnapshot): DisplayGroup {
  const d = snap.data() || {};
  return {
    id: snap.id,
    name: d.name,
    siteId: d.siteId,
    description: d.description || '',
    status: d.status,
    createdBy: d.createdBy || '',
    createdAt: toIso(d.createdAt) || '',
    updatedAt: toIso(d.updatedAt) || '',
  };
}

/** Ensures every group exists, is active, and belongs to the given site. */
async function assertGroupsBelongToSite(groupIds: string[], siteId: string, allowExistingInactive: string[] = []) {
  if (groupIds.length === 0) return;
  const snaps = await db.getAll(...groupIds.map((id) => db.collection(COL.groups).doc(id)));
  for (const g of snaps) {
    if (!g.exists) throw new HttpsError('invalid-argument', 'A selected display group does not exist.');
    const data = g.data()!;
    if (data.siteId !== siteId) {
      throw new HttpsError('invalid-argument', `Display group "${data.name}" belongs to a different site.`);
    }
    if (data.status !== 'active' && !allowExistingInactive.includes(g.id)) {
      throw new HttpsError('failed-precondition', `Display group "${data.name}" is inactive.`);
    }
  }
}

async function assertActiveSite(siteId: string) {
  const snap = await db.collection(COL.sites).doc(siteId).get();
  if (!snap.exists) throw new HttpsError('invalid-argument', 'Selected site does not exist.');
  if (snap.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Selected site is inactive.');
}

async function assertActiveDepartment(departmentId: string) {
  const snap = await db.collection('departments').doc(departmentId).get();
  if (!snap.exists) throw new HttpsError('invalid-argument', 'Selected department does not exist.');
  if (snap.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Selected department is inactive.');
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export const createSite = onCall<CreateSiteRequest, Promise<SiteResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const name = requireString(request.data?.name, 'Site name', 120);
  const location = requireString(request.data?.location, 'Site location', 240);
  const ref = db.collection(COL.sites).doc();
  await ref.set({
    id: ref.id,
    name,
    nameLower: name.toLowerCase(),
    location,
    status: 'active',
    createdBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAuditLog({ actorId: caller.uid, action: 'site.create', targetId: ref.id, targetType: 'site', newState: { name, location } });
  return { site: siteFromSnap(await ref.get()) };
});

export const updateSite = onCall<UpdateSiteRequest, Promise<SiteResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const id = requireId(request.data?.id, 'Site ID');
  const ref = db.collection(COL.sites).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Site not found.');
  const current = snap.data()!;
  const name = request.data.name !== undefined ? requireString(request.data.name, 'Site name', 120) : current.name;
  const location =
    request.data.location !== undefined ? requireString(request.data.location, 'Site location', 240) : current.location;
  await ref.update({ name, nameLower: name.toLowerCase(), location, updatedAt: FieldValue.serverTimestamp() });
  await writeAuditLog({
    actorId: caller.uid,
    action: 'site.update',
    targetId: id,
    targetType: 'site',
    previousState: { name: current.name, location: current.location },
    newState: { name, location },
  });
  return { site: siteFromSnap(await ref.get()) };
});

export const setSiteStatus = onCall<SetSiteStatusRequest, Promise<SiteResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const id = requireId(request.data?.id, 'Site ID');
  const status = request.data?.status;
  if (status !== 'active' && status !== 'inactive') throw new HttpsError('invalid-argument', 'Invalid site status.');
  const ref = db.collection(COL.sites).doc(id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Site not found.');
    if (status === 'inactive') {
      const fleet = await tx.get(
        db.collection(COL.displays).where('siteId', '==', id).where('lifecycle', 'in', NON_RETIRED_LIFECYCLES).limit(1000)
      );
      if (!fleet.empty) {
        throw new HttpsError(
          'failed-precondition',
          `This site still contains ${fleet.size} non-retired digital display(s). Retire them or move them to another site before deactivating the site.`
        );
      }
    }
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
    tx.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: status === 'active' ? 'site.activate' : 'site.deactivate',
        targetId: id,
        targetType: 'site',
        previousState: { status: snap.data()?.status },
        newState: { status },
      })
    );
  });
  return { site: siteFromSnap(await ref.get()) };
});

// ---------------------------------------------------------------------------
// Display groups (grant NO permissions)
// ---------------------------------------------------------------------------

export const createDisplayGroup = onCall<CreateDisplayGroupRequest, Promise<DisplayGroupResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const name = requireString(request.data?.name, 'Group name', 120);
  const siteId = requireId(request.data?.siteId, 'Site ID');
  const description = request.data?.description
    ? requireString(request.data.description, 'Description', 500, { allowEmpty: true })
    : '';
  await assertActiveSite(siteId);
  const ref = db.collection(COL.groups).doc();
  await ref.set({
    id: ref.id,
    name,
    siteId,
    description,
    status: 'active',
    createdBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAuditLog({ actorId: caller.uid, action: 'display_group.create', targetId: ref.id, targetType: 'display_group', newState: { name, siteId } });
  return { group: groupFromSnap(await ref.get()) };
});

export const updateDisplayGroup = onCall<UpdateDisplayGroupRequest, Promise<DisplayGroupResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const id = requireId(request.data?.id, 'Group ID');
  const ref = db.collection(COL.groups).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Display group not found.');
  const current = snap.data()!;
  const name = request.data.name !== undefined ? requireString(request.data.name, 'Group name', 120) : current.name;
  const description =
    request.data.description !== undefined
      ? requireString(request.data.description, 'Description', 500, { allowEmpty: true })
      : current.description;
  await ref.update({ name, description, updatedAt: FieldValue.serverTimestamp() });
  await writeAuditLog({
    actorId: caller.uid,
    action: 'display_group.update',
    targetId: id,
    targetType: 'display_group',
    previousState: { name: current.name, description: current.description },
    newState: { name, description },
  });
  return { group: groupFromSnap(await ref.get()) };
});

export const setDisplayGroupStatus = onCall<SetDisplayGroupStatusRequest, Promise<DisplayGroupResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const id = requireId(request.data?.id, 'Group ID');
  const status = request.data?.status;
  if (status !== 'active' && status !== 'inactive') throw new HttpsError('invalid-argument', 'Invalid group status.');
  const ref = db.collection(COL.groups).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Display group not found.');
  if (status === 'active') await assertActiveSite(snap.data()!.siteId);
  // Existing display references are preserved for history; inactive groups cannot be newly selected.
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  await writeAuditLog({
    actorId: caller.uid,
    action: status === 'active' ? 'display_group.activate' : 'display_group.deactivate',
    targetId: id,
    targetType: 'display_group',
    previousState: { status: snap.data()!.status },
    newState: { status },
  });
  return { group: groupFromSnap(await ref.get()) };
});

// ---------------------------------------------------------------------------
// Display records
// ---------------------------------------------------------------------------

async function displayResponse(displayId: string, revokedAssignmentCount?: number): Promise<DisplayMutationResponse> {
  const snap = await db.collection(COL.displays).doc(displayId).get();
  const [view] = await buildViews([snap]);
  return { display: view!, ...(revokedAssignmentCount !== undefined ? { revokedAssignmentCount } : {}) };
}

export const registerDisplay = onCall<RegisterDisplayRequest, Promise<DisplayMutationResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const data = request.data || ({} as RegisterDisplayRequest);
  const name = requireString(data.name, 'Display name', 120);
  const siteId = requireId(data.siteId, 'Site ID');
  const departmentId = requireId(data.departmentId, 'Department ID');
  const locationDescription = requireString(data.locationDescription, 'Location description', 240, { allowEmpty: true });
  const orientation = validateOrientation(data.orientation);
  const configuredResolution = validateResolution(data.configuredResolution);
  const groupIds = validateGroupIdList(data.groupIds);

  await Promise.all([assertActiveSite(siteId), assertActiveDepartment(departmentId)]);
  await assertGroupsBelongToSite(groupIds, siteId);

  const ref = db.collection(COL.displays).doc();
  const batch = db.batch();
  batch.set(ref, {
    id: ref.id,
    name,
    nameLower: name.toLowerCase(),
    siteId,
    locationDescription,
    departmentId,
    groupIds,
    orientation,
    configuredResolution,
    lifecycle: 'pending_enrollment',
    lastHeartbeatAt: null,
    reported: null,
    enrolledAt: null,
    createdBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection(COL.secrets).doc(ref.id), {
    displayId: ref.id,
    activeDeviceUid: null,
    credentialVerifier: null,
    credentialGeneration: 0,
    pairingCodeVerifier: null,
    pairingCodeExpiresAt: null,
  });
  batch.create(
    db.collection('auditEvents').doc(),
    buildAuditRecord({
      actorId: caller.uid,
      action: 'display.register',
      targetId: ref.id,
      targetType: 'display',
      newState: { name, siteId, departmentId, groupIds, orientation, configuredResolution, locationDescription },
    })
  );
  await batch.commit();
  return displayResponse(ref.id);
});

export const updateDisplay = onCall<UpdateDisplayRequest, Promise<DisplayMutationResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const data = request.data || ({} as UpdateDisplayRequest);
  const displayId = requireId(data.displayId, 'Display ID');
  const ref = db.collection(COL.displays).doc(displayId);
  const pre = await ref.get();
  if (!pre.exists) throw new HttpsError('not-found', 'Digital display not found.');
  const cur = pre.data()!;
  if (cur.lifecycle === 'retired') {
    throw new HttpsError('failed-precondition', 'Retired digital displays are preserved for history and cannot be edited.');
  }

  const next = {
    name: data.name !== undefined ? requireString(data.name, 'Display name', 120) : cur.name,
    siteId: data.siteId !== undefined ? requireId(data.siteId, 'Site ID') : cur.siteId,
    locationDescription:
      data.locationDescription !== undefined
        ? requireString(data.locationDescription, 'Location description', 240, { allowEmpty: true })
        : cur.locationDescription,
    departmentId: data.departmentId !== undefined ? requireId(data.departmentId, 'Department ID') : cur.departmentId,
    groupIds: data.groupIds !== undefined ? validateGroupIdList(data.groupIds) : (cur.groupIds as string[]),
    orientation: data.orientation !== undefined ? validateOrientation(data.orientation) : cur.orientation,
    configuredResolution:
      data.configuredResolution !== undefined ? validateResolution(data.configuredResolution) : cur.configuredResolution,
  };

  if (next.siteId !== cur.siteId) await assertActiveSite(next.siteId);
  if (next.departmentId !== cur.departmentId) await assertActiveDepartment(next.departmentId);
  // Groups already on the display may stay even if since deactivated (history); new ones must be active.
  await assertGroupsBelongToSite(next.groupIds, next.siteId, (cur.groupIds as string[]) || []);

  const departmentChanged = next.departmentId !== cur.departmentId;
  let revoked = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.lifecycle === 'retired') {
      throw new HttpsError('failed-precondition', 'Digital display changed during update; please retry.');
    }
    let assignmentSnaps: DocumentSnapshot[] = [];
    const userSnaps = new Map<string, DocumentSnapshot>();
    if (departmentChanged) {
      const q = await tx.get(db.collection(COL.assignments).where('displayId', '==', displayId));
      assignmentSnaps = q.docs;
      if (assignmentSnaps.length > 0) {
        const users = await tx.getAll(...assignmentSnaps.map((a) => db.collection('users').doc(String(a.data()!.uid))));
        users.forEach((u) => userSnaps.set(u.id, u));
      }
    }
    if (departmentChanged) {
      revoked = revokeIncompatibleForDisplay(tx, caller.uid, displayId, next.departmentId, assignmentSnaps, userSnaps);
    }
    tx.update(ref, { ...next, nameLower: next.name.toLowerCase(), updatedAt: FieldValue.serverTimestamp() });
    tx.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: 'display.update_configuration',
        targetId: displayId,
        targetType: 'display',
        previousState: {
          name: cur.name,
          siteId: cur.siteId,
          locationDescription: cur.locationDescription,
          departmentId: cur.departmentId,
          groupIds: cur.groupIds,
          orientation: cur.orientation,
          configuredResolution: cur.configuredResolution,
        },
        newState: next,
        metadata: departmentChanged ? { revokedAssignments: revoked } : {},
      })
    );
  });

  return displayResponse(displayId, departmentChanged ? revoked : undefined);
});

/** Invalidates the current device identity using server-side state (not token expiry). */
async function invalidateDeviceIdentity(oldDeviceUid: string | null) {
  if (!oldDeviceUid) return;
  try {
    await admin.auth().revokeRefreshTokens(oldDeviceUid);
    await admin.auth().updateUser(oldDeviceUid, { disabled: true });
  } catch (err: unknown) {
    // Server-side generation check already blocks the identity; this is defence in depth.
    const code = (err as { code?: string }).code;
    if (code !== 'auth/user-not-found') console.warn('[Aura DIMS] Device identity revocation warning:', code);
  }
}

export const setDisplayLifecycle = onCall<SetDisplayLifecycleRequest, Promise<DisplayMutationResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const action = request.data?.action;
  if (action !== 'suspend' && action !== 'reactivate' && action !== 'retire') {
    throw new HttpsError('invalid-argument', 'Action must be suspend, reactivate, or retire.');
  }
  const ref = db.collection(COL.displays).doc(displayId);
  const secretRef = db.collection(COL.secrets).doc(displayId);
  let oldDeviceUid: string | null = null;

  await db.runTransaction(async (tx) => {
    const [snap, secret] = await Promise.all([tx.get(ref), tx.get(secretRef)]);
    if (!snap.exists) throw new HttpsError('not-found', 'Digital display not found.');
    const current = snap.data()!.lifecycle;
    const target = nextLifecycle(current, action);
    if (!target) {
      throw new HttpsError('failed-precondition', `Cannot ${action} a digital display whose lifecycle is "${current}".`);
    }
    tx.update(ref, { lifecycle: target, updatedAt: FieldValue.serverTimestamp() });
    if (action === 'retire') {
      const s = secret.data() || {};
      oldDeviceUid = (s.activeDeviceUid as string) || null;
      if (s.pairingCodeVerifier) tx.delete(db.collection(COL.pairingCodes).doc(String(s.pairingCodeVerifier)));
      tx.set(
        secretRef,
        {
          activeDeviceUid: null,
          credentialVerifier: null,
          credentialGeneration: Number(s.credentialGeneration || 0) + 1,
          pairingCodeVerifier: null,
          pairingCodeExpiresAt: null,
        },
        { merge: true }
      );
    }
    tx.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: `display.${action}`,
        targetId: displayId,
        targetType: 'display',
        previousState: { lifecycle: current },
        newState: { lifecycle: target },
      })
    );
  });

  await invalidateDeviceIdentity(oldDeviceUid);
  return displayResponse(displayId);
});

export const resetEnrollment = onCall<ResetEnrollmentRequest, Promise<DisplayMutationResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const ref = db.collection(COL.displays).doc(displayId);
  const secretRef = db.collection(COL.secrets).doc(displayId);
  let oldDeviceUid: string | null = null;

  await db.runTransaction(async (tx) => {
    const [snap, secret] = await Promise.all([tx.get(ref), tx.get(secretRef)]);
    if (!snap.exists) throw new HttpsError('not-found', 'Digital display not found.');
    const d = snap.data()!;
    if (d.lifecycle === 'retired') {
      throw new HttpsError('failed-precondition', 'Retired digital displays cannot be re-enrolled.');
    }
    const s = secret.data() || {};
    oldDeviceUid = (s.activeDeviceUid as string) || null;
    if (s.pairingCodeVerifier) tx.delete(db.collection(COL.pairingCodes).doc(String(s.pairingCodeVerifier)));
    tx.set(
      secretRef,
      {
        displayId,
        activeDeviceUid: null,
        credentialVerifier: null,
        credentialGeneration: Number(s.credentialGeneration || 0) + 1,
        pairingCodeVerifier: null,
        pairingCodeExpiresAt: null,
      },
      { merge: true }
    );
    tx.update(ref, {
      lifecycle: 'pending_enrollment',
      lastHeartbeatAt: null,
      reported: null,
      enrolledAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: 'display.reset_enrollment',
        targetId: displayId,
        targetType: 'display',
        previousState: {
          lifecycle: d.lifecycle,
          enrolledAt: toIso(d.enrolledAt),
          lastHeartbeatAt: toIso(d.lastHeartbeatAt),
          reported: d.reported || null,
          hadDeviceIdentity: !!oldDeviceUid,
        },
        newState: { lifecycle: 'pending_enrollment' },
      })
    );
  });

  await invalidateDeviceIdentity(oldDeviceUid);
  return displayResponse(displayId);
});

export const generateDisplayPairingCode = onCall<GeneratePairingCodeRequest, Promise<GeneratePairingCodeResponse>>(
  opts,
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const displayId = requireId(request.data?.displayId, 'Display ID');
    const cfg = getConfig();
    const ref = db.collection(COL.displays).doc(displayId);
    const secretRef = db.collection(COL.secrets).doc(displayId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generatePairingCode();
      const verifier = pairingCodeVerifier(code);
      const expiresAt = Timestamp.fromMillis(Date.now() + cfg.pairingCodeTtlSeconds * 1000);
      try {
        await db.runTransaction(async (tx) => {
          const [snap, secret] = await Promise.all([tx.get(ref), tx.get(secretRef)]);
          if (!snap.exists) throw new HttpsError('not-found', 'Digital display not found.');
          if (snap.data()!.lifecycle !== 'pending_enrollment') {
            throw new HttpsError(
              'failed-precondition',
              'Pairing codes can only be generated for digital displays pending enrollment. Reset enrollment to replace a device.'
            );
          }
          const previous = secret.data()?.pairingCodeVerifier as string | null | undefined;
          if (previous) tx.delete(db.collection(COL.pairingCodes).doc(previous)); // regeneration invalidates old code
          tx.create(db.collection(COL.pairingCodes).doc(verifier), {
            displayId,
            expiresAt,
            consumedAt: null,
            createdBy: caller.uid,
            createdAt: FieldValue.serverTimestamp(),
          });
          tx.set(secretRef, { displayId, pairingCodeVerifier: verifier, pairingCodeExpiresAt: expiresAt }, { merge: true });
          tx.create(
            db.collection('auditEvents').doc(),
            buildAuditRecord({
              actorId: caller.uid,
              action: 'display.pairing_code_generate',
              targetId: displayId,
              targetType: 'display',
              newState: { expiresAt: expiresAt.toDate().toISOString(), supersededPrevious: !!previous },
            })
          );
        });
        return { pairingCode: code, expiresAt: expiresAt.toDate().toISOString() };
      } catch (err: unknown) {
        if (err instanceof HttpsError) throw err;
        const code6 = (err as { code?: number | string }).code;
        if (code6 === 6 || code6 === 'already-exists') continue; // verifier collision; regenerate
        throw err;
      }
    }
    throw new HttpsError('unavailable', 'Could not generate a unique pairing code. Please retry.');
  }
);

// ---------------------------------------------------------------------------
// Assignments (authoritative: /displayAssignments)
// ---------------------------------------------------------------------------

export const assignDisplayUser = onCall<AssignDisplayUserRequest, Promise<AssignmentMutationResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const uid = requireId(request.data?.uid, 'User ID');
  const displayRef = db.collection(COL.displays).doc(displayId);
  const userRef = db.collection('users').doc(uid);
  const aRef = db.collection(COL.assignments).doc(assignmentId(displayId, uid));

  await db.runTransaction(async (tx) => {
    const [display, user, existing] = await Promise.all([tx.get(displayRef), tx.get(userRef), tx.get(aRef)]);
    if (!display.exists) throw new HttpsError('not-found', 'Digital display not found.');
    if (!user.exists) throw new HttpsError('not-found', 'User not found.');
    const d = display.data()!;
    const u = user.data()!;
    if (d.lifecycle === 'retired') throw new HttpsError('failed-precondition', 'Cannot assign users to a retired digital display.');
    if (u.role !== 'department_head') {
      throw new HttpsError('failed-precondition', 'Only Department Heads can be assigned. Administrators already see every digital display.');
    }
    if (u.status !== 'active') throw new HttpsError('failed-precondition', 'Only active users can be assigned.');
    if (!u.departmentId || u.departmentId !== d.departmentId) {
      throw new HttpsError(
        'failed-precondition',
        'A Department Head can only be assigned to digital displays that belong to their own department.'
      );
    }
    if (existing.exists) return; // idempotent
    tx.create(aRef, {
      displayId,
      uid,
      departmentId: d.departmentId,
      assignedBy: caller.uid,
      assignedAt: FieldValue.serverTimestamp(),
    });
    tx.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: 'display_assignment.create',
        targetId: aRef.id,
        targetType: 'display_assignment',
        newState: { displayId, uid, departmentId: d.departmentId },
      })
    );
  });

  return { assignment: serializeAssignment(await aRef.get()) };
});

export const unassignDisplayUser = onCall<UnassignDisplayUserRequest, Promise<AssignmentMutationResponse>>(opts, async (request) => {
  const caller = await assertAdminCaller(request.auth);
  const displayId = requireId(request.data?.displayId, 'Display ID');
  const uid = requireId(request.data?.uid, 'User ID');
  const aRef = db.collection(COL.assignments).doc(assignmentId(displayId, uid));
  let removed = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(aRef);
    if (!snap.exists) return;
    removed = true;
    tx.delete(aRef);
    tx.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: 'display_assignment.remove',
        targetId: aRef.id,
        targetType: 'display_assignment',
        previousState: { displayId, uid, departmentId: snap.data()!.departmentId },
      })
    );
  });
  return { assignment: null, removed };
});

export const listUserAssignments = onCall<ListUserAssignmentsRequest, Promise<ListUserAssignmentsResponse>>(opts, async (request) => {
  await assertAdminCaller(request.auth);
  const uid = requireId(request.data?.uid, 'User ID');
  const snaps = await db.collection(COL.assignments).where('uid', '==', uid).limit(500).get();
  return { assignments: await buildAssignmentViews(snaps.docs) };
});


// ---------------------------------------------------------------------------
// Device protocol & Delivery reporting
// ---------------------------------------------------------------------------

export const redeemPairingCode = onCall<RedeemPairingCodeRequest, Promise<RedeemPairingCodeResponse>>(
  opts,
  async (request) => {
    const rawCode = request.data?.pairingCode;
    if (!rawCode || typeof rawCode !== 'string') {
      throw new HttpsError('invalid-argument', 'Pairing code is required.');
    }
    const cleanCode = rawCode.trim().toUpperCase();
    const verifier = pairingCodeVerifier(cleanCode);

    const clientIp = clientAddress(request.rawRequest);
    const rateLimitKey = hashClientKey('pairing_attempt', clientIp);
    await checkRateLimit(rateLimitKey, 300, 10);

    const pRef = db.collection(COL.pairingCodes).doc(verifier);
    const pSnap = await pRef.get();
    if (!pSnap.exists) {
      await recordRateLimitHit(rateLimitKey, 300, 10);
      throw new HttpsError('not-found', 'Invalid pairing code.');
    }

    const pData = pSnap.data()!;
    if (pData.consumedAt) {
      throw new HttpsError('failed-precondition', 'Pairing code has already been consumed.');
    }
    const expiresAt = pData.expiresAt as Timestamp;
    if (expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('failed-precondition', 'Pairing code has expired.');
    }

    const displayId = pData.displayId as string;
    const dRef = db.collection(COL.displays).doc(displayId);
    const sRef = db.collection(COL.secrets).doc(displayId);

    const deviceSecret = generateDeviceSecret();
    const secretHash = deviceSecretVerifier(displayId, deviceSecret);
    const deviceUid = newDeviceUid();

    await db.runTransaction(async (tx) => {
      const [dSnap, sSnap] = await Promise.all([tx.get(dRef), tx.get(sRef)]);
      if (!dSnap.exists) throw new HttpsError('not-found', 'Digital display not found.');
      const d = dSnap.data()!;
      if (d.lifecycle !== 'pending_enrollment') {
        throw new HttpsError('failed-precondition', 'Digital display is not in pending_enrollment state.');
      }
      const s = sSnap.data() || {};
      const nextGen = Number(s.credentialGeneration || 0) + 1;

      tx.update(pRef, { consumedAt: FieldValue.serverTimestamp() });
      tx.set(
        sRef,
        {
          displayId,
          activeDeviceUid: deviceUid,
          credentialVerifier: secretHash,
          credentialGeneration: nextGen,
          pairingCodeVerifier: null,
          pairingCodeExpiresAt: null,
          enrolledAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.update(dRef, {
        lifecycle: 'active',
        enrolledAt: FieldValue.serverTimestamp(),
        lastHeartbeatAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(
        db.collection('auditEvents').doc(),
        buildAuditRecord({
          actorId: deviceUid,
          action: 'display.enrolled',
          targetId: displayId,
          targetType: 'display',
          newState: { lifecycle: 'active', credentialGeneration: nextGen },
        })
      );
    });

    try {
      await admin.auth().createUser({
        uid: deviceUid,
        displayName: `Device for display ${displayId}`,
        disabled: false,
      });
    } catch (e: any) {
      if (e.code !== 'auth/uid-already-exists') {
        console.error('Failed to create device auth user:', e);
      }
    }

    await admin.auth().setCustomUserClaims(deviceUid, {
      role: 'device',
      displayId,
      principal: 'device',
    });

    const customToken = await admin.auth().createCustomToken(deviceUid, {
      role: 'device',
      displayId,
      principal: 'device',
    });

    return {
      displayId,
      deviceSecret,
      customToken,
    };
  }
);

export const deviceSignIn = onCall<DeviceSignInRequest, Promise<DeviceSignInResponse>>(
  opts,
  async (request) => {
    const { displayId, deviceSecret } = request.data || {};
    if (!displayId || !deviceSecret) {
      throw new HttpsError('invalid-argument', 'Missing displayId or deviceSecret.');
    }

    const clientIp = clientAddress(request.rawRequest);
    const rateLimitKey = hashClientKey('device_signin', `${displayId}:${clientIp}`);
    await checkRateLimit(rateLimitKey, 600, 30);

    const [dSnap, sSnap] = await Promise.all([
      db.collection(COL.displays).doc(displayId).get(),
      db.collection(COL.secrets).doc(displayId).get(),
    ]);

    if (!dSnap.exists || !sSnap.exists) {
      await recordRateLimitHit(rateLimitKey, 600, 30);
      throw new HttpsError('not-found', 'Digital display not found.');
    }

    const d = dSnap.data()!;
    if (d.lifecycle !== 'active') {
      throw new HttpsError('permission-denied', `Digital display is not active (status: ${d.lifecycle}).`);
    }

    const s = sSnap.data()!;
    const expectedHash = s.credentialVerifier as string | undefined;
    const activeDeviceUid = s.activeDeviceUid as string | undefined;

    if (!expectedHash || !activeDeviceUid) {
      throw new HttpsError('failed-precondition', 'Digital display is not enrolled.');
    }

    const providedHash = deviceSecretVerifier(displayId, deviceSecret);
    if (!verifiersEqual(providedHash, expectedHash)) {
      await recordRateLimitHit(rateLimitKey, 600, 30);
      throw new HttpsError('permission-denied', 'Invalid device credentials.');
    }

    await admin.auth().setCustomUserClaims(activeDeviceUid, {
      role: 'device',
      displayId,
      principal: 'device',
    });

    const customToken = await admin.auth().createCustomToken(activeDeviceUid, {
      role: 'device',
      displayId,
      principal: 'device',
    });

    return { customToken };
  }
);

export const getDevicePublication = onCall<GetDevicePublicationRequest, Promise<GetDevicePublicationResponse>>(
  opts,
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Device authentication required.');
    }

    const displayId = requireId(request.data?.displayId, 'Display ID');
    const sDoc = await db.collection(COL.secrets).doc(displayId).get();
    if (!sDoc.exists || sDoc.data()?.activeDeviceUid !== auth.uid) {
      throw new HttpsError('permission-denied', 'Device identity does not match this digital display.');
    }

    const dDoc = await db.collection(COL.displays).doc(displayId).get();
    if (!dDoc.exists) {
      throw new HttpsError('not-found', 'Digital display not found.');
    }

    const display = dDoc.data()!;
    if (display.lifecycle !== 'active') {
      throw new HttpsError('permission-denied', `Digital display is ${display.lifecycle}.`);
    }

    return {
      displayId,
      lifecycle: display.lifecycle,
      desiredPublicationId: display.desiredPublicationId || null,
      activePublicationId: display.activePublicationId || null,
      orientation: display.orientation,
      configuredResolution: display.configuredResolution,
      serverTimestamp: new Date().toISOString(),
    };
  }
);

export const getDevicePublicationManifest = onCall<GetDevicePublicationManifestRequest, Promise<GetDevicePublicationManifestResponse>>(
  opts,
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Device authentication required.');
    }

    const displayId = requireId(request.data?.displayId, 'Display ID');
    const publicationId = requireId(request.data?.publicationId, 'Publication ID');

    const sDoc = await db.collection(COL.secrets).doc(displayId).get();
    if (!sDoc.exists || sDoc.data()?.activeDeviceUid !== auth.uid) {
      throw new HttpsError('permission-denied', 'Device identity does not match this digital display.');
    }

    const dDoc = await db.collection(COL.displays).doc(displayId).get();
    if (!dDoc.exists || dDoc.data()?.lifecycle !== 'active') {
      throw new HttpsError('permission-denied', 'Digital display is not active.');
    }

    const pubDoc = await db.collection('publications').doc(publicationId).get();
    if (!pubDoc.exists) {
      throw new HttpsError('not-found', `Publication ${publicationId} not found.`);
    }

    const pub = pubDoc.data() as PublicationRecord;
    if (pub.displayId !== displayId && dDoc.data()?.desiredPublicationId !== publicationId) {
      throw new HttpsError('permission-denied', 'Access denied to publications belonging to other digital displays.');
    }

    const bucket = admin.storage().bucket();
    const manifestFile = bucket.file(pub.storagePath);
    const [exists] = await manifestFile.exists();
    if (!exists) {
      throw new HttpsError('not-found', 'Publication manifest file not found in storage.');
    }

    const [content] = await manifestFile.download();
    const manifest = JSON.parse(content.toString('utf8')) as DetailedPublicationManifest;

    const isEmulator = !!process.env.STORAGE_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR === 'true';
    const storageHost = process.env.STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
    const bucketName = bucket.name || 'demo-aura-dims.appspot.com';

    const assetUrls: Record<string, string> = {};
    for (const a of manifest.assets) {
      if (isEmulator) {
        assetUrls[a.assetId] = `http://${storageHost}/v0/b/${bucketName}/o/${encodeURIComponent(a.storagePath)}?alt=media`;
      } else {
        try {
          const [url] = await bucket.file(a.storagePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 3600 * 1000,
          });
          assetUrls[a.assetId] = url;
        } catch {
          assetUrls[a.assetId] = `https://storage.googleapis.com/${bucketName}/${a.storagePath}`;
        }
      }
    }

    return { manifest, assetUrls };
  }
);

export const reportDeviceDelivery = onCall<ReportDeviceDeliveryRequest, Promise<ReportDeviceDeliveryResponse>>(
  opts,
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Device authentication required.');
    }

    const displayId = requireId(request.data?.displayId, 'Display ID');
    const publicationId = requireId(request.data?.publicationId, 'Publication ID');
    const stage = request.data?.stage;
    const checksumSha256 = request.data?.checksumSha256 || null;
    const errorMessage = request.data?.errorMessage || null;

    const sDoc = await db.collection(COL.secrets).doc(displayId).get();
    if (!sDoc.exists || sDoc.data()?.activeDeviceUid !== auth.uid) {
      throw new HttpsError('permission-denied', 'Device identity does not match this digital display.');
    }

    const dRef = db.collection(COL.displays).doc(displayId);
    const dDoc = await dRef.get();
    if (!dDoc.exists) {
      throw new HttpsError('not-found', 'Digital display not found.');
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      deliveryStage: stage,
      lastSyncAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (stage === 'active') {
      updateData.activePublicationId = publicationId;
      updateData.lastActiveAt = FieldValue.serverTimestamp();
      updateData.lastDeliveryError = null;
    } else if (stage === 'failed') {
      updateData.lastDeliveryError = errorMessage;
    }

    await dRef.update(updateData);

    await writeAuditLog({
      actorId: auth.uid,
      action: 'display.delivery_reported',
      targetId: displayId,
      targetType: 'display',
      newState: {
        stage,
        publicationId,
        checksumSha256,
        errorMessage,
      },
    });

    return {
      accepted: true,
      serverReceivedAt: now,
    };
  }
);

export const reportDeviceHeartbeat = onCall<DeviceHeartbeatRequest, Promise<DeviceHeartbeatResponse>>(
  opts,
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Device authentication required.');
    }

    const data = request.data || ({} as DeviceHeartbeatRequest);
    let displayId = data.displayId;
    if (!displayId) {
      displayId = auth.token?.displayId as string | undefined;
    }
    if (!displayId) {
      const q = await db.collection(COL.secrets).where('activeDeviceUid', '==', auth.uid).limit(1).get();
      if (q.empty) {
        throw new HttpsError('permission-denied', 'Unrecognized device identity.');
      }
      displayId = q.docs[0].id;
    }

    const sDoc = await db.collection(COL.secrets).doc(displayId).get();
    if (!sDoc.exists || sDoc.data()?.activeDeviceUid !== auth.uid) {
      throw new HttpsError('permission-denied', 'Device identity does not match this digital display.');
    }

    const dRef = db.collection(COL.displays).doc(displayId);
    const dDoc = await dRef.get();
    if (!dDoc.exists) {
      throw new HttpsError('not-found', 'Digital display not found.');
    }

    const display = dDoc.data()!;
    if (display.lifecycle !== 'active') {
      throw new HttpsError('permission-denied', `Digital display is not active (${display.lifecycle}).`);
    }

    const reportedState: DisplayReportedState = {
      appVersion: data.appVersion || '1.0.0',
      clientKind: data.clientKind || 'player',
      screenWidth: data.screen?.width || null,
      screenHeight: data.screen?.height || null,
      availableStorageBytes: data.diagnostics?.availableStorageBytes || null,
      uptimeSeconds: data.diagnostics?.uptimeSeconds || null,
      desiredPublicationId: data.desiredPublicationId || display.desiredPublicationId || null,
      downloadingPublicationId: data.downloadingPublicationId || null,
      readyPublicationId: data.readyPublicationId || null,
      activePublicationId: data.activePublicationId || display.activePublicationId || null,
      deliveryStage: data.deliveryStage || display.deliveryStage || 'idle',
      lastSyncAt: data.lastSyncAt || null,
      storage: data.storage || null,
      playback: data.playback || null,
      rendererHealth: data.rendererHealth || 'healthy',
      lastError: data.lastError || null,
      errorCount: data.errorCount || 0,
    };

    const updatePayload: Record<string, any> = {
      lastHeartbeatAt: FieldValue.serverTimestamp(),
      reported: reportedState,
    };
    if (data.activePublicationId) {
      updatePayload.activePublicationId = data.activePublicationId;
    }
    if (data.deliveryStage) {
      updatePayload.deliveryStage = data.deliveryStage;
    }

    await dRef.update(updatePayload);

    return {
      accepted: true,
      serverReceivedAt: new Date().toISOString(),
      recommendedHeartbeatSeconds: 30,
    };
  }
);

export const listDisplays = onCall<ListDisplaysRequest, Promise<ListDisplaysResponse>>(
  opts,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    let q = db.collection(COL.displays) as admin.firestore.Query;

    if (caller.role === 'department_head') {
      if (!caller.departmentId) {
        return { displays: [], nextCursor: null, scanLimited: false, thresholds: thresholds() };
      }
      q = q.where('departmentId', '==', caller.departmentId);
    } else if (request.data?.departmentId) {
      q = q.where('departmentId', '==', request.data.departmentId);
    }

    if (request.data?.siteId) {
      q = q.where('siteId', '==', request.data.siteId);
    }

    const snaps = await q.get();
    let docs = snaps.docs;

    const lifecycleFilter = request.data?.lifecycle || 'non_retired';
    if (lifecycleFilter === 'non_retired') {
      docs = docs.filter((d) => d.data().lifecycle !== 'retired');
    } else if (lifecycleFilter !== 'all') {
      docs = docs.filter((d) => d.data().lifecycle === lifecycleFilter);
    }

    const search = request.data?.search?.trim().toLowerCase();
    if (search) {
      docs = docs.filter((d) => {
        const name = (d.data().name || '').toLowerCase();
        const loc = (d.data().locationDescription || '').toLowerCase();
        return name.includes(search) || loc.includes(search);
      });
    }

    const views = await buildViews(docs);

    let finalViews = views;
    if (request.data?.connectivity) {
      finalViews = views.filter((v) => v.connectivity === request.data?.connectivity);
    }

    return {
      displays: finalViews,
      nextCursor: null,
      scanLimited: false,
      thresholds: thresholds(),
    };
  }
);

export const getDisplay = onCall<GetDisplayRequest, Promise<GetDisplayResponse>>(
  opts,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const displayId = requireId(request.data?.displayId, 'Display ID');
    const snap = await loadAuthorizedDisplay(caller, displayId);
    const [view] = await buildViews([snap]);

    let assignments: AssignmentView[] | undefined;
    let enrollment: EnrollmentState | undefined;

    if (caller.role === 'admin') {
      const aSnaps = await db.collection(COL.assignments).where('displayId', '==', displayId).get();
      assignments = await buildAssignmentViews(aSnaps.docs);

      const secretSnap = await db.collection(COL.secrets).doc(displayId).get();
      const s = secretSnap.data() || {};
      const pairingExpires = s.pairingCodeExpiresAt ? toIso(s.pairingCodeExpiresAt) : null;
      enrollment = {
        enrolled: !!s.activeDeviceUid,
        pairingCodeActive: !!s.pairingCodeVerifier && (!pairingExpires || new Date(pairingExpires).getTime() > Date.now()),
        pairingCodeExpiresAt: pairingExpires,
      };
    }

    return {
      display: view!,
      assignments,
      enrollment,
      thresholds: thresholds(),
    };
  }
);
