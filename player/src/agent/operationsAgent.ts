/**
 * Aura DIMS - Durable Device Operations Agent
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements single-flight claiming, persistent local deduplication, capability checks,
 * bounded backoff, and post-reboot reconciliation for server-authorized digital display operations.
 *
 * Terminology: Always use "digital display" in all user-facing copy and logs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { DeviceIdentity } from './identity.js';
import type { SyncEngine } from './syncEngine.js';
import type { HardwareAdapter } from './hardwareAdapter.js';
import type {
  ClaimDeviceOperationRequest,
  ClaimDeviceOperationResponse,
  DeviceOperationRecord,
  ReportDeviceOperationRequest,
  ReportDeviceOperationResponse,
  UploadDevicePreviewRequest,
  UploadDevicePreviewResponse,
} from '@aura-dims/display-schema';

export interface LocalOperationLedgerEntry {
  operationId: string;
  type: DeviceOperationRecord['type'];
  claimLeaseId: string;
  state: 'awaiting_reconnect' | 'succeeded' | 'failed';
  resultSummary?: string;
  errorCode?: string;
  errorMessage?: string;
  preRebootBootId?: string | null;
  preRebootUptimeSeconds?: number | null;
  recordedAt: string;
}

interface LocalOperationLedgerFile {
  entries: LocalOperationLedgerEntry[];
}

export class OperationsAgent {
  private readonly config: PlayerConfig;
  private readonly logger: Logger;
  private readonly identity: DeviceIdentity;
  private readonly syncEngine: SyncEngine;
  private readonly hardwareAdapter: HardwareAdapter;
  private readonly onRefreshRenderer: () => number;
  private readonly ledgerPath: string;
  private inFlight = false;
  private consecutiveFailures = 0;
  private nextAllowedPollMs = 0;

  constructor(params: {
    config: PlayerConfig;
    logger: Logger;
    identity: DeviceIdentity;
    syncEngine: SyncEngine;
    hardwareAdapter: HardwareAdapter;
    onRefreshRenderer: () => number;
  }) {
    this.config = params.config;
    this.logger = params.logger;
    this.identity = params.identity;
    this.syncEngine = params.syncEngine;
    this.hardwareAdapter = params.hardwareAdapter;
    this.onRefreshRenderer = params.onRefreshRenderer;
    this.ledgerPath = path.join(this.config.dataDir, 'operations-ledger.json');
  }

  public loadLedger(): LocalOperationLedgerEntry[] {
    try {
      if (!fs.existsSync(this.ledgerPath)) return [];
      const parsed = JSON.parse(
        fs.readFileSync(this.ledgerPath, 'utf8')
      ) as LocalOperationLedgerFile;
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      return [];
    }
  }

  private saveLedgerEntry(entry: LocalOperationLedgerEntry): void {
    try {
      const existing = this.loadLedger().filter(
        (e) => e.operationId !== entry.operationId
      );
      existing.push(entry);
      // Bound ledger size to most recent 200 operations
      const bounded = existing.slice(-200);
      const tmpPath = `${this.ledgerPath}.tmp`;
      fs.writeFileSync(
        tmpPath,
        JSON.stringify({ entries: bounded }, null, 2),
        'utf8'
      );
      fs.renameSync(tmpPath, this.ledgerPath);
    } catch (err) {
      this.logger.warn('Failed to persist local operation ledger entry:', err);
    }
  }

  public getLedgerEntry(operationId: string): LocalOperationLedgerEntry | undefined {
    return this.loadLedger().find((e) => e.operationId === operationId);
  }

  /**
   * Reconciles any locally tracked `awaiting_reconnect` REBOOT operations upon agent startup/reconnect.
   */
  public async reconcilePendingReboots(): Promise<void> {
    const displayId = this.identity.getDisplayId();
    if (!displayId) return;

    const pendingReboots = this.loadLedger().filter(
      (e) => e.type === 'REBOOT' && e.state === 'awaiting_reconnect'
    );
    if (pendingReboots.length === 0) return;

    const currentBootId = this.hardwareAdapter.readBootId();
    const currentUptime = Math.floor(os.uptime());
    const transport = this.identity.getTransport();

    for (const entry of pendingReboots) {
      const bootIdChanged =
        Boolean(entry.preRebootBootId && currentBootId) &&
        entry.preRebootBootId !== currentBootId;
      const uptimeReset =
        typeof entry.preRebootUptimeSeconds === 'number' &&
        currentUptime < entry.preRebootUptimeSeconds;

      const rebootVerified = bootIdChanged || uptimeReset;
      const newState = rebootVerified ? 'succeeded' : 'failed';
      const resultSummary = rebootVerified
        ? `Digital display reconnected after verified OS reboot (uptime ${currentUptime}s${
            currentBootId ? `, bootId ${currentBootId.slice(0, 8)}` : ''
          }).`
        : 'Digital display agent restarted without evidence of a full OS reboot.';

      try {
        await transport.callAuthenticatedFunction<
          ReportDeviceOperationRequest,
          ReportDeviceOperationResponse
        >(
          'reportDeviceOperation',
          {
            displayId,
            operationId: entry.operationId,
            claimLeaseId: entry.claimLeaseId,
            state: newState,
            resultSummary,
            errorCode: rebootVerified ? undefined : 'REBOOT_NOT_OBSERVED',
            errorMessage: rebootVerified ? undefined : resultSummary,
          },
          this.identity
        );

        this.saveLedgerEntry({
          ...entry,
          state: newState,
          resultSummary,
          recordedAt: new Date().toISOString(),
        });
      } catch (err) {
        this.logger.warn(
          `Deferred post-reboot reconciliation for operation ${entry.operationId}:`,
          err
        );
      }
    }
  }

  /**
   * Polls, claims, and executes at most one queued operation for this digital display.
   * Respects single-flight lock and exponential backoff on transport errors.
   */
  public async pollAndExecuteNext(forceImmediate = false): Promise<DeviceOperationRecord | null> {
    if (this.inFlight) {
      return null;
    }

    const now = Date.now();
    if (!forceImmediate && now < this.nextAllowedPollMs) {
      return null;
    }

    const displayId = this.identity.getDisplayId();
    if (!displayId) return null;

    const token = await this.identity.getIdToken();
    if (!token) return null;

    this.inFlight = true;
    const transport = this.identity.getTransport();

    try {
      await this.reconcilePendingReboots();

      const claimRes = await transport.callAuthenticatedFunction<
        ClaimDeviceOperationRequest,
        ClaimDeviceOperationResponse
      >(
        'claimDeviceOperation',
        {
          displayId,
          capabilities: this.hardwareAdapter.getCapabilities(),
        },
        this.identity
      );

      this.consecutiveFailures = 0;
      this.nextAllowedPollMs = 0;

      const op = claimRes.operation;
      if (!op || !op.claimLeaseId) {
        return null;
      }

      await this.executeClaimedOperation(displayId, op, op.claimLeaseId);
      return op;
    } catch (err) {
      this.consecutiveFailures++;
      const backoffMs = Math.min(
        120_000,
        1_000 * Math.pow(2, Math.min(6, this.consecutiveFailures))
      );
      this.nextAllowedPollMs = Date.now() + backoffMs;
      this.logger.warn(
        `Device operation poll failed (backoff ${backoffMs}ms):`,
        (err as any)?.message || err
      );
      return null;
    } finally {
      this.inFlight = false;
    }
  }

  private async executeClaimedOperation(
    displayId: string,
    op: DeviceOperationRecord,
    claimLeaseId: string
  ): Promise<void> {
    const transport = this.identity.getTransport();

    // 1. Check local persistent deduplication ledger
    const existingEntry = this.getLedgerEntry(op.id);
    if (existingEntry) {
      this.logger.info(
        `Operation ${op.id} (${op.type}) found in local deduplication ledger (${existingEntry.state}); re-reporting without re-execution.`
      );
      if (existingEntry.state === 'awaiting_reconnect' && op.type === 'REBOOT') {
        // Destructive operation guard: never replay a REBOOT that was already dispatched!
        await this.reconcilePendingReboots();
        return;
      }
      await transport.callAuthenticatedFunction<
        ReportDeviceOperationRequest,
        ReportDeviceOperationResponse
      >(
        'reportDeviceOperation',
        {
          displayId,
          operationId: op.id,
          claimLeaseId,
          state: existingEntry.state,
          resultSummary: existingEntry.resultSummary,
          errorCode: existingEntry.errorCode,
          errorMessage: existingEntry.errorMessage,
        },
        this.identity
      );
      return;
    }

    // 2. Check operation expiry before starting
    if (new Date(op.expiresAt).getTime() <= Date.now()) {
      const msg = `Operation ${op.id} (${op.type}) expired at ${op.expiresAt} before execution.`;
      await this.reportAndRecord(displayId, op, claimLeaseId, {
        state: 'failed',
        errorCode: 'OPERATION_EXPIRED',
        errorMessage: msg,
      });
      return;
    }

    // 3. Report in_progress for non-reboot operations
    if (op.type !== 'REBOOT') {
      await transport.callAuthenticatedFunction<
        ReportDeviceOperationRequest,
        ReportDeviceOperationResponse
      >(
        'reportDeviceOperation',
        {
          displayId,
          operationId: op.id,
          claimLeaseId,
          state: 'in_progress',
        },
        this.identity
      );
    }

    // 4. Dispatch by operation type
    switch (op.type) {
      case 'SYNC_NOW': {
        try {
          const updated = await this.syncEngine.checkForUpdates();
          const activePub = this.syncEngine.getActivePublicationId();
          const stage = this.syncEngine.getCurrentStage();
          const lastErr = this.syncEngine.getLastError();

          if (stage === 'failed') {
            await this.reportAndRecord(displayId, op, claimLeaseId, {
              state: 'failed',
              errorCode: 'SYNC_FAILED',
              errorMessage: lastErr || 'Publication synchronization failed on digital display.',
            });
            return;
          }

          const summary = updated
            ? `Synchronized and activated publication ${activePub}.`
            : `Digital display is up to date (active publication: ${activePub || 'none'}).`;

          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'succeeded',
            resultSummary: summary,
          });
        } catch (err: any) {
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'failed',
            errorCode: 'SYNC_EXCEPTION',
            errorMessage: err?.message || 'Unexpected error during SYNC_NOW.',
          });
        }
        return;
      }

      case 'REFRESH_RENDERER': {
        const caps = this.hardwareAdapter.getCapabilities();
        if (!caps.refreshRenderer) {
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'failed',
            errorCode: 'UNSUPPORTED_CAPABILITY',
            errorMessage:
              caps.refreshRendererReason ||
              'Renderer refresh is not supported on this digital display.',
          });
          return;
        }

        const newGen = this.onRefreshRenderer();
        await this.reportAndRecord(displayId, op, claimLeaseId, {
          state: 'succeeded',
          resultSummary: `Triggered local renderer refresh (generation #${newGen}) for digital display.`,
        });
        return;
      }

      case 'SAFE_CLEANUP_CACHE': {
        try {
          const cleanupSummary = this.syncEngine.runSafeCacheCleanup();
          const summary = `Cleaned ${cleanupSummary.removedAssets} unreferenced assets, ${cleanupSummary.removedPublications} old publications, ${cleanupSummary.removedStagingDirs} staging dirs (${cleanupSummary.freedBytes} bytes freed). Active and previous packages preserved.`;
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'succeeded',
            resultSummary: summary,
            cleanupSummary,
          });
        } catch (err: any) {
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'failed',
            errorCode: 'CLEANUP_FAILED',
            errorMessage: err?.message || 'Safe cache cleanup failed.',
          });
        }
        return;
      }

      case 'CAPTURE_PREVIEW': {
        const caps = this.hardwareAdapter.getCapabilities();
        if (!caps.capturePreview) {
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'failed',
            errorCode: 'UNSUPPORTED_CAPABILITY',
            errorMessage:
              caps.capturePreviewReason ||
              'Preview capture is not supported on this digital display.',
          });
          return;
        }

        try {
          const captured = await this.hardwareAdapter.capturePreview();
          const uploadRes = await transport.callAuthenticatedFunction<
            UploadDevicePreviewRequest,
            UploadDevicePreviewResponse
          >(
            'uploadDevicePreview',
            {
              displayId,
              operationId: op.id,
              claimLeaseId,
              mimeType: captured.mimeType,
              imageBase64: captured.imageBase64,
              width: captured.width,
              height: captured.height,
              captureMethod: captured.captureMethod,
            },
            this.identity
          );

          this.saveLedgerEntry({
            operationId: op.id,
            type: op.type,
            claimLeaseId,
            state: 'succeeded',
            resultSummary:
              uploadRes.operation.resultSummary ||
              `Captured digital display software preview (${captured.sizeBytes} bytes).`,
            recordedAt: new Date().toISOString(),
          });
        } catch (err: any) {
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'failed',
            errorCode: 'CAPTURE_PREVIEW_FAILED',
            errorMessage: err?.message || 'Failed to capture or upload digital display preview.',
          });
        }
        return;
      }

      case 'REBOOT': {
        const caps = this.hardwareAdapter.getCapabilities();
        if (!caps.reboot) {
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'failed',
            errorCode: 'UNSUPPORTED_CAPABILITY',
            errorMessage:
              caps.rebootReason || 'Reboot is not supported on this digital display.',
          });
          return;
        }

        const preRebootBootId = this.hardwareAdapter.readBootId();
        const preRebootUptimeSeconds = Math.floor(os.uptime());

        // Record in persistent ledger BEFORE invoking OS reboot so it is never replayed on restart
        this.saveLedgerEntry({
          operationId: op.id,
          type: 'REBOOT',
          claimLeaseId,
          state: 'awaiting_reconnect',
          preRebootBootId,
          preRebootUptimeSeconds,
          resultSummary: 'Reboot command accepted; awaiting digital display reconnect.',
          recordedAt: new Date().toISOString(),
        });

        await transport.callAuthenticatedFunction<
          ReportDeviceOperationRequest,
          ReportDeviceOperationResponse
        >(
          'reportDeviceOperation',
          {
            displayId,
            operationId: op.id,
            claimLeaseId,
            state: 'awaiting_reconnect',
            preRebootBootId,
            preRebootUptimeSeconds,
            resultSummary:
              'Controlled OS reboot initiated; awaiting digital display reconnect and boot verification.',
          },
          this.identity
        );

        try {
          await this.hardwareAdapter.triggerReboot();
        } catch (err: any) {
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'failed',
            errorCode: 'REBOOT_EXECUTION_FAILED',
            errorMessage: err?.message || 'Controlled reboot helper failed to execute.',
          });
        }
        return;
      }
    }
  }

  private async reportAndRecord(
    displayId: string,
    op: DeviceOperationRecord,
    claimLeaseId: string,
    params: {
      state: 'succeeded' | 'failed';
      resultSummary?: string;
      errorCode?: string;
      errorMessage?: string;
      cleanupSummary?: ReportDeviceOperationRequest['cleanupSummary'];
    }
  ): Promise<void> {
    const transport = this.identity.getTransport();
    this.saveLedgerEntry({
      operationId: op.id,
      type: op.type,
      claimLeaseId,
      state: params.state,
      resultSummary: params.resultSummary,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      recordedAt: new Date().toISOString(),
    });

    await transport.callAuthenticatedFunction<
      ReportDeviceOperationRequest,
      ReportDeviceOperationResponse
    >(
      'reportDeviceOperation',
      {
        displayId,
        operationId: op.id,
        claimLeaseId,
        state: params.state,
        resultSummary: params.resultSummary,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        cleanupSummary: params.cleanupSummary,
      },
      this.identity
    );
  }
}

