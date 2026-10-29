# Digital Display Player Installation & Provisioning Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Target Milestone:** Physical Digital Display Pilot & Staging Deployment Preparation  

---

## 1. Player Architecture Overview

The Aura DIMS Digital Display Player operates as a hardened, offline-first signage appliance composed of two segregated subsystems:

1. **Local Agent (`@aura-dims/player/agent`):**
   - Headless background supervisor running under a dedicated system user (`auradims`).
   - Secure identity management: handles 10-character pairing codes, cryptographically stores device credentials in restricted storage (`player/data/credentials/device-credentials.json` mode `0600`), and restores sessions across reboots.
   - Package synchronization: deterministic state machine (`discovered` → `downloading` → `verifying` → `ready` → `active`). Enforces SHA-256 integrity, limits, staging isolation, and atomic pointer activation.
   - Content-addressable cache (`player/data/cache/<sha256>`) and safe garbage collection of unreferenced assets.
   - Loopback HTTP server (`127.0.0.1:8090`): strictly bound to localhost, with Origin/Host validation (rejects DNS rebinding), strict Content Security Policy, and path traversal protection.
   - Process supervision & telemetry: dispatches heartbeats every 60 seconds with delivery stages, free storage, and playback presentation status.

2. **Browser Renderer (`@aura-dims/player/renderer`):**
   - Fullscreen Chromium kiosk mode pointing strictly to `http://127.0.0.1:8090`.
   - Zero live Firebase SDK or network dependencies in client JavaScript.
   - Evaluates schedule rules locally in `Asia/Kolkata` local hardware clock time.
   - Multi-lingual font shaping for English (`Inter`), Gujarati (`Noto Sans Gujarati`), and Hindi (`Noto Sans Devanagari`).
   - Automatic aspect ratio scaling for landscape (1920×1080) and portrait (1080×1920) digital displays.
   - Media error recovery and corporate neutral fallback for idle/conflict windows.

---

## 2. Physical Pilot Digital Display Hardware Specifications

The controlled staging pilot deploys two dedicated physical digital display hardware units:

| Specification | Pilot Unit 1 (Landscape) | Pilot Unit 2 (Portrait) |
| :--- | :--- | :--- |
| **Physical Location** | Manufacturing Building — Ground Floor Lobby | Engineering Wing — Tower B Corridor |
| **Display Name** | `STG-MFG-LOBBY-01` | `STG-ENG-TOWERB-01` |
| **Orientation** | **Landscape** (Horizontal) | **Portrait** (Vertical Totem) |
| **Native Resolution** | 1920 × 1080 @ 60 Hz | 1080 × 1920 @ 60 Hz (90° physical rotation) |
| **Aspect Ratio** | 16:9 | 9:16 |
| **Hardware Platform** | Raspberry Pi 4 Model B (4 GB RAM) / CM4 | Raspberry Pi 4 Model B (4 GB RAM) / CM4 |
| **Compute Architecture** | ARM64 (aarch64) | ARM64 (aarch64) |
| **Operating System** | Raspberry Pi OS Lite 64-bit (Debian 12 Bookworm) | Raspberry Pi OS Lite 64-bit (Debian 12 Bookworm) |
| **Storage** | 32 GB Industrial Grade MicroSD (High Endurance) | 32 GB Industrial Grade MicroSD (High Endurance) |
| **Local Cache Quota** | 10 GB dedicated for content cache | 10 GB dedicated for content cache |
| **Primary Network** | Gigabit Ethernet (1000BASE-T) | 802.11ac Wi-Fi (5 GHz enterprise WPA2-PSK) |
| **Fallback Network** | 802.11ac Wi-Fi (5 GHz) | Cellular 4G LTE USB Dongle (optional backup) |
| **Operating Timezone** | `Asia/Kolkata` (UTC+05:30) via RTC / local clock | `Asia/Kolkata` (UTC+05:30) via RTC / local clock |
| **Display Rotation Config**| Default (`display_rotate=0`) | Hardware/KMS rotated (`video=HDMI-A-1:1080x1920M@60,rotate=90`) |

---

## 3. Linux ARM64 Operating System Provisioning

### 3.1 Base Operating System Installation
1. Flash **Raspberry Pi OS Lite (64-bit)** using Raspberry Pi Imager.
2. Configure initial OS settings:
   - Hostname: `auradims-pilot-01` (Unit 1) or `auradims-pilot-02` (Unit 2)
   - Locale: `en_IN.UTF-8`
   - Timezone: `Asia/Kolkata`
   - Enable SSH (public key authentication only).

### 3.2 Display Rotation Configuration (Unit 2 - Portrait)
For Raspberry Pi OS Bookworm with KMS (Kernel Mode Setting), set rotation in `/boot/firmware/cmdline.txt` by appending:
```
video=HDMI-A-1:1080x1920M@60,rotate=90
```
Or for X11 session rotation:
```bash
xrandr --output HDMI-1 --rotate right
```

### 3.3 Core Packages Installation
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  nodejs \
  npm \
  chromium \
  network-manager \
  chrony \
  logrotate \
  unclutter \
  jq \
  curl
```

> [!NOTE]
> Node.js LTS (v20+) is recommended. If the default distribution packages an older Node.js, install the official NodeSource binary distribution for ARM64:
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
> sudo apt install -y nodejs
> ```

---

## 4. Hardware Acceleration & Display Power Management

To prevent sleep, screen blanking, or screen burn-in and ensure smooth slide transitions at 60 fps:

### 4.1 Disable Console & Display Blanking
In `/boot/firmware/cmdline.txt`, add:
```
consoleblank=0
```

In `/boot/firmware/config.txt`, configure:
```ini
# Force HDMI hotplug and output mode
hdmi_force_hotplug=1
hdmi_group=2
hdmi_mode=82 # 1080p 60Hz
# Enable DRM VC4 V3D driver for full hardware acceleration
dtoverlay=vc4-kms-v3d
gpu_mem=128
```

### 4.2 X11 Power Management Disabling (in Kiosk Profile)
```bash
# Disable DPMS and screensaver blanking
xset s off
xset -dpms
xset s noblank
```

---

## 5. Compositor & Kiosk Runtime Profiles

Two compositor architectures are supported for physical digital displays:

### Option A: Modern Wayland Kiosk (Cage Compositor — Recommended)
Cage is a lightweight Wayland kiosk compositor that displays a single fullscreen application without any window management overhead:

```bash
sudo apt install -y cage
```

Start script `/opt/aura-dims/bin/kiosk-wayland.sh`:
```bash
#!/bin/bash
export WAYLAND_DISPLAY=wayland-0
export XDG_RUNTIME_DIR=/run/user/$(id -u auradims)
exec cage -d -- chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --no-first-run \
  --fast \
  --fast-start \
  --disable-features=TranslateUI \
  --disk-cache-dir=/tmp/chromium-cache \
  --overscroll-history-navigation=0 \
  --disable-pinch \
  --enable-features=VaapiVideoDecoder,CanvasOopRasterization \
  --use-gl=egl \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  http://127.0.0.1:8090
```

### Option B: Traditional X11 Kiosk (xinit + Openbox + Unclutter)
```bash
sudo apt install -y xserver-xorg xinit openbox
```

Kiosk initialization script `/opt/aura-dims/bin/kiosk-x11.sh`:
```bash
#!/bin/bash
xset -dpms
xset s off
xset s noblank
unclutter -idle 0.1 -root &
exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --disk-cache-dir=/tmp/chromium-cache \
  --overscroll-history-navigation=0 \
  --disable-pinch \
  --enable-features=VaapiVideoDecoder,CanvasOopRasterization \
  --use-gl=egl \
  --autoplay-policy=no-user-gesture-required \
  http://127.0.0.1:8090
```

---

## 6. Network Management & Resilience

Digital displays must automatically reconnect upon network degradation without interrupting on-display signage playback.

### 6.1 NetworkManager Wi-Fi Configuration
```bash
# Configure Enterprise Wi-Fi connection
sudo nmcli connection add \
  type wifi \
  con-name "AuraPilotWifi" \
  ifname wlan0 \
  ssid "Aura-IoT-Staging" \
  wifi-sec.key-mgmt wpa-psk \
  wifi-sec.psk "StagingSecurePassphrase2026!" \
  connection.autoconnect yes \
  connection.autoconnect-priority 10 \
  connection.autoconnect-retries 0

# Set DNS servers and fallback
sudo nmcli connection modify "AuraPilotWifi" ipv4.dns "1.1.1.1 8.8.8.8"
```

### 6.2 Offline Resilience Invariant
- The digital display agent retries cloud heartbeats and publication checks using exponential backoff with jitter (initial interval: 30s, max: 300s).
- Schedule evaluation runs completely locally against the hardware clock.
- When offline, playback continues seamlessly using cached assets in `player/data/cache/`.
- Offline status is accumulated in local telemetry and flushed once network connectivity is restored.

---

## 7. Systemd Service Configuration & Supervision

### 7.1 Dedicated System User
```bash
sudo useradd -r -s /bin/false -d /var/lib/auradims -m auradims
sudo mkdir -p /opt/aura-dims /var/lib/auradims/data /var/log/auradims
sudo chown -R auradims:auradims /var/lib/auradims /var/log/auradims
```

### 7.2 Digital Display Agent Service (`/etc/systemd/system/auradims-agent.service`)
```ini
[Unit]
Description=Aura DIMS Digital Display Local Agent
After=network-online.target time-sync.target
Wants=network-online.target time-sync.target

[Service]
Type=simple
User=auradims
Group=auradims
WorkingDirectory=/var/lib/auradims
Environment=NODE_ENV=staging
Environment=AURA_PLAYER_PORT=8090
Environment=AURA_PLAYER_DATA_DIR=/var/lib/auradims/data
Environment=AURA_LOG_LEVEL=info
ExecStart=/usr/bin/node /opt/aura-dims/player/dist/agent/index.js
Restart=always
RestartSec=5s
RestartSteps=5
RestartMaxDelaySec=60s
StandardOutput=append:/var/log/auradims/agent.log
StandardError=append:/var/log/auradims/agent-error.log

# Security Sandboxing
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/auradims/data /var/log/auradims
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

### 7.3 Digital Display Kiosk Service (`/etc/systemd/system/auradims-kiosk.service`)
```ini
[Unit]
Description=Aura DIMS Fullscreen Kiosk Browser
After=auradims-agent.service
Requires=auradims-agent.service

[Service]
Type=simple
User=auradims
Group=auradims
WorkingDirectory=/var/lib/auradims
Environment=DISPLAY=:0
ExecStart=/bin/bash /opt/aura-dims/bin/kiosk-x11.sh
Restart=always
RestartSec=3s
StandardOutput=append:/var/log/auradims/kiosk.log
StandardError=append:/var/log/auradims/kiosk-error.log

[Install]
WantedBy=graphical.target
```

### 7.4 Log Rotation (`/etc/logrotate.d/auradims`)
```
/var/log/auradims/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 auradims auradims
    copytruncate
}
```

---

## 8. First-Run Enrollment & Pairing Flow

1. **Power On:** The physical digital display powers on, boots Linux, starts the `auradims-agent` daemon, and launches Chromium kiosk pointing to `http://127.0.0.1:8090`.
2. **Setup Screen:** Since `device-credentials.json` does not exist, the renderer displays the **Aura DIMS Digital Display Enrollment** interface showing a prominent 10-character code input field.
3. **Admin Generation:** In the Aura DIMS Web Dashboard (`/displays`), a System Administrator generates an enrollment code for the target digital display record.
4. **Code Structure:**
   - **Alphabet:** 31 unambiguous alphanumeric characters: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (excludes `0`, `O`, `1`, `I`, `L` to eliminate transcription ambiguity on physical displays).
   - **Length:** Strictly 10 characters.
   - **Entropy:** $31^{10} \approx 8.19 \times 10^{14}$ combinations (~49.5 bits).
   - **TTL:** Single-use, expires in 15 minutes.
5. **Redemption:** The field installer enters the 10-character pairing code via an attached keyboard, remote, or enrollment utility.
6. **Credential Issuance:** The agent calls Cloud Function `redeemPairingCode`. Upon successful validation, the function returns a unique `deviceId` and cryptographically secure `deviceSecret`.
7. **Restricted Storage:** The agent persists credentials to `player/data/credentials/device-credentials.json` with strict POSIX file permissions `0600` (read/write only by `auradims` user).
8. **Initial Sync:** The agent queries `getDevicePublicationManifest`, downloads required assets into staging, computes SHA-256 digests, commits verified files into content-addressable cache, updates the atomic pointer, and commences scheduled playback in `Asia/Kolkata` time.

---

## 9. Pilot Testing & Verification Protocols

### 9.1 24-Hour Offline Resilience Verification Protocol
The objective is to prove that the physical digital display operates autonomously without cloud contact for 24 continuous hours.

```
Step 1: Verify digital display is active and broadcasting active publication.
Step 2: Physically disconnect Ethernet cable and disable Wi-Fi (sudo nmcli networking off).
Step 3: Monitor playback at hour 0, 1, 6, 12, 18, and 24.
        Verify slide transitions occur on time without stutter or blank frames.
Step 4: Verify agent logs record network unreachable without crashing or memory leaks.
Step 5: Re-enable network connectivity (sudo nmcli networking on).
Step 6: Verify agent immediately reconnects, flushes offline heartbeats, and resumes live telemetry reporting.
```

### 9.2 7-Day Soak Testing Protocol
The objective is to prove runtime stability, resource discipline, and thermals over a 7-day continuous broadcast:

| Metric | Target Ceiling | Monitoring Method |
| :--- | :--- | :--- |
| **Agent Memory (RSS)** | < 120 MB | `ps -o rss,command -p $(pgrep -f auradims-agent)` |
| **Chromium Memory (RSS)** | < 350 MB | `ps -o rss,command -p $(pgrep -f chromium)` |
| **CPU Utilization** | < 15% average | `top -b -n 1` |
| **SoC Temperature** | < 65°C | `vcgencmd measure_temp` |
| **Storage Consumption** | Stable within cache quota (≤ 10 GB) | `df -h /var/lib/auradims` |
| **Dropped Frames** | < 0.1% during slide transitions | Chromium DevTools Performance API |
| **Process Restarts** | 0 unexpected restarts | `systemctl status auradims-agent auradims-kiosk` |
