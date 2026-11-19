/**
 * Aura DIMS - Captive Portal HTTP Server & Wi-Fi Onboarding UI
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements:
 * - Operating System captive detection traps (Apple, Android, Windows, Firefox)
 * - 302 Catch-all redirect to /setup
 * - Responsive, mobile-first Wi-Fi onboarding interface
 * - Local Wi-Fi scan and connection API
 *
 * Terminology rule: Always use "digital display" in user-facing naming and logs.
 */

import * as http from 'node:http';
import type { Logger } from './logger.js';
import type { WifiManager } from './wifiManager.js';
import type { DeviceIdentity } from './identity.js';
import type { SyncEngine } from './syncEngine.js';

function escapeHtml(str: string): string {
  return String(str || '').replace(/[&<>"']/g, (m) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[m] ?? m;
  });
}

export class CaptivePortalServer {
  private readonly logger: Logger;
  private readonly wifiManager: WifiManager;
  private readonly identity?: DeviceIdentity;
  private readonly syncEngine?: SyncEngine;
  private readonly onRefreshRenderer?: () => void;
  private server: http.Server | null = null;
  private isRunning = false;
  private activePort = 80;

  constructor(
    logger: Logger,
    wifiManager: WifiManager,
    identity?: DeviceIdentity,
    syncEngine?: SyncEngine,
    onRefreshRenderer?: () => void
  ) {
    this.logger = logger;
    this.wifiManager = wifiManager;
    this.identity = identity;
    this.syncEngine = syncEngine;
    this.onRefreshRenderer = onRefreshRenderer;
  }

  public async start(preferredPort = 80): Promise<number> {
    if (this.isRunning) return this.activePort;

    return new Promise((resolve) => {
      const tryPort = (port: number) => {
        const srv = http.createServer((req, res) => this.handleRequest(req, res));

        srv.on('error', (err: any) => {
          if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
            if (port === 80) {
              this.logger.warn(
                `[CaptivePortal] Port 80 unavailable (${err.code}). Falling back to port 8080...`
              );
              tryPort(8080);
              return;
            }
          }
          this.logger.error('[CaptivePortal] Server error:', err?.message || err);
        });

        srv.listen(port, '0.0.0.0', () => {
          this.server = srv;
          this.isRunning = true;
          this.activePort = port;
          this.logger.info(
            `[CaptivePortal] Captive Portal HTTP service listening on 0.0.0.0:${port}`
          );
          resolve(port);
        });
      };

      tryPort(preferredPort);
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning || !this.server) return;
    return new Promise((resolve) => {
      this.server?.close(() => {
        this.isRunning = false;
        this.server = null;
        this.logger.info('[CaptivePortal] Captive Portal server stopped.');
        resolve();
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const hostHeader = req.headers.host || '10.42.0.1';
    const parsedUrl = new URL(req.url || '/', `http://${hostHeader}`);
    const pathname = parsedUrl.pathname;

    // Set CORS headers for local setup API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. Operating System Captive Portal Traps
    const isProbe =
      pathname === '/generate_204' ||
      pathname === '/gen_204' ||
      pathname === '/hotspot-detect.html' ||
      pathname === '/canonical.html' ||
      pathname === '/connecttest.txt' ||
      pathname === '/ncsi.txt' ||
      pathname === '/success.txt' ||
      pathname === '/mobile/status.php';

    if (isProbe) {
      this.logger.info(`[CaptivePortal] Trapped OS captive probe: ${pathname}. Redirecting to /setup...`);
      res.writeHead(302, { Location: `http://${hostHeader}/setup` });
      res.end();
      return;
    }

    // 2. Setup Page & Static Assets
    if (pathname === '/' || pathname === '/setup') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getSetupHtml());
      return;
    }

    // 3. API: Scan Wi-Fi Networks
    if (req.method === 'GET' && pathname === '/api/wifi/scan') {
      try {
        const networks = await this.wifiManager.scanNetworks();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, networks }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || 'Scan failed' }));
      }
      return;
    }

    // 4. API: Wi-Fi Status
    if (req.method === 'GET' && pathname === '/api/wifi/status') {
      try {
        const status = await this.wifiManager.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || 'Status check failed' }));
      }
      return;
    }

    // 5. API: Connect to Wi-Fi (Fast-ACK to prevent browser disconnect timeout on AP teardown)
    if (req.method === 'POST' && pathname === '/api/wifi/connect') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const ssid = (parsed.ssid || '').trim();
          const password = parsed.password || '';
          const overridePassword = Boolean(parsed.overridePassword);

          if (!ssid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'SSID is required' }));
            return;
          }

          this.logger.info(
            `[CaptivePortal] Received user connect request for SSID: "${ssid}" (overridePassword: ${overridePassword}). Sending Fast-ACK before AP mode switch...`
          );

          // Fast-ACK: Immediately send 200 OK while AP hotspot link is fully alive so browser receives clean confirmation
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              pending: true,
              ssid,
              resultSummary: `Connection initiated to "${ssid}". This digital display is now switching to Wi-Fi and closing the setup hotspot.`,
            })
          );

          // Schedule the physical network connection after a 600ms grace period so TCP socket cleanly flushes
          setTimeout(async () => {
            try {
              this.logger.info(`[CaptivePortal] Executing network switch to Wi-Fi "${ssid}"...`);
              await this.wifiManager.connectNetwork(ssid, password, 100, overridePassword);
              this.logger.info(`[CaptivePortal] Successfully joined Wi-Fi network "${ssid}".`);
            } catch (err: any) {
              this.logger.error(
                `[CaptivePortal] Asynchronous switch to Wi-Fi "${ssid}" failed:`,
                err?.message || err
              );
            }
          }, 600);
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || 'Connection failed' }));
        }
      });
      return;
    }

    // 6. API: Device Registration & Identity Info
    if (req.method === 'GET' && pathname === '/api/device/info') {
      const isEnrolled = this.identity?.isEnrolled() ?? false;
      const creds = isEnrolled ? this.identity?.getCredentials() : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          enrolled: isEnrolled,
          displayId: creds?.displayId || null,
          apSsid: this.wifiManager.getApSsid(),
        })
      );
      return;
    }

    // 7. API: Redeem Pairing Key Code (Pair Digital Display)
    if (req.method === 'POST' && pathname === '/api/pair') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const pairingCode = (parsed.pairingCode || parsed.code || '').trim().toUpperCase();

          if (!pairingCode) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Pairing key code is required.' }));
            return;
          }

          if (!this.identity) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: 'Device identity provider is not initialized on this digital display.',
              })
            );
            return;
          }

          this.logger.info(
            `[CaptivePortal] Attempting to pair digital display with key code: "${pairingCode}"...`
          );
          const result = await this.identity.pairWithCode(pairingCode);

          if (result.success) {
            this.logger.info(
              `[CaptivePortal] Digital display paired successfully as: "${result.displayId}".`
            );

            if (this.syncEngine) {
              this.syncEngine.checkForUpdates().catch((err: any) => {
                this.logger.warn('[CaptivePortal] Post-pairing sync check warning:', err?.message || err);
              });
            }

            if (this.onRefreshRenderer) {
              try {
                this.onRefreshRenderer();
              } catch (err: any) {
                this.logger.warn(
                  '[CaptivePortal] Post-pairing renderer refresh warning:',
                  err?.message || err
                );
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: true,
                displayId: result.displayId,
                message: 'Digital display registered successfully!',
              })
            );
          } else {
            this.logger.warn(`[CaptivePortal] Pairing failed: ${result.error}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: result.error || 'Invalid or expired pairing code.',
              })
            );
          }
        } catch (err: any) {
          this.logger.error('[CaptivePortal] Pairing request error:', err?.message || err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              error: err?.message || 'Internal pairing error.',
            })
          );
        }
      });
      return;
    }

    // 8. API: Unpair Digital Display (Wipe local credentials)
    if (req.method === 'POST' && pathname === '/api/unpair') {
      try {
        if (this.identity) {
          this.identity.clearCredentials();
        }
        this.logger.info('[CaptivePortal] Digital display credentials cleared via unpair API.');

        if (this.onRefreshRenderer) {
          try {
            this.onRefreshRenderer();
          } catch (err: any) {
            this.logger.warn(
              '[CaptivePortal] Post-unpair renderer refresh warning:',
              err?.message || err
            );
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            message: 'Digital display unpaired successfully.',
          })
        );
      } catch (err: any) {
        this.logger.error('[CaptivePortal] Unpair request error:', err?.message || err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: err?.message || 'Failed to unpair digital display.',
          })
        );
      }
      return;
    }

    // 9. API: Reboot Digital Display
    if (req.method === 'POST' && pathname === '/api/reboot') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Rebooting digital display...' }));
      this.logger.info('[CaptivePortal] Digital display reboot requested from captive portal.');
      setTimeout(() => {
        import('node:child_process').then(({ exec }) => {
          exec('sudo systemctl reboot || sudo reboot', (err) => {
            if (err) this.logger.error('[CaptivePortal] Reboot command failed:', err);
          });
        });
      }, 1000);
      return;
    }

    // 10. Catch-all redirect for captive portal detection on any other domain
    res.writeHead(302, { Location: `http://${hostHeader}/setup` });
    res.end();
  }

  private getSetupHtml(): string {
    const apSsid = this.wifiManager.getApSsid();
    const isEnrolled = this.identity?.isEnrolled() ?? false;
    const creds = isEnrolled ? this.identity?.getCredentials() : null;
    const displayId = creds?.displayId || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Aura DIMS - Digital Display Wi-Fi Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #090d16; color: #f1f5f9; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.25rem; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 1rem; width: 100%; max-width: 460px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .header { text-align: center; margin-bottom: 1.25rem; }
    .badge { display: inline-block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #14b8a6; background: rgba(20,184,166,0.1); border: 1px solid rgba(20,184,166,0.3); padding: 0.25rem 0.75rem; border-radius: 9999px; margin-bottom: 0.5rem; }
    h1 { font-size: 1.35rem; font-weight: 700; color: #ffffff; margin-bottom: 0.35rem; }
    p.sub { font-size: 0.85rem; color: #94a3b8; line-height: 1.4; }
    .hotspot-pill { display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.5rem; font-size: 0.75rem; color: #38bdf8; background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.25); padding: 0.2rem 0.6rem; border-radius: 0.5rem; }
    .btn-scan { width: 100%; padding: 0.65rem 1rem; background: #1e293b; color: #38bdf8; border: 1px solid #334155; border-radius: 0.5rem; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem; transition: background 0.2s; }
    .btn-scan:hover { background: #334155; }
    .network-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 240px; overflow-y: auto; margin-bottom: 1.25rem; padding-right: 0.25rem; }
    .network-item { background: #1e293b; border: 1px solid #334155; border-radius: 0.5rem; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.15s; }
    .network-item:hover, .network-item.selected { border-color: #14b8a6; background: rgba(20,184,166,0.08); }
    .network-info { display: flex; align-items: center; gap: 0.75rem; }
    .ssid { font-size: 0.9rem; font-weight: 600; color: #f8fafc; display: flex; align-items: center; gap: 0.4rem; }
    .meta { font-size: 0.75rem; color: #64748b; }
    .signal-pill { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 0.25rem; }
    .sig-strong { background: rgba(34,197,94,0.15); color: #4ade80; }
    .sig-med { background: rgba(234,179,8,0.15); color: #facc15; }
    .sig-weak { background: rgba(239,68,68,0.15); color: #f87171; }
    .badge-saved { font-size: 0.65rem; font-weight: 700; background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); padding: 0.1rem 0.35rem; border-radius: 0.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .saved-box { background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.25); border-radius: 0.5rem; padding: 0.65rem 0.85rem; margin-bottom: 1rem; font-size: 0.8rem; }
    .saved-header { color: #86efac; font-weight: 600; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
    .override-label { display: flex; align-items: center; gap: 0.5rem; color: #cbd5e1; font-size: 0.8rem; cursor: pointer; user-select: none; }
    .override-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: #14b8a6; cursor: pointer; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.8rem; font-weight: 500; color: #cbd5e1; margin-bottom: 0.35rem; }
    input[type="text"], input[type="password"] { width: 100%; background: #020617; border: 1px solid #334155; border-radius: 0.5rem; padding: 0.65rem 0.85rem; color: #f8fafc; font-size: 0.9rem; outline: none; }
    input[type="text"]:focus, input[type="password"]:focus { border-color: #14b8a6; box-shadow: 0 0 0 2px rgba(20,184,166,0.2); }
    .btn-connect { width: 100%; padding: 0.75rem; background: #0d9488; color: #ffffff; border: none; border-radius: 0.5rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn-connect:hover { background: #14b8a6; }
    .btn-connect:disabled { opacity: 0.5; cursor: not-allowed; }
    .status-box { margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.85rem; display: none; }
    .status-error { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; display: block; }
    .status-success { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); color: #86efac; display: block; }
    .status-loading { background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.3); color: #7dd3fc; display: block; }
    .hidden { display: none !important; }
    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #ffffff; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 6px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Maintenance & Pairing Section Styles */
    .maintenance-section { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid #1e293b; }
    .maintenance-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
    .m-title { display: flex; align-items: center; gap: 0.45rem; font-size: 0.95rem; font-weight: 600; color: #f1f5f9; }
    .m-sub { font-size: 0.8rem; color: #94a3b8; line-height: 1.4; margin-bottom: 1rem; }
    .m-sub code { background: #020617; border: 1px solid #334155; padding: 0.15rem 0.4rem; border-radius: 0.25rem; color: #38bdf8; font-family: monospace; font-size: 0.8rem; }
    .badge-status { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge-enrolled { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
    .badge-unregistered { background: rgba(234,179,8,0.15); color: #facc15; border: 1px solid rgba(234,179,8,0.3); }
    .m-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .btn-m { flex: 1 1 calc(50% - 0.375rem); min-width: 120px; padding: 0.7rem 0.85rem; border-radius: 0.5rem; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.45rem; transition: all 0.2s; border: none; }
    .btn-register { background: #0284c7; color: #ffffff; }
    .btn-register:hover { background: #0369a1; }
    .btn-unpair { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
    .btn-unpair:hover { background: rgba(239,68,68,0.25); border-color: #ef4444; }
    .btn-reboot { background: #1e293b; color: #f87171; border: 1px solid #334155; }
    .btn-reboot:hover { background: #334155; border-color: #ef4444; }

    /* Modal Dialog */
    .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .modal-card { background: #0f172a; border: 1px solid #334155; border-radius: 1rem; width: 100%; max-width: 440px; padding: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); animation: modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
    .modal-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1.15rem; font-weight: 700; color: #ffffff; }
    .modal-close { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; padding: 0.2rem 0.5rem; border-radius: 0.35rem; line-height: 1; }
    .modal-close:hover { color: #f1f5f9; background: #1e293b; }
    .modal-desc { font-size: 0.8rem; color: #94a3b8; line-height: 1.45; margin-bottom: 1.25rem; }
    .code-input { letter-spacing: 0.2em; font-size: 1.35rem; font-weight: 700; text-align: center; text-transform: uppercase; color: #38bdf8; padding: 0.75rem !important; }
    .modal-buttons { display: flex; gap: 0.75rem; margin-top: 1.25rem; }
    .btn-cancel { flex: 1; padding: 0.75rem; background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 0.5rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn-cancel:hover { background: #334155; color: #ffffff; }
    .btn-pair-submit { flex: 1.6; padding: 0.75rem; background: #0d9488; color: #ffffff; border: none; border-radius: 0.5rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn-pair-submit:hover { background: #14b8a6; }
    .btn-pair-submit:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">Aura DIMS • Signage Setup</div>
      <h1>Digital Display Wi-Fi Setup</h1>
      <p class="sub">Select a local Wi-Fi network to connect this digital display to the Aura DIMS Cloud.</p>
      <div class="hotspot-pill">
        <span>Broadcasting: <strong>${escapeHtml(apSsid)}</strong></span>
      </div>
    </div>

    <button id="scan-btn" class="btn-scan" onclick="scanWifi()">
      <span id="scan-label">↻ Scan Available Networks</span>
    </button>

    <div id="network-container" class="network-list">
      <div style="text-align: center; color: #64748b; font-size: 0.85rem; padding: 1.5rem 0;">
        Scanning for nearby Wi-Fi networks...
      </div>
    </div>

    <form id="connect-form" onsubmit="connectWifi(event)">
      <div class="form-group">
        <label for="ssid-input">Wi-Fi Network (SSID)</label>
        <input type="text" id="ssid-input" placeholder="Select above or type SSID..." required autocomplete="off" oninput="handleSsidInput()">
      </div>

      <div id="saved-box" class="saved-box hidden">
        <div class="saved-header">
          <span>✓ Stored Credentials Available</span>
        </div>
        <p style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 0.4rem;">
          This digital display already has saved credentials for this network. You do not need to re-enter the password.
        </p>
        <label class="override-label">
          <input type="checkbox" id="override-check" onchange="toggleOverride()">
          <span>Override / Update password</span>
        </label>
      </div>

      <div class="form-group" id="pass-group">
        <label for="pass-input" id="pass-label">Password</label>
        <input type="password" id="pass-input" placeholder="Enter Wi-Fi password..." autocomplete="off">
      </div>

      <button type="submit" id="connect-btn" class="btn-connect">Connect Digital Display</button>
    </form>

    <div id="status-box" class="status-box"></div>

    <!-- Maintenance & Device Registration Section -->
    <div class="maintenance-section">
      <div class="maintenance-header">
        <div class="m-title">
          <span>Digital Display Maintenance</span>
        </div>
        <span id="enrollment-badge" class="badge-status ${isEnrolled ? 'badge-enrolled' : 'badge-unregistered'}">
          ${isEnrolled ? '✓ Registered' : '• Unregistered'}
        </span>
      </div>
      <p class="m-sub" id="enrollment-sub">
        ${
          isEnrolled
            ? `Enrolled with Display ID: <code id="display-id-text">${escapeHtml(displayId)}</code>`
            : 'This digital display is not yet registered in Aura DIMS.'
        }
      </p>

      <div class="m-actions">
        <button type="button" class="btn-m btn-register" onclick="openPairModal()">
          <span id="register-btn-label">${isEnrolled ? 'Re-pair Display' : 'Register Digital Display'}</span>
        </button>
        <button type="button" class="btn-m btn-unpair ${isEnrolled ? '' : 'hidden'}" id="unpair-btn" onclick="unpairDevice()">
          <span>Unpair Display</span>
        </button>
        <button type="button" class="btn-m btn-reboot" onclick="rebootDevice()">
          <span>Reboot Display</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Register Digital Display Popup Modal -->
  <div id="pair-modal" class="modal-backdrop hidden" onclick="handleModalBackdrop(event)">
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">
          <h3>Register Digital Display</h3>
        </div>
        <button type="button" class="modal-close" onclick="closePairModal()">&times;</button>
      </div>
      <p class="modal-desc">
        Enter the pairing code generated in the Aura DIMS Web Console (under <strong>Displays &gt; Add Digital Display</strong>) to pair this digital display with your organization.
      </p>

      <form id="pair-form" onsubmit="submitPairCode(event)">
        <div class="form-group">
          <label for="pairing-code-input">Pairing Key Code</label>
          <input
            type="text"
            id="pairing-code-input"
            class="code-input"
            placeholder="e.g. 7K2M9P"
            maxlength="12"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            required
            oninput="this.value = this.value.toUpperCase()"
          />
        </div>

        <div id="pair-status-box" class="status-box"></div>

        <div class="modal-buttons">
          <button type="button" class="btn-cancel" onclick="closePairModal()">Cancel</button>
          <button type="submit" id="pair-submit-btn" class="btn-pair-submit">Pair & Activate</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let scannedList = [];
    let selectedNetwork = null;

    async function scanWifi() {
      const btn = document.getElementById('scan-btn');
      const label = document.getElementById('scan-label');
      const container = document.getElementById('network-container');
      btn.disabled = true;
      label.innerHTML = '<span class="spinner"></span> Scanning...';

      try {
        const res = await fetch('/api/wifi/scan');
        const data = await res.json();
        if (data.success && data.networks) {
          scannedList = data.networks;
          renderNetworks(scannedList);
        } else {
          container.innerHTML = '<div style="text-align: center; color: #f87171; font-size: 0.85rem; padding: 1rem;">Scan error: ' + (data.error || 'Unknown error') + '</div>';
        }
      } catch (err) {
        container.innerHTML = '<div style="text-align: center; color: #f87171; font-size: 0.85rem; padding: 1rem;">Could not reach setup service.</div>';
      } finally {
        btn.disabled = false;
        label.innerHTML = '↻ Refresh Networks';
      }
    }

    function renderNetworks(list) {
      const container = document.getElementById('network-container');
      if (!list || list.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #94a3b8; font-size: 0.85rem; padding: 1.5rem 0;">No Wi-Fi networks found. Try scanning again.</div>';
        return;
      }

      container.innerHTML = list.map((net, idx) => {
        const sigClass = net.signal >= 70 ? 'sig-strong' : net.signal >= 40 ? 'sig-med' : 'sig-weak';
        const isSelected = selectedNetwork && selectedNetwork.ssid === net.ssid;
        return \`
          <div class="network-item \${isSelected ? 'selected' : ''}" onclick="selectNetwork(\${idx})">
            <div class="network-info">
              <div>
                <div class="ssid">
                  \${escapeHtml(net.ssid)}
                  \${net.isSaved ? '<span class="badge-saved">✓ Saved</span>' : ''}
                </div>
                <div class="meta">\${net.security === 'open' ? 'Open Network' : net.security.toUpperCase()} \${net.channel ? '• Ch ' + net.channel : ''}</div>
              </div>
            </div>
            <span class="signal-pill \${sigClass}">\${net.signal}%</span>
          </div>
        \`;
      }).join('');
    }

    function selectNetwork(idx) {
      const net = scannedList[idx];
      if (!net) return;
      selectedNetwork = net;
      document.getElementById('ssid-input').value = net.ssid;
      updateFormState(net);
      renderNetworks(scannedList);
    }

    function handleSsidInput() {
      const typed = document.getElementById('ssid-input').value.trim();
      const match = scannedList.find(n => n.ssid === typed);
      selectedNetwork = match || { ssid: typed, security: 'wpa2', isSaved: false };
      updateFormState(selectedNetwork);
    }

    function updateFormState(net) {
      const savedBox = document.getElementById('saved-box');
      const overrideCheck = document.getElementById('override-check');
      const passGroup = document.getElementById('pass-group');
      const passInput = document.getElementById('pass-input');
      const passLabel = document.getElementById('pass-label');
      const connectBtn = document.getElementById('connect-btn');

      if (net.isSaved) {
        savedBox.classList.remove('hidden');
        if (overrideCheck.checked) {
          passGroup.classList.remove('hidden');
          passLabel.textContent = 'New Wi-Fi Password';
          passInput.placeholder = 'Enter new password to override stored one...';
          passInput.focus();
          connectBtn.textContent = 'Update Password & Connect';
        } else {
          passGroup.classList.add('hidden');
          passInput.value = '';
          connectBtn.textContent = 'Connect Using Saved Credentials';
        }
      } else {
        savedBox.classList.add('hidden');
        overrideCheck.checked = false;
        passLabel.textContent = 'Password';
        passInput.placeholder = 'Enter Wi-Fi password...';

        if (net.security === 'open') {
          passGroup.classList.add('hidden');
          passInput.value = '';
          connectBtn.textContent = 'Connect Digital Display';
        } else {
          passGroup.classList.remove('hidden');
          connectBtn.textContent = 'Connect Digital Display';
        }
      }
    }

    function toggleOverride() {
      if (selectedNetwork) {
        updateFormState(selectedNetwork);
      }
    }

    async function connectWifi(e) {
      e.preventDefault();
      const ssid = document.getElementById('ssid-input').value.trim();
      const passInput = document.getElementById('pass-input');
      const overrideCheck = document.getElementById('override-check');
      const statusBox = document.getElementById('status-box');
      const connectBtn = document.getElementById('connect-btn');

      if (!ssid) return;

      const isSaved = selectedNetwork && selectedNetwork.isSaved;
      const overridePassword = isSaved && overrideCheck && overrideCheck.checked;
      const password = passInput.value;

      connectBtn.disabled = true;
      statusBox.className = 'status-box status-loading';
      statusBox.innerHTML = '<span class="spinner"></span> Connecting to "' + escapeHtml(ssid) + '"...';

      try {
        const res = await fetch('/api/wifi/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssid, password, overridePassword })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          statusBox.className = 'status-box status-success';
          statusBox.innerHTML = '✓ ' + escapeHtml(data.resultSummary || 'Wi-Fi connection initiated!') + '<br><small>This digital display is now switching to "' + escapeHtml(ssid) + '" and closing the hotspot. You may now reconnect to your regular Wi-Fi network.</small>';
        } else {
          statusBox.className = 'status-box status-error';
          statusBox.innerHTML = '⚠ ' + escapeHtml(data.error || 'Connection failed.');
          connectBtn.disabled = false;
        }
      } catch (err) {
        statusBox.className = 'status-box status-success';
        statusBox.innerHTML = '✓ Wi-Fi command accepted!<br><small>Digital display switched interfaces to connect to "' + escapeHtml(ssid) + '". Setup hotspot closed. You may now reconnect your device to normal Wi-Fi.</small>';
      }
    }

    function openPairModal() {
      const modal = document.getElementById('pair-modal');
      const input = document.getElementById('pairing-code-input');
      const statusBox = document.getElementById('pair-status-box');
      const submitBtn = document.getElementById('pair-submit-btn');
      statusBox.className = 'status-box';
      statusBox.innerHTML = '';
      input.value = '';
      submitBtn.disabled = false;
      modal.classList.remove('hidden');
      setTimeout(function() { input.focus(); }, 120);
    }

    function closePairModal() {
      document.getElementById('pair-modal').classList.add('hidden');
    }

    function handleModalBackdrop(e) {
      if (e.target.id === 'pair-modal') {
        closePairModal();
      }
    }

    async function submitPairCode(e) {
      e.preventDefault();
      const input = document.getElementById('pairing-code-input');
      const code = input.value.trim().toUpperCase();
      const statusBox = document.getElementById('pair-status-box');
      const submitBtn = document.getElementById('pair-submit-btn');

      if (!code) return;

      submitBtn.disabled = true;
      statusBox.className = 'status-box status-loading';
      statusBox.innerHTML = '<span class="spinner"></span> Redeeming pairing code with Aura DIMS Cloud...';

      try {
        const res = await fetch('/api/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairingCode: code })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          statusBox.className = 'status-box status-success';
          statusBox.innerHTML = '✓ Digital display registered successfully!<br><small>Display ID: <strong>' + escapeHtml(data.displayId) + '</strong>. Initializing playback...</small>';

          const badge = document.getElementById('enrollment-badge');
          if (badge) {
            badge.className = 'badge-status badge-enrolled';
            badge.textContent = '✓ Registered';
          }
          const sub = document.getElementById('enrollment-sub');
          if (sub) {
            sub.innerHTML = 'Enrolled with Display ID: <code>' + escapeHtml(data.displayId) + '</code>';
          }
          const regBtn = document.getElementById('register-btn-label');
          if (regBtn) {
            regBtn.textContent = 'Re-pair Display';
          }
          const unpairBtn = document.getElementById('unpair-btn');
          if (unpairBtn) {
            unpairBtn.classList.remove('hidden');
          }

          setTimeout(function() {
            closePairModal();
          }, 2500);
        } else {
          statusBox.className = 'status-box status-error';
          statusBox.innerHTML = '⚠ ' + escapeHtml(data.error || 'Pairing failed. Please verify code and internet connection.');
          submitBtn.disabled = false;
        }
      } catch (err) {
        statusBox.className = 'status-box status-error';
        statusBox.innerHTML = '⚠ Could not contact digital display service. Please try again.';
        submitBtn.disabled = false;
      }
    }

    async function loadDeviceInfo() {
      try {
        const res = await fetch('/api/device/info');
        const data = await res.json();
        if (data.success) {
          const badge = document.getElementById('enrollment-badge');
          const sub = document.getElementById('enrollment-sub');
          const regBtn = document.getElementById('register-btn-label');
          const unpairBtn = document.getElementById('unpair-btn');
          if (data.enrolled && data.displayId) {
            if (badge) {
              badge.className = 'badge-status badge-enrolled';
              badge.textContent = '✓ Registered';
            }
            if (sub) {
              sub.innerHTML = 'Enrolled with Display ID: <code>' + escapeHtml(data.displayId) + '</code>';
            }
            if (regBtn) regBtn.textContent = 'Re-pair Display';
            if (unpairBtn) unpairBtn.classList.remove('hidden');
          } else {
            if (badge) {
              badge.className = 'badge-status badge-unregistered';
              badge.textContent = '• Unregistered';
            }
            if (sub) {
              sub.textContent = 'This digital display is not yet registered in Aura DIMS.';
            }
            if (regBtn) regBtn.textContent = 'Register Digital Display';
            if (unpairBtn) unpairBtn.classList.add('hidden');
          }
        }
      } catch (e) {}
    }

    async function unpairDevice() {
      if (!confirm('Are you sure you want to unpair this digital display from Aura DIMS?\\n\\nThis will wipe local device credentials and return the display to an unregistered state.')) {
        return;
      }
      try {
        const res = await fetch('/api/unpair', { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('Digital display successfully unpaired.');
          loadDeviceInfo();
        } else {
          alert('Could not unpair digital display: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Could not contact digital display service to unpair.');
      }
    }

    async function rebootDevice() {
      if (!confirm('Are you sure you want to reboot this digital display?')) return;
      try {
        await fetch('/api/reboot', { method: 'POST' });
        alert('Digital display reboot command issued. It will restart shortly.');
      } catch (err) {
        alert('Reboot requested.');
      }
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    }

    // Auto-scan and status refresh on load
    window.addEventListener('DOMContentLoaded', function() {
      loadDeviceInfo();
      scanWifi();
    });
  </script>
</body>
</html>`;
  }
}
