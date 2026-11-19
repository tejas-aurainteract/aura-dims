/**
 * Aura DIMS - Digital Display Setup Portal & Captive Assistant
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Runs locally on the digital display during Setup / AP Mode to configure Wi-Fi
 * and provide a secure on-device maintenance & registration panel.
 * Terminology rule: Strictly use "digital display" in user-facing copy and logs.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const PORT = parseInt(process.env.SETUP_PORT || '80', 10);
const SETUP_DIR = path.resolve(__dirname);
const SETUP_HTML = path.join(SETUP_DIR, 'setup.html');
const CREDENTIALS_FILE = '/home/aura/player/data/credentials/device-credentials.json';

function getApSsid() {
  try {
    let serial = '';
    const serialFile = '/sys/firmware/devicetree/base/serial-number';
    if (fs.existsSync(serialFile)) {
      serial = fs.readFileSync(serialFile, 'utf8').replace(/\0/g, '').trim();
    }
    if (!serial && fs.existsSync('/proc/cpuinfo')) {
      const match = fs.readFileSync('/proc/cpuinfo', 'utf8').match(/Serial\s*:\s*([0-9a-fA-F]+)/);
      if (match) serial = match[1];
    }
    const suffix = (serial || 'A1B2').slice(-4).toUpperCase();
    return `Aura-${suffix}`;
  } catch (e) {
    return 'Aura-Setup';
  }
}

function getCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return null;
}

const server = http.createServer((req, res) => {
  const hostHeader = req.headers.host || '10.42.0.1';
  const parsedUrl = new URL(req.url || '/', `http://${hostHeader}`);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Captive Portal OS Traps
  const isProbe = [
    '/generate_204',
    '/gen_204',
    '/hotspot-detect.html',
    '/canonical.html',
    '/connecttest.txt',
    '/ncsi.txt',
    '/success.txt',
    '/mobile/status.php',
  ].includes(pathname);

  if (isProbe) {
    res.writeHead(302, { Location: `http://${hostHeader}/setup` });
    res.end();
    return;
  }

  // Serve Setup HTML
  if (pathname === '/' || pathname === '/setup') {
    if (fs.existsSync(SETUP_HTML)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(SETUP_HTML, 'utf8'));
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Setup page template not found.');
    }
    return;
  }

  // Device Info API
  if (req.method === 'GET' && pathname === '/api/device/info') {
    const creds = getCredentials();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        enrolled: !!creds,
        displayId: creds ? creds.displayId : null,
        apSsid: getApSsid(),
      })
    );
    return;
  }

  // Wi-Fi Scan API
  if (req.method === 'GET' && pathname === '/api/wifi/scan') {
    exec('sudo nmcli -t -f active,ssid,signal,security dev wifi list --rescan yes 2>/dev/null || sudo nmcli -t -f active,ssid,signal,security dev wifi list 2>/dev/null', (err, stdout) => {
      if (err) {
        // Return fallback list if scan fails or on non-Linux
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          networks: [
            { ssid: 'Aura-Office-5G', signal: 90, security: 'wpa2', isSaved: false },
            { ssid: 'Aura-Guest', signal: 75, security: 'open', isSaved: false },
          ]
        }));
        return;
      }

      const map = new Map();
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(':');
        if (parts.length < 3) continue;
        const inUse = parts[0] === '*';
        const ssid = parts[1];
        if (!ssid || ssid === '--') continue;
        const signal = parseInt(parts[2], 10) || 50;
        const security = (parts[3] || 'wpa2').toLowerCase();

        if (!map.has(ssid) || (map.get(ssid).signal < signal)) {
          map.set(ssid, { ssid, signal, security, inUse, isSaved: false });
        }
      }

      const networks = Array.from(map.values()).sort((a, b) => b.signal - a.signal);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, networks }));
    });
    return;
  }

  // Wi-Fi Connect API with Fast-ACK
  if (req.method === 'POST' && pathname === '/api/wifi/connect') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const ssid = (parsed.ssid || '').trim();
        const password = parsed.password || '';

        if (!ssid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SSID is required' }));
          return;
        }

        // Fast-ACK: respond immediately before AP hotspot is torn down
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          pending: true,
          ssid,
          resultSummary: `Connection initiated to "${ssid}". Digital display is now joining Wi-Fi.`,
        }));

        // Schedule physical connection after 600ms grace period so TCP socket finishes flushing
        setTimeout(() => {
          const passCmd = password ? `password "${password}"` : '';
          const cmd = `sudo nmcli dev wifi connect "${ssid}" ${passCmd} ifname wlan0 && sudo nmcli connection modify "${ssid}" connection.autoconnect yes connection.autoconnect-priority 100`;
          exec(cmd, (err) => {
            if (err) {
              console.error(`[Aura Setup] Failed to connect to "${ssid}":`, err.message);
            } else {
              console.log(`[Aura Setup] Successfully joined Wi-Fi "${ssid}".`);
            }
          });
        }, 600);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON request' }));
      }
    });
    return;
  }

  // Register Digital Display API (Pair with Key Code)
  if (req.method === 'POST' && pathname === '/api/pair') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const pairingCode = (parsed.pairingCode || parsed.code || '').trim().toUpperCase();

        if (!pairingCode) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Pairing key code is required' }));
          return;
        }

        console.log(`[Aura Setup] Redeeming pairing code: "${pairingCode}"...`);

        // Execute registration using the player agent runtime
        const cmd = `node /home/aura/player/dist/index.js --pair "${pairingCode}"`;
        exec(cmd, { timeout: 35000 }, (err, stdout, stderr) => {
          const creds = getCredentials();
          if (creds && creds.displayId) {
            console.log(`[Aura Setup] Digital display successfully paired as: ${creds.displayId}`);
            // Restart player service so it resumes with new credentials
            exec('sudo systemctl restart aura-player.service', () => {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, displayId: creds.displayId }));
          } else {
            const errorMsg = (stderr || stdout || err?.message || 'Invalid or expired pairing code.').trim();
            console.error(`[Aura Setup] Pairing failed:`, errorMsg);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: errorMsg || 'Pairing failed. Please verify the code.' }));
          }
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Internal pairing error' }));
      }
    });
    return;
  }

  // Graceful Reboot API
  if (req.method === 'POST' && pathname === '/api/reboot') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Rebooting digital display...' }));
    setTimeout(() => {
      exec('sudo systemctl reboot || sudo reboot', () => {});
    }, 1000);
    return;
  }

  // Catch-all 302 redirect
  res.writeHead(302, { Location: `http://${hostHeader}/setup` });
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Aura Setup] Setup Portal HTTP server listening on 0.0.0.0:${PORT}`);
});
