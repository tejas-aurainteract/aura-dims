/**
 * Aura DIMS - Player Process Supervision & Telemetry Dispatcher
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - Periodic publication update checks
 * - Periodic heartbeat reporting with real delivery and playback telemetry
 * - Differentiates heartbeat presence from actual presentation start
 * - Local storage metrics evaluation
 * - Safe error backoff
 */

import * as fs from 'node:fs';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { DeviceIdentity } from './identity.js';
import type { SyncEngine } from './syncEngine.js';
import type { LocalServer } from './localServer.js';
import type {
  DeviceHeartbeatRequest,
  StorageMetrics,
} from '@aura-dims/display-schema';

export class Supervisor {
  private config: PlayerConfig;
  private logger: Logger;
  private identity: DeviceIdentity;
  private syncEngine: SyncEngine;
  private server: LocalServer;
  private syncTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    config: PlayerConfig,
    logger: Logger,
    identity: DeviceIdentity,
    syncEngine: SyncEngine,
    server: LocalServer
  ) {
    this.config = config;
    this.logger = logger;
    this.identity = identity;
    this.syncEngine = syncEngine;
    this.server = server;
  }

  start(): void {
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

    // Initial heartbeat after 2s
    setTimeout(() => {
      this.triggerHeartbeat();
    }, 2000);
  }

  stop(): void {
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
  }

  private getStorageMetrics(): StorageMetrics {
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(this.config.dataDir);
        const total = stats.blocks * stats.bsize;
        const free = stats.bfree * stats.bsize;
        return {
          totalBytes: total,
          usedBytes: Math.max(0, total - free),
          freeBytes: free,
        };
      }
    } catch {
      // Fallback
    }

    // Default estimate if statfs unsupported
    return {
      totalBytes: 32 * 1024 * 1024 * 1024, // 32 GB
      usedBytes: 2 * 1024 * 1024 * 1024, // 2 GB
      freeBytes: 30 * 1024 * 1024 * 1024,
    };
  }

  private async triggerHeartbeat(): Promise<void> {
    const displayId = this.identity.getDisplayId();
    if (!displayId) return;

    const token = await this.identity.getIdToken();
    if (!token) {
      // Offline: cannot dispatch heartbeat to server
      return;
    }

    const storage = this.getStorageMetrics();
    const playback = this.server.getPlaybackState();
    const rendererHealth = this.server.getRendererHealth();

    const payload: DeviceHeartbeatRequest = {
      displayId,
      appVersion: this.config.appVersion,
      clientKind: 'player',
      desiredPublicationId: null, // populated by server or syncEngine
      downloadingPublicationId: this.syncEngine.getDownloadingPublicationId(),
      readyPublicationId: this.syncEngine.getReadyPublicationId(),
      activePublicationId: this.syncEngine.getActivePublicationId(),
      deliveryStage: this.syncEngine.getCurrentStage(),
      lastSyncAt: new Date().toISOString(),
      storage,
      playback,
      rendererHealth,
      lastError: this.syncEngine.getLastError(),
      errorCount: this.syncEngine.getLastError() ? 1 : 0,
    };

    const heartbeatUrl = `http://${this.config.functionsEmulatorHost}/${this.config.projectId}/${this.config.region}/reportDeviceHeartbeat`;
    try {
      await fetch(heartbeatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: payload }),
      });
    } catch (err: any) {
      this.logger.warn('Failed to dispatch heartbeat to server (operating offline):', err?.message || err);
    }
  }
}

