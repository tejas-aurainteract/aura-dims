/**
 * Aura DIMS - Backend Cloud Functions
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scope: Minimal foundation diagnostic & health check functions.
 * Privileged operations (roles, assignments, publication approvals)
 * will be implemented in future milestones.
 */

import { onRequest, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Health check callable function for client diagnostics.
 * Verifies that the client can talk to Cloud Functions emulator/backend.
 */
export const healthCheck = onCall(
  {
    cors: true,
    region: 'asia-south1', // India (Mumbai) regional target
  },
  async (request) => {
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
  }
);

/**
 * HTTP health endpoint for browser or curl diagnostic checks.
 */
export const apiHealth = onRequest(
  {
    cors: true,
    region: 'asia-south1',
  },
  (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'Aura DIMS HTTP Gateway',
      company: 'Aurainteract Private Limited',
      timezone: 'Asia/Kolkata',
      timestamp: new Date().toISOString(),
      projectId: process.env.GCLOUD_PROJECT || 'demo-aura-dims',
      emulator: process.env.FUNCTIONS_EMULATOR === 'true',
    });
  }
);

