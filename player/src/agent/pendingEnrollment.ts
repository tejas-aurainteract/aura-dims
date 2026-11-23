/**
 * Aura DIMS - Store-and-Forward Pending Enrollment Persistence
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Persists an unredeemed pairing key code in an access-restricted JSON file
 * (`pending-enrollment.json`) so mobile-only AP onboarding can submit Wi-Fi
 * credentials and the pairing code in a single step before the setup AP closes.
 *
 * Terminology rule: Strictly use "digital display" in user-facing copy and logs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  PendingEnrollment,
  PendingEnrollmentSource,
  PendingEnrollmentView,
} from '@aura-dims/display-schema';
import type { Logger } from './logger.js';

const PAIRING_CODE_REGEX = /^[A-Z0-9]{6,12}$/;

export function normalizePairingCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

export function isValidPairingCode(code: string): boolean {
  return PAIRING_CODE_REGEX.test(code);
}

export function maskPairingCode(code: string): string {
  const clean = normalizePairingCode(code);
  if (clean.length >= 4) {
    return `${clean.slice(0, 2)}••••${clean.slice(-2)}`;
  }
  return '••••••';
}

export class PendingEnrollmentStore {
  private readonly filePath: string;
  private readonly credentialsDir: string;
  private readonly logger?: Logger;

  constructor(credentialsDir: string, logger?: Logger) {
    this.credentialsDir = credentialsDir;
    this.filePath = path.join(credentialsDir, 'pending-enrollment.json');
    this.logger = logger;

    if (!fs.existsSync(this.credentialsDir)) {
      fs.mkdirSync(this.credentialsDir, { recursive: true, mode: 0o700 });
    }
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  public read(): PendingEnrollment | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PendingEnrollment>;
      if (
        !parsed ||
        parsed.schemaVersion !== 1 ||
        typeof parsed.pairingCode !== 'string' ||
        !isValidPairingCode(normalizePairingCode(parsed.pairingCode))
      ) {
        this.logger?.warn('[PendingEnrollment] Invalid pending-enrollment.json schema; ignoring.');
        return null;
      }

      return {
        schemaVersion: 1,
        pairingCode: normalizePairingCode(parsed.pairingCode),
        submittedAt:
          typeof parsed.submittedAt === 'string' ? parsed.submittedAt : new Date().toISOString(),
        source:
          parsed.source === 'captive_portal' ||
          parsed.source === 'lan_portal' ||
          parsed.source === 'cli'
            ? parsed.source
            : 'captive_portal',
        state:
          parsed.state === 'pending' ||
          parsed.state === 'redeeming' ||
          parsed.state === 'failed_terminal'
            ? parsed.state
            : 'pending',
        attempts: typeof parsed.attempts === 'number' && parsed.attempts >= 0 ? parsed.attempts : 0,
        lastAttemptAt: typeof parsed.lastAttemptAt === 'string' ? parsed.lastAttemptAt : null,
        nextAttemptAt: typeof parsed.nextAttemptAt === 'string' ? parsed.nextAttemptAt : null,
        lastError:
          parsed.lastError &&
          typeof parsed.lastError.code === 'string' &&
          typeof parsed.lastError.message === 'string'
            ? { code: parsed.lastError.code, message: parsed.lastError.message }
            : null,
        wifiSsid: typeof parsed.wifiSsid === 'string' ? parsed.wifiSsid : null,
      };
    } catch (err: any) {
      this.logger?.warn(
        '[PendingEnrollment] Failed to parse pending-enrollment.json (treating as absent):',
        err?.message || err
      );
      return null;
    }
  }

  public saveNew(
    rawPairingCode: string,
    source: PendingEnrollmentSource = 'captive_portal',
    wifiSsid?: string | null
  ): PendingEnrollment {
    const pairingCode = normalizePairingCode(rawPairingCode);
    if (!isValidPairingCode(pairingCode)) {
      throw new Error('Pairing key code must be 6 to 12 uppercase letters or digits.');
    }

    const record: PendingEnrollment = {
      schemaVersion: 1,
      pairingCode,
      submittedAt: new Date().toISOString(),
      source,
      state: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      lastError: null,
      wifiSsid: wifiSsid ? wifiSsid.trim() : null,
    };

    this.writeAtomic(record);
    this.logger?.info(
      `[PendingEnrollment] Saved pending enrollment (${maskPairingCode(pairingCode)}) for digital display.`
    );
    return record;
  }

  public update(
    patch: Partial<Omit<PendingEnrollment, 'schemaVersion' | 'pairingCode' | 'submittedAt'>>
  ): PendingEnrollment | null {
    const existing = this.read();
    if (!existing) return null;

    const updated: PendingEnrollment = {
      ...existing,
      ...patch,
    };

    this.writeAtomic(updated);
    return updated;
  }

  public clear(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
        this.logger?.info('[PendingEnrollment] Cleared pending-enrollment.json.');
      }
    } catch (err: any) {
      this.logger?.warn(
        '[PendingEnrollment] Could not delete pending-enrollment.json:',
        err?.message || err
      );
    }
  }

  public getView(): PendingEnrollmentView | null {
    const record = this.read();
    if (!record) return null;

    return {
      state: record.state,
      attempts: record.attempts,
      submittedAt: record.submittedAt,
      lastAttemptAt: record.lastAttemptAt,
      nextAttemptAt: record.nextAttemptAt,
      lastError: record.lastError,
      codeHint: maskPairingCode(record.pairingCode),
      wifiSsid: record.wifiSsid ?? null,
    };
  }

  private writeAtomic(record: PendingEnrollment): void {
    if (!fs.existsSync(this.credentialsDir)) {
      fs.mkdirSync(this.credentialsDir, { recursive: true, mode: 0o700 });
    }

    const tmpPath = `${this.filePath}.tmp`;
    const serialized = JSON.stringify(record, null, 2);

    const fd = fs.openSync(tmpPath, 'w', 0o600);
    try {
      fs.writeSync(fd, serialized, 0, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tmpPath, this.filePath);
  }
}
