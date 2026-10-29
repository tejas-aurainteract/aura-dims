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

import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import type {
  DigitalDisplay,
  DisplayView,
  DisplayReportedState,
  UserProfile,
  AssignmentView,
  DisplayAssignment,
  ConnectivityThresholds,
} from '@aura-dims/display-schema';
import { db, toIso, toMillis, buildAuditRecord } from './common.js';
import { deriveConnectivity, getConfig } from './operational.js';

export const COL = {
  sites: 'sites',
  groups: 'displayGroups',
  displays: 'displays',
  assignments: 'displayAssignments',
  secrets: 'displaySecrets',
  pairingCodes: 'pairingCodes',
} as const;

export function assignmentId(displayId: string, uid: string): string {
  return `${displayId}__${uid}`;
}

export function thresholds(): ConnectivityThresholds {
  const cfg = getConfig();
  return {
    onlineWindowSeconds: cfg.onlineWindowSeconds,
    recommendedHeartbeatSeconds: cfg.recommendedHeartbeatSeconds,
  };
}

export function serializeDisplay(snap: DocumentSnapshot): DigitalDisplay {
  const d = snap.data() || {};
  const reported = (d.reported || null) as DisplayReportedState | null;
  return {
    id: snap.id,
    name: String(d.name || ''),
    siteId: String(d.siteId || ''),
    locationDescription: String(d.locationDescription || ''),
    departmentId: String(d.departmentId || ''),
    groupIds: Array.isArray(d.groupIds) ? (d.groupIds as string[]) : [],
    orientation: d.orientation === 'portrait' ? 'portrait' : 'landscape',
    configuredResolution: {
      width: Number(d.configuredResolution?.width || 0),
      height: Number(d.configuredResolution?.height || 0),
    },
    lifecycle: d.lifecycle,
    lastHeartbeatAt: toIso(d.lastHeartbeatAt),
    reported,
    enrolledAt: toIso(d.enrolledAt),
    createdBy: String(d.createdBy || ''),
    createdAt: toIso(d.createdAt) || '',
    updatedAt: toIso(d.updatedAt) || '',
  };
}

/** Resolves site / department / group labels with batched reads and derives connectivity. */
export async function buildViews(snaps: DocumentSnapshot[], nowMs: number = Date.now()): Promise<DisplayView[]> {
  if (snaps.length === 0) return [];
  const cfg = getConfig();
  const siteIds = new Set<string>();
  const deptIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const s of snaps) {
    const d = s.data() || {};
    if (d.siteId) siteIds.add(d.siteId);
    if (d.departmentId) deptIds.add(d.departmentId);
    for (const g of (d.groupIds as string[] | undefined) || []) groupIds.add(g);
  }

  const names = new Map<string, string>();
  const load = async (col: string, ids: Set<string>) => {
    if (ids.size === 0) return;
    const refs = [...ids].map((id) => db.collection(col).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) names.set(`${col}/${doc.id}`, String(doc.data()?.name || ''));
    }
  };
  await Promise.all([load(COL.sites, siteIds), load('departments', deptIds), load(COL.groups, groupIds)]);

  return snaps.map((snap) => {
    const base = serializeDisplay(snap);
    return {
      ...base,
      connectivity: deriveConnectivity(toMillis(snap.data()?.lastHeartbeatAt), nowMs, cfg.onlineWindowSeconds),
      siteName: names.get(`${COL.sites}/${base.siteId}`) ?? null,
      departmentName: names.get(`departments/${base.departmentId}`) ?? null,
      groupNames: base.groupIds.map((g) => names.get(`${COL.groups}/${g}`) ?? g),
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
export async function loadAuthorizedDisplay(caller: UserProfile, displayId: string): Promise<DocumentSnapshot> {
  const snap = await db.collection(COL.displays).doc(displayId).get();
  if (caller.role === 'admin') {
    if (!snap.exists) throw new HttpsError('not-found', 'Digital display not found.');
    return snap;
  }
  const denied = new HttpsError('permission-denied', 'You are not assigned to this digital display.');
  if (!snap.exists || caller.role !== 'department_head' || !caller.departmentId) throw denied;
  const assignment = await db.collection(COL.assignments).doc(assignmentId(displayId, caller.uid)).get();
  if (!isAssignmentValid(assignment, caller, snap)) throw denied;
  return snap;
}

export function isAssignmentValid(
  assignment: DocumentSnapshot,
  caller: UserProfile,
  display: DocumentSnapshot
): boolean {
  if (!assignment.exists || !display.exists) return false;
  const a = assignment.data() || {};
  const d = display.data() || {};
  return (
    caller.status === 'active' &&
    caller.role === 'department_head' &&
    !!caller.departmentId &&
    a.uid === caller.uid &&
    a.displayId === display.id &&
    a.departmentId === caller.departmentId &&
    d.departmentId === caller.departmentId
  );
}

export function serializeAssignment(snap: DocumentSnapshot): DisplayAssignment {
  const a = snap.data() || {};
  return {
    id: snap.id,
    displayId: String(a.displayId),
    uid: String(a.uid),
    departmentId: String(a.departmentId),
    assignedBy: String(a.assignedBy || ''),
    assignedAt: toIso(a.assignedAt) || '',
  };
}

export async function buildAssignmentViews(snaps: DocumentSnapshot[]): Promise<AssignmentView[]> {
  if (snaps.length === 0) return [];
  const base = snaps.map(serializeAssignment);
  const userRefs = [...new Set(base.map((a) => a.uid))].map((uid) => db.collection('users').doc(uid));
  const displayRefs = [...new Set(base.map((a) => a.displayId))].map((id) => db.collection(COL.displays).doc(id));
  const [users, displays] = await Promise.all([db.getAll(...userRefs), db.getAll(...displayRefs)]);
  const userMap = new Map(users.filter((u) => u.exists).map((u) => [u.id, u.data()!]));
  const displayMap = new Map(displays.filter((d) => d.exists).map((d) => [d.id, d.data()!]));
  return base.map((a) => ({
    ...a,
    userDisplayName: (userMap.get(a.uid)?.displayName as string) ?? null,
    userEmail: (userMap.get(a.uid)?.email as string) ?? null,
    userStatus: (userMap.get(a.uid)?.status as 'active' | 'inactive') ?? null,
    displayName: (displayMap.get(a.displayId)?.name as string) ?? null,
    displayLifecycle: displayMap.get(a.displayId)?.lifecycle ?? null,
  }));
}

/**
 * Revokes every assignment of `displayId` whose user is no longer compatible
 * with `newDepartmentId`. Must run inside the caller's transaction.
 * NOTE: all reads must happen before writes in a Firestore transaction, so the
 * caller passes pre-read assignment and user snapshots.
 */
export function revokeIncompatibleForDisplay(
  tx: Transaction,
  actorId: string,
  displayId: string,
  newDepartmentId: string,
  assignmentSnaps: DocumentSnapshot[],
  userSnaps: Map<string, DocumentSnapshot>
): number {
  let revoked = 0;
  for (const a of assignmentSnaps) {
    const data = a.data() || {};
    const user = userSnaps.get(String(data.uid));
    const u = user?.data();
    const compatible =
      !!u && u.role === 'department_head' && u.departmentId === newDepartmentId && data.departmentId === newDepartmentId;
    if (!compatible) {
      tx.delete(a.ref);
      tx.create(
        db.collection('auditEvents').doc(),
        buildAuditRecord({
          actorId,
          action: 'display_assignment.revoke_incompatible',
          targetId: a.id,
          targetType: 'display_assignment',
          previousState: { displayId, uid: data.uid, departmentId: data.departmentId },
          metadata: { reason: 'display_department_changed', newDepartmentId },
        })
      );
      revoked += 1;
    }
  }
  return revoked;
}

/**
 * Called from protected user mutations. Revokes assignments that became
 * incompatible after a user's role or department change.
 */
export async function revokeAssignmentsForUserChange(
  actorId: string,
  uid: string,
  role: string,
  departmentId: string | null
): Promise<number> {
  const snaps = await db.collection(COL.assignments).where('uid', '==', uid).get();
  if (snaps.empty) return 0;
  let revoked = 0;
  const displayRefs = snaps.docs.map((d) => db.collection(COL.displays).doc(String(d.data().displayId)));
  const displays = await db.getAll(...displayRefs);
  const displayDept = new Map(displays.map((d) => [d.id, d.exists ? d.data()?.departmentId : null]));
  const batch = db.batch();
  for (const a of snaps.docs) {
    const data = a.data();
    const compatible =
      role === 'department_head' &&
      !!departmentId &&
      data.departmentId === departmentId &&
      displayDept.get(String(data.displayId)) === departmentId;
    if (!compatible) {
      batch.delete(a.ref);
      batch.create(
        db.collection('auditEvents').doc(),
        buildAuditRecord({
          actorId,
          action: 'display_assignment.revoke_incompatible',
          targetId: a.id,
          targetType: 'display_assignment',
          previousState: { displayId: data.displayId, uid, departmentId: data.departmentId },
          metadata: { reason: 'user_role_or_department_changed', role, departmentId },
        })
      );
      revoked += 1;
    }
  }
  if (revoked > 0) await batch.commit();
  return revoked;
}
