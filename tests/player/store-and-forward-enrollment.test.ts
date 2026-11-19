import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '../../player/src/agent/logger.js';
import {
  PendingEnrollmentStore,
  maskPairingCode,
  normalizePairingCode,
  isValidPairingCode,
} from '../../player/src/agent/pendingEnrollment.js';
import {
  EnrollmentWorker,
  classifyEnrollmentError,
} from '../../player/src/agent/enrollmentWorker.js';
import { WifiManager } from '../../player/src/agent/wifiManager.js';
import { CaptivePortalServer } from '../../player/src/agent/captivePortal.js';

describe('Store-and-Forward Digital Display Enrollment', () => {
  let tmpDir: string;
  let credsDir: string;
  let logger: Logger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-enroll-test-'));
    credsDir = path.join(tmpDir, 'credentials');
    logger = new Logger(path.join(tmpDir, 'logs'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('PendingEnrollmentStore validates, writes atomically, masks code, and handles corrupt JSON', () => {
    expect(normalizePairingCode(' 7k2-m9p ')).toBe('7K2M9P');
    expect(isValidPairingCode('7K2M9P')).toBe(true);
    expect(isValidPairingCode('SHORT')).toBe(false);
    expect(maskPairingCode('7K2M9P')).toBe('••••9P');

    const store = new PendingEnrollmentStore(credsDir, logger);
    expect(store.read()).toBeNull();

    expect(() => store.saveNew('BAD', 'captive_portal')).toThrow();

    const saved = store.saveNew('7k2m9p', 'captive_portal', 'OfficeWiFi');
    expect(saved.pairingCode).toBe('7K2M9P');
    expect(saved.state).toBe('pending');
    expect(saved.wifiSsid).toBe('OfficeWiFi');
    expect(store.exists()).toBe(true);

    const view = store.getView();
    expect(view).not.toBeNull();
    expect(view!.codeHint).toBe('••••9P');
    expect((view as any).pairingCode).toBeUndefined();

    // Corrupt JSON should be treated as absent without crashing
    fs.writeFileSync(store.getFilePath(), '{not valid json', 'utf8');
    expect(store.read()).toBeNull();

    store.clear();
    expect(store.exists()).toBe(false);
  });

  it('classifyEnrollmentError separates terminal, rate_limited, and transient errors', () => {
    expect(classifyEnrollmentError('Invalid pairing code.').kind).toBe('terminal');
    expect(classifyEnrollmentError('Pairing code has already been consumed.').kind).toBe('terminal');
    expect(classifyEnrollmentError('Pairing code has expired.').kind).toBe('terminal');
    expect(classifyEnrollmentError('Digital display is not in pending_enrollment state.').kind).toBe(
      'terminal'
    );
    expect(classifyEnrollmentError('resource-exhausted: too many attempts').kind).toBe(
      'rate_limited'
    );
    expect(classifyEnrollmentError('fetch failed: ENOTFOUND').kind).toBe('transient');
  });

  it('EnrollmentWorker skips when offline, retries transient errors, and succeeds when online', async () => {
    const store = new PendingEnrollmentStore(credsDir, logger);
    store.saveNew('AB12CD', 'captive_portal', 'AuraWiFi');

    let isOnline = false;
    let isEnrolled = false;
    let shouldFailTransient = true;
    let enrolledDisplayId: string | null = null;
    let pairCalls = 0;

    const worker = new EnrollmentWorker({
      store,
      identity: {
        isEnrolled: () => isEnrolled,
        pairWithCode: async (code: string) => {
          pairCalls += 1;
          if (shouldFailTransient) {
            return { success: false, displayId: '', error: 'fetch failed: ECONNRESET' };
          }
          expect(code).toBe('AB12CD');
          isEnrolled = true;
          return { success: true, displayId: 'disp_online_1' };
        },
      },
      logger,
      checkOnline: async () => isOnline,
      onEnrolled: (id) => {
        enrolledDisplayId = id;
      },
      baseBackoffMs: 1000,
    });

    // 1. Offline: should NOT increment attempts or call pairWithCode
    const offRes = await worker.attemptOnce();
    expect(offRes.status).toBe('offline');
    expect(pairCalls).toBe(0);
    expect(store.read()!.attempts).toBe(0);

    // 2. Online + transient failure: schedules retry with backoff
    isOnline = true;
    const transientRes = await worker.attemptOnce();
    expect(transientRes.status).toBe('retry_scheduled');
    expect(pairCalls).toBe(1);
    expect(store.read()!.state).toBe('pending');
    expect(store.read()!.nextAttemptAt).not.toBeNull();

    // 3. Immediate attemptOnce respects backoff
    const backoffRes = await worker.attemptOnce();
    expect(backoffRes.status).toBe('backoff');
    expect(pairCalls).toBe(1);

    // 4. Kick with resetBackoff=true after recovery succeeds and clears pending file
    shouldFailTransient = false;
    const okRes = await worker.kick(true);
    expect(okRes.status).toBe('enrolled');
    expect(okRes.displayId).toBe('disp_online_1');
    expect(enrolledDisplayId).toBe('disp_online_1');
    expect(store.exists()).toBe(false);
  });

  it('EnrollmentWorker stops on terminal error and recovers leftover redeeming state on start', async () => {
    const store = new PendingEnrollmentStore(credsDir, logger);
    store.saveNew('EX9999', 'captive_portal');
    store.update({ state: 'redeeming', attempts: 1 });

    let pairCalls = 0;
    const worker = new EnrollmentWorker({
      store,
      identity: {
        isEnrolled: () => false,
        pairWithCode: async () => {
          pairCalls += 1;
          return { success: false, displayId: '', error: 'Pairing code has expired.' };
        },
      },
      logger,
      checkOnline: async () => true,
      tickIntervalMs: 60_000,
    });

    worker.start();
    // Wait for initial kick
    await new Promise((r) => setTimeout(r, 80));
    worker.stop();

    expect(pairCalls).toBe(1);
    const after = store.read();
    expect(after).not.toBeNull();
    expect(after!.state).toBe('failed_terminal');
    expect(after!.lastError?.code).toBe('code_expired');

    // Subsequent attempts do not re-call server
    const again = await worker.attemptOnce();
    expect(again.status).toBe('failed_terminal');
    expect(pairCalls).toBe(1);
  });

  it('CaptivePortalServer saves pending pairing code before Fast-ACK, masks in /api/device/info, and clears on /api/unpair', async () => {
    const store = new PendingEnrollmentStore(credsDir, logger);
    const wifi = new WifiManager(logger);
    expect(wifi.getApPassword()).toBe('aura12345678');

    const mockIdentity: any = {
      isEnrolled: () => false,
      getCredentials: () => null,
      clearCredentials: () => {},
      pairWithCode: async () => ({ success: false, displayId: '', error: 'offline' }),
    };

    const worker = new EnrollmentWorker({
      store,
      identity: mockIdentity,
      logger,
      checkOnline: async () => false,
    });

    const portal = new CaptivePortalServer(
      logger,
      wifi,
      mockIdentity,
      undefined,
      undefined,
      worker
    );
    const port = await portal.start(8771);

    try {
      // 1. Reject invalid pairing code on /api/wifi/connect
      const badRes = await fetch(`http://127.0.0.1:${port}/api/wifi/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: 'Aura-Office-5G', password: 'secret', pairingCode: '12' }),
      });
      expect(badRes.status).toBe(400);
      expect(store.exists()).toBe(false);

      // 2. Valid Wi-Fi + pairing code writes pending-enrollment.json BEFORE Fast-ACK returns
      const goodRes = await fetch(`http://127.0.0.1:${port}/api/wifi/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: 'Aura-Office-5G',
          password: 'secret',
          pairingCode: '7k2m9p',
        }),
      });
      expect(goodRes.status).toBe(200);
      const goodJson = await goodRes.json();
      expect(goodJson.success).toBe(true);
      expect(goodJson.enrollmentQueued).toBe(true);
      expect(store.exists()).toBe(true);
      expect(store.read()!.pairingCode).toBe('7K2M9P');

      // 3. /api/device/info exposes masked codeHint, never raw pairingCode
      const infoRes = await fetch(`http://127.0.0.1:${port}/api/device/info`);
      const infoJson = await infoRes.json();
      expect(infoJson.pendingEnrollment).not.toBeNull();
      expect(infoJson.pendingEnrollment.codeHint).toBe('••••9P');
      expect(JSON.stringify(infoJson)).not.toContain('7K2M9P');

      // 4. /api/unpair clears pending enrollment
      const unpairRes = await fetch(`http://127.0.0.1:${port}/api/unpair`, { method: 'POST' });
      expect(unpairRes.status).toBe(200);
      expect(store.exists()).toBe(false);
    } finally {
      await portal.stop();
    }
  });
});
