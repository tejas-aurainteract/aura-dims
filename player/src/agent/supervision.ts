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
import { WifiManager } from './wifiManager.js';
import { CaptivePortalServer } from './captivePortal.js';
import { PendingEnrollmentStore } from './pendingEnrollment.js';
import { EnrollmentWorker } from './enrollmentWorker.js';
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
  private wifiManager: WifiManager;
  private pendingEnrollmentStore: PendingEnrollmentStore;
  private enrollmentWorker: EnrollmentWorker;
  private captivePortal: CaptivePortalServer;
  private syncTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private operationsTimer: NodeJS.Timeout | null = null;
  private wifiTimer: NodeJS.Timeout | null = null;
  private consecutiveOfflineChecks = 0;
  private isRunning = false;

  constructor(
    config: PlayerConfig,
    logger: Logger,
    identity: DeviceIdentity,
    syncEngine: SyncEngine,
    server: LocalServer,
    hardwareAdapter?: HardwareAdapter,
    operationsAgent?: OperationsAgent,
    wifiManager?: WifiManager,
    pendingEnrollmentStore?: PendingEnrollmentStore
  ) {
    this.config = config;
    this.logger = logger;
    this.identity = identity;
    this.syncEngine = syncEngine;
    this.server = server;
    this.hardwareAdapter = hardwareAdapter || new HardwareAdapter(config, logger);
    this.wifiManager = wifiManager || new WifiManager(logger);
    this.pendingEnrollmentStore =
      pendingEnrollmentStore || new PendingEnrollmentStore(config.credentialsDir, logger);
    this.server.setPendingEnrollmentStore(this.pendingEnrollmentStore);

    this.operationsAgent =
      operationsAgent ||
      new OperationsAgent({
        config,
        logger,
        identity,
        syncEngine,
        hardwareAdapter: this.hardwareAdapter,
        wifiManager: this.wifiManager,
        onRefreshRenderer: () => this.server.triggerRendererRefresh(),
      });

    this.enrollmentWorker = new EnrollmentWorker({
      store: this.pendingEnrollmentStore,
      identity: this.identity,
      logger: this.logger,
      checkOnline: () => this.wifiManager.checkInternetAccess(),
      onEnrolled: () => {
        this.operationsAgent.startRealtimeListener();
        this.triggerSync();
        this.triggerHeartbeat().catch(() => {});
        this.server.triggerRendererRefresh();
      },
      onStateChange: () => {
        this.server.triggerRendererRefresh();
        const pending = this.pendingEnrollmentStore.read();
        if (!this.identity.isEnrolled() && pending?.state === 'failed_terminal') {
          setTimeout(() => {
            if (this.isRunning && !this.identity.isEnrolled()) {
              this.ensureOnboardingPortalIfNeeded('Stored pairing code failed terminally').catch(
                () => {}
              );
            }
          }, 8000);
        }
      },
    });

    this.captivePortal = new CaptivePortalServer(
      logger,
      this.wifiManager,
      this.identity,
      this.syncEngine,
      () => this.server.triggerRendererRefresh(),
      this.enrollmentWorker,
      (active) => {
        this.server.setApModeState(
          active,
          active ? this.wifiManager.getApSsid() : undefined,
          active ? this.wifiManager.getApPassword() : undefined
        );
      }
    );
  }

  public getEnrollmentWorker(): EnrollmentWorker {
    return this.enrollmentWorker;
  }

  public getPendingEnrollmentStore(): PendingEnrollmentStore {
    return this.pendingEnrollmentStore;
  }

  public getWifiManager(): WifiManager {
    return this.wifiManager;
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

    // Attach real-time Firestore listener for zero-latency wake-up (< 50ms)
    this.operationsAgent.startRealtimeListener();

    // Start store-and-forward enrollment worker (redeems stored pairing code when online)
    this.enrollmentWorker.start();

    // Initial sync check
    this.triggerSync();

    // Start periodic intervals
    this.syncTimer = setInterval(() => {
      this.triggerSync();
    }, this.config.syncIntervalMs);

    this.heartbeatTimer = setInterval(() => {
      this.triggerHeartbeat();
    }, this.config.heartbeatIntervalMs);

    // Fast-path operations checker (picks up queued operations in ~1.5s instead of 30s)
    this.operationsTimer = setInterval(() => {
      this.operationsAgent.pollAndExecuteNext().catch(() => { });
    }, 1500);

    // Initial heartbeat & operation check after 2s
    setTimeout(() => {
      if (this.isRunning) {
        this.triggerHeartbeat();
      }
    }, 2000);

    // Fast boot-time network connectivity & AP mode evaluation (after brief 5s hardware stabilization)
    setTimeout(() => {
      if (this.isRunning) {
        this.performInitialNetworkEvaluation();
      }
    }, 5000);

    // Periodic network reachability & AP fallback evaluation (every 30 seconds)
    this.wifiTimer = setInterval(() => {
      this.checkNetworkAndManageApMode();
    }, 30_000);
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
    if (this.operationsTimer) {
      clearInterval(this.operationsTimer);
      this.operationsTimer = null;
    }
    if (this.wifiTimer) {
      clearInterval(this.wifiTimer);
      this.wifiTimer = null;
    }
    this.operationsAgent.stopRealtimeListener();
    this.enrollmentWorker.stop();
    this.captivePortal.stop().catch(() => {});
    this.logger.info('Digital display supervision timers stopped.');
  }

  /**
   * Fast boot-time evaluation:
   * - If Ethernet online: suppress AP mode.
   * - If 0 saved profiles: immediately starts AP mode.
   * - If saved profiles exist: scans airwaves. If none in range: immediately starts AP mode.
   * - If in range: attempts connection in order. If all fail: starts AP mode.
   */
  private async performInitialNetworkEvaluation(): Promise<void> {
    try {
      const result = await this.wifiManager.evaluateStartupConnectivity();
      if (result.action === 'ap_mode_started') {
        this.logger.info(`[Supervisor] AP Mode activated on startup: ${result.reason}`);
        await this.captivePortal.start(80);
        this.server.setApModeState(
          true,
          this.wifiManager.getApSsid(),
          this.wifiManager.getApPassword()
        );
        this.server.triggerRendererRefresh();
      } else {
        // Digital display is online at boot -> kick store-and-forward enrollment immediately
        this.enrollmentWorker.kick(true).catch(() => {});
        // If unprovisioned with no active pending code (e.g. unpaired without keyboard),
        // expose the mobile onboarding portal so the operator can enter a pairing code.
        await this.ensureOnboardingPortalIfNeeded('Digital display is unprovisioned with no pending pairing code');
      }
    } catch (err: any) {
      this.logger.warn('[Supervisor] Error during startup network evaluation:', err?.message || err);
    }
  }

  private async ensureOnboardingPortalIfNeeded(reason: string): Promise<void> {
    if (this.identity.isEnrolled()) return;
    const pending = this.pendingEnrollmentStore.read();
    if (pending && (pending.state === 'pending' || pending.state === 'redeeming')) {
      return;
    }

    if (this.wifiManager.isApModeActive()) {
      return;
    }

    const ethOnline = await this.wifiManager.isEthernetOnline().catch(() => false);
    if (ethOnline) {
      // On Ethernet, start the portal on LAN without disrupting wired internet
      await this.captivePortal.start(80);
      this.logger.info(`[Supervisor] Onboarding portal started on LAN (${reason}).`);
      return;
    }

    this.logger.info(
      `[Supervisor] ${reason}. Activating AP Mode (SSID: "${this.wifiManager.getApSsid()}") for mobile-only onboarding...`
    );
    await this.wifiManager.startApMode();
    await this.captivePortal.start(80);
    this.server.setApModeState(
      true,
      this.wifiManager.getApSsid(),
      this.wifiManager.getApPassword()
    );
    this.server.triggerRendererRefresh();
  }

  private async checkNetworkAndManageApMode(): Promise<void> {
    // User requirement: Once the digital display enters AP mode, do NOT auto-exit or auto-reconnect
    // in the background. The digital display stays in AP mode until the user explicitly selects a network.
    if (this.wifiManager.isApModeActive()) {
      return;
    }

    try {
      const isOnline = await this.wifiManager.checkInternetAccess();

      if (isOnline) {
        const wasOffline = this.consecutiveOfflineChecks > 0;
        this.consecutiveOfflineChecks = 0;
        if (wasOffline) {
          this.enrollmentWorker.kick(true).catch(() => {});
        }
        return;
      }

      this.consecutiveOfflineChecks += 1;
      this.logger.info(
        `[Supervisor] Internet unreachable (consecutive check #${this.consecutiveOfflineChecks}).`
      );

      // Check if wired Ethernet is online (suppresses AP mode if wired connection works)
      const ethOnline = await this.wifiManager.isEthernetOnline();
      if (ethOnline) {
        this.logger.info('[Supervisor] Wired Ethernet is online. Suppressing AP mode.');
        return;
      }

      // Check saved Wi-Fi profiles
      const savedProfiles = await this.wifiManager.getSavedWifiProfiles();

      // RULE 1: If 0 saved profiles exist (unboxed or cleared) -> INSTANT AP MODE!
      if (savedProfiles.length === 0) {
        this.logger.warn(
          `[Supervisor] Zero saved Wi-Fi profiles found. Instantly activating AP Mode (SSID: "${this.wifiManager.getApSsid()}")...`
        );
        await this.wifiManager.startApMode();
        await this.captivePortal.start(80);
        this.server.setApModeState(
          true,
          this.wifiManager.getApSsid(),
          this.wifiManager.getApPassword()
        );
        this.server.triggerRendererRefresh();
        return;
      }

      // RULE 2: If saved profiles exist, check if ANY are detected in the airwaves
      const scanned = await this.wifiManager.scanNetworks();
      const scannedSsids = new Set(scanned.map((s) => s.ssid));
      const anySavedInRange = savedProfiles.some((p) => scannedSsids.has(p));

      if (!anySavedInRange) {
        this.logger.warn(
          `[Supervisor] None of the ${savedProfiles.length} saved Wi-Fi profile(s) detected in airwaves. Instantly activating AP Mode...`
        );
        await this.wifiManager.startApMode();
        await this.captivePortal.start(80);
        this.server.setApModeState(
          true,
          this.wifiManager.getApSsid(),
          this.wifiManager.getApPassword()
        );
        this.server.triggerRendererRefresh();
        return;
      }

      // RULE 3: Saved profiles ARE in the airwaves -> allow up to 2 failed checks for NetworkManager reconnect
      if (this.consecutiveOfflineChecks >= 2) {
        this.logger.warn(
          `[Supervisor] Reconnection to in-range profiles failed after grace period. Activating AP Mode...`
        );
        await this.wifiManager.startApMode();
        await this.captivePortal.start(80);
        this.server.setApModeState(
          true,
          this.wifiManager.getApSsid(),
          this.wifiManager.getApPassword()
        );
        this.server.triggerRendererRefresh();
      }
    } catch (err: any) {
      this.logger.warn('[Supervisor] Error checking network status:', err?.message || err);
    }
  }

  private triggerSync(): void {
    if (!this.identity.isEnrolled()) return;

    this.syncEngine.checkForUpdates().catch((err: any) => {
      this.logger.warn('Error during periodic sync check:', err?.message || err);
    });

    this.operationsAgent.pollAndExecuteNext().catch((err: any) => {
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
