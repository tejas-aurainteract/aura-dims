/**
 * Aura DIMS - Store-and-Forward Enrollment Worker
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Automatically redeems a persisted pairing code (`pending-enrollment.json`)
 * as soon as the digital display has verified internet connectivity, with
 * single-flight mutex protection, error classification, and exponential backoff.
 *
 * Terminology rule: Strictly use "digital display" in user-facing copy and logs.
 */

import type { PendingEnrollmentError } from '@aura-dims/display-schema';
import type { Logger } from './logger.js';
import type { PendingEnrollmentStore } from './pendingEnrollment.js';
import { maskPairingCode } from './pendingEnrollment.js';

export interface EnrollmentIdentityAdapter {
  isEnrolled(): boolean;
  pairWithCode(pairingCode: string): Promise<{ success: boolean; displayId: string; error?: string }>;
}

export interface EnrollmentWorkerOptions {
  store: PendingEnrollmentStore;
  identity: EnrollmentIdentityAdapter;
  logger: Logger;
  checkOnline: () => Promise<boolean>;
  onEnrolled?: (displayId: string) => void;
  onStateChange?: () => void;
  tickIntervalMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface EnrollmentAttemptResult {
  status:
    | 'idle'
    | 'in_flight'
    | 'offline'
    | 'backoff'
    | 'enrolled'
    | 'retry_scheduled'
    | 'failed_terminal';
  displayId?: string;
  error?: PendingEnrollmentError;
}

export type ClassifiedErrorKind = 'terminal' | 'rate_limited' | 'transient';

export function classifyEnrollmentError(rawMessage: string): {
  kind: ClassifiedErrorKind;
  error: PendingEnrollmentError;
} {
  const msg = String(rawMessage || 'Connection error');
  const lower = msg.toLowerCase();

  if (lower.includes('invalid pairing code') || lower.includes('not-found')) {
    return {
      kind: 'terminal',
      error: {
        code: 'invalid_code',
        message: 'Invalid pairing code. Generate a new code in Aura DIMS.',
      },
    };
  }

  if (lower.includes('already been consumed') || lower.includes('already consumed')) {
    return {
      kind: 'terminal',
      error: {
        code: 'code_consumed',
        message: 'Pairing code has already been used. Generate a new code in Aura DIMS.',
      },
    };
  }

  if (lower.includes('expired')) {
    return {
      kind: 'terminal',
      error: {
        code: 'code_expired',
        message: 'Pairing code expired. Generate a new code in Aura DIMS.',
      },
    };
  }

  if (lower.includes('not in pending_enrollment')) {
    return {
      kind: 'terminal',
      error: {
        code: 'already_active',
        message:
          'Digital display is already active in Aura DIMS. Unpair it in the web console first.',
      },
    };
  }

  if (lower.includes('invalid-argument') || lower.includes('pairing code is required')) {
    return {
      kind: 'terminal',
      error: {
        code: 'invalid_argument',
        message: 'Invalid pairing code format.',
      },
    };
  }

  if (
    lower.includes('resource-exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('too many')
  ) {
    return {
      kind: 'rate_limited',
      error: {
        code: 'rate_limited',
        message: 'Too many pairing attempts. Retrying after cooldown...',
      },
    };
  }

  return {
    kind: 'transient',
    error: {
      code: 'network_unavailable',
      message: msg,
    },
  };
}

export class EnrollmentWorker {
  private readonly store: PendingEnrollmentStore;
  private readonly identity: EnrollmentIdentityAdapter;
  private readonly logger: Logger;
  private readonly checkOnline: () => Promise<boolean>;
  private readonly onEnrolled?: (displayId: string) => void;
  private readonly onStateChange?: () => void;
  private readonly tickIntervalMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  private tickTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private inFlightPromise: Promise<EnrollmentAttemptResult> | null = null;

  constructor(options: EnrollmentWorkerOptions) {
    this.store = options.store;
    this.identity = options.identity;
    this.logger = options.logger;
    this.checkOnline = options.checkOnline;
    this.onEnrolled = options.onEnrolled;
    this.onStateChange = options.onStateChange;
    this.tickIntervalMs = options.tickIntervalMs ?? 15_000;
    this.baseBackoffMs = options.baseBackoffMs ?? 5_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 5 * 60 * 1000;
  }

  public getStore(): PendingEnrollmentStore {
    return this.store;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. If already enrolled, clean up any stale pending file
    if (this.identity.isEnrolled()) {
      if (this.store.exists()) {
        this.logger.info(
          '[EnrollmentWorker] Digital display is already enrolled; removing stale pending enrollment.'
        );
        this.store.clear();
      }
    } else {
      // 2. Recover any leftover 'redeeming' state from a previous crash/reboot
      const existing = this.store.read();
      if (existing && existing.state === 'redeeming') {
        this.store.update({ state: 'pending', nextAttemptAt: null });
      }
    }

    this.tickTimer = setInterval(() => {
      this.attemptOnce().catch((err: any) => {
        this.logger.warn('[EnrollmentWorker] Periodic tick error:', err?.message || err);
      });
    }, this.tickIntervalMs);

    // Kick immediately on startup
    this.kick(false);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /**
   * Triggers an immediate redemption check.
   * Pass `resetBackoff = true` when connectivity transitions offline -> online or after Wi-Fi join.
   */
  public kick(resetBackoff = true): Promise<EnrollmentAttemptResult> {
    if (resetBackoff) {
      const existing = this.store.read();
      if (existing && existing.state === 'pending' && existing.nextAttemptAt) {
        this.store.update({ nextAttemptAt: null });
      }
    }
    return this.attemptOnce();
  }

  public async attemptOnce(): Promise<EnrollmentAttemptResult> {
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    const promise = this.runAttemptInternal().finally(() => {
      this.inFlightPromise = null;
    });
    this.inFlightPromise = promise;
    return promise;
  }

  private async runAttemptInternal(): Promise<EnrollmentAttemptResult> {
    // 1. Already enrolled -> clean up and exit
    if (this.identity.isEnrolled()) {
      if (this.store.exists()) {
        this.store.clear();
        this.onStateChange?.();
      }
      return { status: 'idle' };
    }

    const pending = this.store.read();
    if (!pending) {
      return { status: 'idle' };
    }

    if (pending.state === 'failed_terminal') {
      return {
        status: 'failed_terminal',
        error: pending.lastError || { code: 'terminal', message: 'Pairing failed.' },
      };
    }

    // 2. Respect backoff schedule
    if (pending.nextAttemptAt) {
      const nextMs = Date.parse(pending.nextAttemptAt);
      if (!Number.isNaN(nextMs) && Date.now() < nextMs) {
        return { status: 'backoff' };
      }
    }

    // 3. Check internet reachability without incrementing attempts if offline
    let online = false;
    try {
      online = await this.checkOnline();
    } catch {
      online = false;
    }

    if (!online) {
      return { status: 'offline' };
    }

    // 4. Transition to 'redeeming' and invoke cloud function
    const nextAttemptNumber = pending.attempts + 1;
    const nowIso = new Date().toISOString();
    this.store.update({
      state: 'redeeming',
      attempts: nextAttemptNumber,
      lastAttemptAt: nowIso,
    });
    this.onStateChange?.();

    this.logger.info(
      `[EnrollmentWorker] Attempting to enroll digital display with stored pairing code (${maskPairingCode(
        pending.pairingCode
      )}, attempt #${nextAttemptNumber})...`
    );

    let result: { success: boolean; displayId: string; error?: string };
    try {
      result = await this.identity.pairWithCode(pending.pairingCode);
    } catch (err: any) {
      result = {
        success: false,
        displayId: '',
        error: err?.message || 'Unexpected error during pairing',
      };
    }

    if (result.success) {
      this.store.clear();
      this.logger.info(
        `[EnrollmentWorker] Digital display enrolled via stored pairing code (Display ID: ${result.displayId}).`
      );
      this.onEnrolled?.(result.displayId);
      this.onStateChange?.();
      return { status: 'enrolled', displayId: result.displayId };
    }

    // 5. Classify error
    const classified = classifyEnrollmentError(result.error || 'Connection error');

    if (classified.kind === 'terminal') {
      this.store.update({
        state: 'failed_terminal',
        nextAttemptAt: null,
        lastError: classified.error,
      });
      this.logger.warn(
        `[EnrollmentWorker] Terminal pairing error (${classified.error.code}): ${classified.error.message}`
      );
      this.onStateChange?.();
      return { status: 'failed_terminal', error: classified.error };
    }

    // Transient or rate_limited: compute exponential backoff with ±20% jitter
    const rawDelay = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * Math.pow(2, Math.max(0, nextAttemptNumber - 1))
    );
    const minDelay = classified.kind === 'rate_limited' ? Math.max(60_000, rawDelay) : rawDelay;
    const jitterFactor = 0.8 + Math.random() * 0.4; // 0.8 .. 1.2
    const delayMs = Math.round(minDelay * jitterFactor);
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

    this.store.update({
      state: 'pending',
      nextAttemptAt,
      lastError: classified.error,
    });
    this.logger.warn(
      `[EnrollmentWorker] Transient pairing error (${classified.error.code}). Next retry in ${Math.round(
        delayMs / 1000
      )}s.`
    );
    this.onStateChange?.();
    return { status: 'retry_scheduled', error: classified.error };
  }
}
