# Digital Display Player Installation & Provisioning Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Target Milestone:** Secure Digital Display Playback & Delivery Reporting  

---

## 1. Player Architecture Overview

The Aura DIMS Digital Display Player runs as a hardened, offline-first signage appliance composed of two segregated subsystems:

1. **Local Agent (`@aura-dims/player/agent`):**
   - Headless background supervisor running under a dedicated system user (`auradims`).
   - Secure identity management: handles pairing codes, cryptographically stores device credentials in restricted storage (`player/data/credentials/device-credentials.json` mode `0600`), and restores sessions across reboots.
   - Package synchronization: state machine (`discovered` → `downloading` → `verifying` → `ready` → `active`). Enforces SHA-256 integrity, limits, staging isolation, and atomic pointer activation.
   - Content-addressable cache (`player/data/cache/<sha256>`) and safe garbage collection.
   - Loopback HTTP server (`127.0.0.1:8090`): strictly bound to localhost, with Origin/Host validation, strict Content Security Policy, and path traversal protection.
   - Process supervision & telemetry: dispatches heartbeats with delivery stages, free storage, and playback presentation status.

2. **Browser Renderer (`@aura-dims/player/renderer`):**
   - Fullscreen Chromium kiosk mode pointing strictly to `http://127.0.0.1:8090`.
   - Zero live Firebase SDK or network dependencies in client JavaScript.
   - Evaluates schedule rules locally in `Asia/Kolkata` local hardware clock time.
   - Multi-lingual font shaping for English (`Inter`), Gujarati (`Noto Sans Gujarati`), and Hindi (`Noto Sans Devanagari`).
   - Automatic aspect ratio scaling for landscape (1920×1080) and portrait (1080×1920) digital displays.
   - Media error recovery and corporate neutral fallback for idle/conflict windows.

---

## 2. Linux ARM64 Deployment Profile

Tested and supported on Linux ARM64 platforms (Debian 12 Bookworm, Ubuntu 24.04 LTS, Raspberry Pi OS 64-bit):

### Prerequisites
```bash
sudo apt update
sudo apt install -y nodejs npm chromium-browser x11-xserver-utils unclutter logrotate
```

### 1. Create Dedicated Unprivileged System User
```bash
sudo useradd -r -s /bin/false -d /var/lib/auradims -m auradims
sudo mkdir -p /opt/aura-dims /var/lib/auradims /var/log/auradims
sudo chown -R auradims:auradims /var/lib/auradims /var/log/auradims
```

### 2. Deploy Application Files
```bash
sudo cp -r /path/to/dist /opt/aura-dims/player
sudo chown -R root:root /opt/aura-dims
sudo chmod -R 755 /opt/aura-dims
```

### 3. Install Systemd Services
```bash
sudo cp /opt/aura-dims/player/systemd/auradims-agent.service /etc/systemd/system/
sudo cp /opt/aura-dims/player/systemd/auradims-kiosk.service /etc/systemd/system/
sudo cp /opt/aura-dims/player/systemd/auradims-logrotate.conf /etc/logrotate.d/auradims

sudo systemctl daemon-reload
sudo systemctl enable auradims-agent.service
sudo systemctl enable auradims-kiosk.service
sudo systemctl start auradims-agent.service
sudo systemctl start auradims-kiosk.service
```

---

## 3. Local Developer Mode (No Systemd Required)

Developers can exercise the digital display player directly on their development workstation:

```bash
# Start local digital display player agent and open renderer in default browser
pnpm run player:dev

# Start standalone headless agent on custom port
pnpm run player:agent --port 8095 --data-dir ./tmp-player-data

# Automatically pair with a pairing code
pnpm run player:agent --pair ABC123
```

---

## 4. First-Run Pairing Flow

1. On initial boot, the digital display displays the **Aura DIMS Digital Display Enrollment** screen with a prominent 6-character code input.
2. In the Aura DIMS Web Dashboard, an Administrator clicks **Generate Pairing Code** for the registered digital display.
3. The installer or technician inputs the single-use pairing code on the digital display setup screen.
4. The local agent contacts the Cloud Function `redeemPairingCode`, receives device credentials, stores them in `credentials/device-credentials.json`, downloads the desired publication package, validates SHA-256 checksums, and begins scheduled playback.

