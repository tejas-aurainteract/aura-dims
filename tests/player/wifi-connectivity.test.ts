/**
 * Aura DIMS - Digital Display Wi-Fi Network & Captive Portal Test Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Always use "digital display" in user-facing naming and logs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Logger } from '../../player/src/agent/logger.js';
import { WifiManager } from '../../player/src/agent/wifiManager.js';
import { CaptivePortalServer } from '../../player/src/agent/captivePortal.js';
import { HardwareAdapter } from '../../player/src/agent/hardwareAdapter.js';
import { loadConfig } from '../../player/src/agent/config.js';
import { parseNmcliWifiList } from '@aura-dims/display-schema';

const TMP_LOGS = path.resolve(__dirname, '../../test-tmp/wifi-tests');

describe('Digital Display Wi-Fi Management & AP Onboarding', () => {
  let logger: Logger;

  beforeEach(() => {
    fs.mkdirSync(TMP_LOGS, { recursive: true });
    logger = new Logger(TMP_LOGS);
  });

  afterEach(() => {
    try {
      fs.rmSync(TMP_LOGS, { recursive: true, force: true });
    } catch {}
  });

  it('HardwareAdapter advertises manageWifi capability and wifi operation types', () => {
    const config = loadConfig({ dataDir: TMP_LOGS });
    const adapter = new HardwareAdapter(config, logger);
    const caps = adapter.getCapabilities();

    expect(caps.manageWifi).toBe(true);
    expect(caps.supportedOperationTypes).toContain('SCAN_WIFI');
    expect(caps.supportedOperationTypes).toContain('CONNECT_WIFI');
  });

  it('WifiManager initializes with default SSID "Aura" and password "12345678"', () => {
    const wifi = new WifiManager(logger);
    expect(wifi.getApSsid()).toBe('Aura');
    expect(wifi.getApPassword()).toBe('12345678');
    expect(wifi.isApModeActive()).toBe(false);
  });

  it('WifiManager scans networks and returns sorted results', async () => {
    const wifi = new WifiManager(logger);
    const networks = await wifi.scanNetworks();

    expect(networks.length).toBeGreaterThan(0);
    // Verifies descending signal order
    for (let i = 0; i < networks.length - 1; i++) {
      expect(networks[i]!.signal).toBeGreaterThanOrEqual(networks[i + 1]!.signal);
    }
  });

  it('WifiManager connects to network and returns success', async () => {
    const wifi = new WifiManager(logger);
    const result = await wifi.connectNetwork('Aura-Office-5G', 'secretpass123');

    expect(result.success).toBe(true);
    expect(result.ssid).toBe('Aura-Office-5G');
    expect(result.resultSummary).toContain('Aura-Office-5G');
  });

  it('WifiManager rejects connection with empty SSID', async () => {
    const wifi = new WifiManager(logger);
    await expect(wifi.connectNetwork('')).rejects.toThrow('SSID cannot be empty.');
  });

  it('CaptivePortalServer traps OS captive portal detection probes with HTTP 302', async () => {
    const wifi = new WifiManager(logger);
    const portal = new CaptivePortalServer(logger, wifi);
    const port = await portal.start(8765);

    try {
      // Test Apple probe
      const appleRes = await makeRequest(`http://127.0.0.1:${port}/hotspot-detect.html`);
      expect(appleRes.statusCode).toBe(302);
      expect(appleRes.headers.location).toContain('/setup');

      // Test Android probe
      const androidRes = await makeRequest(`http://127.0.0.1:${port}/generate_204`);
      expect(androidRes.statusCode).toBe(302);
      expect(androidRes.headers.location).toContain('/setup');

      // Test Windows probe
      const winRes = await makeRequest(`http://127.0.0.1:${port}/ncsi.txt`);
      expect(winRes.statusCode).toBe(302);
      expect(winRes.headers.location).toContain('/setup');

      // Test /setup serves HTML
      const setupRes = await makeRequest(`http://127.0.0.1:${port}/setup`);
      expect(setupRes.statusCode).toBe(200);
      expect(setupRes.body).toContain('Digital Display Wi-Fi Setup');
      expect(setupRes.body).toContain('Aura DIMS');
    } finally {
      await portal.stop();
    }
  });

  it('CaptivePortalServer serves Wi-Fi scan and status endpoints', async () => {
    const wifi = new WifiManager(logger);
    const portal = new CaptivePortalServer(logger, wifi);
    const port = await portal.start(8766);

    try {
      // Scan API
      const scanRes = await makeRequest(`http://127.0.0.1:${port}/api/wifi/scan`);
      expect(scanRes.statusCode).toBe(200);
      const scanJson = JSON.parse(scanRes.body);
      expect(scanJson.success).toBe(true);
      expect(Array.isArray(scanJson.networks)).toBe(true);

      // Status API
      const statusRes = await makeRequest(`http://127.0.0.1:${port}/api/wifi/status`);
      expect(statusRes.statusCode).toBe(200);
      const statusJson = JSON.parse(statusRes.body);
      expect(statusJson.success).toBe(true);
      expect(statusJson.status.apModeActive).toBe(false);
    } finally {
      await portal.stop();
    }
  });

  it('parseNmcliWifiList parses terse nmcli stdout correctly into WifiScannedNetwork items', () => {
    const mockOutput = [
      '*:Office-Primary:85:WPA2',
      ' :Guest-Open:45:',
      ' :Warehouse\\:Meeting:60:WPA2 WPA3',
      ' :Office-Primary:70:WPA2', // duplicate SSID with lower signal
      ' :--:30:WPA2', // hidden network (should be ignored)
      ' ::20:WPA2', // empty SSID
      '',
    ].join('\n');

    const result = parseNmcliWifiList(mockOutput);

    expect(result).toHaveLength(3);

    // 1. In-use network should be sorted first
    expect(result[0]!.ssid).toBe('Office-Primary');
    expect(result[0]!.inUse).toBe(true);
    expect(result[0]!.signal).toBe(85);
    expect(result[0]!.security).toBe('wpa2');

    // 2. Warehouse:Meeting with escaped colon
    expect(result[1]!.ssid).toBe('Warehouse:Meeting');
    expect(result[1]!.signal).toBe(60);
    expect(result[1]!.security).toBe('wpa3');
    expect(result[1]!.inUse).toBe(false);

    // 3. Guest-Open
    expect(result[2]!.ssid).toBe('Guest-Open');
    expect(result[2]!.signal).toBe(45);
    expect(result[2]!.security).toBe('open');
    expect(result[2]!.inUse).toBe(false);
  });
});

function makeRequest(
  url: string,
  options?: http.RequestOptions
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, options || {}, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body,
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}
