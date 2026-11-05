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
 * - Uses shared PlayerTransport for explicit 'emulator' vs 'cloud' modes.
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
import { PlayerTransport, PlayerTransportError, type TokenProvider } from './transport.js';
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

export class DeviceIdentity implements TokenProvider {
  private config: PlayerConfig;
  private logger: Logger;
  private transport: PlayerTransport;
  private credsFilePath: string;
  private app: FirebaseApp;
  private auth: Auth;
  private currentCredentials: DeviceCredentials | null = null;
  private currentUser: UserCredential | null = null;
  private cachedIdToken: string | null = null;
  private tokenExpiresAtMs = 0;
  private revokedReason: string | null = null;

  constructor(config: PlayerConfig, logger: Logger, transport?: PlayerTransport) {
    this.config = config;
    this.logger = logger;
    this.transport = transport || new PlayerTransport(config);
    this.credsFilePath = path.join(config.credentialsDir, 'device-credentials.json');

    if (!fs.existsSync(config.credentialsDir)) {
      fs.mkdirSync(config.credentialsDir, { recursive: true, mode: 0o700 });
    }

    // Initialize client Firebase app with unique name per mode/projectId
    const appName = `aura-dims-player-${config.mode}-${config.projectId}`;
    this.app =
      getApps().find((a) => a.name === appName) ||
      initializeApp(
        {
          apiKey: config.firebaseApiKey,
          authDomain: config.firebaseAuthDomain || `${config.projectId}.firebaseapp.com`,
          projectId: config.projectId,
          storageBucket: config.storageBucket || `${config.projectId}.firebasestorage.app`,
        },
        appName
      );

    this.auth = getAuth(this.app);

    // Connect to Auth emulator strictly in 'emulator' mode
    if (config.mode === 'emulator') {
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

  public getTransport(): PlayerTransport {
    return this.transport;
  }

  public isEnrolled(): boolean {
    return fs.existsSync(this.credsFilePath);
  }

  public isRevoked(): boolean {
    return this.revokedReason !== null;
  }

  public getRevocationReason(): string | null {
    return this.revokedReason;
  }

  public markRevoked(reason: string): void {
    this.revokedReason = reason;
    this.currentUser = null;
    this.cachedIdToken = null;
    this.tokenExpiresAtMs = 0;
    this.logger.error(`Digital display credentials marked revoked: ${reason}`);
  }

  public getCredentials(): DeviceCredentials | null {
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

  public saveCredentials(creds: DeviceCredentials): void {
    const raw = JSON.stringify(creds, null, 2);
    const tmpPath = `${this.credsFilePath}.tmp`;
    fs.writeFileSync(tmpPath, raw, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, this.credsFilePath);
    this.currentCredentials = creds;
    this.revokedReason = null;
    this.logger.info(`Securely persisted credentials for digital display: ${creds.displayId}`);
  }

  public clearCredentials(): void {
    if (fs.existsSync(this.credsFilePath)) {
      fs.unlinkSync(this.credsFilePath);
    }
    this.currentCredentials = null;
    this.currentUser = null;
    this.cachedIdToken = null;
    this.tokenExpiresAtMs = 0;
    this.revokedReason = null;
    this.logger.info('Device credentials cleared.');
  }

  private async authenticateWithCustomToken(
    customToken: string,
    fallbackUid: string
  ): Promise<string> {
    try {
      this.currentUser = await signInWithCustomToken(this.auth, customToken);
      const token = await this.currentUser.user.getIdToken();
      this.cachedIdToken = token;
      this.tokenExpiresAtMs = Date.now() + 50 * 60 * 1000;
      return this.currentUser.user.uid;
    } catch {
      // Fallback to direct IdentityToolkit REST exchange via PlayerTransport
      const exchanged = await this.transport.exchangeCustomToken(customToken);
      this.cachedIdToken = exchanged.idToken;
      this.tokenExpiresAtMs = Date.now() + Math.max(60, exchanged.expiresInSeconds - 300) * 1000;
      return fallbackUid;
    }
  }

  public async pairWithCode(
    pairingCode: string
  ): Promise<{ success: boolean; displayId: string; error?: string }> {
    this.logger.info(
      `Attempting to redeem pairing code with Aura DIMS (${this.config.mode} mode)...`
    );

    try {
      const result = await this.transport.callPublicFunction<
        RedeemPairingCodeRequest,
        RedeemPairingCodeResponse
      >('redeemPairingCode', { pairingCode });

      const { displayId, deviceSecret, customToken } = result;
      const deviceUid = await this.authenticateWithCustomToken(
        customToken,
        `device:${displayId}`
      );

      this.saveCredentials({
        displayId,
        deviceSecret,
        deviceUid,
        enrolledAt: new Date().toISOString(),
      });

      this.logger.info(
        `Pairing successful! Authenticated as device for digital display: ${displayId}`
      );
      return { success: true, displayId };
    } catch (err: any) {
      const message = err?.message || 'Connection error';
      this.logger.error('Pairing error from server:', message);
      return { success: false, displayId: '', error: message };
    }
  }

  public async restoreSession(): Promise<{
    authenticated: boolean;
    displayId: string | null;
    revoked?: boolean;
    error?: string;
  }> {
    const creds = this.getCredentials();
    if (!creds) {
      return { authenticated: false, displayId: null };
    }

    this.logger.info(`Restoring authenticated session for digital display: ${creds.displayId}...`);


    try {
      const result = await this.transport.callPublicFunction<
        DeviceSignInRequest,
        DeviceSignInResponse
      >('deviceSignIn', {
        displayId: creds.displayId,
        deviceSecret: creds.deviceSecret,
      });

      await this.authenticateWithCustomToken(result.customToken, creds.deviceUid);
      this.revokedReason = null;
      this.logger.info(`Session successfully restored for digital display: ${creds.displayId}`);
      return { authenticated: true, displayId: creds.displayId };
    } catch (err: any) {
      const message = err?.message || 'Network offline';
      if (err instanceof PlayerTransportError && (err.isRevoked || err.statusCode === 403)) {
        this.markRevoked(message);
        return {
          authenticated: false,
          displayId: creds.displayId,
          revoked: true,
          error: message,
        };
      }
      this.logger.warn(
        'Failed to contact server for session restoration (operating offline):',
        message
      );
      return { authenticated: false, displayId: creds.displayId, error: message };
    }
  }

  public async getIdToken(forceRefresh = false): Promise<string | null> {
    if (this.revokedReason && !forceRefresh) {
      return null;
    }

    const now = Date.now();
    if (!forceRefresh && this.cachedIdToken && now < this.tokenExpiresAtMs) {
      return this.cachedIdToken;
    }

    if (!forceRefresh && this.currentUser) {
      try {
        const token = await this.currentUser.user.getIdToken(false);
        this.cachedIdToken = token;
        this.tokenExpiresAtMs = now + 45 * 60 * 1000;
        return token;
      } catch {
        // Proceed to full session restore
      }
    }

    const restore = await this.restoreSession();
    if (!restore.authenticated) {
      return null;
    }

    if (this.currentUser) {
      const token = await this.currentUser.user.getIdToken(forceRefresh);
      this.cachedIdToken = token;
      this.tokenExpiresAtMs = Date.now() + 45 * 60 * 1000;
      return token;
    }

    return this.cachedIdToken;
  }

  public async getValidIdToken(forceRefresh = false): Promise<string> {
    const token = await this.getIdToken(forceRefresh);
    if (!token) {
      if (this.revokedReason) {
        throw new PlayerTransportError(
          `Digital display credentials revoked: ${this.revokedReason}`,
          {
            statusCode: 403,
            firebaseCode: 'PERMISSION_DENIED',
            isAuthError: true,
            isRevoked: true,
          }
        );
      }
      throw new PlayerTransportError('Digital display is not authenticated or offline.', {
        statusCode: 401,
        firebaseCode: 'UNAUTHENTICATED',
        isAuthError: true,
      });
    }
    return token;
  }

  public getDisplayId(): string | null {
    return this.getCredentials()?.displayId || null;
  }
}
