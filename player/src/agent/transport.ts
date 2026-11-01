/**
 * Aura DIMS - Shared Player Transport Abstraction
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Provides explicit 'emulator' and 'cloud' transport modes for digital display
 * callable function invocations, custom token exchange, automatic token renewal,
 * revocation handling, and private asset download validation.
 *
 * Terminology: Always use "digital display" in all user-facing copy and logs.
 */

import { PlayerConfig, validatePlayerConfig } from './config.js';

export class PlayerTransportError extends Error {
  public readonly statusCode: number;
  public readonly firebaseCode?: string;
  public readonly isAuthError: boolean;
  public readonly isRevoked: boolean;

  constructor(
    message: string,
    options: {
      statusCode: number;
      firebaseCode?: string;
      isAuthError?: boolean;
      isRevoked?: boolean;
    }
  ) {
    super(message);
    this.name = 'PlayerTransportError';
    this.statusCode = options.statusCode;
    this.firebaseCode = options.firebaseCode;
    this.isAuthError = Boolean(options.isAuthError);
    this.isRevoked = Boolean(options.isRevoked);
  }
}

export interface TokenProvider {
  getValidIdToken(forceRefresh?: boolean): Promise<string>;
  markRevoked?(reason: string): void;
}

export class PlayerTransport {
  private readonly config: PlayerConfig;

  constructor(config: PlayerConfig) {
    validatePlayerConfig(config);
    this.config = config;
  }

  public getMode(): 'emulator' | 'cloud' {
    return this.config.mode;
  }

  public getCallableUrl(functionName: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(functionName)) {
      throw new Error(`Invalid callable function name: "${functionName}"`);
    }

    if (this.config.mode === 'emulator') {
      const host = this.config.functionsEmulatorHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      return `http://${host}/${this.config.projectId}/${this.config.region}/${functionName}`;
    }

    const base = (
      this.config.functionsBaseUrl ||
      `https://${this.config.region}-${this.config.projectId}.cloudfunctions.net`
    ).replace(/\/+$/, '');

    if (!base.startsWith('https://')) {
      throw new Error(
        `Cloud transport mode requires HTTPS callable endpoint, got "${base}".`
      );
    }

    return `${base}/${functionName}`;
  }

  public getCustomTokenExchangeUrl(): string {
    if (this.config.mode === 'emulator') {
      const host = this.config.authEmulatorHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      return `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(
        this.config.firebaseApiKey
      )}`;
    }

    return `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(
      this.config.firebaseApiKey
    )}`;
  }

  /**
   * Validates that an outbound URL strictly respects the active transport mode boundary.
   */
  public validateAssetDownloadUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`Invalid asset download URL for digital display: "${rawUrl}"`);
    }

    if (this.config.mode === 'emulator') {
      const emulatorHost = this.config.storageEmulatorHost.replace(/^https?:\/\//, '').split('/')[0];
      const allowedEmulatorHosts = new Set([
        '127.0.0.1',
        'localhost',
        emulatorHost.split(':')[0],
        ...(this.config.allowedDownloadHosts || []),
      ]);
      if (!allowedEmulatorHosts.has(parsed.hostname)) {
        throw new Error(
          `Emulator transport mode blocked outbound asset download to non-emulator host "${parsed.hostname}".`
        );
      }
      return parsed;
    }

    // Cloud mode: require HTTPS and block loopback/emulator endpoints unless explicitly allowed in test harness
    if (parsed.protocol !== 'https:') {
      throw new Error(
        `Cloud transport mode requires HTTPS for digital display asset downloads, received "${parsed.protocol}".`
      );
    }

    const allowedCloudHosts = new Set([
      'storage.googleapis.com',
      'firebasestorage.googleapis.com',
      ...(this.config.storageBucket ? [`${this.config.storageBucket}.storage.googleapis.com`] : []),
      ...(this.config.allowedDownloadHosts || []),
    ]);

    const isAllowed =
      allowedCloudHosts.has(parsed.hostname) ||
      parsed.hostname.endsWith('.firebasestorage.app') ||
      parsed.hostname.endsWith('.googleapis.com');

    if (!isAllowed) {
      throw new Error(
        `Cloud transport mode blocked asset download from untrusted host "${parsed.hostname}".`
      );
    }

    return parsed;
  }

  /**
   * Exchanges a short-lived Firebase custom token for an ID token.
   */
  public async exchangeCustomToken(customToken: string): Promise<{
    idToken: string;
    refreshToken: string;
    expiresInSeconds: number;
  }> {
    const url = this.getCustomTokenExchangeUrl();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Ignore JSON parse error; handled below
    }

    if (!res.ok || !json?.idToken) {
      const errMsg = json?.error?.message || text || `HTTP ${res.status}`;
      throw new PlayerTransportError(
        `Digital display custom token exchange failed: ${errMsg}`,
        {
          statusCode: res.status,
          firebaseCode: json?.error?.message,
          isAuthError: res.status === 400 || res.status === 401 || res.status === 403,
        }
      );
    }

    return {
      idToken: String(json.idToken),
      refreshToken: String(json.refreshToken || ''),
      expiresInSeconds: Number(json.expiresIn || 3600),
    };
  }

  /**
   * Invokes an unauthenticated callable function (e.g. redeemPairingCode, deviceSignIn).
   */
  public async callPublicFunction<TReq, TRes>(
    functionName: string,
    payload: TReq
  ): Promise<TRes> {
    return this.invokeCallable<TReq, TRes>(functionName, payload, null);
  }

  /**
   * Invokes an authenticated callable function using the digital display's ID token.
   * Automatically refreshes the ID token once on 401/UNAUTHENTICATED and detects credential revocation.
   */
  public async callAuthenticatedFunction<TReq, TRes>(
    functionName: string,
    payload: TReq,
    tokenProvider: TokenProvider
  ): Promise<TRes> {
    let idToken = await tokenProvider.getValidIdToken(false);
    try {
      return await this.invokeCallable<TReq, TRes>(functionName, payload, idToken);
    } catch (err: any) {
      if (err instanceof PlayerTransportError) {
        if (err.isRevoked) {
          tokenProvider.markRevoked?.(err.message);
          throw err;
        }
        if (err.statusCode === 401 || err.firebaseCode === 'UNAUTHENTICATED') {
          // Renew token once and retry
          try {
            idToken = await tokenProvider.getValidIdToken(true);
          } catch (refreshErr: any) {
            if (refreshErr instanceof PlayerTransportError && refreshErr.isRevoked) {
              tokenProvider.markRevoked?.(refreshErr.message);
            }
            throw refreshErr;
          }
          return await this.invokeCallable<TReq, TRes>(functionName, payload, idToken);
        }
      }
      throw err;
    }
  }

  private async invokeCallable<TReq, TRes>(
    functionName: string,
    payload: TReq,
    idToken: string | null
  ): Promise<TRes> {
    const url = this.getCallableUrl(functionName);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: payload }),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON response
    }

    if (!res.ok || json?.error) {
      const firebaseCode: string | undefined = json?.error?.status || json?.error?.code;
      const errorMessage: string =
        json?.error?.message || text || `HTTP ${res.status} calling ${functionName}`;
      const lowerMsg = errorMessage.toLowerCase();
      const isRevoked =
        (res.status === 403 || firebaseCode === 'PERMISSION_DENIED') &&
        (lowerMsg.includes('revoked') ||
          lowerMsg.includes('invalid device credential') ||
          lowerMsg.includes('not enrolled') ||
          lowerMsg.includes('retired'));

      const isAuthError =
        res.status === 401 ||
        res.status === 403 ||
        firebaseCode === 'UNAUTHENTICATED' ||
        firebaseCode === 'PERMISSION_DENIED';

      throw new PlayerTransportError(
        `Callable ${functionName} failed (${res.status}): ${errorMessage}`,
        {
          statusCode: res.status,
          firebaseCode,
          isAuthError,
          isRevoked,
        }
      );
    }

    const result = json?.result ?? json?.data;
    if (result === undefined) {
      throw new PlayerTransportError(
        `Callable ${functionName} returned malformed response without result envelope.`,
        { statusCode: 502 }
      );
    }

    return result as TRes;
  }
}

