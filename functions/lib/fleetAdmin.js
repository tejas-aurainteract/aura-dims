"use strict";
/**
 * Aura DIMS - Admin fleet management callables
 * Sites, display groups, display records, lifecycle, enrollment codes, assignments.
 * Every callable authorizes the caller explicitly (Admin SDK bypasses rules).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUserAssignments = exports.unassignDisplayUser = exports.assignDisplayUser = exports.generateDisplayPairingCode = exports.resetEnrollment = exports.setDisplayLifecycle = exports.updateDisplay = exports.registerDisplay = exports.setDisplayGroupStatus = exports.updateDisplayGroup = exports.createDisplayGroup = exports.setSiteStatus = exports.updateSite = exports.createSite = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const common_js_1 = require("./common.js");
const operational_js_1 = require("./operational.js");
const credentials_js_1 = require("./credentials.js");
const displayModel_js_1 = require("./displayModel.js");
const opts = { cors: true, region: common_js_1.REGION };
// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function validateOrientation(value) {
    if (value !== 'portrait' && value !== 'landscape') {
        throw new https_1.HttpsError('invalid-argument', 'Orientation must be "portrait" or "landscape".');
    }
    return value;
}
function validateResolution(value) {
    const r = value;
    const ok = (n) => Number.isInteger(n) && n >= 64 && n <= 16384;
    if (!r || !ok(r.width) || !ok(r.height)) {
        throw new https_1.HttpsError('invalid-argument', 'Configured resolution must be whole pixels between 64 and 16384.');
    }
    return { width: r.width, height: r.height };
}
function validateGroupIdList(value) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value) || value.length > 20) {
        throw new https_1.HttpsError('invalid-argument', 'groupIds must be an array of at most 20 group IDs.');
    }
    const ids = value.map((v) => (0, common_js_1.requireId)(v, 'groupId'));
    return [...new Set(ids)];
}
function siteFromSnap(snap) {
    const d = snap.data() || {};
    return {
        id: snap.id,
        name: d.name,
        location: d.location,
        status: d.status,
        createdBy: d.createdBy || '',
        createdAt: (0, common_js_1.toIso)(d.createdAt) || '',
        updatedAt: (0, common_js_1.toIso)(d.updatedAt) || '',
    };
}
function groupFromSnap(snap) {
    const d = snap.data() || {};
    return {
        id: snap.id,
        name: d.name,
        siteId: d.siteId,
        description: d.description || '',
        status: d.status,
        createdBy: d.createdBy || '',
        createdAt: (0, common_js_1.toIso)(d.createdAt) || '',
        updatedAt: (0, common_js_1.toIso)(d.updatedAt) || '',
    };
}
/** Ensures every group exists, is active, and belongs to the given site. */
async function assertGroupsBelongToSite(groupIds, siteId, allowExistingInactive = []) {
    if (groupIds.length === 0)
        return;
    const snaps = await common_js_1.db.getAll(...groupIds.map((id) => common_js_1.db.collection(displayModel_js_1.COL.groups).doc(id)));
    for (const g of snaps) {
        if (!g.exists)
            throw new https_1.HttpsError('invalid-argument', 'A selected display group does not exist.');
        const data = g.data();
        if (data.siteId !== siteId) {
            throw new https_1.HttpsError('invalid-argument', `Display group "${data.name}" belongs to a different site.`);
        }
        if (data.status !== 'active' && !allowExistingInactive.includes(g.id)) {
            throw new https_1.HttpsError('failed-precondition', `Display group "${data.name}" is inactive.`);
        }
    }
}
async function assertActiveSite(siteId) {
    const snap = await common_js_1.db.collection(displayModel_js_1.COL.sites).doc(siteId).get();
    if (!snap.exists)
        throw new https_1.HttpsError('invalid-argument', 'Selected site does not exist.');
    if (snap.data()?.status !== 'active')
        throw new https_1.HttpsError('failed-precondition', 'Selected site is inactive.');
}
async function assertActiveDepartment(departmentId) {
    const snap = await common_js_1.db.collection('departments').doc(departmentId).get();
    if (!snap.exists)
        throw new https_1.HttpsError('invalid-argument', 'Selected department does not exist.');
    if (snap.data()?.status !== 'active')
        throw new https_1.HttpsError('failed-precondition', 'Selected department is inactive.');
}
// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------
exports.createSite = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const name = (0, common_js_1.requireString)(request.data?.name, 'Site name', 120);
    const location = (0, common_js_1.requireString)(request.data?.location, 'Site location', 240);
    const ref = common_js_1.db.collection(displayModel_js_1.COL.sites).doc();
    await ref.set({
        id: ref.id,
        name,
        nameLower: name.toLowerCase(),
        location,
        status: 'active',
        createdBy: caller.uid,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await (0, common_js_1.writeAuditLog)({ actorId: caller.uid, action: 'site.create', targetId: ref.id, targetType: 'site', newState: { name, location } });
    return { site: siteFromSnap(await ref.get()) };
});
exports.updateSite = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const id = (0, common_js_1.requireId)(request.data?.id, 'Site ID');
    const ref = common_js_1.db.collection(displayModel_js_1.COL.sites).doc(id);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Site not found.');
    const current = snap.data();
    const name = request.data.name !== undefined ? (0, common_js_1.requireString)(request.data.name, 'Site name', 120) : current.name;
    const location = request.data.location !== undefined ? (0, common_js_1.requireString)(request.data.location, 'Site location', 240) : current.location;
    await ref.update({ name, nameLower: name.toLowerCase(), location, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: 'site.update',
        targetId: id,
        targetType: 'site',
        previousState: { name: current.name, location: current.location },
        newState: { name, location },
    });
    return { site: siteFromSnap(await ref.get()) };
});
exports.setSiteStatus = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const id = (0, common_js_1.requireId)(request.data?.id, 'Site ID');
    const status = request.data?.status;
    if (status !== 'active' && status !== 'inactive')
        throw new https_1.HttpsError('invalid-argument', 'Invalid site status.');
    const ref = common_js_1.db.collection(displayModel_js_1.COL.sites).doc(id);
    await common_js_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Site not found.');
        if (status === 'inactive') {
            const fleet = await tx.get(common_js_1.db.collection(displayModel_js_1.COL.displays).where('siteId', '==', id).where('lifecycle', 'in', operational_js_1.NON_RETIRED_LIFECYCLES).limit(1000));
            if (!fleet.empty) {
                throw new https_1.HttpsError('failed-precondition', `This site still contains ${fleet.size} non-retired digital display(s). Retire them or move them to another site before deactivating the site.`);
            }
        }
        tx.update(ref, { status, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        tx.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
            actorId: caller.uid,
            action: status === 'active' ? 'site.activate' : 'site.deactivate',
            targetId: id,
            targetType: 'site',
            previousState: { status: snap.data()?.status },
            newState: { status },
        }));
    });
    return { site: siteFromSnap(await ref.get()) };
});
// ---------------------------------------------------------------------------
// Display groups (grant NO permissions)
// ---------------------------------------------------------------------------
exports.createDisplayGroup = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const name = (0, common_js_1.requireString)(request.data?.name, 'Group name', 120);
    const siteId = (0, common_js_1.requireId)(request.data?.siteId, 'Site ID');
    const description = request.data?.description
        ? (0, common_js_1.requireString)(request.data.description, 'Description', 500, { allowEmpty: true })
        : '';
    await assertActiveSite(siteId);
    const ref = common_js_1.db.collection(displayModel_js_1.COL.groups).doc();
    await ref.set({
        id: ref.id,
        name,
        siteId,
        description,
        status: 'active',
        createdBy: caller.uid,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await (0, common_js_1.writeAuditLog)({ actorId: caller.uid, action: 'display_group.create', targetId: ref.id, targetType: 'display_group', newState: { name, siteId } });
    return { group: groupFromSnap(await ref.get()) };
});
exports.updateDisplayGroup = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const id = (0, common_js_1.requireId)(request.data?.id, 'Group ID');
    const ref = common_js_1.db.collection(displayModel_js_1.COL.groups).doc(id);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Display group not found.');
    const current = snap.data();
    const name = request.data.name !== undefined ? (0, common_js_1.requireString)(request.data.name, 'Group name', 120) : current.name;
    const description = request.data.description !== undefined
        ? (0, common_js_1.requireString)(request.data.description, 'Description', 500, { allowEmpty: true })
        : current.description;
    await ref.update({ name, description, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: 'display_group.update',
        targetId: id,
        targetType: 'display_group',
        previousState: { name: current.name, description: current.description },
        newState: { name, description },
    });
    return { group: groupFromSnap(await ref.get()) };
});
exports.setDisplayGroupStatus = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const id = (0, common_js_1.requireId)(request.data?.id, 'Group ID');
    const status = request.data?.status;
    if (status !== 'active' && status !== 'inactive')
        throw new https_1.HttpsError('invalid-argument', 'Invalid group status.');
    const ref = common_js_1.db.collection(displayModel_js_1.COL.groups).doc(id);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Display group not found.');
    if (status === 'active')
        await assertActiveSite(snap.data().siteId);
    // Existing display references are preserved for history; inactive groups cannot be newly selected.
    await ref.update({ status, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    await (0, common_js_1.writeAuditLog)({
        actorId: caller.uid,
        action: status === 'active' ? 'display_group.activate' : 'display_group.deactivate',
        targetId: id,
        targetType: 'display_group',
        previousState: { status: snap.data().status },
        newState: { status },
    });
    return { group: groupFromSnap(await ref.get()) };
});
// ---------------------------------------------------------------------------
// Display records
// ---------------------------------------------------------------------------
async function displayResponse(displayId, revokedAssignmentCount) {
    const snap = await common_js_1.db.collection(displayModel_js_1.COL.displays).doc(displayId).get();
    const [view] = await (0, displayModel_js_1.buildViews)([snap]);
    return { display: view, ...(revokedAssignmentCount !== undefined ? { revokedAssignmentCount } : {}) };
}
exports.registerDisplay = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const data = request.data || {};
    const name = (0, common_js_1.requireString)(data.name, 'Display name', 120);
    const siteId = (0, common_js_1.requireId)(data.siteId, 'Site ID');
    const departmentId = (0, common_js_1.requireId)(data.departmentId, 'Department ID');
    const locationDescription = (0, common_js_1.requireString)(data.locationDescription, 'Location description', 240, { allowEmpty: true });
    const orientation = validateOrientation(data.orientation);
    const configuredResolution = validateResolution(data.configuredResolution);
    const groupIds = validateGroupIdList(data.groupIds);
    await Promise.all([assertActiveSite(siteId), assertActiveDepartment(departmentId)]);
    await assertGroupsBelongToSite(groupIds, siteId);
    const ref = common_js_1.db.collection(displayModel_js_1.COL.displays).doc();
    const batch = common_js_1.db.batch();
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    batch.set(common_js_1.db.collection(displayModel_js_1.COL.secrets).doc(ref.id), {
        displayId: ref.id,
        activeDeviceUid: null,
        credentialVerifier: null,
        credentialGeneration: 0,
        pairingCodeVerifier: null,
        pairingCodeExpiresAt: null,
    });
    batch.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
        actorId: caller.uid,
        action: 'display.register',
        targetId: ref.id,
        targetType: 'display',
        newState: { name, siteId, departmentId, groupIds, orientation, configuredResolution, locationDescription },
    }));
    await batch.commit();
    return displayResponse(ref.id);
});
exports.updateDisplay = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const data = request.data || {};
    const displayId = (0, common_js_1.requireId)(data.displayId, 'Display ID');
    const ref = common_js_1.db.collection(displayModel_js_1.COL.displays).doc(displayId);
    const pre = await ref.get();
    if (!pre.exists)
        throw new https_1.HttpsError('not-found', 'Digital display not found.');
    const cur = pre.data();
    if (cur.lifecycle === 'retired') {
        throw new https_1.HttpsError('failed-precondition', 'Retired digital displays are preserved for history and cannot be edited.');
    }
    const next = {
        name: data.name !== undefined ? (0, common_js_1.requireString)(data.name, 'Display name', 120) : cur.name,
        siteId: data.siteId !== undefined ? (0, common_js_1.requireId)(data.siteId, 'Site ID') : cur.siteId,
        locationDescription: data.locationDescription !== undefined
            ? (0, common_js_1.requireString)(data.locationDescription, 'Location description', 240, { allowEmpty: true })
            : cur.locationDescription,
        departmentId: data.departmentId !== undefined ? (0, common_js_1.requireId)(data.departmentId, 'Department ID') : cur.departmentId,
        groupIds: data.groupIds !== undefined ? validateGroupIdList(data.groupIds) : cur.groupIds,
        orientation: data.orientation !== undefined ? validateOrientation(data.orientation) : cur.orientation,
        configuredResolution: data.configuredResolution !== undefined ? validateResolution(data.configuredResolution) : cur.configuredResolution,
    };
    if (next.siteId !== cur.siteId)
        await assertActiveSite(next.siteId);
    if (next.departmentId !== cur.departmentId)
        await assertActiveDepartment(next.departmentId);
    // Groups already on the display may stay even if since deactivated (history); new ones must be active.
    await assertGroupsBelongToSite(next.groupIds, next.siteId, cur.groupIds || []);
    const departmentChanged = next.departmentId !== cur.departmentId;
    let revoked = 0;
    await common_js_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data().lifecycle === 'retired') {
            throw new https_1.HttpsError('failed-precondition', 'Digital display changed during update; please retry.');
        }
        let assignmentSnaps = [];
        const userSnaps = new Map();
        if (departmentChanged) {
            const q = await tx.get(common_js_1.db.collection(displayModel_js_1.COL.assignments).where('displayId', '==', displayId));
            assignmentSnaps = q.docs;
            if (assignmentSnaps.length > 0) {
                const users = await tx.getAll(...assignmentSnaps.map((a) => common_js_1.db.collection('users').doc(String(a.data().uid))));
                users.forEach((u) => userSnaps.set(u.id, u));
            }
        }
        if (departmentChanged) {
            revoked = (0, displayModel_js_1.revokeIncompatibleForDisplay)(tx, caller.uid, displayId, next.departmentId, assignmentSnaps, userSnaps);
        }
        tx.update(ref, { ...next, nameLower: next.name.toLowerCase(), updatedAt: firestore_1.FieldValue.serverTimestamp() });
        tx.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
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
        }));
    });
    return displayResponse(displayId, departmentChanged ? revoked : undefined);
});
/** Invalidates the current device identity using server-side state (not token expiry). */
async function invalidateDeviceIdentity(oldDeviceUid) {
    if (!oldDeviceUid)
        return;
    try {
        await admin.auth().revokeRefreshTokens(oldDeviceUid);
        await admin.auth().updateUser(oldDeviceUid, { disabled: true });
    }
    catch (err) {
        // Server-side generation check already blocks the identity; this is defence in depth.
        const code = err.code;
        if (code !== 'auth/user-not-found')
            console.warn('[Aura DIMS] Device identity revocation warning:', code);
    }
}
exports.setDisplayLifecycle = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const displayId = (0, common_js_1.requireId)(request.data?.displayId, 'Display ID');
    const action = request.data?.action;
    if (action !== 'suspend' && action !== 'reactivate' && action !== 'retire') {
        throw new https_1.HttpsError('invalid-argument', 'Action must be suspend, reactivate, or retire.');
    }
    const ref = common_js_1.db.collection(displayModel_js_1.COL.displays).doc(displayId);
    const secretRef = common_js_1.db.collection(displayModel_js_1.COL.secrets).doc(displayId);
    let oldDeviceUid = null;
    await common_js_1.db.runTransaction(async (tx) => {
        const [snap, secret] = await Promise.all([tx.get(ref), tx.get(secretRef)]);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Digital display not found.');
        const current = snap.data().lifecycle;
        const target = (0, operational_js_1.nextLifecycle)(current, action);
        if (!target) {
            throw new https_1.HttpsError('failed-precondition', `Cannot ${action} a digital display whose lifecycle is "${current}".`);
        }
        tx.update(ref, { lifecycle: target, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        if (action === 'retire') {
            const s = secret.data() || {};
            oldDeviceUid = s.activeDeviceUid || null;
            if (s.pairingCodeVerifier)
                tx.delete(common_js_1.db.collection(displayModel_js_1.COL.pairingCodes).doc(String(s.pairingCodeVerifier)));
            tx.set(secretRef, {
                activeDeviceUid: null,
                credentialVerifier: null,
                credentialGeneration: Number(s.credentialGeneration || 0) + 1,
                pairingCodeVerifier: null,
                pairingCodeExpiresAt: null,
            }, { merge: true });
        }
        tx.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
            actorId: caller.uid,
            action: `display.${action}`,
            targetId: displayId,
            targetType: 'display',
            previousState: { lifecycle: current },
            newState: { lifecycle: target },
        }));
    });
    await invalidateDeviceIdentity(oldDeviceUid);
    return displayResponse(displayId);
});
exports.resetEnrollment = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const displayId = (0, common_js_1.requireId)(request.data?.displayId, 'Display ID');
    const ref = common_js_1.db.collection(displayModel_js_1.COL.displays).doc(displayId);
    const secretRef = common_js_1.db.collection(displayModel_js_1.COL.secrets).doc(displayId);
    let oldDeviceUid = null;
    await common_js_1.db.runTransaction(async (tx) => {
        const [snap, secret] = await Promise.all([tx.get(ref), tx.get(secretRef)]);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Digital display not found.');
        const d = snap.data();
        if (d.lifecycle === 'retired') {
            throw new https_1.HttpsError('failed-precondition', 'Retired digital displays cannot be re-enrolled.');
        }
        const s = secret.data() || {};
        oldDeviceUid = s.activeDeviceUid || null;
        if (s.pairingCodeVerifier)
            tx.delete(common_js_1.db.collection(displayModel_js_1.COL.pairingCodes).doc(String(s.pairingCodeVerifier)));
        tx.set(secretRef, {
            displayId,
            activeDeviceUid: null,
            credentialVerifier: null,
            credentialGeneration: Number(s.credentialGeneration || 0) + 1,
            pairingCodeVerifier: null,
            pairingCodeExpiresAt: null,
        }, { merge: true });
        tx.update(ref, {
            lifecycle: 'pending_enrollment',
            lastHeartbeatAt: null,
            reported: null,
            enrolledAt: null,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
            actorId: caller.uid,
            action: 'display.reset_enrollment',
            targetId: displayId,
            targetType: 'display',
            previousState: {
                lifecycle: d.lifecycle,
                enrolledAt: (0, common_js_1.toIso)(d.enrolledAt),
                lastHeartbeatAt: (0, common_js_1.toIso)(d.lastHeartbeatAt),
                reported: d.reported || null,
                hadDeviceIdentity: !!oldDeviceUid,
            },
            newState: { lifecycle: 'pending_enrollment' },
        }));
    });
    await invalidateDeviceIdentity(oldDeviceUid);
    return displayResponse(displayId);
});
exports.generateDisplayPairingCode = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const displayId = (0, common_js_1.requireId)(request.data?.displayId, 'Display ID');
    const cfg = (0, operational_js_1.getConfig)();
    const ref = common_js_1.db.collection(displayModel_js_1.COL.displays).doc(displayId);
    const secretRef = common_js_1.db.collection(displayModel_js_1.COL.secrets).doc(displayId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const code = (0, credentials_js_1.generatePairingCode)();
        const verifier = (0, credentials_js_1.pairingCodeVerifier)(code);
        const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() + cfg.pairingCodeTtlSeconds * 1000);
        try {
            await common_js_1.db.runTransaction(async (tx) => {
                const [snap, secret] = await Promise.all([tx.get(ref), tx.get(secretRef)]);
                if (!snap.exists)
                    throw new https_1.HttpsError('not-found', 'Digital display not found.');
                if (snap.data().lifecycle !== 'pending_enrollment') {
                    throw new https_1.HttpsError('failed-precondition', 'Pairing codes can only be generated for digital displays pending enrollment. Reset enrollment to replace a device.');
                }
                const previous = secret.data()?.pairingCodeVerifier;
                if (previous)
                    tx.delete(common_js_1.db.collection(displayModel_js_1.COL.pairingCodes).doc(previous)); // regeneration invalidates old code
                tx.create(common_js_1.db.collection(displayModel_js_1.COL.pairingCodes).doc(verifier), {
                    displayId,
                    expiresAt,
                    consumedAt: null,
                    createdBy: caller.uid,
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                });
                tx.set(secretRef, { displayId, pairingCodeVerifier: verifier, pairingCodeExpiresAt: expiresAt }, { merge: true });
                tx.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
                    actorId: caller.uid,
                    action: 'display.pairing_code_generate',
                    targetId: displayId,
                    targetType: 'display',
                    newState: { expiresAt: expiresAt.toDate().toISOString(), supersededPrevious: !!previous },
                }));
            });
            return { pairingCode: code, expiresAt: expiresAt.toDate().toISOString() };
        }
        catch (err) {
            if (err instanceof https_1.HttpsError)
                throw err;
            const code6 = err.code;
            if (code6 === 6 || code6 === 'already-exists')
                continue; // verifier collision; regenerate
            throw err;
        }
    }
    throw new https_1.HttpsError('unavailable', 'Could not generate a unique pairing code. Please retry.');
});
// ---------------------------------------------------------------------------
// Assignments (authoritative: /displayAssignments)
// ---------------------------------------------------------------------------
exports.assignDisplayUser = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const displayId = (0, common_js_1.requireId)(request.data?.displayId, 'Display ID');
    const uid = (0, common_js_1.requireId)(request.data?.uid, 'User ID');
    const displayRef = common_js_1.db.collection(displayModel_js_1.COL.displays).doc(displayId);
    const userRef = common_js_1.db.collection('users').doc(uid);
    const aRef = common_js_1.db.collection(displayModel_js_1.COL.assignments).doc((0, displayModel_js_1.assignmentId)(displayId, uid));
    await common_js_1.db.runTransaction(async (tx) => {
        const [display, user, existing] = await Promise.all([tx.get(displayRef), tx.get(userRef), tx.get(aRef)]);
        if (!display.exists)
            throw new https_1.HttpsError('not-found', 'Digital display not found.');
        if (!user.exists)
            throw new https_1.HttpsError('not-found', 'User not found.');
        const d = display.data();
        const u = user.data();
        if (d.lifecycle === 'retired')
            throw new https_1.HttpsError('failed-precondition', 'Cannot assign users to a retired digital display.');
        if (u.role !== 'department_head') {
            throw new https_1.HttpsError('failed-precondition', 'Only Department Heads can be assigned. Administrators already see every digital display.');
        }
        if (u.status !== 'active')
            throw new https_1.HttpsError('failed-precondition', 'Only active users can be assigned.');
        if (!u.departmentId || u.departmentId !== d.departmentId) {
            throw new https_1.HttpsError('failed-precondition', 'A Department Head can only be assigned to digital displays that belong to their own department.');
        }
        if (existing.exists)
            return; // idempotent
        tx.create(aRef, {
            displayId,
            uid,
            departmentId: d.departmentId,
            assignedBy: caller.uid,
            assignedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
            actorId: caller.uid,
            action: 'display_assignment.create',
            targetId: aRef.id,
            targetType: 'display_assignment',
            newState: { displayId, uid, departmentId: d.departmentId },
        }));
    });
    return { assignment: (0, displayModel_js_1.serializeAssignment)(await aRef.get()) };
});
exports.unassignDisplayUser = (0, https_1.onCall)(opts, async (request) => {
    const caller = await (0, common_js_1.assertAdminCaller)(request.auth);
    const displayId = (0, common_js_1.requireId)(request.data?.displayId, 'Display ID');
    const uid = (0, common_js_1.requireId)(request.data?.uid, 'User ID');
    const aRef = common_js_1.db.collection(displayModel_js_1.COL.assignments).doc((0, displayModel_js_1.assignmentId)(displayId, uid));
    let removed = false;
    await common_js_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(aRef);
        if (!snap.exists)
            return;
        removed = true;
        tx.delete(aRef);
        tx.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
            actorId: caller.uid,
            action: 'display_assignment.remove',
            targetId: aRef.id,
            targetType: 'display_assignment',
            previousState: { displayId, uid, departmentId: snap.data().departmentId },
        }));
    });
    return { assignment: null, removed };
});
exports.listUserAssignments = (0, https_1.onCall)(opts, async (request) => {
    await (0, common_js_1.assertAdminCaller)(request.auth);
    const uid = (0, common_js_1.requireId)(request.data?.uid, 'User ID');
    const snaps = await common_js_1.db.collection(displayModel_js_1.COL.assignments).where('uid', '==', uid).limit(500).get();
    return { assignments: await (0, displayModel_js_1.buildAssignmentViews)(snaps.docs) };
});
//# sourceMappingURL=fleetAdmin.js.map