"use strict";
/**
 * Aura DIMS - Operational configuration & pure decision logic
 *
 * All thresholds are configurable through environment variables
 * (functions/.env, functions/.env.<projectId>, or deployed params).
 * Every function here takes `nowMs` explicitly so time boundaries can be
 * tested with a controlled clock.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAIRING_CODE_LENGTH = exports.PAIRING_ALPHABET = exports.NON_RETIRED_LIFECYCLES = void 0;
exports.getConfig = getConfig;
exports.deriveConnectivity = deriveConnectivity;
exports.onlineCutoffMs = onlineCutoffMs;
exports.isPairingCodeExpired = isPairingCodeExpired;
exports.nextLifecycle = nextLifecycle;
exports.evaluateRateWindow = evaluateRateWindow;
exports.normalisePairingCode = normalisePairingCode;
exports.isWellFormedPairingCode = isWellFormedPairingCode;
function envInt(name, fallback, min, max) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max)
        return fallback;
    return parsed;
}
function getConfig() {
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
function deriveConnectivity(lastHeartbeatMs, nowMs, onlineWindowSeconds) {
    if (lastHeartbeatMs === null)
        return 'never_connected';
    return nowMs - lastHeartbeatMs <= onlineWindowSeconds * 1000 ? 'online' : 'offline';
}
/** Online threshold timestamp: heartbeats at or after this instant are online. */
function onlineCutoffMs(nowMs, onlineWindowSeconds) {
    return nowMs - onlineWindowSeconds * 1000;
}
/** A pairing code is expired at (and after) its expiry instant. */
function isPairingCodeExpired(expiresAtMs, nowMs) {
    return nowMs >= expiresAtMs;
}
exports.NON_RETIRED_LIFECYCLES = ['pending_enrollment', 'active', 'suspended'];
/** Allowed Admin lifecycle transitions. Enrollment moves pending -> active. */
function nextLifecycle(current, action) {
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
function evaluateRateWindow(state, nowMs, windowSeconds, limit) {
    if (!state || nowMs - state.windowStartMs >= windowSeconds * 1000) {
        return { blocked: false, windowStartMs: nowMs, count: 0 };
    }
    return { blocked: state.count >= limit, windowStartMs: state.windowStartMs, count: state.count };
}
/** Pairing code alphabet: no 0/O/1/I/L to reduce transcription errors (31 symbols). */
exports.PAIRING_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
exports.PAIRING_CODE_LENGTH = 10;
/** Normalises user-entered codes: uppercase, strip spaces and dashes. */
function normalisePairingCode(input) {
    return input.toUpperCase().replace(/[\s-]/g, '');
}
function isWellFormedPairingCode(code) {
    if (code.length !== exports.PAIRING_CODE_LENGTH)
        return false;
    for (const ch of code) {
        if (!exports.PAIRING_ALPHABET.includes(ch))
            return false;
    }
    return true;
}
//# sourceMappingURL=operational.js.map