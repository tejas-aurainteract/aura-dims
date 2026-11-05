/**
 * Aura DIMS - Player Process Supervision, Hardware Telemetry & Operations Dispatcher
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - Periodic publication update checks
 * - Periodic heartbeat reporting with real delivery, playback, hardware, and capability telemetry
 * - Differentiates connectivity, download readiness, active publication, and actual presentation start
 * - Durable device operation polling with immediate wakeup when heartbeat indicates pending operations
 * - Safe error backoff
 */

import * as os from 'node:os';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { DeviceIdentity } from './identity.js';
import type { SyncEngine } from './syncEngine.js';
import type { LocalServer } from './localServer.js';
import { HardwareAdapter } from './hardwareAdapter.js';
import { OperationsAgent } from './operationsAgent.js';
import type {
  DeviceHeartbeatRequest,
  DeviceHeartbeatResponse,
  StorageMetrics,
} from '@aura-dims/display-schema';

export class Supervisor {
  private config: PlayerConfig;
  private logger: Logger;
  private identity: DeviceIdentity;
  private syncEngine: SyncEngine;
  private server: LocalServer;
  private hardwareAdapter: HardwareAdapter;
  private operationsAgent: OperationsAgent;
  private syncTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    config: PlayerConfig,
    logger: Logger,
    identity: DeviceIdentity,
    syncEngine: SyncEngine,
    server: LocalServer,
    hardwareAdapter?: HardwareAdapter,
    operationsAgent?: OperationsAgent
  ) {
    this.config = config;
    this.logger = logger;
    this.identity = identity;
    this.syncEngine = syncEngine;
    this.server = server;
    this.hardwareAdapter = hardwareAdapter || new HardwareAdapter(config, logger);
    this.operationsAgent =
      operationsAgent ||
      new OperationsAgent({
        config,
        logger,
        identity,
        syncEngine,
        hardwareAdapter: this.hardwareAdapter,
        onRefreshRenderer: () => this.server.triggerRendererRefresh(),
      });
  }

  public getHardwareAdapter(): HardwareAdapter {
    return this.hardwareAdapter;
  }

  public getOperationsAgent(): OperationsAgent {
    return this.operationsAgent;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.logger.info('Starting digital display supervision timers...');

    // Initial sync check
    this.triggerSync();

    // Start periodic intervals
    this.syncTimer = setInterval(() => {
      this.triggerSync();
    }, this.config.syncIntervalMs);

    this.heartbeatTimer = setInterval(() => {
      this.triggerHeartbeat();
    }, this.config.heartbeatIntervalMs);

    // Initial heartbeat & operation check after 2s
    setTimeout(() => {
      if (this.isRunning) {
        this.triggerHeartbeat();
      }
    }, 2000);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.logger.info('Digital display supervision timers stopped.');
  }

  private triggerSync(): void {
    if (!this.identity.isEnrolled()) return;

    this.syncEngine.checkForUpdates().catch((err) => {
      this.logger.warn('Error during periodic sync check:', err?.message || err);
    });

    this.operationsAgent.pollAndExecuteNext().catch((err) => {
      this.logger.warn('Error during periodic operations poll:', err?.message || err);
    });
  }

  private getStorageMetrics(): StorageMetrics | null {
    const disk = this.hardwareAdapter.readDiskMetrics();
    if (
      disk.diskTotalBytes !== null &&
      disk.diskFreeBytes !== null &&
      disk.diskTotalBytes > 0
    ) {
      return {
        totalBytes: disk.diskTotalBytes,
        usedBytes: Math.max(0, disk.diskTotalBytes - disk.diskFreeBytes),
        freeBytes: disk.diskFreeBytes,
      };
    }
    return null;
  }

  public async triggerHeartbeat(): Promise<DeviceHeartbeatResponse | null> {
    const displayId = this.identity.getDisplayId();
    if (!displayId) return null;

    const token = await this.identity.getIdToken();
    if (!token) {
      return null;
    }

    const hardwareMetrics = this.hardwareAdapter.collectMetrics();
    const capabilities = this.hardwareAdapter.getCapabilities();
    const storage = this.getStorageMetrics();
    const playback = this.server.getPlaybackState();
    const rendererHealth = this.server.getRendererHealth();
    const cacheInventory = this.syncEngine.getCacheInventory();
    const assetProgress = this.syncEngine.getAssetProgress();

    const payload: DeviceHeartbeatRequest = {
      displayId,
      appVersion: this.config.appVersion,
      rendererVersion: this.config.rendererVersion,
      clientKind: 'player',
      diagnostics: {
        ...(hardwareMetrics.diskFreeBytes !== null
          ? { availableStorageBytes: hardwareMetrics.diskFreeBytes }
          : {}),
        uptimeSeconds: Math.floor(os.uptime()),
      },
      desiredPublicationId: this.syncEngine.getDesiredPublicationId(),
      downloadingPublicationId: this.syncEngine.getDownloadingPublicationId(),
      readyPublicationId: this.syncEngine.getReadyPublicationId(),
      activePublicationId: this.syncEngine.getActivePublicationId(),
      presentedPublicationId: playback.presentedPublicationId ?? null,
      firstPresentedAt: playback.firstPresentedAt ?? null,
      deliveryStage: this.syncEngine.getCurrentStage(),
      lastSyncAt: this.syncEngine.getLastSyncAt() || new Date().toISOString(),
      storage,
      hardwareMetrics,
      capabilities,
      assetProgress,
      cacheInventory,
      lastInventoryAt: cacheInventory.reportedAt,
      playback,
      rendererHealth,
      lastError: this.syncEngine.getLastError(),
      errorCount: this.syncEngine.getLastError() ? 1 : 0,
    };


    try {
      const transport = this.identity.getTransport();
      const response = await transport.callAuthenticatedFunction<
        DeviceHeartbeatRequest,
        DeviceHeartbeatResponse
      >('reportDeviceHeartbeat', payload, this.identity);

      if ((response.pendingOperationCount ?? 0) > 0) {
        await this.operationsAgent.pollAndExecuteNext(true);
      }
      return response;
    } catch (err: any) {
      this.logger.warn(
        'Failed to dispatch heartbeat to server (operating offline):',
        err?.message || err
      );
      return null;
    }
  }
}
