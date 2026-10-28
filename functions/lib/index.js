"use strict";
/**
 * Aura DIMS - Backend Cloud Functions
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scope: Minimal foundation diagnostic & health check functions.
 * Privileged operations (roles, assignments, publication approvals)
 * will be implemented in future milestones.
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
exports.apiHealth = exports.healthCheck = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin SDK once
if (admin.apps.length === 0) {
    admin.initializeApp();
}
/**
 * Health check callable function for client diagnostics.
 * Verifies that the client can talk to Cloud Functions emulator/backend.
 */
exports.healthCheck = (0, https_1.onCall)({
    cors: true,
    region: 'asia-south1', // India (Mumbai) regional target
}, async (request) => {
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    const projectId = process.env.GCLOUD_PROJECT || 'demo-aura-dims';
    return {
        status: 'healthy',
        service: 'Aura DIMS Cloud Functions (v2)',
        product: 'Aura Digital Information Management System',
        company: 'Aurainteract Private Limited',
        timezone: 'Asia/Kolkata',
        timestamp: new Date().toISOString(),
        emulator: isEmulator,
        projectId,
        authContext: {
            authenticated: !!request.auth,
            uid: request.auth?.uid || null,
        },
    };
});
/**
 * HTTP health endpoint for browser or curl diagnostic checks.
 */
exports.apiHealth = (0, https_1.onRequest)({
    cors: true,
    region: 'asia-south1',
}, (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'Aura DIMS HTTP Gateway',
        company: 'Aurainteract Private Limited',
        timezone: 'Asia/Kolkata',
        timestamp: new Date().toISOString(),
        projectId: process.env.GCLOUD_PROJECT || 'demo-aura-dims',
        emulator: process.env.FUNCTIONS_EMULATOR === 'true',
    });
});
//# sourceMappingURL=index.js.map