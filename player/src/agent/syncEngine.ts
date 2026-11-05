/**
 * Aura DIMS - Package Synchronization & Verification Engine
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - State machine: Discovered -> Downloading -> Verifying -> Ready -> Active -> (Failed)
 * - Strict limits: package size, file count, max file size, free disk space
 * - Streamed .part file downloads with fsync, size check, and SHA-256 verification before activation
 * - Automatic signed asset URL renewal on 401/403 during download
 * - Feature & orientation compatibility enforcement before staging
 * - Stale revision race check before atomic pointer switch
 * - Previous working package retention for instant rollback
 * - Content-addressable file caching with reference tracking, inventory telemetry, and safe GC
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { DeviceIdentity } from './identity.js';
import type { HardwareAdapter } from './hardwareAdapter.js';
import {
  checkDevicePublicationCompatibility,
  type AssetTransferProgress,
  type CacheInventoryItem,
  type CacheInventorySummary,
  type CacheReferenceKind,
  type DetailedPublicationManifest,
  type DisplayOrientation,
  type GetDevicePublicationManifestRequest,
  type GetDevicePublicationManifestResponse,
  type GetDevicePublicationRequest,
  type GetDevicePublicationResponse,
  type PackageDeliveryStage,
  type ReportDeviceDeliveryRequest,
  type ReportDeviceDeliveryResponse,
} from '@aura-dims/display-schema';

export interface ActivePackagePointer {
  publicationId: string;
  displayId: string;
  activatedAt: string;
  manifestPath: string;
  assetsDir: string;
}

export interface SafeCacheCleanupResult {
  removedPublications: number;
  removedAssets: number;
  removedStagingDirs: number;
  removedPartFiles: number;
  freedBytes: number;
}

export class SyncEngine {
  private config: PlayerConfig;
  private logger: Logger;
  private identity: DeviceIdentity;
  private hardwareAdapter?: HardwareAdapter;
  private activePointerPath: string;
  private previousPointerPath: string;
  private currentStage: PackageDeliveryStage = 'idle';
  private desiredPublicationId: string | null = null;
  private downloadingPublicationId: string | null = null;
  private readyPublicationId: string | null = null;
  private activePublicationId: string | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private assetProgressMap: Map<string, AssetTransferProgress> = new Map();
  private syncInFlight = false;

  constructor(
    config: PlayerConfig,
    logger: Logger,
    identity: DeviceIdentity,
    hardwareAdapter?: HardwareAdapter
  ) {
    this.config = config;
    this.logger = logger;
    this.identity = identity;
    this.hardwareAdapter = hardwareAdapter;

    // Ensure all directories exist
    [
      config.packagesDir,
      config.stagingDir,
      config.versionsDir,
      config.cacheDir,
    ].forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    this.activePointerPath = path.join(config.packagesDir, 'active.json');
    this.previousPointerPath = path.join(config.packagesDir, 'previous.json');

    // Load active package pointer if exists
    const active = this.getActivePackage();
    if (active) {
      this.activePublicationId = active.publicationId;
      this.desiredPublicationId = active.publicationId;
      this.currentStage = 'active';
      this.populateActiveAssetProgress(active);
      this.logger.info(`Loaded existing active publication package: ${active.publicationId}`);
    }
  }

  public getCurrentStage(): PackageDeliveryStage {
    return this.currentStage;
  }

  public getDesiredPublicationId(): string | null {
    return this.desiredPublicationId;
  }

  public getDownloadingPublicationId(): string | null {
    return this.downloadingPublicationId;
  }

  public getReadyPublicationId(): string | null {
    return this.readyPublicationId;
  }

  public getActivePublicationId(): string | null {
    return this.activePublicationId;
  }

  public getLastSyncAt(): string | null {
    return this.lastSyncAt;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public getAssetProgress(): AssetTransferProgress[] {
    return Array.from(this.assetProgressMap.values()).slice(0, 100);
  }

  public getActivePackage(): ActivePackagePointer | null {
    if (!fs.existsSync(this.activePointerPath)) return null;
    try {
      const raw = fs.readFileSync(this.activePointerPath, 'utf8');
      return JSON.parse(raw) as ActivePackagePointer;
    } catch {
      return null;
    }
  }

  public getPreviousPackage(): ActivePackagePointer | null {
    if (!fs.existsSync(this.previousPointerPath)) return null;
    try {
      const raw = fs.readFileSync(this.previousPointerPath, 'utf8');
      return JSON.parse(raw) as ActivePackagePointer;
    } catch {
      return null;
    }
  }

  public loadActiveManifest(): DetailedPublicationManifest | null {
    const active = this.getActivePackage();
    if (!active || !fs.existsSync(active.manifestPath)) return null;
    try {
      const raw = fs.readFileSync(active.manifestPath, 'utf8');
      return JSON.parse(raw) as DetailedPublicationManifest;
    } catch (err) {
      this.logger.error('Failed to parse active manifest:', err);
      return null;
    }
  }

  private populateActiveAssetProgress(pointer: ActivePackagePointer): void {
    try {
      if (!fs.existsSync(pointer.manifestPath)) return;
      const manifest = JSON.parse(
        fs.readFileSync(pointer.manifestPath, 'utf8')
      ) as DetailedPublicationManifest;
      const now = pointer.activatedAt || new Date().toISOString();
      this.assetProgressMap.clear();
      for (const a of manifest.assets || []) {
        this.assetProgressMap.set(a.assetId, {
          publicationId: pointer.publicationId,
          assetId: a.assetId,
          fileName: a.fileName || a.assetId,
          sizeBytes: a.fileSizeBytes,
          bytesTransferred: a.fileSizeBytes,
          progressPercent: 100,
          checksumSha256: a.checksumSha256.toLowerCase(),
          verifiedChecksumSha256: a.checksumSha256.toLowerCase(),
          stage: 'ready',
          fromCache: true,
          updatedAt: now,
          errorMessage: null,
        });
      }
    } catch {
      // Ignore error loading initial progress snapshot
    }
  }

  public computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  private async reportDeliveryStage(
    displayId: string,
    publicationId: string,
    stage: PackageDeliveryStage,
    checksumSha256?: string,
    errorMessage?: string
  ): Promise<void> {
    this.currentStage = stage;
    if (errorMessage) {
      this.lastError = errorMessage;
    } else if (stage === 'active') {
      this.lastError = null;
    }


    try {
      const transport = this.identity.getTransport();
      await transport.callAuthenticatedFunction<
        ReportDeviceDeliveryRequest,
        ReportDeviceDeliveryResponse
      >(
        'reportDeviceDelivery',
        {
          displayId,
          publicationId,
          stage,
          checksumSha256,
          errorMessage,
          assetProgress: this.getAssetProgress(),
          cacheInventory: this.getCacheInventory(),
        },
        this.identity
      );
    } catch (err) {
      this.logger.warn(`Failed to report delivery stage ${stage} to server:`, err);
    }
  }

  /**
   * Main sync routine: checks server for desired publication and orchestrates download and activation.
   */
  public async checkForUpdates(): Promise<boolean> {
    if (this.syncInFlight) {
      this.logger.info('Publication sync already in progress; skipping concurrent trigger.');
      return false;
    }

    const displayId = this.identity.getDisplayId();
    if (!displayId) return false;

    const token = await this.identity.getIdToken();
    if (!token) {
      this.logger.warn(
        'Cannot check for publication updates: digital display is offline or unauthenticated.'
      );
      return false;
    }

    const transport = this.identity.getTransport();
    let pubInfo: GetDevicePublicationResponse;
    try {
      pubInfo = await transport.callAuthenticatedFunction<
        GetDevicePublicationRequest,
        GetDevicePublicationResponse
      >('getDevicePublication', { displayId }, this.identity);
      this.lastSyncAt = new Date().toISOString();
    } catch (err) {
      this.logger.warn(
        'Failed to contact server for publication check (operating offline):',
        err
      );
      return false;
    }

    const desiredPubId = pubInfo.desiredPublicationId;
    this.desiredPublicationId = desiredPubId;

    if (!desiredPubId) {
      this.logger.info('No desired publication assigned to this digital display.');
      return false;
    }

    if (desiredPubId === this.activePublicationId) {
      return false;
    }

    this.logger.info(`Discovered new desired publication version: ${desiredPubId}`);
    return this.synchronizePublication(displayId, desiredPubId, token, pubInfo.orientation);
  }

  private async fetchManifestAndUrls(
    displayId: string,
    publicationId: string
  ): Promise<GetDevicePublicationManifestResponse> {
    const transport = this.identity.getTransport();
    return transport.callAuthenticatedFunction<
      GetDevicePublicationManifestRequest,
      GetDevicePublicationManifestResponse
    >('getDevicePublicationManifest', { displayId, publicationId }, this.identity);
  }

  /**
   * Streams an asset URL to a unique .part file, flushes with fsync, verifies size and SHA-256,
   * and atomically renames into place. Ported from verified hardware agent patterns.
   */
  private async downloadVerifiedAsset(params: {
    publicationId: string;
    assetId: string;
    fileName: string;
    expectedSizeBytes: number;
    expectedSha256: string;
    downloadUrl: string;
    destPath: string;
    cachePath: string;
  }): Promise<void> {
    const {
      publicationId,
      assetId,
      fileName,
      expectedSizeBytes,
      expectedSha256,
      downloadUrl,
      destPath,
      cachePath,
    } = params;

    const transport = this.identity.getTransport();
    transport.validateAssetDownloadUrl(downloadUrl);

    const partPath = `${destPath}.${crypto.randomUUID()}.part`;
    let fileHandle: fs.promises.FileHandle | null = null;

    const updateProgress = (
      stage: AssetTransferProgress['stage'],
      bytesTransferred: number,
      verifiedSha: string | null = null,
      errorMessage: string | null = null
    ) => {
      const pct =
        expectedSizeBytes > 0
          ? Math.min(100, Math.round((bytesTransferred / expectedSizeBytes) * 100))
          : stage === 'ready'
            ? 100
            : 0;
      this.assetProgressMap.set(assetId, {
        publicationId,
        assetId,
        fileName,
        sizeBytes: expectedSizeBytes,
        bytesTransferred,
        progressPercent: pct,
        checksumSha256: expectedSha256.toLowerCase(),
        verifiedChecksumSha256: verifiedSha,
        stage,
        fromCache: false,
        updatedAt: new Date().toISOString(),
        errorMessage,
      });
    };

    updateProgress('downloading', 0);

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        const statusErr = new Error(`HTTP ${res.status} downloading asset ${assetId}`);
        (statusErr as any).statusCode = res.status;
        throw statusErr;
      }

      fileHandle = await fs.promises.open(partPath, 'w', 0o644);
      const hash = crypto.createHash('sha256');
      let bytesWritten = 0;

      if (res.body) {
        const nodeStream = Readable.fromWeb(res.body as any);
        for await (const chunk of nodeStream) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytesWritten += buf.length;
          if (bytesWritten > this.config.maxFileSizeBytes) {
            throw new Error(
              `Asset ${assetId} stream exceeded maxFileSizeBytes (${this.config.maxFileSizeBytes} B)`
            );
          }
          hash.update(buf);
          await fileHandle.write(buf);
          updateProgress('downloading', bytesWritten);
        }
      } else {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        bytesWritten = buf.length;
        if (bytesWritten > this.config.maxFileSizeBytes) {
          throw new Error(
            `Asset ${assetId} exceeded maxFileSizeBytes (${this.config.maxFileSizeBytes} B)`
          );
        }
        hash.update(buf);
        await fileHandle.write(buf);
        updateProgress('downloading', bytesWritten);
      }

      updateProgress('verifying', bytesWritten);
      await fileHandle.sync();
      await fileHandle.close();
      fileHandle = null;

      if (expectedSizeBytes > 0 && bytesWritten !== expectedSizeBytes) {
        throw new Error(
          `Size mismatch for asset ${assetId}: expected ${expectedSizeBytes} B, downloaded ${bytesWritten} B`
        );
      }

      const computedSha = hash.digest('hex').toLowerCase();
      if (computedSha !== expectedSha256.toLowerCase()) {
        throw new Error(
          `Integrity check failed for asset ${assetId}: expected ${expectedSha256.toLowerCase()}, got ${computedSha}`
        );
      }

      // Atomic move from .part to staged destination
      fs.renameSync(partPath, destPath);

      // Populate content-addressable cache atomically
      if (!fs.existsSync(cachePath)) {
        const cacheTmp = `${cachePath}.${crypto.randomUUID()}.part`;
        fs.copyFileSync(destPath, cacheTmp);
        fs.renameSync(cacheTmp, cachePath);
      }

      updateProgress('ready', bytesWritten, computedSha, null);
    } catch (err: any) {
      if (fileHandle) {
        try {
          await fileHandle.close();
        } catch {
          // Ignore close error
        }
      }
      try {
        if (fs.existsSync(partPath)) {
          fs.unlinkSync(partPath);
        }
      } catch {
        // Ignore unlink error
      }
      updateProgress('failed', 0, null, err?.message || String(err));
      throw err;
    }
  }

  /**
   * Downloads, validates, and atomically switches to a new publication version.
   */
  public async synchronizePublication(
    displayId: string,
    publicationId: string,
    _token?: string,
    expectedOrientation?: DisplayOrientation
  ): Promise<boolean> {
    this.syncInFlight = true;
    this.downloadingPublicationId = publicationId;
    this.desiredPublicationId = publicationId;

    try {
      await this.reportDeliveryStage(displayId, publicationId, 'downloading');

      // 1. Fetch publication manifest & authorized asset URLs
      let manifest: DetailedPublicationManifest;
      let assetUrls: Record<string, string>;

      try {
        const fetched = await this.fetchManifestAndUrls(displayId, publicationId);
        manifest = fetched.manifest;
        assetUrls = fetched.assetUrls;
      } catch (err: any) {
        const msg = `Exception fetching publication manifest: ${err?.message || err}`;
        this.logger.error(msg);
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, msg);
        return false;
      }

      // 2. Enforce feature & orientation compatibility before staging
      const capabilities = this.hardwareAdapter?.getCapabilities() || null;
      const targetOrientation = expectedOrientation || manifest.orientation;
      const compat = checkDevicePublicationCompatibility(
        manifest,
        targetOrientation,
        capabilities
      );
      if (!compat.compatible) {
        const err = `Publication ${publicationId} rejected due to incompatibility: ${compat.reasons.join(' ')}`;
        this.logger.error(err);
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
        return false;
      }

      // 3. Enforce package limits & free disk space
      const assets = manifest.assets || [];
      if (assets.length > this.config.maxFileCount) {
        const err = `Package file count (${assets.length}) exceeds safety limit (${this.config.maxFileCount})`;
        this.logger.error(err);
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
        return false;
      }

      let totalSizeBytes = 0;
      for (const a of assets) {
        if (a.fileSizeBytes > this.config.maxFileSizeBytes) {
          const err = `Asset ${a.assetId} size (${a.fileSizeBytes} B) exceeds maximum file size limit (${this.config.maxFileSizeBytes} B)`;
          this.logger.error(err);
          await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
          return false;
        }
        totalSizeBytes += a.fileSizeBytes;
      }

      if (totalSizeBytes > this.config.maxPackageSizeBytes) {
        const err = `Total package size (${totalSizeBytes} B) exceeds maximum limit (${this.config.maxPackageSizeBytes} B)`;
        this.logger.error(err);
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
        return false;
      }

      if (this.hardwareAdapter) {
        const disk = this.hardwareAdapter.readDiskMetrics();
        const requiredFreeBytes = totalSizeBytes + this.config.minFreeDiskBytes;
        if (disk.diskFreeBytes !== null && disk.diskFreeBytes < requiredFreeBytes) {
          this.logger.warn(
            `Low disk space detected (${disk.diskFreeBytes} B free, ${requiredFreeBytes} B required). Running safe cache cleanup before staging...`
          );
          this.runSafeCacheCleanup();
          const afterDisk = this.hardwareAdapter.readDiskMetrics();
          if (afterDisk.diskFreeBytes !== null && afterDisk.diskFreeBytes < requiredFreeBytes) {
            const err = `Insufficient disk space on digital display: ${afterDisk.diskFreeBytes} B free, need at least ${requiredFreeBytes} B`;
            this.logger.error(err);
            await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
            return false;
          }
        }
      }

      // 4. Initialize asset progress telemetry for this publication
      this.assetProgressMap.clear();
      const nowIso = new Date().toISOString();
      for (const a of assets) {
        this.assetProgressMap.set(a.assetId, {
          publicationId,
          assetId: a.assetId,
          fileName: a.fileName || a.assetId,
          sizeBytes: a.fileSizeBytes,
          bytesTransferred: 0,
          progressPercent: 0,
          checksumSha256: a.checksumSha256.toLowerCase(),
          verifiedChecksumSha256: null,
          stage: 'queued',
          fromCache: false,
          updatedAt: nowIso,
          errorMessage: null,
        });
      }

      // 5. Prepare staging directory
      const stagingDir = path.join(this.config.stagingDir, publicationId);
      const stagingAssetsDir = path.join(stagingDir, 'assets');
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      fs.mkdirSync(stagingAssetsDir, { recursive: true });

      // 6. Download / retrieve assets with verified Content-Addressable Cache hit or .part streaming
      this.logger.info(
        `Starting preparation of ${assets.length} assets for publication ${publicationId}...`
      );
      let refreshedUrlsOnce = false;

      for (const a of assets) {
        const destPath = path.join(stagingAssetsDir, a.assetId);
        const cachePath = path.join(this.config.cacheDir, a.checksumSha256.toLowerCase());

        // Verified cache hit?
        if (fs.existsSync(cachePath)) {
          try {
            const stats = fs.statSync(cachePath);
            if (stats.size === a.fileSizeBytes) {
              const cachedSha = (await this.computeFileSha256(cachePath)).toLowerCase();
              if (cachedSha === a.checksumSha256.toLowerCase()) {
                fs.copyFileSync(cachePath, destPath);
                this.assetProgressMap.set(a.assetId, {
                  publicationId,
                  assetId: a.assetId,
                  fileName: a.fileName || a.assetId,
                  sizeBytes: a.fileSizeBytes,
                  bytesTransferred: a.fileSizeBytes,
                  progressPercent: 100,
                  checksumSha256: a.checksumSha256.toLowerCase(),
                  verifiedChecksumSha256: cachedSha,
                  stage: 'ready',
                  fromCache: true,
                  updatedAt: new Date().toISOString(),
                  errorMessage: null,
                });
                this.logger.info(
                  `Asset ${a.assetId} reused from verified content-addressable cache (${cachedSha.slice(0, 10)})`
                );
                continue;
              }
            }
            // Corrupted cache entry: remove it and re-download
            fs.unlinkSync(cachePath);
          } catch {
            // Fall through to download
          }
        }

        let downloadUrl = assetUrls[a.assetId];
        if (!downloadUrl) {
          const err = `No authorized download URL provided for asset: ${a.assetId}`;
          this.logger.error(err);
          fs.rmSync(stagingDir, { recursive: true, force: true });
          await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
          return false;
        }

        try {
          await this.downloadVerifiedAsset({
            publicationId,
            assetId: a.assetId,
            fileName: a.fileName || a.assetId,
            expectedSizeBytes: a.fileSizeBytes,
            expectedSha256: a.checksumSha256,
            downloadUrl,
            destPath,
            cachePath,
          });
        } catch (firstErr: any) {
          const statusCode = firstErr?.statusCode;
          // If signed URL expired (401/403), renew manifest URLs once and retry download
          if ((statusCode === 401 || statusCode === 403) && !refreshedUrlsOnce) {
            refreshedUrlsOnce = true;
            this.logger.info(
              `Refreshing expired asset download URLs for publication ${publicationId}...`
            );
            try {
              const renewed = await this.fetchManifestAndUrls(displayId, publicationId);
              assetUrls = renewed.assetUrls;
              downloadUrl = assetUrls[a.assetId];
              if (!downloadUrl) {
                throw firstErr;
              }
              await this.downloadVerifiedAsset({
                publicationId,
                assetId: a.assetId,
                fileName: a.fileName || a.assetId,
                expectedSizeBytes: a.fileSizeBytes,
                expectedSha256: a.checksumSha256,
                downloadUrl,
                destPath,
                cachePath,
              });
            } catch (retryErr: any) {
              const msg = `Failed to download asset ${a.assetId}: ${retryErr?.message || retryErr}`;
              this.logger.error(msg);
              fs.rmSync(stagingDir, { recursive: true, force: true });
              await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, msg);
              return false;
            }
          } else {
            const msg = `Failed to download asset ${a.assetId}: ${firstErr?.message || firstErr}`;
            this.logger.error(msg);
            fs.rmSync(stagingDir, { recursive: true, force: true });
            await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, msg);
            return false;
          }
        }
      }

      // 7. Stage: Verifying staged package integrity
      await this.reportDeliveryStage(displayId, publicationId, 'verifying');
      this.logger.info(`Verifying staged package for publication ${publicationId}...`);

      for (const a of assets) {
        const destPath = path.join(stagingAssetsDir, a.assetId);
        if (!fs.existsSync(destPath)) {
          const err = `Asset file missing from staging: ${a.assetId}`;
          this.logger.error(err);
          fs.rmSync(stagingDir, { recursive: true, force: true });
          await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
          return false;
        }

        const computedSha = (await this.computeFileSha256(destPath)).toLowerCase();
        if (computedSha !== a.checksumSha256.toLowerCase()) {
          const err = `Integrity check failed for asset ${a.assetId}: expected ${a.checksumSha256}, got ${computedSha}`;
          this.logger.error(err);
          fs.rmSync(stagingDir, { recursive: true, force: true });
          await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
          return false;
        }
      }

      // Save manifest in staging with fsync
      const manifestPath = path.join(stagingDir, 'manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      // 8. Stale revision race check before activation:
      // Verify whether a newer desiredPublicationId was assigned while downloading.
      try {
        const transport = this.identity.getTransport();
        const latestPub = await transport.callAuthenticatedFunction<
          GetDevicePublicationRequest,
          GetDevicePublicationResponse
        >('getDevicePublication', { displayId }, this.identity);

        if (
          latestPub.desiredPublicationId &&
          latestPub.desiredPublicationId !== publicationId
        ) {
          this.logger.warn(
            `Publication ${publicationId} was superseded by newer desired publication ${latestPub.desiredPublicationId} during staging. Aborting stale activation and switching to newer revision.`
          );
          fs.rmSync(stagingDir, { recursive: true, force: true });
          this.downloadingPublicationId = null;
          this.desiredPublicationId = latestPub.desiredPublicationId;
          return await this.synchronizePublication(
            displayId,
            latestPub.desiredPublicationId,
            undefined,
            latestPub.orientation
          );
        }
      } catch {
        // If server is unreachable right at activation time, proceed with verified staged package
      }

      // 9. Stage: Ready
      this.readyPublicationId = publicationId;
      await this.reportDeliveryStage(displayId, publicationId, 'ready');

      // 10. Atomic activation switch
      const versionDir = path.join(this.config.versionsDir, publicationId);
      if (fs.existsSync(versionDir)) {
        fs.rmSync(versionDir, { recursive: true, force: true });
      }
      fs.renameSync(stagingDir, versionDir);

      const versionManifestPath = path.join(versionDir, 'manifest.json');
      const versionAssetsDir = path.join(versionDir, 'assets');

      // Retain previous working package pointer before overwrite
      const currentActive = this.getActivePackage();
      if (currentActive && currentActive.publicationId !== publicationId) {
        const tmpPrev = `${this.previousPointerPath}.tmp`;
        fs.writeFileSync(tmpPrev, JSON.stringify(currentActive, null, 2), 'utf8');
        fs.renameSync(tmpPrev, this.previousPointerPath);
        this.logger.info(`Retained previous package pointer: ${currentActive.publicationId}`);
      }

      // Switch active pointer atomically
      const newActivePointer: ActivePackagePointer = {
        publicationId,
        displayId,
        activatedAt: new Date().toISOString(),
        manifestPath: versionManifestPath,
        assetsDir: versionAssetsDir,
      };

      const tmpActivePointer = `${this.activePointerPath}.tmp`;
      fs.writeFileSync(tmpActivePointer, JSON.stringify(newActivePointer, null, 2), 'utf8');
      fs.renameSync(tmpActivePointer, this.activePointerPath);

      this.activePublicationId = publicationId;
      this.downloadingPublicationId = null;
      this.readyPublicationId = null;
      this.lastSyncAt = new Date().toISOString();

      // 11. Prune old packages and unreferenced cache items before final active report
      this.runSafeCacheCleanup();

      // 12. Stage: Active
      await this.reportDeliveryStage(
        displayId,
        publicationId,
        'active',
        manifest.integrity?.checksum
      );
      this.logger.info(
        `Successfully activated publication ${publicationId} for digital display: ${displayId}`
      );

      return true;
    } finally {
      this.downloadingPublicationId = null;
      this.syncInFlight = false;
    }
  }

  /**
   * Builds a bounded inventory summary of the local content-addressable cache and package store.
   */
  public getCacheInventory(): CacheInventorySummary {
    const active = this.getActivePackage();
    const previous = this.getPreviousPackage();
    const inFlightPubId = this.downloadingPublicationId;

    const shaMeta = new Map<
      string,
      {
        assetIds: Set<string>;
        fileNames: Set<string>;
        references: Set<CacheReferenceKind>;
      }
    >();

    const registerManifestRefs = (manifestPath: string, refKind: CacheReferenceKind) => {
      try {
        if (!fs.existsSync(manifestPath)) return;
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DetailedPublicationManifest;
        for (const a of m.assets || []) {
          const sha = a.checksumSha256.toLowerCase();
          let entry = shaMeta.get(sha);
          if (!entry) {
            entry = {
              assetIds: new Set(),
              fileNames: new Set(),
              references: new Set(),
            };
            shaMeta.set(sha, entry);
          }
          entry.assetIds.add(a.assetId);
          entry.fileNames.add(a.fileName || a.assetId);
          entry.references.add(refKind);
        }
      } catch {
        // Ignore unreadable manifest
      }
    };

    if (active) registerManifestRefs(active.manifestPath, 'active');
    if (previous) registerManifestRefs(previous.manifestPath, 'previous');
    if (inFlightPubId) {
      const stagedManifest = path.join(this.config.stagingDir, inFlightPubId, 'manifest.json');
      registerManifestRefs(stagedManifest, 'staged');
      for (const prog of this.assetProgressMap.values()) {
        if (prog.publicationId === inFlightPubId) {
          const sha = prog.checksumSha256.toLowerCase();
          let entry = shaMeta.get(sha);
          if (!entry) {
            entry = {
              assetIds: new Set(),
              fileNames: new Set(),
              references: new Set(),
            };
            shaMeta.set(sha, entry);
          }
          entry.assetIds.add(prog.assetId);
          entry.fileNames.add(prog.fileName);
          entry.references.add('staged');
        }
      }
    }

    const items: CacheInventoryItem[] = [];
    let totalCachedBytes = 0;
    let referencedBytes = 0;
    let unreferencedBytes = 0;

    try {
      if (fs.existsSync(this.config.cacheDir)) {
        const cachedFiles = fs.readdirSync(this.config.cacheDir);
        for (const f of cachedFiles) {
          if (f.endsWith('.part')) continue;
          const fullPath = path.join(this.config.cacheDir, f);
          try {
            const stat = fs.statSync(fullPath);
            if (!stat.isFile()) continue;
            totalCachedBytes += stat.size;
            const sha = f.toLowerCase();
            const meta = shaMeta.get(sha);
            const refs: CacheReferenceKind[] =
              meta && meta.references.size > 0
                ? Array.from(meta.references)
                : ['unreferenced'];

            if (refs.includes('unreferenced')) {
              unreferencedBytes += stat.size;
            } else {
              referencedBytes += stat.size;
            }

            items.push({
              checksumSha256: sha,
              assetIds: meta ? Array.from(meta.assetIds) : [],
              fileNames: meta ? Array.from(meta.fileNames) : [],
              sizeBytes: stat.size,
              verifiedAt: stat.ctime.toISOString(),
              lastUsedAt: stat.mtime.toISOString(),
              references: refs,
            });
          } catch {
            // Skip inaccessible file
          }
        }
      }
    } catch {
      // Ignore directory read error
    }

    const stagedPublicationIds: string[] = [];
    try {
      if (fs.existsSync(this.config.stagingDir)) {
        for (const d of fs.readdirSync(this.config.stagingDir)) {
          stagedPublicationIds.push(d);
        }
      }
    } catch {
      // Ignore
    }

    return {
      reportedAt: new Date().toISOString(),
      activePublicationId: active?.publicationId || null,
      previousPublicationId: previous?.publicationId || null,
      stagedPublicationIds,
      totalItems: items.length,
      totalBytes: totalCachedBytes,
      referencedBytes,
      unreferencedBytes,
      items: items.slice(0, 100),
    };
  }

  /**
   * Reference-counted safe garbage collection for versions, staging directories, .part files, and cacheDir.
   * Strictly protects:
   * - Active publication package and its assets
   * - Previous rollback publication package and its assets
   * - Any currently in-flight downloadingPublicationId staging directory and its assets
   */
  public runSafeCacheCleanup(): SafeCacheCleanupResult {
    let removedPublications = 0;
    let removedAssets = 0;
    let removedStagingDirs = 0;
    let removedPartFiles = 0;
    let freedBytes = 0;

    const active = this.getActivePackage();
    const previous = this.getPreviousPackage();
    const inFlightPubId = this.downloadingPublicationId;

    const protectedPublications = new Set<string>();
    if (active) protectedPublications.add(active.publicationId);
    if (previous) protectedPublications.add(previous.publicationId);
    if (inFlightPubId) protectedPublications.add(inFlightPubId);

    const directorySize = (dirPath: string): number => {
      let total = 0;
      try {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
          const full = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            total += directorySize(full);
          } else if (entry.isFile()) {
            total += fs.statSync(full).size;
          }
        }
      } catch {
        // Ignore
      }
      return total;
    };

    // 1. Prune superseded version directories (protecting active & previous)
    try {
      if (fs.existsSync(this.config.versionsDir)) {
        for (const v of fs.readdirSync(this.config.versionsDir)) {
          if (!protectedPublications.has(v)) {
            const p = path.join(this.config.versionsDir, v);
            freedBytes += directorySize(p);
            fs.rmSync(p, { recursive: true, force: true });
            removedPublications++;
            this.logger.info(`Pruned superseded package directory: ${v}`);
          }
        }
      }
    } catch (err) {
      this.logger.warn('Package version cleanup error:', err);
    }

    // 2. Prune abandoned staging directories (protecting inFlightPubId)
    try {
      if (fs.existsSync(this.config.stagingDir)) {
        for (const s of fs.readdirSync(this.config.stagingDir)) {
          if (s !== inFlightPubId) {
            const p = path.join(this.config.stagingDir, s);
            freedBytes += directorySize(p);
            fs.rmSync(p, { recursive: true, force: true });
            removedStagingDirs++;
            this.logger.info(`Pruned abandoned staging directory: ${s}`);
          }
        }
      }
    } catch (err) {
      this.logger.warn('Staging directory cleanup error:', err);
    }

    // 3. Collect all protected SHA-256 checksums across active, previous, and in-flight staging
    const referencedSha256s = new Set<string>();
    const inspectManifest = (manifestPath: string) => {
      try {
        if (fs.existsSync(manifestPath)) {
          const m = JSON.parse(
            fs.readFileSync(manifestPath, 'utf8')
          ) as DetailedPublicationManifest;
          for (const a of m.assets || []) {
            referencedSha256s.add(a.checksumSha256.toLowerCase());
          }
        }
      } catch {
        // Ignore
      }
    };

    if (active) inspectManifest(active.manifestPath);
    if (previous) inspectManifest(previous.manifestPath);
    if (inFlightPubId) {
      inspectManifest(path.join(this.config.stagingDir, inFlightPubId, 'manifest.json'));
      for (const prog of this.assetProgressMap.values()) {
        if (prog.publicationId === inFlightPubId) {
          referencedSha256s.add(prog.checksumSha256.toLowerCase());
        }
      }
    }

    // 4. Prune unreferenced cache blobs and stale .part files in cacheDir
    try {
      if (fs.existsSync(this.config.cacheDir)) {
        for (const f of fs.readdirSync(this.config.cacheDir)) {
          const full = path.join(this.config.cacheDir, f);
          if (f.endsWith('.part')) {
            if (!inFlightPubId) {
              try {
                const sz = fs.statSync(full).size;
                fs.unlinkSync(full);
                freedBytes += sz;
                removedPartFiles++;
              } catch {
                // Ignore
              }
            }
            continue;
          }
          if (!referencedSha256s.has(f.toLowerCase())) {
            try {
              const sz = fs.statSync(full).size;
              fs.unlinkSync(full);
              freedBytes += sz;
              removedAssets++;
              this.logger.info(`Garbage collected unreferenced cache item: ${f.slice(0, 10)}`);
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn('Cache garbage collection error:', err);
    }

    return {
      removedPublications,
      removedAssets,
      removedStagingDirs,
      removedPartFiles,
      freedBytes,
    };
  }
}
