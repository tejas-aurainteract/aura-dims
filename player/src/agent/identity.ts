/**
 * Aura DIMS - Device Identity & Credential Management
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Ground rules:
 * - Credentials stored strictly in access-restricted directory.
 * - Restores authenticated session after restart without human-user login.
 * - Never logs or leaks tokens or secrets.
 * - Uses client Firebase SDK / custom tokens only (Admin SDK forbidden on device).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithCustomToken,
  connectAuthEmulator,
  type Auth,
  type UserCredential,
} from 'firebase/auth';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type {
  RedeemPairingCodeRequest,
  RedeemPairingCodeResponse,
  DeviceSignInRequest,
  DeviceSignInResponse,
} from '@aura-dims/display-schema';

export interface DeviceCredentials {
  displayId: string;
  deviceSecret: string;
  deviceUid: string;
  enrolledAt: string;
}

export class DeviceIdentity {
  private config: PlayerConfig;
  private logger: Logger;
  private credsFilePath: string;
  private app: FirebaseApp;
  private auth: Auth;
  private currentCredentials: DeviceCredentials | null = null;
  private currentUser: UserCredential | null = null;

  constructor(config: PlayerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.credsFilePath = path.join(config.credentialsDir, 'device-credentials.json');

    if (!fs.existsSync(config.credentialsDir)) {
      fs.mkdirSync(config.credentialsDir, { recursive: true, mode: 0o700 });
    }

    // Initialize client Firebase app
    const appName = 'aura-dims-player';
    this.app = getApps().find((a) => a.name === appName) || initializeApp(
      {
        apiKey: 'demo-api-key',
        authDomain: `${config.projectId}.firebaseapp.com`,
        projectId: config.projectId,
        storageBucket: `${config.projectId}.appspot.com`,
      },
      appName
    );

    this.auth = getAuth(this.app);

    // Connect to Auth emulator in local dev
    if (config.authEmulatorHost) {
      const hostUrl = config.authEmulatorHost.startsWith('http')
        ? config.authEmulatorHost
        : `http://${config.authEmulatorHost}`;
      try {
        connectAuthEmulator(this.auth, hostUrl, { disableWarnings: true });
      } catch {
        // Ignored if already connected
      }
    }
  }

  isEnrolled(): boolean {
    return fs.existsSync(this.credsFilePath);
  }

  getCredentials(): DeviceCredentials | null {
    if (this.currentCredentials) return this.currentCredentials;
    if (!fs.existsSync(this.credsFilePath)) return null;

    try {
      const raw = fs.readFileSync(this.credsFilePath, 'utf8');
      this.currentCredentials = JSON.parse(raw) as DeviceCredentials;
      return this.currentCredentials;
    } catch (err) {
      this.logger.error('Failed to read device credentials file:', err);
      return null;
    }
  }

  saveCredentials(creds: DeviceCredentials): void {
    const raw = JSON.stringify(creds, null, 2);
    // Write atomically
    const tmpPath = `${this.credsFilePath}.tmp`;
    fs.writeFileSync(tmpPath, raw, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, this.credsFilePath);
    this.currentCredentials = creds;
    this.logger.info(`Securely persisted credentials for digital display: ${creds.displayId}`);
  }

  clearCredentials(): void {
    if (fs.existsSync(this.credsFilePath)) {
      fs.unlinkSync(this.credsFilePath);
    }
    this.currentCredentials = null;
    this.currentUser = null;
    this.logger.info('Device credentials cleared.');
  }

  async pairWithCode(pairingCode: string): Promise<{ success: boolean; displayId: string; error?: string }> {
    this.logger.info('Attempting to redeem pairing code with Aura DIMS Cloud Functions...');
    const functionUrl = `http://${this.config.functionsEmulatorHost}/${this.config.projectId}/${this.config.region}/redeemPairingCode`;

    try {
      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { pairingCode } as RedeemPairingCodeRequest }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = body?.error?.message || `Pairing failed with status ${res.status}`;
        this.logger.error('Pairing error from server:', message);
        return { success: false, displayId: '', error: message };
      }

      const json = (await res.json()) as { result: RedeemPairingCodeResponse };
      const { displayId, deviceSecret, customToken } = json.result;

      // Authenticate with custom token
      this.currentUser = await signInWithCustomToken(this.auth, customToken);
      const deviceUid = this.currentUser.user.uid;

      this.saveCredentials({
        displayId,
        deviceSecret,
        deviceUid,
        enrolledAt: new Date().toISOString(),
      });

      this.logger.info(`Pairing successful! Authenticated as device for digital display: ${displayId}`);
      return { success: true, displayId };
    } catch (err: any) {
      this.logger.error('Pairing request exception:', err?.message || err);
      return { success: false, displayId: '', error: err?.message || 'Connection error' };
    }
  }

  async restoreSession(): Promise<{ authenticated: boolean; displayId: string | null; error?: string }> {
    const creds = this.getCredentials();
    if (!creds) {
      return { authenticated: false, displayId: null };
    }

    this.logger.info(`Restoring authenticated session for digital display: ${creds.displayId}...`);
    const functionUrl = `http://${this.config.functionsEmulatorHost}/${this.config.projectId}/${this.config.region}/deviceSignIn`;

    try {
      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            displayId: creds.displayId,
            deviceSecret: creds.deviceSecret,
          } as DeviceSignInRequest,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = body?.error?.message || `Device authentication failed with status ${res.status}`;
        this.logger.error('Session restoration failed:', message);
        return { authenticated: false, displayId: creds.displayId, error: message };
      }

      const json = (await res.json()) as { result: DeviceSignInResponse };
      const { customToken } = json.result;

      this.currentUser = await signInWithCustomToken(this.auth, customToken);
      this.logger.info(`Session successfully restored for digital display: ${creds.displayId}`);
      return { authenticated: true, displayId: creds.displayId };
    } catch (err: any) {
      this.logger.warn('Failed to contact server for session restoration (operating offline):', err?.message || err);
      // Offline fallback: we are enrolled, but operating offline without network
      return { authenticated: false, displayId: creds.displayId, error: 'Network offline' };
    }
  }

  async getIdToken(): Promise<string | null> {
    if (!this.currentUser) {
      const restore = await this.restoreSession();
      if (!restore.authenticated || !this.currentUser) return null;
    }
    return this.currentUser.user.getIdToken();
  }

  getDisplayId(): string | null {
    return this.getCredentials()?.displayId || null;
  }
}

