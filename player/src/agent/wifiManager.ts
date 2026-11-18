/**
 * Aura DIMS - Digital Display Wi-Fi & Hotspot Network Manager
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - On-demand Wi-Fi scanning with deduplication and signal quality sorting
 * - Priority-ordered connection with NetworkManager (highest autoconnect-priority for newest network)
 * - 30-second internet verification with automatic rollback if new network fails
 * - Automatic Access Point (AP) mode fallback when disconnected (SSID: "Aura", Pass: "12345678")
 * - Cross-platform adapter with simulated networks for local development and testing
 *
 * Terminology rule: Always use "digital display" in user-facing naming and logs.
 */

import * as child_process from 'node:child_process';
import * as os from 'node:os';
import * as http from 'node:http';
import type { Logger } from './logger.js';
import type { WifiScannedNetwork, WifiStatus } from '@aura-dims/display-schema';

export interface WifiManagerConfig {
  wifiInterface?: string;
  apSsid?: string;
  apPassword?: string;
  internetCheckTimeoutMs?: number;
  gracePeriodBeforeApMs?: number;
}

export class WifiManager {
  private readonly logger: Logger;
  private readonly wifiInterface: string;
  private readonly apSsid: string;
  private readonly apPassword: string;
  private readonly internetCheckTimeoutMs: number;
  private apActive = false;
  private isLinux: boolean;
  private currentConnectedSsid: string | null = null;
  private mockNetworks: WifiScannedNetwork[] = [
    { ssid: 'Aura-Office-5G', signal: 95, security: 'wpa2', channel: 36 },
    { ssid: 'Aura-Guest-WiFi', signal: 82, security: 'open', channel: 6 },
    { ssid: 'Tech-Hub-Corporate', signal: 74, security: 'wpa3', channel: 1 },
    { ssid: 'Surat-Complex-Fast', signal: 65, security: 'wpa2', channel: 11 },
    { ssid: 'Warehouse-IoT', signal: 45, security: 'wpa2', channel: 44 },
  ];

  constructor(logger: Logger, config?: WifiManagerConfig) {
    this.logger = logger;
    this.wifiInterface = config?.wifiInterface || 'wlan0';
    this.apSsid = config?.apSsid || 'Aura';
    this.apPassword = config?.apPassword || '12345678';
    this.internetCheckTimeoutMs = config?.internetCheckTimeoutMs || 30_000;
    this.isLinux = os.platform() === 'linux';
  }

  public getApSsid(): string {
    return this.apSsid;
  }

  public getApPassword(): string {
    return this.apPassword;
  }

  public isApModeActive(): boolean {
    return this.apActive;
  }

  /**
   * Scans for nearby Wi-Fi networks.
   * On Linux: uses nmcli dev wifi list --rescan yes.
   * On other platforms: returns mock networks for testing.
   */
  public async scanNetworks(): Promise<WifiScannedNetwork[]> {
    if (!this.isLinux) {
      this.logger.info('[WifiManager] Non-Linux platform detected; returning mock Wi-Fi networks.');
      return this.mockNetworks.map((net) => ({
        ...net,
        inUse: net.ssid === this.currentConnectedSsid,
      }));
    }

    try {
      this.logger.info('[WifiManager] Initiating nmcli Wi-Fi scan on digital display...');
      // Execute rescan and output fields: IN-USE,SSID,BSSID,SIGNAL,SECURITY,CHAN
      const stdout = await this.execCommand(
        `nmcli -t -f IN-USE,SSID,BSSID,SIGNAL,SECURITY,CHAN dev wifi list --rescan yes`
      );

      const lines = stdout.split('\n');
      const networkMap = new Map<string, WifiScannedNetwork>();

      for (const line of lines) {
        if (!line.trim()) continue;

        // nmcli -t escapes colons with backslashes
        const parts = this.parseNmcliLine(line);
        if (parts.length < 5) continue;

        const inUseRaw = parts[0]?.trim() || '';
        const ssid = parts[1]?.trim() || '';
        const bssid = parts[2]?.trim() || '';
        const signalRaw = parseInt(parts[3] || '0', 10);
        const securityRaw = (parts[4] || '').trim();
        const chanRaw = parseInt(parts[5] || '0', 10);

        // Filter out hidden/empty SSIDs and our own AP SSID
        if (!ssid || ssid === '--' || ssid === this.apSsid) continue;

        const signal = Number.isFinite(signalRaw) ? Math.min(100, Math.max(0, signalRaw)) : 0;
        const inUse = inUseRaw.includes('*');

        let security: WifiScannedNetwork['security'] = 'open';
        const secUpper = securityRaw.toUpperCase();
        if (secUpper.includes('WPA3')) security = 'wpa3';
        else if (secUpper.includes('WPA2')) security = 'wpa2';
        else if (secUpper.includes('WPA')) security = 'wpa';
        else if (secUpper.includes('WEP')) security = 'wep';

        const existing = networkMap.get(ssid);
        if (!existing || signal > existing.signal) {
          networkMap.set(ssid, {
            ssid,
            bssid: bssid || undefined,
            signal,
            security,
            channel: Number.isFinite(chanRaw) && chanRaw > 0 ? chanRaw : undefined,
            inUse,
          });
        }
      }

      const results = Array.from(networkMap.values()).sort((a, b) => b.signal - a.signal);
      this.logger.info(`[WifiManager] Discovered ${results.length} Wi-Fi networks in range.`);
      return results;
    } catch (err: any) {
      this.logger.warn('[WifiManager] nmcli scan failed:', err?.message || err);
      // Fallback to simulated scan if nmcli is missing or fails
      return this.mockNetworks;
    }
  }

  /**
   * Connects to a Wi-Fi network with priority and 30-second verification rollback.
   * If priority is omitted, automatically assigns highest priority so the newest network takes precedence.
   */
  public async connectNetwork(
    ssid: string,
    password?: string,
    priority?: number
  ): Promise<{ success: boolean; ssid: string; resultSummary: string }> {
    const targetSsid = ssid.trim();
    if (!targetSsid) {
      throw new Error('SSID cannot be empty.');
    }

    this.logger.info(`[WifiManager] Attempting connection to Wi-Fi: "${targetSsid}"...`);

    // Record previous connection for rollback
    const previousSsid = await this.getActiveSsid();

    if (!this.isLinux) {
      this.logger.info(`[WifiManager] Dev/Mock: Simulated connection to Wi-Fi "${targetSsid}".`);
      this.currentConnectedSsid = targetSsid;
      if (this.apActive) {
        await this.stopApMode();
      }
      return {
        success: true,
        ssid: targetSsid,
        resultSummary: `Simulated connection to Wi-Fi "${targetSsid}" succeeded with highest priority.`,
      };
    }

    try {
      // 1. Calculate highest autoconnect priority
      const targetPriority =
        typeof priority === 'number'
          ? priority
          : (await this.getHighestAutoconnectPriority()) + 10;

      // 2. Check if a profile for targetSsid already exists
      const existingConnName = await this.findConnectionProfile(targetSsid);

      if (existingConnName) {
        this.logger.info(
          `[WifiManager] Profile exists for "${targetSsid}". Updating credentials and priority to ${targetPriority}...`
        );
        if (password) {
          await this.execCommand(
            `nmcli connection modify "${existingConnName}" 802-11-wireless-security.psk "${password}"`
          );
        }
        await this.execCommand(
          `nmcli connection modify "${existingConnName}" connection.autoconnect yes connection.autoconnect-priority ${targetPriority}`
        );
        await this.execCommand(`nmcli connection up "${existingConnName}"`);
      } else {
        this.logger.info(
          `[WifiManager] Creating new connection profile for "${targetSsid}" with priority ${targetPriority}...`
        );
        const passArg = password ? `password "${password}"` : '';
        await this.execCommand(
          `nmcli dev wifi connect "${targetSsid}" ${passArg} ifname "${this.wifiInterface}"`
        );
        // Set autoconnect priority to highest
        await this.execCommand(
          `nmcli connection modify "${targetSsid}" connection.autoconnect-priority ${targetPriority}`
        );
      }

      // 3. 30-Second Connectivity Verification
      this.logger.info(
        `[WifiManager] Verifying internet access on "${targetSsid}" (up to ${this.internetCheckTimeoutMs / 1000}s)...`
      );
      const isOnline = await this.waitForInternet(this.internetCheckTimeoutMs);

      if (!isOnline) {
        this.logger.warn(
          `[WifiManager] Internet verification failed on "${targetSsid}". Initiating rollback to previous profile...`
        );
        await this.rollbackToPrevious(previousSsid);
        throw new Error(
          `Connected to "${targetSsid}" but internet access could not be verified within ${this.internetCheckTimeoutMs / 1000}s. Reverted to previous network profile.`
        );
      }

      this.currentConnectedSsid = targetSsid;
      this.logger.info(
        `[WifiManager] Successfully connected to "${targetSsid}" with verified internet connectivity.`
      );

      // If AP mode was active, tear it down
      if (this.apActive) {
        await this.stopApMode();
      }

      return {
        success: true,
        ssid: targetSsid,
        resultSummary: `Connected to Wi-Fi "${targetSsid}" with highest priority (${targetPriority}) and verified internet access.`,
      };
    } catch (err: any) {
      this.logger.warn(`[WifiManager] Failed to connect to "${targetSsid}":`, err?.message || err);
      // Ensure rollback on exception if previous was active
      if (previousSsid && previousSsid !== targetSsid) {
        await this.rollbackToPrevious(previousSsid).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Checks whether the digital display has active internet connectivity.
   */
  public async checkInternetAccess(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const endpoints = ['http://connectivitycheck.gstatic.com/generate_204', 'http://1.1.1.1'];
      const target = endpoints[0]!;

      const req = http.get(target, { timeout: 4000 }, (res) => {
        resolve(res.statusCode === 204 || (res.statusCode !== undefined && res.statusCode < 400));
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Starts Access Point (AP) mode on the digital display.
   * SSID: "Aura", Password: "12345678"
   */
  public async startApMode(): Promise<void> {
    if (this.apActive) {
      this.logger.info(`[WifiManager] AP mode already active (SSID: "${this.apSsid}").`);
      return;
    }

    this.logger.info(
      `[WifiManager] Switching digital display to AP Mode (SSID: "${this.apSsid}", Pass: "${this.apPassword}")...`
    );

    if (!this.isLinux) {
      this.apActive = true;
      this.logger.info('[WifiManager] Dev/Mock: AP mode activated.');
      return;
    }

    try {
      // Delete old AP profile if it exists
      await this.execCommand(`nmcli connection delete "Aura-AP"`).catch(() => {});

      // Create and start AP hotspot connection
      await this.execCommand(
        `nmcli dev wifi hotspot ifname "${this.wifiInterface}" ssid "${this.apSsid}" password "${this.apPassword}" con-name "Aura-AP"`
      );

      this.apActive = true;
      this.logger.info(
        `[WifiManager] AP Mode active on interface "${this.wifiInterface}". Digital display is broadcasting SSID "${this.apSsid}".`
      );
    } catch (err: any) {
      this.logger.error('[WifiManager] Failed to launch AP mode via nmcli:', err?.message || err);
      this.apActive = false;
      throw err;
    }
  }

  /**
   * Stops Access Point (AP) mode and restores client Wi-Fi autoconnect.
   */
  public async stopApMode(): Promise<void> {
    if (!this.apActive) return;

    this.logger.info('[WifiManager] Stopping AP Mode on digital display...');

    if (this.isLinux) {
      try {
        await this.execCommand(`nmcli connection down "Aura-AP"`).catch(() => {});
        await this.execCommand(`nmcli connection delete "Aura-AP"`).catch(() => {});
        await this.execCommand(
          `nmcli device set "${this.wifiInterface}" autoconnect yes`
        ).catch(() => {});
      } catch (err: any) {
        this.logger.warn('[WifiManager] Notice while stopping AP connection:', err?.message || err);
      }
    }

    this.apActive = false;
    this.logger.info('[WifiManager] AP mode stopped. Digital display restored to client Wi-Fi mode.');
  }

  /**
   * Returns current digital display Wi-Fi and network status.
   */
  public async getStatus(): Promise<WifiStatus> {
    const isOnline = await this.checkInternetAccess();
    const ssid = await this.getActiveSsid();

    let ipAddress: string | null = null;
    let macAddress: string | null = null;
    let signal: number | null = null;

    if (this.isLinux) {
      try {
        const ipOut = await this.execCommand(`ip -br addr show ${this.wifiInterface}`);
        const ipMatch = ipOut.match(/UP\s+(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) ipAddress = ipMatch[1] || null;

        const macOut = await this.execCommand(`cat /sys/class/net/${this.wifiInterface}/address`);
        macAddress = macOut.trim() || null;

        if (ssid) {
          const sigOut = await this.execCommand(
            `nmcli -t -f IN-USE,SIGNAL dev wifi list | grep '^\\*'`
          );
          const sigParts = sigOut.split(':');
          if (sigParts[1]) {
            signal = parseInt(sigParts[1], 10) || null;
          }
        }
      } catch {
        // Fallback for fields
      }
    } else {
      ipAddress = '192.168.1.105';
      macAddress = 'B8:27:EB:12:34:56';
      signal = 88;
    }

    return {
      connected: isOnline && !!ssid,
      ssid: ssid || this.currentConnectedSsid,
      ipAddress,
      macAddress,
      signal,
      apModeActive: this.apActive,
      apSsid: this.apActive ? this.apSsid : null,
    };
  }

  private async waitForInternet(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const ok = await this.checkInternetAccess();
      if (ok) return true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }

  private async getActiveSsid(): Promise<string | null> {
    if (!this.isLinux) return this.currentConnectedSsid;
    try {
      const stdout = await this.execCommand(
        `nmcli -t -f active,ssid dev wifi | grep '^yes'`
      );
      const match = stdout.split(':');
      return match[1]?.trim() || null;
    } catch {
      return null;
    }
  }

  private async getHighestAutoconnectPriority(): Promise<number> {
    if (!this.isLinux) return 100;
    try {
      const stdout = await this.execCommand(
        `nmcli -t -f AUTOCONNECT-PRIORITY connection show`
      );
      const priorities = stdout
        .split('\n')
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => Number.isFinite(n));
      return priorities.length > 0 ? Math.max(...priorities) : 10;
    } catch {
      return 10;
    }
  }

  private async findConnectionProfile(ssid: string): Promise<string | null> {
    if (!this.isLinux) return null;
    try {
      const stdout = await this.execCommand(`nmcli -t -f NAME,TYPE connection show`);
      const lines = stdout.split('\n');
      for (const line of lines) {
        const [name, type] = line.split(':');
        if (type?.includes('wireless') && name?.trim() === ssid) {
          return name.trim();
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async rollbackToPrevious(previousSsid: string | null): Promise<void> {
    if (!previousSsid || !this.isLinux) return;
    this.logger.info(`[WifiManager] Re-activating previous connection profile "${previousSsid}"...`);
    try {
      await this.execCommand(`nmcli connection up "${previousSsid}"`);
      this.logger.info(`[WifiManager] Successfully rolled back to "${previousSsid}".`);
    } catch (err: any) {
      this.logger.warn(`[WifiManager] Rollback to "${previousSsid}" failed:`, err?.message || err);
    }
  }

  private parseNmcliLine(line: string): string[] {
    const parts: string[] = [];
    let current = '';
    let escaped = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (escaped) {
        current += char;
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === ':') {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current);
    return parts;
  }

  private execCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      child_process.exec(cmd, { timeout: 15_000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }
}
