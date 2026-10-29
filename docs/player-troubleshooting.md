# Digital Display Player Troubleshooting Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  

---

## 1. Diagnostic Checks

### Check Agent Service Status
```bash
sudo systemctl status auradims-agent.service
```

### View Live Agent Logs
```bash
journalctl -u auradims-agent.service -f -n 100
```

### Check Local Loopback HTTP Service
```bash
curl -I http://127.0.0.1:8090/health
curl -s http://127.0.0.1:8090/api/status | jq .
curl -s http://127.0.0.1:8090/api/active-package | jq .
```

---

## 2. Common Issues & Solutions

### A. Digital Display Shows "Awaiting publication package"
- **Cause:** The digital display is enrolled, but no publication has been compiled or targeted to this display.
- **Remedy:** In the Aura DIMS dashboard, navigate to **Schedules**, create or approve a schedule targeting this digital display, and click **Publish Package**.

### B. Digital Display Shows Setup / Pairing Screen After Reboot
- **Cause:** Device credentials were wiped or permissions prevent reading `credentials/device-credentials.json`.
- **Remedy:**
  1. Inspect `/var/lib/auradims/credentials/device-credentials.json`.
  2. Verify file owner is `auradims` and mode is `0600`.
  3. If missing, generate a new pairing code from the Aura DIMS admin dashboard and re-enroll the digital display.

### C. Checksum Verification Failure (`failed` delivery stage)
- **Cause:** Downloaded asset was corrupted in transit, or network drop caused partial file save.
- **Behavior:** The agent logs `Integrity check failed for asset ...`, deletes staging files, and refuses to activate the package. The previous working package remains active without interruption.
- **Remedy:** The agent will automatically re-attempt synchronization on the next sync window (default 15s). Ensure stable connectivity to the storage host.

### D. Offline Playback & Hardware Clock Drift
- **Behavior:** The digital display player evaluates schedules using the local system clock in `Asia/Kolkata`.
- **Remedy:** Ensure the hardware RTC clock is synchronized via NTP (`systemd-timesyncd` or `chrony`) when network is available:
  ```bash
  timedatectl status
  timedatectl set-timezone Asia/Kolkata
  ```
  If offline indefinitely, the hardware RTC clock maintains scheduled transitions. If no schedule window matches, the digital display displays the corporate neutral fallback.

### E. Chromium Kiosk Screen Blanking / Sleeping
- **Remedy:** Ensure `xset` commands ran successfully in the kiosk service:
  ```bash
  export DISPLAY=:0
  xset s off
  xset -dpms
  xset s noblank
  ```

