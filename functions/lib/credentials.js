"use strict";
/**
 * Aura DIMS - Device credential primitives & rate limiting
 *
 * - Pairing codes come from crypto.randomInt (CSPRNG).
 * - Only HMAC-SHA256 verifiers are stored, never plaintext codes or secrets.
 * - Nothing in this module logs codes, secrets, or tokens.
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
exports.generatePairingCode = generatePairingCode;
exports.pairingCodeVerifier = pairingCodeVerifier;
exports.generateDeviceSecret = generateDeviceSecret;
exports.deviceSecretVerifier = deviceSecretVerifier;
exports.verifiersEqual = verifiersEqual;
exports.newDeviceUid = newDeviceUid;
exports.hashClientKey = hashClientKey;
exports.checkRateLimit = checkRateLimit;
exports.recordRateLimitHit = recordRateLimitHit;
exports.clientAddress = clientAddress;
const crypto = __importStar(require("node:crypto"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const common_js_1 = require("./common.js");
const operational_js_1 = require("./operational.js");
const EMULATOR_ONLY_PEPPER = 'aura-dims-emulator-only-pepper-not-for-production';
/**
 * Server-side pepper used for all verifiers. In deployed environments it MUST be
 * supplied as a secret (AURA_CREDENTIAL_PEPPER); the emulator fallback is refused
 * outside the Functions emulator.
 */
function getPepper() {
    const configured = process.env.AURA_CREDENTIAL_PEPPER;
    if (configured && configured.length >= 32)
        return configured;
    if (process.env.FUNCTIONS_EMULATOR === 'true')
        return EMULATOR_ONLY_PEPPER;
    throw new https_1.HttpsError('failed-precondition', 'Device credential service is not configured.');
}
function generatePairingCode() {
    let code = '';
    for (let i = 0; i < operational_js_1.PAIRING_CODE_LENGTH; i += 1) {
        code += operational_js_1.PAIRING_ALPHABET[crypto.randomInt(0, operational_js_1.PAIRING_ALPHABET.length)];
    }
    return code;
}
/** Deterministic keyed verifier so a submitted code can be looked up without plaintext storage. */
function pairingCodeVerifier(normalisedCode) {
    return crypto.createHmac('sha256', getPepper()).update(`pairing:${normalisedCode}`).digest('hex');
}
function generateDeviceSecret() {
    return crypto.randomBytes(32).toString('base64url');
}
function deviceSecretVerifier(displayId, secret) {
    return crypto.createHmac('sha256', getPepper()).update(`device:${displayId}:${secret}`).digest('hex');
}
function verifiersEqual(a, b) {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length || ab.length === 0)
        return false;
    return crypto.timingSafeEqual(ab, bb);
}
function newDeviceUid() {
    return `dvc_${crypto.randomBytes(16).toString('hex')}`;
}
/** Hashes a client address so raw IPs are never persisted in rate-limit records. */
function hashClientKey(scope, value) {
    return crypto.createHash('sha256').update(`${scope}:${value}`).digest('hex').slice(0, 40);
}
/**
 * Firestore-backed fixed-window rate limiter (/rateLimits, denied to all clients).
 * `peek` checks without consuming; `record` increments the counter.
 */
async function checkRateLimit(key, windowSeconds, limit) {
    const ref = common_js_1.db.collection('rateLimits').doc(key);
    const snap = await ref.get();
    const data = snap.data();
    const state = data
        ? { windowStartMs: data.windowStart.toMillis(), count: Number(data.count || 0) }
        : null;
    const decision = (0, operational_js_1.evaluateRateWindow)(state, Date.now(), windowSeconds, limit);
    if (decision.blocked) {
        throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please wait before trying again.');
    }
}
async function recordRateLimitHit(key, windowSeconds, limit) {
    const ref = common_js_1.db.collection('rateLimits').doc(key);
    await common_js_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data();
        const nowMs = Date.now();
        const state = data
            ? { windowStartMs: data.windowStart.toMillis(), count: Number(data.count || 0) }
            : null;
        const decision = (0, operational_js_1.evaluateRateWindow)(state, nowMs, windowSeconds, limit);
        tx.set(ref, {
            windowStart: firestore_1.Timestamp.fromMillis(decision.windowStartMs),
            count: decision.count + 1,
            // Eligible for TTL cleanup; correctness never depends on TTL deletion.
            expiresAt: firestore_1.Timestamp.fromMillis(decision.windowStartMs + windowSeconds * 1000),
        });
    });
}
/**
 * Uses the platform-resolved request IP. The left-most X-Forwarded-For entry is
 * client-controlled, so it is deliberately ignored to prevent key rotation.
 */
function clientAddress(rawRequest) {
    return rawRequest?.ip || 'unknown';
}
//# sourceMappingURL=credentials.js.map