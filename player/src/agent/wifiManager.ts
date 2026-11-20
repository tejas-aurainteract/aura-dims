/**
 * Aura DIMS - Digital Display Wi-Fi & Hotspot Network Manager
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - On-demand Wi-Fi scanning with deduplication and signal quality sorting
 * - Priority-ordered connection with NetworkManager (highest autoconnect-priority for newest network)
 * - 30-second internet verification with automatic rollback if new network fails
 * - Automatic Access Point (AP) mode fallback when disconnected (SSID: "Aura-<Last4MAC>", Pass: "aura12345678")
 * - Cross-platform adapter with simulated networks for local development and testing
 *
 * Terminology rule: Always use "digital display" in user-facing naming and logs.
 */

import * as child_process from 'node:child_process';
import * as os from 'node:os';
import * as http from 'node:http';
import * as fs from 'node:fs';
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
    { ssid: 'Aura-Office-5G', signal: 95, security: 'wpa2', channel: 36, isSaved: true },
    { ssid: 'Aura-Guest-WiFi', signal: 82, security: 'open', channel: 6 },
    { ssid: 'Tech-Hub-Corporate', signal: 74, security: 'wpa3', channel: 1 },
    { ssid: 'Surat-Complex-Fast', signal: 65, security: 'wpa2', channel: 11 },
    { ssid: 'Warehouse-IoT', signal: 45, security: 'wpa2', channel: 44 },
  ];

  constructor(logger: Logger, config?: WifiManagerConfig) {
    this.logger = logger;
    this.isLinux = os.platform() === 'linux';
    this.wifiInterface = config?.wifiInterface || 'wlan0';
    this.apSsid = this.computeApSsid(config?.apSsid);
    this.apPassword = config?.apPassword || 'aura12345678';
    this.internetCheckTimeoutMs = config?.internetCheckTimeoutMs || 30_000;
  }

  /**
   * Computes dynamic AP SSID incorporating the last 4 characters of the digital display's MAC address.
   * Format: Aura-<Last4MAC> (e.g. Aura-3456 or Aura-6EF2)
   */
  private computeApSsid(customSsid?: string): string {
    if (customSsid) return customSsid;
    try {
      let mac = '';
      if (this.isLinux) {
        const sysPath = `/sys/class/net/${this.wifiInterface}/address`;
        if (fs.existsSync(sysPath)) {
          mac = fs.readFileSync(sysPath, 'utf8').trim();
        }
      } else {
        mac = 'B8:27:EB:12:34:56';
      }
      const cleanMac = mac.replace(/[:-]/g, '').toUpperCase();
      if (cleanMac.length >= 4) {
        return `Aura-${cleanMac.slice(-4)}`;
      }
    } catch {
      // Fallback
    }
    return 'Aura-WIFI';
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
   * Returns a list of all saved Wi-Fi connection profile SSIDs stored in NetworkManager.
   */
  public async getSavedWifiProfiles(): Promise<string[]> {
    if (!this.isLinux) {
      return ['Aura-Office-5G'];
    }
    try {
      const stdout = await this.execCommand(`sudo nmcli -t -f NAME,TYPE connection show`);
      const lines = stdout.split('\n');
      const profiles: string[] = [];
      for (const line of lines) {
        const parts = this.parseNmcliLine(line);
        const name = parts[0]?.trim();
        const type = parts[1]?.trim();
        if (
          (type?.includes('wireless') || type?.includes('wifi')) &&
          name &&
          name !== 'Aura-AP' &&
          name !== this.apSsid
        ) {
          profiles.push(name);
        }
      }
      return Array.from(new Set(profiles));
    } catch (err: any) {
      this.logger.warn('[WifiManager] Could not query saved connection profiles:', err?.message || err);
      return [];
    }
  }

  /**
   * Deletes all saved Wi-Fi profiles from NetworkManager.
   */
  public async deleteSavedWifiProfiles(): Promise<number> {
    this.logger.info('[WifiManager] Deleting all saved Wi-Fi connection profiles...');
    if (!this.isLinux) {
      this.logger.info('[WifiManager] Dev/Mock: Simulated deletion of saved profiles.');
      return 1;
    }
    try {
      const profiles = await this.getSavedWifiProfiles();
      let deleted = 0;
      for (const prof of profiles) {
        await this.execCommand(`sudo nmcli connection delete "${prof}"`).catch(() => {});
        deleted++;
      }
      this.logger.info(`[WifiManager] Successfully deleted ${deleted} saved Wi-Fi profiles.`);
      return deleted;
    } catch (err: any) {
      this.logger.error('[WifiManager] Failed to clear Wi-Fi profiles:', err?.message || err);
      throw err;
    }
  }

  /**
   * Checks whether wired Ethernet is plugged in and has active internet access.
   */
  public async isEthernetOnline(): Promise<boolean> {
    if (!this.isLinux) return false;
    try {
      const stdout = await this.execCommand(`ip -br addr show | grep -E '^(eth|en)'`);
      if (stdout.includes('UP')) {
        return await this.checkInternetAccess();
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Scans for nearby Wi-Fi networks.
   * On Linux: uses nmcli dev wifi list --rescan yes.
   * Annotates networks with isSaved: true if a profile already exists on this digital display.
   */
  public async scanNetworks(): Promise<WifiScannedNetwork[]> {
    const savedProfiles = new Set(await this.getSavedWifiProfiles());

    if (!this.isLinux) {
      this.logger.info('[WifiManager] Non-Linux platform detected; returning mock Wi-Fi networks.');
      return this.mockNetworks.map((net) => ({
        ...net,
        inUse: net.ssid === this.currentConnectedSsid,
        isSaved: savedProfiles.has(net.ssid) || !!net.isSaved,
      }));
    }

    try {
      this.logger.info('[WifiManager] Initiating nmcli Wi-Fi scan on digital display...');
      // Execute rescan and output fields: IN-USE,SSID,BSSID,SIGNAL,SECURITY,CHAN
      const stdout = await this.execCommand(
        `sudo nmcli -t -f IN-USE,SSID,BSSID,SIGNAL,SECURITY,CHAN dev wifi list --rescan yes`
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
        if (!ssid || ssid === '--' || ssid === this.apSsid || ssid === 'Aura-AP') continue;

        const signal = Number.isFinite(signalRaw) ? Math.min(100, Math.max(0, signalRaw)) : 0;
        const inUse = inUseRaw.includes('*');
        const isSaved = savedProfiles.has(ssid);

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
            isSaved,
          });
        }
      }

      const results = Array.from(networkMap.values()).sort((a, b) => {
        if (a.inUse && !b.inUse) return -1;
        if (!a.inUse && b.inUse) return 1;
        if (a.isSaved && !b.isSaved) return -1;
        if (!a.isSaved && b.isSaved) return 1;
        return b.signal - a.signal;
      });
      this.logger.info(`[WifiManager] Discovered ${results.length} Wi-Fi networks in range.`);
      return results;
    } catch (err: any) {
      this.logger.warn('[WifiManager] nmcli scan failed:', err?.message || err);
      return this.mockNetworks;
    }
  }

  /**
   * Connects to a Wi-Fi network with priority and 30-second verification rollback.
   * If priority is omitted, automatically assigns highest priority (100) so the newest network takes precedence.
   * If overridePassword is false and a stored profile exists, connects using stored credentials.
   */
  public async connectNetwork(
    ssid: string,
    password?: string,
    priority = 100,
    overridePassword = false
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
      const targetPriority = Math.max(priority, 100);

      // 1. Check if a profile for targetSsid already exists
      const existingConnName = await this.findConnectionProfile(targetSsid);

      if (existingConnName) {
        this.logger.info(
          `[WifiManager] Stored profile exists for "${targetSsid}". Configuring priority ${targetPriority}...`
        );
        if (overridePassword && password) {
          this.logger.info(`[WifiManager] Overriding stored password for "${targetSsid}"...`);
          await this.execCommand(
            `sudo nmcli connection modify "${existingConnName}" 802-11-wireless-security.psk "${password}"`
          );
        } else if (!overridePassword && password) {
          // If password was provided without explicit override flag, update non-empty password
          await this.execCommand(
            `sudo nmcli connection modify "${existingConnName}" 802-11-wireless-security.psk "${password}"`
          ).catch(() => {});
        }

        // Set highest autoconnect priority
        await this.execCommand(
          `sudo nmcli connection modify "${existingConnName}" connection.autoconnect yes connection.autoconnect-priority ${targetPriority}`
        );

        // Bring connection up
        await this.execCommand(`sudo nmcli connection up "${existingConnName}"`);
      } else {
        this.logger.info(
          `[WifiManager] Creating new connection profile for "${targetSsid}" with priority ${targetPriority}...`
        );
        const passArg = password ? `password "${password}"` : '';
        await this.execCommand(
          `sudo nmcli dev wifi connect "${targetSsid}" ${passArg} ifname "${this.wifiInterface}"`
        );
        // Set autoconnect priority to highest
        await this.execCommand(
          `sudo nmcli connection modify "${targetSsid}" connection.autoconnect yes connection.autoconnect-priority ${targetPriority}`
        );
      }

      // 2. 30-Second Connectivity Verification
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
   * Fast boot-time evaluation of digital display connectivity.
   * Logic:
   * 1. If wired Ethernet is active and online -> keep client mode, suppress AP.
   * 2. If already online via Wi-Fi -> keep client mode.
   * 3. If zero saved Wi-Fi profiles exist -> immediately activate AP mode.
   * 4. If saved profiles exist:
   *    - Perform fast scan of airwaves.
   *    - If NONE of the saved profiles exist in the airwaves -> instantly activate AP mode.
   *    - If saved profiles ARE found in the airwaves -> try connecting in order of priority.
   *      If all fail -> activate AP mode.
   */
  public async evaluateStartupConnectivity(): Promise<{
    action: 'online' | 'ap_mode_started' | 'connected_to_profile';
    ssid?: string;
    reason: string;
  }> {
    this.logger.info('[WifiManager] Evaluating boot-time network connectivity...');

    // 1. Check Ethernet
    const ethOnline = await this.isEthernetOnline();
    if (ethOnline) {
      this.logger.info('[WifiManager] Wired Ethernet is connected with active internet. Suppressing AP mode.');
      return { action: 'online', reason: 'Wired Ethernet online' };
    }

    // 2. Check if already online via Wi-Fi
    const wifiOnline = await this.checkInternetAccess();
    if (wifiOnline) {
      const activeSsid = await this.getActiveSsid();
      this.logger.info(`[WifiManager] Digital display already online via Wi-Fi (SSID: "${activeSsid || 'connected'}").`);
      return { action: 'online', ssid: activeSsid || undefined, reason: 'Already online' };
    }

    // 3. Check saved Wi-Fi profiles
    const savedProfiles = await this.getSavedWifiProfiles();
    if (savedProfiles.length === 0) {
      this.logger.warn('[WifiManager] No saved Wi-Fi profiles found. Instantly activating AP mode...');
      await this.startApMode();
      return { action: 'ap_mode_started', reason: 'No saved Wi-Fi profiles' };
    }

    // 4. Stored profiles exist; scan airwaves to see if any are present
    this.logger.info(
      `[WifiManager] Found ${savedProfiles.length} saved Wi-Fi profile(s) (${savedProfiles.join(', ')}). Scanning airwaves...`
    );
    const scanned = await this.scanNetworks();
    const scannedSsids = new Set(scanned.map((s) => s.ssid));
    const matchingProfiles = savedProfiles.filter((p) => scannedSsids.has(p));

    if (matchingProfiles.length === 0) {
      this.logger.warn(
        '[WifiManager] None of the saved Wi-Fi profiles were detected in the airwaves. Instantly activating AP mode...'
      );
      await this.startApMode();
      return { action: 'ap_mode_started', reason: 'No saved profiles in range' };
    }

    // 5. Attempt connecting to matching profiles
    this.logger.info(
      `[WifiManager] Detected ${matchingProfiles.length} in-range saved profile(s): ${matchingProfiles.join(', ')}. Attempting connection...`
    );
    for (const targetSsid of matchingProfiles) {
      try {
        this.logger.info(`[WifiManager] Attempting connection to saved profile "${targetSsid}"...`);
        const res = await this.connectNetwork(targetSsid);
        if (res.success) {
          return { action: 'connected_to_profile', ssid: targetSsid, reason: res.resultSummary };
        }
      } catch (err: any) {
        this.logger.warn(`[WifiManager] Connection to saved profile "${targetSsid}" failed:`, err?.message || err);
      }
    }

    // 6. All in-range saved profiles failed
    this.logger.warn(
      '[WifiManager] All in-range saved profiles failed to connect. Activating AP mode...'
    );
    await this.startApMode();
    return { action: 'ap_mode_started', reason: 'All in-range saved profiles failed to connect' };
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
   * SSID: "Aura-<Last4MAC>", Password: "aura12345678"
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
      // 1. Unblock Wi-Fi and disable power-save (never call `nmcli dev wifi` here as it triggers a hardware scan!)
      await this.execCommand(`sudo rfkill unblock wifi 2>/dev/null`).catch(() => {});
      await this.execCommand(
        `sudo iw dev "${this.wifiInterface}" set power_save off 2>/dev/null`
      ).catch(() => {});

      // 2. Ensure dnsmasq provides wildcard DNS + Default Gateway (Option 3) + DNS (Option 6) + RFC 8910 Captive Portal URI (Option 114)
      await this.execCommand(
        `printf 'address=/#/10.42.0.1\\ndhcp-option=3,10.42.0.1\\ndhcp-option=6,10.42.0.1\\ndhcp-option=114,http://10.42.0.1/setup\\n' | sudo tee /etc/NetworkManager/dnsmasq-shared.d/captive.conf >/dev/null 2>&1 || true`
      ).catch(() => {});

      // 2b. Redirect port 80 to 8080 only if needed as fallback (if port 80 is bound natively via CAP_NET_BIND_SERVICE, remove stale REDIRECT rules)
      await this.execCommand(
        `sudo iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080 2>/dev/null || true`
      ).catch(() => {});

      // 3. Delete legacy AP profile names if they exist, and ensure "Aura-AP" exists without recreating it if already configured
      await this.execCommand(
        `sudo nmcli connection delete "Aura-Setup-AP" "Hotspot" 2>/dev/null`
      ).catch(() => {});

      const existingAp = await this.execCommand(
        `sudo nmcli -t -f NAME connection show "Aura-AP" 2>/dev/null`
      ).catch(() => '');

      if (!existingAp.includes('Aura-AP')) {
        // 4. Create 2.4 GHz WPA2-AES (RSN+CCMP) AP connection profile with PMF disabled
        await this.execCommand(
          `sudo nmcli connection add type wifi ifname "${this.wifiInterface}" con-name "Aura-AP" autoconnect no ssid "${this.apSsid}" 802-11-wireless.mode ap 802-11-wireless.band bg 802-11-wireless.channel 6 802-11-wireless-security.key-mgmt wpa-psk 802-11-wireless-security.psk "${this.apPassword}" 802-11-wireless-security.proto rsn 802-11-wireless-security.pairwise ccmp 802-11-wireless-security.group ccmp 802-11-wireless-security.pmf 1 ipv4.method shared ipv4.addresses 10.42.0.1/24 ipv6.method disabled`
        );
      }

      // 5. Activate the AP connection
      await this.execCommand(`sudo nmcli connection up "Aura-AP"`);

      // 6. On Raspberry Pi 5 (brcmfmac43455), if NetworkManager had a background client scan in flight
      //    when Aura-AP came up, wpa_supplicant logs "Failed to initiate AP scan" and brcmfmac aborts
      //    that scan after its 10s escan timer expires. Wait 12s for the escan timeout to clear, then
      //    re-activate Aura-AP once so beacons broadcast reliably at 100% power.
      await new Promise((r) => setTimeout(r, 2000));
      const wpaLog = await this.execCommand(
        `sudo journalctl -u wpa_supplicant -n 12 --no-pager 2>/dev/null`
      ).catch(() => '');
      if (wpaLog.includes('Failed to initiate AP scan')) {
        this.logger.warn(
          '[WifiManager] Detected pending brcmfmac scan collision during AP startup; waiting 12s for escan timer to clear and re-activating Aura-AP...'
        );
        await new Promise((r) => setTimeout(r, 12_000));
        await this.execCommand(`sudo nmcli connection up "Aura-AP"`);
      }

      this.apActive = true;
      this.logger.info(
        `[WifiManager] AP Mode active on interface "${this.wifiInterface}". Digital display is broadcasting SSID "${this.apSsid}" (2.4 GHz, Pass: "${this.apPassword}").`
      );
    } catch (err: any) {
      this.logger.warn(
        `[WifiManager] Primary AP creation encountered notice, attempting fallback: ${err?.message || err}`
      );
      try {
        await this.execCommand(
          `sudo nmcli dev wifi hotspot ifname "${this.wifiInterface}" ssid "${this.apSsid}" password "${this.apPassword}" con-name "Aura-AP"`
        );
        await this.execCommand(
          `sudo nmcli connection modify "Aura-AP" 802-11-wireless.band bg 802-11-wireless.channel 6 802-11-wireless-security.pmf 1 2>/dev/null || true`
        ).catch(() => {});
        this.apActive = true;
      } catch (fallbackErr: any) {
        this.logger.error('[WifiManager] Failed to launch AP mode via nmcli:', fallbackErr?.message || fallbackErr);
        this.apActive = false;
        throw fallbackErr;
      }
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
        await this.execCommand(`sudo nmcli connection down "Aura-AP"`).catch(() => {});
        await this.execCommand(`sudo nmcli connection delete "Aura-AP"`).catch(() => {});
        await this.execCommand(
          `sudo nmcli device set "${this.wifiInterface}" autoconnect yes`
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
            `sudo nmcli -t -f IN-USE,SIGNAL dev wifi list | grep '^\\*'`
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
        `sudo nmcli -t -f active,ssid dev wifi | grep '^yes'`
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
        `sudo nmcli -t -f AUTOCONNECT-PRIORITY connection show`
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
      const stdout = await this.execCommand(`sudo nmcli -t -f NAME,TYPE connection show`);
      const lines = stdout.split('\n');
      for (const line of lines) {
        const [name, type] = line.split(':');
        if ((type?.includes('wireless') || type?.includes('wifi')) && name?.trim() === ssid) {
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
      await this.execCommand(`sudo nmcli connection up "${previousSsid}"`);
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
