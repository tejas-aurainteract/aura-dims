"use strict";
/**
 * Aura DIMS - Digital display domain model helpers (server-side)
 *
 * Collections:
 *   /sites/{siteId}
 *   /displayGroups/{groupId}
 *   /displays/{displayId}                 normal display record (no credential material)
 *   /displayAssignments/{displayId}__{uid} AUTHORITATIVE Department Head access grant
 *   /displaySecrets/{displayId}           internal: verifiers, device identity (clients denied)
 *   /pairingCodes/{verifier}              internal: single-use code lookup (clients denied)
 *   /rateLimits/{key}                     internal: rate-limit windows (clients denied)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COL = void 0;
exports.assignmentId = assignmentId;
exports.thresholds = thresholds;
exports.serializeDisplay = serializeDisplay;
exports.buildViews = buildViews;
exports.loadAuthorizedDisplay = loadAuthorizedDisplay;
exports.isAssignmentValid = isAssignmentValid;
exports.serializeAssignment = serializeAssignment;
exports.buildAssignmentViews = buildAssignmentViews;
exports.revokeIncompatibleForDisplay = revokeIncompatibleForDisplay;
exports.revokeAssignmentsForUserChange = revokeAssignmentsForUserChange;
const https_1 = require("firebase-functions/v2/https");
const common_js_1 = require("./common.js");
const operational_js_1 = require("./operational.js");
exports.COL = {
    sites: 'sites',
    groups: 'displayGroups',
    displays: 'displays',
    assignments: 'displayAssignments',
    secrets: 'displaySecrets',
    pairingCodes: 'pairingCodes',
};
function assignmentId(displayId, uid) {
    return `${displayId}__${uid}`;
}
function thresholds() {
    const cfg = (0, operational_js_1.getConfig)();
    return {
        onlineWindowSeconds: cfg.onlineWindowSeconds,
        recommendedHeartbeatSeconds: cfg.recommendedHeartbeatSeconds,
    };
}
function serializeDisplay(snap) {
    const d = snap.data() || {};
    const reported = (d.reported || null);
    return {
        id: snap.id,
        name: String(d.name || ''),
        siteId: String(d.siteId || ''),
        locationDescription: String(d.locationDescription || ''),
        departmentId: String(d.departmentId || ''),
        groupIds: Array.isArray(d.groupIds) ? d.groupIds : [],
        orientation: d.orientation === 'portrait' ? 'portrait' : 'landscape',
        configuredResolution: {
            width: Number(d.configuredResolution?.width || 0),
            height: Number(d.configuredResolution?.height || 0),
        },
        lifecycle: d.lifecycle,
        lastHeartbeatAt: (0, common_js_1.toIso)(d.lastHeartbeatAt),
        reported,
        enrolledAt: (0, common_js_1.toIso)(d.enrolledAt),
        createdBy: String(d.createdBy || ''),
        createdAt: (0, common_js_1.toIso)(d.createdAt) || '',
        updatedAt: (0, common_js_1.toIso)(d.updatedAt) || '',
    };
}
/** Resolves site / department / group labels with batched reads and derives connectivity. */
async function buildViews(snaps, nowMs = Date.now()) {
    if (snaps.length === 0)
        return [];
    const cfg = (0, operational_js_1.getConfig)();
    const siteIds = new Set();
    const deptIds = new Set();
    const groupIds = new Set();
    for (const s of snaps) {
        const d = s.data() || {};
        if (d.siteId)
            siteIds.add(d.siteId);
        if (d.departmentId)
            deptIds.add(d.departmentId);
        for (const g of d.groupIds || [])
            groupIds.add(g);
    }
    const names = new Map();
    const load = async (col, ids) => {
        if (ids.size === 0)
            return;
        const refs = [...ids].map((id) => common_js_1.db.collection(col).doc(id));
        const docs = await common_js_1.db.getAll(...refs);
        for (const doc of docs) {
            if (doc.exists)
                names.set(`${col}/${doc.id}`, String(doc.data()?.name || ''));
        }
    };
    await Promise.all([load(exports.COL.sites, siteIds), load('departments', deptIds), load(exports.COL.groups, groupIds)]);
    return snaps.map((snap) => {
        const base = serializeDisplay(snap);
        return {
            ...base,
            connectivity: (0, operational_js_1.deriveConnectivity)((0, common_js_1.toMillis)(snap.data()?.lastHeartbeatAt), nowMs, cfg.onlineWindowSeconds),
            siteName: names.get(`${exports.COL.sites}/${base.siteId}`) ?? null,
            departmentName: names.get(`departments/${base.departmentId}`) ?? null,
            groupNames: base.groupIds.map((g) => names.get(`${exports.COL.groups}/${g}`) ?? g),
        };
    });
}
/**
 * Fail-closed authorization for reading a display.
 * Admin: any display. Department Head: ONLY with an assignment record whose
 * department matches BOTH the caller's current department and the display's
 * current department. Department or group membership alone grants nothing.
 * Missing and unauthorized displays return the same error for Department Heads.
 */
async function loadAuthorizedDisplay(caller, displayId) {
    const snap = await common_js_1.db.collection(exports.COL.displays).doc(displayId).get();
    if (caller.role === 'admin') {
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Digital display not found.');
        return snap;
    }
    const denied = new https_1.HttpsError('permission-denied', 'You are not assigned to this digital display.');
    if (!snap.exists || caller.role !== 'department_head' || !caller.departmentId)
        throw denied;
    const assignment = await common_js_1.db.collection(exports.COL.assignments).doc(assignmentId(displayId, caller.uid)).get();
    if (!isAssignmentValid(assignment, caller, snap))
        throw denied;
    return snap;
}
function isAssignmentValid(assignment, caller, display) {
    if (!assignment.exists || !display.exists)
        return false;
    const a = assignment.data() || {};
    const d = display.data() || {};
    return (caller.status === 'active' &&
        caller.role === 'department_head' &&
        !!caller.departmentId &&
        a.uid === caller.uid &&
        a.displayId === display.id &&
        a.departmentId === caller.departmentId &&
        d.departmentId === caller.departmentId);
}
function serializeAssignment(snap) {
    const a = snap.data() || {};
    return {
        id: snap.id,
        displayId: String(a.displayId),
        uid: String(a.uid),
        departmentId: String(a.departmentId),
        assignedBy: String(a.assignedBy || ''),
        assignedAt: (0, common_js_1.toIso)(a.assignedAt) || '',
    };
}
async function buildAssignmentViews(snaps) {
    if (snaps.length === 0)
        return [];
    const base = snaps.map(serializeAssignment);
    const userRefs = [...new Set(base.map((a) => a.uid))].map((uid) => common_js_1.db.collection('users').doc(uid));
    const displayRefs = [...new Set(base.map((a) => a.displayId))].map((id) => common_js_1.db.collection(exports.COL.displays).doc(id));
    const [users, displays] = await Promise.all([common_js_1.db.getAll(...userRefs), common_js_1.db.getAll(...displayRefs)]);
    const userMap = new Map(users.filter((u) => u.exists).map((u) => [u.id, u.data()]));
    const displayMap = new Map(displays.filter((d) => d.exists).map((d) => [d.id, d.data()]));
    return base.map((a) => ({
        ...a,
        userDisplayName: userMap.get(a.uid)?.displayName ?? null,
        userEmail: userMap.get(a.uid)?.email ?? null,
        userStatus: userMap.get(a.uid)?.status ?? null,
        displayName: displayMap.get(a.displayId)?.name ?? null,
        displayLifecycle: displayMap.get(a.displayId)?.lifecycle ?? null,
    }));
}
/**
 * Revokes every assignment of `displayId` whose user is no longer compatible
 * with `newDepartmentId`. Must run inside the caller's transaction.
 * NOTE: all reads must happen before writes in a Firestore transaction, so the
 * caller passes pre-read assignment and user snapshots.
 */
function revokeIncompatibleForDisplay(tx, actorId, displayId, newDepartmentId, assignmentSnaps, userSnaps) {
    let revoked = 0;
    for (const a of assignmentSnaps) {
        const data = a.data() || {};
        const user = userSnaps.get(String(data.uid));
        const u = user?.data();
        const compatible = !!u && u.role === 'department_head' && u.departmentId === newDepartmentId && data.departmentId === newDepartmentId;
        if (!compatible) {
            tx.delete(a.ref);
            tx.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
                actorId,
                action: 'display_assignment.revoke_incompatible',
                targetId: a.id,
                targetType: 'display_assignment',
                previousState: { displayId, uid: data.uid, departmentId: data.departmentId },
                metadata: { reason: 'display_department_changed', newDepartmentId },
            }));
            revoked += 1;
        }
    }
    return revoked;
}
/**
 * Called from protected user mutations. Revokes assignments that became
 * incompatible after a user's role or department change.
 */
async function revokeAssignmentsForUserChange(actorId, uid, role, departmentId) {
    const snaps = await common_js_1.db.collection(exports.COL.assignments).where('uid', '==', uid).get();
    if (snaps.empty)
        return 0;
    let revoked = 0;
    const displayRefs = snaps.docs.map((d) => common_js_1.db.collection(exports.COL.displays).doc(String(d.data().displayId)));
    const displays = await common_js_1.db.getAll(...displayRefs);
    const displayDept = new Map(displays.map((d) => [d.id, d.exists ? d.data()?.departmentId : null]));
    const batch = common_js_1.db.batch();
    for (const a of snaps.docs) {
        const data = a.data();
        const compatible = role === 'department_head' &&
            !!departmentId &&
            data.departmentId === departmentId &&
            displayDept.get(String(data.displayId)) === departmentId;
        if (!compatible) {
            batch.delete(a.ref);
            batch.create(common_js_1.db.collection('auditEvents').doc(), (0, common_js_1.buildAuditRecord)({
                actorId,
                action: 'display_assignment.revoke_incompatible',
                targetId: a.id,
                targetType: 'display_assignment',
                previousState: { displayId: data.displayId, uid, departmentId: data.departmentId },
                metadata: { reason: 'user_role_or_department_changed', role, departmentId },
            }));
            revoked += 1;
        }
    }
    if (revoked > 0)
        await batch.commit();
    return revoked;
}
//# sourceMappingURL=displayModel.js.map