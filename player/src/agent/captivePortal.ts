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
  private server: http.Server | null = null;
  private isRunning = false;
  private activePort = 80;

  constructor(logger: Logger, wifiManager: WifiManager) {
    this.logger = logger;
    this.wifiManager = wifiManager;
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

    // 5. API: Connect to Wi-Fi
    if (req.method === 'POST' && pathname === '/api/wifi/connect') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const ssid = (parsed.ssid || '').trim();
          const password = parsed.password || '';
          const overridePassword = Boolean(parsed.overridePassword);

          if (!ssid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'SSID is required' }));
            return;
          }

          this.logger.info(
            `[CaptivePortal] Received user connect request for SSID: "${ssid}" (overridePassword: ${overridePassword})`
          );
          const result = await this.wifiManager.connectNetwork(ssid, password, 100, overridePassword);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || 'Connection failed' }));
        }
      });
      return;
    }

    // 6. Catch-all redirect for captive portal detection on any other domain
    res.writeHead(302, { Location: `http://${hostHeader}/setup` });
    res.end();
  }

  private getSetupHtml(): string {
    const apSsid = this.wifiManager.getApSsid();

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
      statusBox.innerHTML = '<span class="spinner"></span> Connecting to "' + escapeHtml(ssid) + '" and verifying internet access (30s test)...';

      try {
        const res = await fetch('/api/wifi/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssid, password, overridePassword })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          statusBox.className = 'status-box status-success';
          statusBox.innerHTML = '✓ ' + escapeHtml(data.resultSummary || 'Successfully connected to Wi-Fi!') + '<br><small>This digital display is now online. Hotspot mode will close automatically.</small>';
        } else {
          statusBox.className = 'status-box status-error';
          statusBox.innerHTML = '⚠ ' + escapeHtml(data.error || 'Connection failed.');
          connectBtn.disabled = false;
        }
      } catch (err) {
        statusBox.className = 'status-box status-error';
        statusBox.innerHTML = '⚠ Connection timed out or digital display switched networks. Please verify connection.';
        connectBtn.disabled = false;
      }
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    }

    // Auto-scan on load
    window.addEventListener('DOMContentLoaded', scanWifi);
  </script>
</body>
</html>`;
  }
}
