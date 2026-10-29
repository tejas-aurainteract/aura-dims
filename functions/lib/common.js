"use strict";
/**
 * Aura DIMS - Shared backend helpers
 * Company: Aurainteract Private Limited
 *
 * The Admin SDK bypasses Security Rules, so every privileged callable must
 * authorize its caller explicitly through these helpers.
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
exports.DEVICE_UID_PREFIX = exports.REGION = exports.db = void 0;
exports.isDevicePrincipal = isDevicePrincipal;
exports.getAuthenticatedCaller = getAuthenticatedCaller;
exports.assertAdminCaller = assertAdminCaller;
exports.writeAuditLog = writeAuditLog;
exports.buildAuditRecord = buildAuditRecord;
exports.toIso = toIso;
exports.toMillis = toMillis;
exports.requireString = requireString;
exports.requireId = requireId;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
if (admin.apps.length === 0) {
    admin.initializeApp();
}
exports.db = admin.firestore();
exports.REGION = 'asia-south1'; // India (Mumbai) regional target
/** Reserved UID namespace for digital display device identities. */
exports.DEVICE_UID_PREFIX = 'dvc_';
function isDevicePrincipal(auth) {
    if (!auth)
        return false;
    return auth.uid.startsWith(exports.DEVICE_UID_PREFIX) || auth.token?.principal === 'device';
}
/**
 * Validates a HUMAN caller and loads the authoritative Firestore profile.
 * Never relies on client claims alone. Device identities are rejected.
 */
async function getAuthenticatedCaller(auth) {
    if (!auth || !auth.uid) {
        throw new https_1.HttpsError('unauthenticated', 'The operation requires an authenticated user session.');
    }
    if (isDevicePrincipal(auth)) {
        throw new https_1.HttpsError('permission-denied', 'Digital display device identities cannot perform user operations.');
    }
    const callerDoc = await exports.db.collection('users').doc(auth.uid).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('permission-denied', 'No authorized user profile exists for this account.');
    }
    const profile = callerDoc.data();
    if (profile.status !== 'active') {
        throw new https_1.HttpsError('permission-denied', 'The user account has been deactivated.');
    }
    return { ...profile, uid: auth.uid };
}
async function assertAdminCaller(auth) {
    const caller = await getAuthenticatedCaller(auth);
    if (caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only System Administrators can execute this operation.');
    }
    return caller;
}
/** Appends an immutable audit event (clients can never write /auditEvents). */
async function writeAuditLog(params) {
    await exports.db.collection('auditEvents').add(buildAuditRecord(params));
}
function buildAuditRecord(params) {
    return {
        actorId: params.actorId,
        action: params.action,
        targetId: params.targetId,
        targetType: params.targetType,
        previousState: params.previousState || null,
        newState: params.newState || null,
        metadata: params.metadata || {},
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    };
}
/** Converts Firestore Timestamp / Date / string into ISO-8601 or null. */
function toIso(value) {
    if (!value)
        return null;
    if (value instanceof firestore_1.Timestamp)
        return value.toDate().toISOString();
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'string')
        return value;
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
        return value.toDate().toISOString();
    }
    return null;
}
function toMillis(value) {
    if (!value)
        return null;
    if (value instanceof firestore_1.Timestamp)
        return value.toMillis();
    if (value instanceof Date)
        return value.getTime();
    if (typeof value === 'object' && value !== null && 'toMillis' in value) {
        return value.toMillis();
    }
    return null;
}
// ---- Input validation helpers ----
function requireString(value, field, maxLength, opts) {
    if (typeof value !== 'string') {
        throw new https_1.HttpsError('invalid-argument', `${field} must be a string.`);
    }
    const trimmed = value.trim();
    if (!opts?.allowEmpty && trimmed.length === 0) {
        throw new https_1.HttpsError('invalid-argument', `${field} is required.`);
    }
    if (trimmed.length > maxLength) {
        throw new https_1.HttpsError('invalid-argument', `${field} must be at most ${maxLength} characters.`);
    }
    return trimmed;
}
function requireId(value, field) {
    const id = requireString(value, field, 128);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
        throw new https_1.HttpsError('invalid-argument', `${field} contains invalid characters.`);
    }
    return id;
}
//# sourceMappingURL=common.js.map