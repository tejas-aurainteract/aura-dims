/**
 * Aura DIMS - Hardware Telemetry & Capability Adapter
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Adapts verified hardware probes from the Raspberry Pi digital display runtime
 * (thermal_zone0, /proc/meminfo, boot_id, statfs, scrot X11 capture, controlled reboot helper)
 * while keeping unknown metrics explicitly null and disabling unsupported OS actions clearly.
 *
 * Terminology: Always use "digital display" in all user-facing copy and logs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { DeviceCapabilities, HardwareMetrics } from '@aura-dims/display-schema';
import { DESIGN_CONSTRAINTS } from '@aura-dims/display-schema';

const execFileAsync = promisify(execFile);

export interface CapturedPreviewFrame {
  mimeType: 'image/jpeg' | 'image/png';
  imageBase64: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  captureMethod: string;
}

export interface HardwareAdapterOverrides {
  thermalFilePath?: string;
  meminfoFilePath?: string;
  bootIdFilePath?: string;
  capturePreviewFn?: () => Promise<CapturedPreviewFrame>;
  triggerRebootFn?: () => Promise<void>;
  forceCapabilities?: Partial<DeviceCapabilities>;
}

function findExecutableOnPath(binaryName: string): string | null {
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, binaryName);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Continue searching
    }
  }
  return null;
}

export class HardwareAdapter {
  private readonly config: PlayerConfig;
  private readonly logger: Logger;
  private readonly overrides: HardwareAdapterOverrides;

  constructor(config: PlayerConfig, logger: Logger, overrides?: HardwareAdapterOverrides) {
    this.config = config;
    this.logger = logger;
    this.overrides = overrides || {};
  }

  /**
   * Reads CPU thermal sensor from Linux /sys/class/thermal/thermal_zone0/temp.
   * Returns null when unavailable (never fabricates temperatures).
   */
  public readCpuTempCelsius(): number | null {
    const thermalPath =
      this.overrides.thermalFilePath || '/sys/class/thermal/thermal_zone0/temp';
    try {
      if (!fs.existsSync(thermalPath)) {
        return null;
      }
      const raw = fs.readFileSync(thermalPath, 'utf8').trim();
      const milliCelsius = Number(raw);
      if (!Number.isFinite(milliCelsius)) {
        return null;
      }
      const celsius = Math.round((milliCelsius / 1000) * 10) / 10;
      if (celsius < -40 || celsius > 150) {
        return null;
      }
      return celsius;
    } catch {
      return null;
    }
  }

  /**
   * Reads system memory usage from /proc/meminfo on Linux (MemTotal - MemAvailable),
   * falling back to Node os.totalmem() / os.freemem().
   */
  public readMemoryMetrics(): { memoryUsedBytes: number | null; memoryTotalBytes: number | null } {
    const meminfoPath = this.overrides.meminfoFilePath || '/proc/meminfo';
    try {
      if (fs.existsSync(meminfoPath)) {
        const content = fs.readFileSync(meminfoPath, 'utf8');
        let totalKb: number | null = null;
        let availableKb: number | null = null;

        for (const line of content.split('\n')) {
          if (line.startsWith('MemTotal:')) {
            const parts = line.split(/\s+/);
            totalKb = Number(parts[1]);
          } else if (line.startsWith('MemAvailable:')) {
            const parts = line.split(/\s+/);
            availableKb = Number(parts[1]);
          }
        }

        if (
          totalKb !== null &&
          availableKb !== null &&
          Number.isFinite(totalKb) &&
          Number.isFinite(availableKb) &&
          totalKb > 0
        ) {
          const totalBytes = totalKb * 1024;
          const usedBytes = Math.max(0, (totalKb - availableKb) * 1024);
          return { memoryUsedBytes: usedBytes, memoryTotalBytes: totalBytes };
        }
      }
    } catch {
      // Fall back to os module below
    }

    try {
      const total = os.totalmem();
      const free = os.freemem();
      if (Number.isFinite(total) && total > 0 && Number.isFinite(free)) {
        return {
          memoryUsedBytes: Math.max(0, total - free),
          memoryTotalBytes: total,
        };
      }
    } catch {
      // Ignore
    }

    return { memoryUsedBytes: null, memoryTotalBytes: null };
  }

  /**
   * Reads filesystem capacity for the digital display data directory using statfs.
   */
  public readDiskMetrics(): { diskFreeBytes: number | null; diskTotalBytes: number | null } {
    try {
      const targetDir = fs.existsSync(this.config.dataDir)
        ? this.config.dataDir
        : process.cwd();
      const stats = fs.statfsSync(targetDir);
      const bsize = Number(stats.bsize);
      const blocks = Number(stats.blocks);
      const bavail = Number(stats.bavail);
      if (Number.isFinite(bsize) && bsize > 0 && Number.isFinite(blocks) && Number.isFinite(bavail)) {
        return {
          diskFreeBytes: Math.max(0, bavail * bsize),
          diskTotalBytes: Math.max(0, blocks * bsize),
        };
      }
    } catch {
      // Unavailable on this platform/filesystem
    }
    return { diskFreeBytes: null, diskTotalBytes: null };
  }

  /**
   * Reads Linux kernel boot_id to detect actual OS reboots across reconnects.
   */
  public readBootId(): string | null {
    const bootIdPath =
      this.overrides.bootIdFilePath || '/proc/sys/kernel/random/boot_id';
    try {
      if (!fs.existsSync(bootIdPath)) {
        return null;
      }
      const bootId = fs.readFileSync(bootIdPath, 'utf8').trim();
      return bootId.length > 0 && bootId.length <= 64 ? bootId : null;
    } catch {
      return null;
    }
  }

  /**
   * Collects bounded real hardware metrics for heartbeat reporting.
   */
  public collectMetrics(): HardwareMetrics {
    const cpuTempCelsius = this.readCpuTempCelsius();
    const { memoryUsedBytes, memoryTotalBytes } = this.readMemoryMetrics();
    const { diskFreeBytes, diskTotalBytes } = this.readDiskMetrics();
    const bootId = this.readBootId();

    return {
      cpuTempCelsius,
      memoryUsedBytes,
      memoryTotalBytes,
      diskFreeBytes,
      diskTotalBytes,
      osPlatform: os.platform(),
      osRelease: os.release(),
      arch: os.arch(),
      bootId,
      observedAt: new Date().toISOString(),
    };
  }

  /**
   * Discovers versioned capabilities supported by the current digital display environment.
   */
  public getCapabilities(): DeviceCapabilities {
    const scrotPath = findExecutableOnPath('scrot');
    const hasX11Display =
      Boolean(process.env.DISPLAY) || fs.existsSync('/tmp/.X11-unix/X0');

    const canCapturePreview = Boolean(
      this.overrides.capturePreviewFn || (os.platform() === 'linux' && scrotPath && hasX11Display)
    );
    const capturePreviewReason = canCapturePreview
      ? null
      : 'X11 display (:0) or scrot capture utility is not available on this digital display host.';

    let canReboot = false;
    let rebootReason: string | null =
      'Controlled reboot helper is not configured on this digital display host.';

    if (this.overrides.triggerRebootFn) {
      canReboot = true;
      rebootReason = null;
    } else if (this.config.rebootHelperPath) {
      try {
        fs.accessSync(this.config.rebootHelperPath, fs.constants.X_OK);
        canReboot = true;
        rebootReason = null;
      } catch {
        canReboot = false;
        rebootReason = `Configured reboot helper (${this.config.rebootHelperPath}) is missing or not executable.`;
      }
    }

    const base: DeviceCapabilities = {
      schemaVersion: '1.0',
      protocolVersion: this.config.protocolVersion,
      agentVersion: this.config.appVersion,
      rendererVersion: this.config.rendererVersion,
      visualDesigns: true,
      supportedMediaTypes: ['image', 'video'],
      supportedOrientations: ['landscape', 'portrait'],
      supportedFonts: [...DESIGN_CONSTRAINTS.SUPPORTED_FONT_FAMILIES],
      capturePreview: canCapturePreview,
      capturePreviewReason,
      refreshRenderer: true,
      refreshRendererReason: null,
      reboot: canReboot,
      rebootReason,
      safeCacheCleanup: true,
    };

    if (this.overrides.forceCapabilities) {
      return { ...base, ...this.overrides.forceCapabilities };
    }
    return base;
  }

  /**
   * Captures an on-demand software preview of the digital display X11 session.
   * Uses a unique temporary file path, enforces size bounds, and cleans up the local temp file.
   */
  public async capturePreview(): Promise<CapturedPreviewFrame> {
    const caps = this.getCapabilities();
    if (!caps.capturePreview) {
      throw new Error(
        caps.capturePreviewReason || 'Preview capture is not supported on this digital display.'
      );
    }

    if (this.overrides.capturePreviewFn) {
      return this.overrides.capturePreviewFn();
    }

    const scrotPath = findExecutableOnPath('scrot');
    if (!scrotPath) {
      throw new Error('scrot executable not found on PATH for digital display preview capture.');
    }

    const tempFile = path.join(
      os.tmpdir(),
      `aura-dims-preview-${crypto.randomUUID()}.jpg`
    );

    try {
      await execFileAsync(scrotPath, ['-z', '-q', '60', '-o', tempFile], {
        timeout: 8_000,
        env: {
          ...process.env,
          DISPLAY: process.env.DISPLAY || ':0',
        },
      });

      if (!fs.existsSync(tempFile)) {
        throw new Error('Preview capture completed without producing an output image.');
      }

      const stat = fs.statSync(tempFile);
      if (stat.size <= 0) {
        throw new Error('Captured digital display preview file is empty.');
      }
      if (stat.size > 2 * 1024 * 1024) {
        throw new Error(
          `Captured digital display preview size (${stat.size} bytes) exceeds 2 MB limit.`
        );
      }

      const buffer = fs.readFileSync(tempFile);
      return {
        mimeType: 'image/jpeg',
        imageBase64: buffer.toString('base64'),
        sizeBytes: stat.size,
        width: null,
        height: null,
        captureMethod: 'x11-scrot',
      };
    } finally {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch {
        // Ignore cleanup error
      }
    }
  }

  /**
   * Triggers a controlled OS reboot via the configured root-owned helper script.
   * Never uses arbitrary shell strings or embedded passwords.
   */
  public async triggerReboot(): Promise<void> {
    const caps = this.getCapabilities();
    if (!caps.reboot) {
      throw new Error(
        caps.rebootReason || 'Reboot capability is not supported on this digital display.'
      );
    }

    if (this.overrides.triggerRebootFn) {
      await this.overrides.triggerRebootFn();
      return;
    }

    if (!this.config.rebootHelperPath) {
      throw new Error('Reboot helper path is not configured.');
    }

    this.logger.warn(
      `Executing controlled reboot helper (${this.config.rebootHelperPath}) for digital display...`
    );
    await execFileAsync(this.config.rebootHelperPath, [], { timeout: 5_000 });
  }
}

