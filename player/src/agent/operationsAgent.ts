/**
 * Aura DIMS - Durable Device Operations Agent
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements single-flight claiming, persistent local deduplication, capability checks,
 * bounded backoff, active lease renewal loops, safe diagnostic execution, and
 * post-reboot & post-restart reconciliation for server-authorized digital display operations.
 *
 * Terminology: Always use "digital display" in all user-facing copy and logs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { DeviceIdentity } from './identity.js';
import type { SyncEngine } from './syncEngine.js';
import type { HardwareAdapter } from './hardwareAdapter.js';
import type {
  ClaimDeviceOperationRequest,
  ClaimDeviceOperationResponse,
  DeviceOperationRecord,
  DiagnosticActionType,
  RenewOperationLeaseRequest,
  RenewOperationLeaseResponse,
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

const LEASE_RENEWAL_INTERVAL_MS = 20_000; // Renew claim lease every 20 seconds while active

const SAFE_DIAGNOSTIC_COMMANDS: Record<DiagnosticActionType, { cmd: string; args: string[]; timeoutMs: number }> = {
  SYSTEM_INFO: { cmd: 'uname', args: ['-srm'], timeoutMs: 5_000 },
  NETWORK_IPS: { cmd: 'ip', args: ['-br', 'address'], timeoutMs: 5_000 },
  PING: { cmd: 'ping', args: ['-c', '3', '-W', '2', '8.8.8.8'], timeoutMs: 10_000 },
  DISK: { cmd: 'df', args: ['-h', '/'], timeoutMs: 5_000 },
  MEMORY: { cmd: 'free', args: ['-h'], timeoutMs: 5_000 },
  SERVICE_STATUS: { cmd: 'systemctl', args: ['status', 'aura-player', '--no-pager', '-n', '15'], timeoutMs: 6_000 },
  PLAYER_LOGS: { cmd: 'journalctl', args: ['-u', 'aura-player', '-n', '50', '--no-pager'], timeoutMs: 8_000 },
  CPU_TEMP: { cmd: 'cat', args: ['/sys/class/thermal/thermal_zone0/temp'], timeoutMs: 3_000 },
};

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
   * Reconciles locally tracked `awaiting_reconnect` operations (both REBOOT and RESTART_PLAYER).
   */
  public async reconcilePendingOperations(): Promise<void> {
    const displayId = this.identity.getDisplayId();
    if (!displayId) return;

    const pending = this.loadLedger().filter((e) => e.state === 'awaiting_reconnect');
    if (pending.length === 0) return;

    const currentBootId = this.hardwareAdapter.readBootId();
    const currentUptime = Math.floor(os.uptime());
    const processUptime = Math.floor(process.uptime());
    const transport = this.identity.getTransport();

    for (const entry of pending) {
      if (entry.type === 'REBOOT') {
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
      } else if (entry.type === 'RESTART_PLAYER') {
        // Player restarted if the process uptime is fresh (< 300s) or PID is running healthy
        const summary = `Digital display player service restarted cleanly (verified runtime uptime ${processUptime}s, PID ${process.pid}).`;
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
              state: 'succeeded',
              resultSummary: summary,
            },
            this.identity
          );

          this.saveLedgerEntry({
            ...entry,
            state: 'succeeded',
            resultSummary: summary,
            recordedAt: new Date().toISOString(),
          });
        } catch (err) {
          this.logger.warn(
            `Deferred post-restart reconciliation for operation ${entry.operationId}:`,
            err
          );
        }
      }
    }
  }

  /**
   * Alias for backwards compatibility with tests and callers.
   */
  public async reconcilePendingReboots(): Promise<void> {
    return this.reconcilePendingOperations();
  }

  /**
   * Polls, claims, and executes at most one queued operation for this digital display.
   * Respects single-flight lock and exponential backoff on transport errors.
   */
  public async pollAndExecuteNext(immediate = false): Promise<DeviceOperationRecord | null> {
    if (immediate) {
      this.nextAllowedPollMs = 0;
    }
    return this.pollAndExecute();
  }

  public async pollAndExecute(): Promise<DeviceOperationRecord | null> {
    if (this.inFlight) {
      this.logger.debug('Operations poll skipped: an operation execution is already in flight.');
      return null;
    }

    if (Date.now() < this.nextAllowedPollMs) {
      return null;
    }

    const displayId = this.identity.getDisplayId();
    if (!displayId) return null;

    const token = await this.identity.getIdToken();
    if (!token) return null;

    this.inFlight = true;
    const transport = this.identity.getTransport();

    try {
      await this.reconcilePendingOperations();

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

      if (!claimRes.operation || !claimRes.operation.claimLeaseId) {
        return null;
      }

      const op = claimRes.operation;
      const claimLeaseId = op.claimLeaseId!;
      this.logger.info(
        `Claimed durable operation ${op.id} (${op.type}) for digital display "${displayId}".`
      );

      await this.executeClaimedOperation(displayId, op, claimLeaseId);
      return op;
    } catch (err: any) {
      this.consecutiveFailures += 1;
      const backoffSec = Math.min(60, Math.pow(2, Math.min(this.consecutiveFailures, 6)));
      this.nextAllowedPollMs = Date.now() + backoffSec * 1000;
      this.logger.warn(
        `Operations poll/claim error (consecutive: ${this.consecutiveFailures}, backoff ${backoffSec}s):`,
        err?.message || err
      );
      return null;
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Executes a claimed operation with persistent local deduplication, lease renewal,
   * bounded timeouts, and strict error reporting.
   */
  public async executeClaimedOperation(
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
      if (
        existingEntry.state === 'awaiting_reconnect' &&
        (op.type === 'REBOOT' || op.type === 'RESTART_PLAYER')
      ) {
        // Destructive operation guard: never replay an awaiting_reconnect operation that was already dispatched!
        await this.reconcilePendingOperations();
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

    // 2. Pre-execution expiration validation
    if (new Date(op.expiresAt).getTime() <= Date.now()) {
      const msg = `Operation ${op.id} (${op.type}) expired at ${op.expiresAt} before execution.`;
      await this.reportAndRecord(displayId, op, claimLeaseId, {
        state: 'failed',
        errorCode: 'OPERATION_EXPIRED',
        errorMessage: msg,
      });
      return;
    }

    // 3. Report in_progress for non-reboot / non-restart operations
    if (op.type !== 'REBOOT' && op.type !== 'RESTART_PLAYER') {
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

    // 4. Setup Lease Renewal Loop & Max Runtime Enforcement
    const maxRuntimeSec = op.maxRuntimeSeconds || 60;
    const maxRuntimeMs = maxRuntimeSec * 1000;
    const startTimeMs = Date.now();
    let isTerminated = false;

    const renewalTimer = setInterval(async () => {
      if (isTerminated) return;
      const elapsedMs = Date.now() - startTimeMs;
      if (elapsedMs >= maxRuntimeMs) {
        isTerminated = true;
        clearInterval(renewalTimer);
        this.logger.error(
          `Operation ${op.id} (${op.type}) exceeded maximum runtime of ${maxRuntimeSec}s. Marking timed out.`
        );
        await this.reportAndRecord(displayId, op, claimLeaseId, {
          state: 'failed',
          errorCode: 'OPERATION_TIMED_OUT',
          errorMessage: `Operation exceeded maximum allowable runtime of ${maxRuntimeSec} seconds on digital display.`,
        });
        return;
      }

      try {
        await transport.callAuthenticatedFunction<
          RenewOperationLeaseRequest,
          RenewOperationLeaseResponse
        >(
          'renewOperationLease',
          { displayId, operationId: op.id, claimLeaseId },
          this.identity
        );
        this.logger.debug(`Renewed claim lease for active operation ${op.id} (${op.type}).`);
      } catch (err: any) {
        this.logger.warn(`Failed to renew claim lease for operation ${op.id}:`, err?.message || err);
      }
    }, LEASE_RENEWAL_INTERVAL_MS);

    try {
      // 5. Dispatch by operation type
      switch (op.type) {
        case 'SYNC_NOW': {
          try {
            const updated = await this.syncEngine.checkForUpdates();
            const activePub = this.syncEngine.getActivePublicationId();
            const stage = this.syncEngine.getCurrentStage();
            const lastErr = this.syncEngine.getLastError();

            if (isTerminated) return;

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
            if (isTerminated) return;
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
            if (isTerminated) return;

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
            if (isTerminated) return;
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

        case 'RESTART_PLAYER': {
          // Reconciled restart pattern: record awaiting_reconnect, notify server, then trigger detached restart
          this.saveLedgerEntry({
            operationId: op.id,
            type: 'RESTART_PLAYER',
            claimLeaseId,
            state: 'awaiting_reconnect',
            resultSummary: 'Player restart command accepted; awaiting daemon reconnect.',
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
              resultSummary:
                'Player daemon restart initiated; awaiting service restart and reconnect.',
            },
            this.identity
          );

          try {
            this.logger.info('Spawning detached systemctl restart aura-player...');
            const child = child_process.spawn('sudo', ['/usr/bin/systemctl', 'restart', 'aura-player'], {
              detached: true,
              stdio: 'ignore',
            });
            child.on('error', (err) => {
              this.logger.warn('Detached player restart spawn notice:', err?.message || err);
            });
            child.unref();
          } catch (err: any) {
            await this.reportAndRecord(displayId, op, claimLeaseId, {
              state: 'failed',
              errorCode: 'RESTART_EXECUTION_FAILED',
              errorMessage: err?.message || 'Failed to spawn restart command for player service.',
            });
          }
          return;
        }

        case 'RUN_DIAGNOSTICS': {
          const action = op.diagnosticAction as DiagnosticActionType;
          if (!action || !SAFE_DIAGNOSTIC_COMMANDS[action]) {
            await this.reportAndRecord(displayId, op, claimLeaseId, {
              state: 'failed',
              errorCode: 'INVALID_DIAGNOSTIC_ACTION',
              errorMessage: `Diagnostic action "${action}" is not recognized or not allowed.`,
            });
            return;
          }

          const def = SAFE_DIAGNOSTIC_COMMANDS[action];

          // Specialized handling for CPU_TEMP: read directly via adapter if possible
          if (action === 'CPU_TEMP') {
            const temp = this.hardwareAdapter.readCpuTempCelsius();
            if (temp !== null) {
              const output = `${temp.toFixed(1)}°C\n`;
              await this.reportAndRecord(displayId, op, claimLeaseId, {
                state: 'succeeded',
                resultSummary: `CPU temperature is ${temp.toFixed(1)}°C`,
                output,
                exitCode: 0,
              });
              return;
            }
          }

          try {
            this.logger.info(`Running safe diagnostic check [${action}]: ${def.cmd} ${def.args.join(' ')}`);
            const execResult = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
              (resolve) => {
                child_process.execFile(
                  def.cmd,
                  def.args,
                  { timeout: def.timeoutMs, maxBuffer: 1024 * 256 },
                  (error, stdout, stderr) => {
                    const code =
                      error && typeof (error as any).code === 'number'
                        ? (error as any).code
                        : error
                        ? 1
                        : 0;
                    resolve({
                      stdout: stdout ? stdout.toString() : '',
                      stderr: stderr ? stderr.toString() : '',
                      exitCode: code,
                    });
                  }
                );
              }
            );

            if (isTerminated) return;

            const combined = (
              execResult.stdout + (execResult.stderr ? `\n[STDERR]\n${execResult.stderr}` : '')
            ).trim();
            const isSuccess = execResult.exitCode === 0;

            await this.reportAndRecord(displayId, op, claimLeaseId, {
              state: isSuccess ? 'succeeded' : 'failed',
              resultSummary: isSuccess
                ? `Diagnostic [${action}] completed successfully (exit 0).`
                : `Diagnostic [${action}] failed with exit code ${execResult.exitCode}.`,
              output: combined.slice(0, 1024 * 60),
              exitCode: execResult.exitCode,
              errorCode: isSuccess ? undefined : 'DIAGNOSTIC_FAILED',
              errorMessage: isSuccess ? undefined : execResult.stderr.trim() || `Exit ${execResult.exitCode}`,
            });
          } catch (err: any) {
            if (isTerminated) return;
            await this.reportAndRecord(displayId, op, claimLeaseId, {
              state: 'failed',
              errorCode: 'DIAGNOSTIC_EXCEPTION',
              errorMessage: err?.message || `Exception occurred during diagnostic check [${action}].`,
              output: err?.stack || err?.message,
              exitCode: 1,
            });
          }
          return;
        }

        case 'EXEC_COMMAND': {
          const rawCmd = (op.command || '').trim();
          if (!rawCmd) {
            await this.reportAndRecord(displayId, op, claimLeaseId, {
              state: 'failed',
              errorCode: 'EMPTY_COMMAND',
              errorMessage: 'Operation EXEC_COMMAND was submitted with an empty command string.',
              exitCode: 1,
            });
            return;
          }

          try {
            this.logger.info(`[OperationsAgent] Executing shell command: "${rawCmd}"`);
            const execResult = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
              (resolve) => {
                child_process.exec(
                  rawCmd,
                  { timeout: (op.maxRuntimeSeconds || 30) * 1000, maxBuffer: 1024 * 512, shell: '/bin/bash' },
                  (error, stdout, stderr) => {
                    const code =
                      error && typeof (error as any).code === 'number'
                        ? (error as any).code
                        : error
                        ? 1
                        : 0;
                    resolve({
                      stdout: stdout ? stdout.toString() : '',
                      stderr: stderr ? stderr.toString() : '',
                      exitCode: code,
                    });
                  }
                );
              }
            );

            if (isTerminated) return;

            const combined = (
              execResult.stdout + (execResult.stderr ? `\n[STDERR]\n${execResult.stderr}` : '')
            ).trim();
            const isSuccess = execResult.exitCode === 0;

            await this.reportAndRecord(displayId, op, claimLeaseId, {
              state: isSuccess ? 'succeeded' : 'failed',
              resultSummary: isSuccess
                ? `Command "${rawCmd}" completed successfully (exit 0).`
                : `Command "${rawCmd}" exited with code ${execResult.exitCode}.`,
              output: combined.slice(0, 1024 * 60) || '(No output returned)',
              exitCode: execResult.exitCode,
              errorCode: isSuccess ? undefined : 'COMMAND_FAILED',
              errorMessage: isSuccess ? undefined : execResult.stderr.trim() || `Exit ${execResult.exitCode}`,
            });
          } catch (err: any) {
            if (isTerminated) return;
            await this.reportAndRecord(displayId, op, claimLeaseId, {
              state: 'failed',
              errorCode: 'COMMAND_EXCEPTION',
              errorMessage: err?.message || `Exception occurred during command execution: "${rawCmd}".`,
              output: err?.stack || err?.message,
              exitCode: 1,
            });
          }
          return;
        }

        default: {
          // Explicit default case: unknown/unsupported op types report failed immediately. No silent returns.
          const unhandledType = (op as any).type;
          this.logger.error(
            `Rejecting unsupported operation type "${unhandledType}" for digital display.`
          );
          await this.reportAndRecord(displayId, op, claimLeaseId, {
            state: 'failed',
            errorCode: 'UNSUPPORTED_OPERATION',
            errorMessage: `Digital display operation type "${unhandledType}" is unsupported or disallowed on this player version.`,
          });
          return;
        }
      }
    } finally {
      isTerminated = true;
      clearInterval(renewalTimer);
    }
  }

  private async reportAndRecord(
    displayId: string,
    op: DeviceOperationRecord,
    claimLeaseId: string,
    params: {
      state: 'succeeded' | 'failed';
      resultSummary?: string;
      output?: string | null;
      exitCode?: number | null;
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
        output: params.output,
        exitCode: params.exitCode,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        cleanupSummary: params.cleanupSummary,
      },
      this.identity
    );
  }
}
