/**
 * Aura DIMS - Package Synchronization & Verification Engine
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - State machine: Discovered -> Downloading -> Verifying -> Ready -> Active -> (Failed)
 * - Strict limits: package size, file count, max file size
 * - SHA-256 checksum verification before activation
 * - Staging directory isolation and atomic pointer switch
 * - Previous working package retention for instant rollback
 * - Content-addressable file caching with reference tracking and safe GC
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { DeviceIdentity } from './identity.js';
import type {
  PackageDeliveryStage,
  DetailedPublicationManifest,
  GetDevicePublicationRequest,
  GetDevicePublicationResponse,
  GetDevicePublicationManifestRequest,
  GetDevicePublicationManifestResponse,
  ReportDeviceDeliveryRequest,
} from '@aura-dims/display-schema';

export interface ActivePackagePointer {
  publicationId: string;
  displayId: string;
  activatedAt: string;
  manifestPath: string;
  assetsDir: string;
}

export class SyncEngine {
  private config: PlayerConfig;
  private logger: Logger;
  private identity: DeviceIdentity;
  private activePointerPath: string;
  private previousPointerPath: string;
  private currentStage: PackageDeliveryStage = 'idle';
  private downloadingPublicationId: string | null = null;
  private readyPublicationId: string | null = null;
  private activePublicationId: string | null = null;
  private lastError: string | null = null;

  constructor(config: PlayerConfig, logger: Logger, identity: DeviceIdentity) {
    this.config = config;
    this.logger = logger;
    this.identity = identity;

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
      this.currentStage = 'active';
      this.logger.info(`Loaded existing active publication package: ${active.publicationId}`);
    }
  }

  getCurrentStage(): PackageDeliveryStage {
    return this.currentStage;
  }

  getDownloadingPublicationId(): string | null {
    return this.downloadingPublicationId;
  }

  getReadyPublicationId(): string | null {
    return this.readyPublicationId;
  }

  getActivePublicationId(): string | null {
    return this.activePublicationId;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getActivePackage(): ActivePackagePointer | null {
    if (!fs.existsSync(this.activePointerPath)) return null;
    try {
      const raw = fs.readFileSync(this.activePointerPath, 'utf8');
      return JSON.parse(raw) as ActivePackagePointer;
    } catch {
      return null;
    }
  }

  getPreviousPackage(): ActivePackagePointer | null {
    if (!fs.existsSync(this.previousPointerPath)) return null;
    try {
      const raw = fs.readFileSync(this.previousPointerPath, 'utf8');
      return JSON.parse(raw) as ActivePackagePointer;
    } catch {
      return null;
    }
  }

  loadActiveManifest(): DetailedPublicationManifest | null {
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

  computeFileSha256(filePath: string): Promise<string> {
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
    if (errorMessage) this.lastError = errorMessage;

    const token = await this.identity.getIdToken();
    if (!token) return;

    const url = `http://${this.config.functionsEmulatorHost}/${this.config.projectId}/${this.config.region}/reportDeviceDelivery`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            displayId,
            publicationId,
            stage,
            checksumSha256,
            errorMessage,
          } as ReportDeviceDeliveryRequest,
        }),
      });
    } catch (err) {
      this.logger.warn(`Failed to report delivery stage ${stage} to server:`, err);
    }
  }

  /**
   * Main sync routine: checks server for desired publication and orchestrates download and activation.
   */
  async checkForUpdates(): Promise<boolean> {
    const displayId = this.identity.getDisplayId();
    if (!displayId) return false;

    const token = await this.identity.getIdToken();
    if (!token) {
      this.logger.warn('Cannot check for publication updates: device is offline or unauthenticated.');
      return false;
    }

    const checkUrl = `http://${this.config.functionsEmulatorHost}/${this.config.projectId}/${this.config.region}/getDevicePublication`;

    let desiredPubId: string | null = null;
    try {
      const res = await fetch(checkUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: { displayId } as GetDevicePublicationRequest,
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Server rejected publication discovery: status ${res.status}`);
        return false;
      }

      const json = (await res.json()) as { result: GetDevicePublicationResponse };
      desiredPubId = json.result.desiredPublicationId;
    } catch (err) {
      this.logger.warn('Failed to contact server for publication check (operating offline):', err);
      return false;
    }

    if (!desiredPubId) {
      this.logger.info('No desired publication assigned to this digital display.');
      return false;
    }

    if (desiredPubId === this.activePublicationId) {
      // Already on active publication
      return false;
    }

    this.logger.info(`Discovered new desired publication version: ${desiredPubId}`);
    return this.synchronizePublication(displayId, desiredPubId, token);
  }

  /**
   * Downloads, validates, and atomically switches to a new publication version.
   */
  async synchronizePublication(displayId: string, publicationId: string, token: string): Promise<boolean> {
    this.downloadingPublicationId = publicationId;
    await this.reportDeliveryStage(displayId, publicationId, 'downloading');

    // 1. Fetch publication manifest & authorized asset URLs
    const manifestUrl = `http://${this.config.functionsEmulatorHost}/${this.config.projectId}/${this.config.region}/getDevicePublicationManifest`;
    let manifest: DetailedPublicationManifest;
    let assetUrls: Record<string, string>;

    try {
      const res = await fetch(manifestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: { displayId, publicationId } as GetDevicePublicationManifestRequest,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = body?.error?.message || `Failed to fetch manifest (status ${res.status})`;
        this.logger.error(err);
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
        return false;
      }

      const json = (await res.json()) as { result: GetDevicePublicationManifestResponse };
      manifest = json.result.manifest;
      assetUrls = json.result.assetUrls;
    } catch (err: any) {
      const msg = `Exception fetching publication manifest: ${err?.message || err}`;
      this.logger.error(msg);
      await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, msg);
      return false;
    }

    // 2. Enforce package limits
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

    // 3. Prepare staging directory
    const stagingDir = path.join(this.config.stagingDir, publicationId);
    const stagingAssetsDir = path.join(stagingDir, 'assets');
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stagingAssetsDir, { recursive: true });

    // 4. Download / retrieve assets with Content-Addressable Cache hit
    this.logger.info(`Starting download of ${assets.length} assets for publication ${publicationId}...`);
    for (const a of assets) {
      const destPath = path.join(stagingAssetsDir, a.assetId);
      const cachePath = path.join(this.config.cacheDir, a.checksumSha256);

      // Cache hit?
      if (fs.existsSync(cachePath)) {
        try {
          const stats = fs.statSync(cachePath);
          if (stats.size === a.fileSizeBytes) {
            fs.copyFileSync(cachePath, destPath);
            this.logger.info(`Asset ${a.assetId} reused from content-addressable cache (${a.checksumSha256.slice(0, 10)})`);
            continue;
          }
        } catch {
          // Fall through to download if cached file corrupted
        }
      }

      // Download from server
      const downloadUrl = assetUrls[a.assetId];
      if (!downloadUrl) {
        const err = `No authorized download URL provided for asset: ${a.assetId}`;
        this.logger.error(err);
        fs.rmSync(stagingDir, { recursive: true, force: true });
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
        return false;
      }

      try {
        const res = await fetch(downloadUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} downloading asset ${a.assetId}`);
        }
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(buffer));
      } catch (err: any) {
        const msg = `Failed to download asset ${a.assetId}: ${err?.message || err}`;
        this.logger.error(msg);
        fs.rmSync(stagingDir, { recursive: true, force: true });
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, msg);
        return false;
      }
    }

    // 5. Stage: Verifying checksums
    await this.reportDeliveryStage(displayId, publicationId, 'verifying');
    this.logger.info(`Verifying SHA-256 checksums for publication ${publicationId}...`);

    for (const a of assets) {
      const destPath = path.join(stagingAssetsDir, a.assetId);
      if (!fs.existsSync(destPath)) {
        const err = `Asset file missing from staging: ${a.assetId}`;
        this.logger.error(err);
        fs.rmSync(stagingDir, { recursive: true, force: true });
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
        return false;
      }

      const computedSha = await this.computeFileSha256(destPath);
      if (computedSha.toLowerCase() !== a.checksumSha256.toLowerCase()) {
        const err = `Integrity check failed for asset ${a.assetId}: expected ${a.checksumSha256}, got ${computedSha}`;
        this.logger.error(err);
        fs.rmSync(stagingDir, { recursive: true, force: true });
        await this.reportDeliveryStage(displayId, publicationId, 'failed', undefined, err);
        return false;
      }

      // Populate content-addressable cache
      const cachePath = path.join(this.config.cacheDir, a.checksumSha256);
      if (!fs.existsSync(cachePath)) {
        fs.copyFileSync(destPath, cachePath);
      }
    }

    // Save manifest in staging
    const manifestPath = path.join(stagingDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // 6. Stage: Ready
    this.readyPublicationId = publicationId;
    await this.reportDeliveryStage(displayId, publicationId, 'ready');

    // 7. Atomic activation switch
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
      fs.writeFileSync(this.previousPointerPath, JSON.stringify(currentActive, null, 2), 'utf8');
      this.logger.info(`Retained previous package pointer: ${currentActive.publicationId}`);
    }

    // Switch active pointer
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

    // 8. Stage: Active
    await this.reportDeliveryStage(
      displayId,
      publicationId,
      'active',
      manifest.integrity?.checksum
    );
    this.logger.info(`Successfully activated publication ${publicationId} for digital display: ${displayId}`);

    // 9. Prune old packages and unreferenced cache items
    this.cleanupOldPackages();
    this.cleanupCache();

    return true;
  }

  /**
   * Keeps active + previous package versions, removes older ones.
   */
  private cleanupOldPackages(): void {
    try {
      const active = this.getActivePackage();
      const previous = this.getPreviousPackage();
      const keep = new Set<string>();
      if (active) keep.add(active.publicationId);
      if (previous) keep.add(previous.publicationId);

      const versions = fs.readdirSync(this.config.versionsDir);
      for (const v of versions) {
        if (!keep.has(v)) {
          const p = path.join(this.config.versionsDir, v);
          fs.rmSync(p, { recursive: true, force: true });
          this.logger.info(`Pruned superseded package directory: ${v}`);
        }
      }
    } catch (err) {
      this.logger.warn('Package cleanup error:', err);
    }
  }

  /**
   * Reference-counted cache cleanup: scans active + previous manifests,
   * prunes unreferenced items in cacheDir.
   */
  private cleanupCache(): void {
    try {
      const referencedSha256s = new Set<string>();

      const inspectManifest = (manifestPath: string) => {
        if (fs.existsSync(manifestPath)) {
          const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DetailedPublicationManifest;
          (m.assets || []).forEach((a: any) => referencedSha256s.add(a.checksumSha256));
        }
      };

      const active = this.getActivePackage();
      if (active) inspectManifest(active.manifestPath);
      const prev = this.getPreviousPackage();
      if (prev) inspectManifest(prev.manifestPath);

      const cachedFiles = fs.readdirSync(this.config.cacheDir);
      for (const f of cachedFiles) {
        if (!referencedSha256s.has(f)) {
          fs.unlinkSync(path.join(this.config.cacheDir, f));
          this.logger.info(`Garbage collected unreferenced cache item: ${f.slice(0, 10)}`);
        }
      }
    } catch (err) {
      this.logger.warn('Cache garbage collection error:', err);
    }
  }
}
