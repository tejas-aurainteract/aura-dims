/**
 * Aura DIMS - Device credential primitives & rate limiting
 *
 * - Pairing codes come from crypto.randomInt (CSPRNG).
 * - Only HMAC-SHA256 verifiers are stored, never plaintext codes or secrets.
 * - Nothing in this module logs codes, secrets, or tokens.
 */

import * as crypto from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './common.js';
import {
  PAIRING_ALPHABET,
  PAIRING_CODE_LENGTH,
  evaluateRateWindow,
} from './operational.js';

const EMULATOR_ONLY_PEPPER = 'aura-dims-emulator-only-pepper-not-for-production';

/**
 * Server-side pepper used for all verifiers. In deployed environments it MUST be
 * supplied as a secret (AURA_CREDENTIAL_PEPPER); the emulator fallback is refused
 * outside the Functions emulator.
 */
function getPepper(): string {
  const configured = process.env.AURA_CREDENTIAL_PEPPER;
  if (configured && configured.length >= 32) return configured;
  if (process.env.FUNCTIONS_EMULATOR === 'true') return EMULATOR_ONLY_PEPPER;
  throw new HttpsError('failed-precondition', 'Device credential service is not configured.');
}

export function generatePairingCode(): string {
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    code += PAIRING_ALPHABET[crypto.randomInt(0, PAIRING_ALPHABET.length)];
  }
  return code;
}

/** Deterministic keyed verifier so a submitted code can be looked up without plaintext storage. */
export function pairingCodeVerifier(normalisedCode: string): string {
  return crypto.createHmac('sha256', getPepper()).update(`pairing:${normalisedCode}`).digest('hex');
}

export function generateDeviceSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function deviceSecretVerifier(displayId: string, secret: string): string {
  return crypto.createHmac('sha256', getPepper()).update(`device:${displayId}:${secret}`).digest('hex');
}

export function verifiersEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function newDeviceUid(): string {
  return `dvc_${crypto.randomBytes(16).toString('hex')}`;
}

/** Hashes a client address so raw IPs are never persisted in rate-limit records. */
export function hashClientKey(scope: string, value: string): string {
  return crypto.createHash('sha256').update(`${scope}:${value}`).digest('hex').slice(0, 40);
}

/**
 * Firestore-backed fixed-window rate limiter (/rateLimits, denied to all clients).
 * `peek` checks without consuming; `record` increments the counter.
 */
export async function checkRateLimit(key: string, windowSeconds: number, limit: number): Promise<void> {
  const ref = db.collection('rateLimits').doc(key);
  const snap = await ref.get();
  const data = snap.data();
  const state = data
    ? { windowStartMs: (data.windowStart as Timestamp).toMillis(), count: Number(data.count || 0) }
    : null;
  const decision = evaluateRateWindow(state, Date.now(), windowSeconds, limit);
  if (decision.blocked) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Please wait before trying again.');
  }
}

export async function recordRateLimitHit(key: string, windowSeconds: number, limit: number): Promise<void> {
  const ref = db.collection('rateLimits').doc(key);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const nowMs = Date.now();
    const state = data
      ? { windowStartMs: (data.windowStart as Timestamp).toMillis(), count: Number(data.count || 0) }
      : null;
    const decision = evaluateRateWindow(state, nowMs, windowSeconds, limit);
    tx.set(ref, {
      windowStart: Timestamp.fromMillis(decision.windowStartMs),
      count: decision.count + 1,
      // Eligible for TTL cleanup; correctness never depends on TTL deletion.
      expiresAt: Timestamp.fromMillis(decision.windowStartMs + windowSeconds * 1000),
    });
  });
}

/**
 * Uses the platform-resolved request IP. The left-most X-Forwarded-For entry is
 * client-controlled, so it is deliberately ignored to prevent key rotation.
 */
export function clientAddress(rawRequest: { ip?: string } | undefined): string {
  return rawRequest?.ip || 'unknown';
}
