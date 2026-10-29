/**
 * Aura DIMS - Shared backend helpers
 * Company: Aurainteract Private Limited
 *
 * The Admin SDK bypasses Security Rules, so every privileged callable must
 * authorize its caller explicitly through these helpers.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuditTargetType, UserProfile } from '@aura-dims/display-schema';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
export const REGION = 'asia-south1'; // India (Mumbai) regional target

/** Reserved UID namespace for digital display device identities. */
export const DEVICE_UID_PREFIX = 'dvc_';

interface CallableAuth {
  uid: string;
  token?: Record<string, unknown>;
}

export function isDevicePrincipal(auth: CallableAuth | undefined): boolean {
  if (!auth) return false;
  return auth.uid.startsWith(DEVICE_UID_PREFIX) || auth.token?.principal === 'device';
}

/**
 * Validates a HUMAN caller and loads the authoritative Firestore profile.
 * Never relies on client claims alone. Device identities are rejected.
 */
export async function getAuthenticatedCaller(auth: CallableAuth | undefined): Promise<UserProfile> {
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'The operation requires an authenticated user session.');
  }
  if (isDevicePrincipal(auth)) {
    throw new HttpsError('permission-denied', 'Digital display device identities cannot perform user operations.');
  }

  const callerDoc = await db.collection('users').doc(auth.uid).get();
  if (!callerDoc.exists) {
    throw new HttpsError('permission-denied', 'No authorized user profile exists for this account.');
  }

  const profile = callerDoc.data() as UserProfile;
  if (profile.status !== 'active') {
    throw new HttpsError('permission-denied', 'The user account has been deactivated.');
  }
  return { ...profile, uid: auth.uid };
}

export async function assertAdminCaller(auth: CallableAuth | undefined): Promise<UserProfile> {
  const caller = await getAuthenticatedCaller(auth);
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only System Administrators can execute this operation.');
  }
  return caller;
}

/** Appends an immutable audit event (clients can never write /auditEvents). */
export async function writeAuditLog(params: {
  actorId: string;
  action: string;
  targetId: string;
  targetType: AuditTargetType;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.collection('auditEvents').add(buildAuditRecord(params));
}

export function buildAuditRecord(params: {
  actorId: string;
  action: string;
  targetId: string;
  targetType: AuditTargetType;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    actorId: params.actorId,
    action: params.action,
    targetId: params.targetId,
    targetType: params.targetType,
    previousState: params.previousState || null,
    newState: params.newState || null,
    metadata: params.metadata || {},
    timestamp: FieldValue.serverTimestamp(),
  };
}

/** Converts Firestore Timestamp / Date / string into ISO-8601 or null. */
export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

// ---- Input validation helpers ----

export function requireString(value: unknown, field: string, maxLength: number, opts?: { allowEmpty?: boolean }): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!opts?.allowEmpty && trimmed.length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new HttpsError('invalid-argument', `${field} must be at most ${maxLength} characters.`);
  }
  return trimmed;
}

export function requireId(value: unknown, field: string): string {
  const id = requireString(value, field, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new HttpsError('invalid-argument', `${field} contains invalid characters.`);
  }
  return id;
}
