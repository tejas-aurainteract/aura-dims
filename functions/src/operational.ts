/**
 * Aura DIMS - Operational configuration & pure decision logic
 *
 * All thresholds are configurable through environment variables
 * (functions/.env, functions/.env.<projectId>, or deployed params).
 * Every function here takes `nowMs` explicitly so time boundaries can be
 * tested with a controlled clock.
 */

import type { DisplayConnectivity, DisplayLifecycle } from '@aura-dims/display-schema';

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export interface OperationalConfig {
  pairingCodeTtlSeconds: number;
  onlineWindowSeconds: number;
  recommendedHeartbeatSeconds: number;
  minHeartbeatWriteIntervalSeconds: number;
  pairingFailureLimit: number;
  pairingFailureWindowSeconds: number;
  deviceSignInLimit: number;
  deviceSignInWindowSeconds: number;
}

export function getConfig(): OperationalConfig {
  return {
    pairingCodeTtlSeconds: envInt('AURA_PAIRING_CODE_TTL_SECONDS', 600, 60, 3600),
    onlineWindowSeconds: envInt('AURA_ONLINE_WINDOW_SECONDS', 300, 30, 86400),
    recommendedHeartbeatSeconds: envInt('AURA_HEARTBEAT_INTERVAL_SECONDS', 60, 10, 3600),
    minHeartbeatWriteIntervalSeconds: envInt('AURA_MIN_HEARTBEAT_WRITE_SECONDS', 15, 0, 600),
    pairingFailureLimit: envInt('AURA_PAIRING_FAILURE_LIMIT', 10, 1, 1000),
    pairingFailureWindowSeconds: envInt('AURA_PAIRING_FAILURE_WINDOW_SECONDS', 600, 10, 86400),
    deviceSignInLimit: envInt('AURA_DEVICE_SIGNIN_LIMIT', 30, 1, 1000),
    deviceSignInWindowSeconds: envInt('AURA_DEVICE_SIGNIN_WINDOW_SECONDS', 600, 10, 86400),
  };
}

/**
 * Derives connectivity from the server receipt time of the last accepted heartbeat.
 * - never_connected: no accepted heartbeat
 * - online: heartbeat within the online window (inclusive)
 * - offline: heartbeat older than the online window
 */
export function deriveConnectivity(
  lastHeartbeatMs: number | null,
  nowMs: number,
  onlineWindowSeconds: number
): DisplayConnectivity {
  if (lastHeartbeatMs === null) return 'never_connected';
  return nowMs - lastHeartbeatMs <= onlineWindowSeconds * 1000 ? 'online' : 'offline';
}

/** Online threshold timestamp: heartbeats at or after this instant are online. */
export function onlineCutoffMs(nowMs: number, onlineWindowSeconds: number): number {
  return nowMs - onlineWindowSeconds * 1000;
}

/** A pairing code is expired at (and after) its expiry instant. */
export function isPairingCodeExpired(expiresAtMs: number, nowMs: number): boolean {
  return nowMs >= expiresAtMs;
}

export const NON_RETIRED_LIFECYCLES: DisplayLifecycle[] = ['pending_enrollment', 'active', 'suspended'];

/** Allowed Admin lifecycle transitions. Enrollment moves pending -> active. */
export function nextLifecycle(
  current: DisplayLifecycle,
  action: 'suspend' | 'reactivate' | 'retire'
): DisplayLifecycle | null {
  switch (action) {
    case 'suspend':
      return current === 'active' ? 'suspended' : null;
    case 'reactivate':
      return current === 'suspended' ? 'active' : null;
    case 'retire':
      return current === 'retired' ? null : 'retired';
    default:
      return null;
  }
}

/** Fixed-window counter decision used by the Firestore-backed rate limiter. */
export function evaluateRateWindow(
  state: { windowStartMs: number; count: number } | null,
  nowMs: number,
  windowSeconds: number,
  limit: number
): { blocked: boolean; windowStartMs: number; count: number } {
  if (!state || nowMs - state.windowStartMs >= windowSeconds * 1000) {
    return { blocked: false, windowStartMs: nowMs, count: 0 };
  }
  return { blocked: state.count >= limit, windowStartMs: state.windowStartMs, count: state.count };
}

/** Pairing code alphabet: no 0/O/1/I/L to reduce transcription errors (31 symbols). */
export const PAIRING_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PAIRING_CODE_LENGTH = 10;

/** Normalises user-entered codes: uppercase, strip spaces and dashes. */
export function normalisePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isWellFormedPairingCode(code: string): boolean {
  if (code.length !== PAIRING_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!PAIRING_ALPHABET.includes(ch)) return false;
  }
  return true;
}
