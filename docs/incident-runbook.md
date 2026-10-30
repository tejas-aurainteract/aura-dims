# Aura DIMS - Incident Response & Operational Runbook

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Document Version:** 1.0.0  
**Target Milestone:** Client Acceptance & Controlled Production Pilot  

---

## 1. Severity Levels & Incident Thresholds

Incidents within the Aura DIMS ecosystem are classified by operational impact and user visibility:

| Severity Level | Definition | Response SLA | Review Threshold Trigger |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Complete digital display blackout (blank screen), emergency broadcast failure, data isolation breach, or corrupted publication manifest. | 15 Minutes | Any digital display rendering a blank screen; any cross-department data exposure. |
| **SEV-2 (Major)** | Digital display offline > 30 minutes during broadcasting hours; repeated renderer crashes (>2 crashes/hr); publication compilation failure. | 1 Hour | Single digital display unable to activate new publication after 3 retry cycles; renderer process restarting repeatedly. |
| **SEV-3 (Moderate)** | Media processing failure; temporary telemetry heartbeat gap; local appliance cache disk usage > 80%; unexpected Cloud Run invocation spikes. | 4 Hours | Local digital display appliance storage exceeds 80%; Cloud Run invocations exceed 20,000/day. |
| **SEV-4 (Minor)** | Minor UI cosmetic defect in web portal; non-blocking telemetry delay; template authoring cosmetic inconsistency. | 1 Business Day | No impact on physical digital display playback or editorial approval flow. |

---

## 2. Emergency Incident Response Procedures

### RUN-01: Digital Display Shows Blank Screen (SEV-1)

> [!CAUTION]
> A blank screen on a physical digital display violates the core Aura DIMS resilience guarantee. Autonomous fallback content must ALWAYS render if scheduled content fails.

1. **Check Local Renderer Loopback Status:**
   - SSH into the digital display appliance or open local terminal:
     ```bash
     curl -i http://127.0.0.1:8090/health
     ```
   - If `127.0.0.1:8090` returns connection refused: The player agent service is stopped.
     ```bash
     sudo systemctl status aura-player-agent.service
     sudo journalctl -u aura-player-agent.service -n 50 --no-pager
     sudo systemctl restart aura-player-agent.service
     ```
2. **Inspect Chromium Kiosk Process:**
   - Check if Chromium is running in kiosk mode:
     ```bash
     pgrep -a chromium
     ```
   - If absent, restart the renderer kiosk service:
     ```bash
     sudo systemctl restart aura-player-kiosk.service
     ```
3. **Verify Local Manifest Pointer:**
   - Inspect `player/data/packages/active.json`:
     ```bash
     cat ~/aura-dims/player/data/packages/active.json
     ```
   - If corrupted or empty, re-link to the bundled permanent neutral fallback:
     ```bash
     cp ~/aura-dims/player/data/packages/neutral_fallback.json ~/aura-dims/player/data/packages/active.json
     ```
   - The loopback HTTP service will immediately reload and display the neutral corporate standby screen.

---

### RUN-02: Corrupted or Erroneous Notice Live on Displays (SEV-1 / SEV-2)

When an approved notice contains critical factual errors or unauthorized visuals:

1. **Immediate Withdrawal from Cloud Portal:**
   - Administrator navigates to **Schedules** > Select the schedule governing the notice.
   - Click **Withdraw Schedule**.
   - Cloud Function `setScheduleStatus` sets status to `withdrawn`, creates an audit log entry, and clears the publication pointer for assigned digital displays.
2. **Online Displays:**
   - Connected digital displays evaluate the schedule change within 30–60 seconds and immediately transition to either the next scheduled playlist or the permanent neutral corporate fallback.
3. **Offline Displays:**
   - If a physical digital display is currently disconnected from the network, it cannot receive the instant withdrawal command.
   - **Remediation:** Dispatch site technical personnel to:
     - Reconnect Ethernet or Wi-Fi to allow immediate cloud synchronization.
     - OR, if network cannot be restored, power off the unit or run local CLI command:
       ```bash
       node player/dist/agent/index.js --withdraw-local
       ```

---

### RUN-03: Cloud Functions Invocation or Cost Quota Alerts (SEV-2 / SEV-3)

When Google Cloud Billing Budget Alerts trigger ($5, $10, or $25 thresholds):

1. **Identify the Consuming Service:**
   - Inspect Google Cloud Console > **Cloud Run** > Sort by Request Count.
   - Check if an appliance is in a tight reconnect loop or high-frequency polling.
2. **Heartbeat Throttle Verification:**
   - Digital display player heartbeats are throttled to a minimum interval of 30 seconds (`MIN_HEARTBEAT_INTERVAL_MS = 30000`).
   - If an anomalous appliance is flooding requests, temporarily disable the display registration from the portal:
     - Digital Displays > Select display > **Deactivate Display**.
     - Backend Cloud Function rejects future requests from this device token with `failed-precondition`.
3. **Instance Capping:**
   - Ensure all Cloud Functions maintain `maxInstances: 10` setting in GCP Cloud Run.

---

### RUN-04: Digital Display Local Disk Pressure (SEV-3)

When digital display disk storage exceeds 80% capacity:

1. **Inspect Cache Directory:**
   ```bash
   df -h /
   du -sh ~/aura-dims/player/data/cache/
   ```
2. **Run Appliance Cache Purge:**
   - The Aura DIMS player agent contains built-in pruning logic that retains only assets referenced in current and future active publication manifests.
   - To trigger an immediate purge of unreferenced staging assets:
     ```bash
     find ~/aura-dims/player/data/staging/ -type f -mtime +1 -delete
     ```
   - Verify that permanent cache files in `player/data/cache/` match active SHA-256 hashes.

---

### RUN-05: Commissioning Quality Gate Blockers (SEV-2 / SEV-3)

When a digital display cannot complete all 12 items of the Commissioning Checklist:

1. **Identify the Blocking Check:**
   - Open **Displays** > find the digital display > click **Checklist**.
   - Review which of the 12 items is marked `Failed` or `Pending`.
2. **Automated Check Failures:**
   - *Network Connectivity (#3):* Verify loopback server on `http://127.0.0.1:8999/status` and egress HTTPS access to Cloud Functions.
   - *Device Enrolled (#4):* Verify device secret exists in restricted directory `player/data/credentials/device.json`. If missing or invalid, execute safe enrollment reset (SOP-08).
   - *User Assignment (#5):* Ensure an active Department Head is assigned within the same department.
   - *Permanent Fallback (#6):* Verify `permanent_fallback.json` exists locally and SHA-256 matches the schema asset.
   - *Test Publication (#7):* Check whether a schedule has been targeted to this display ID and approved.
3. **Human Inspection Failures:**
   - *Mounting & Power (#1):* Inspect physical VESA plate, tilt safety stop, and power outlet line voltage.
   - *Orientation & Resolution (#2):* Confirm panel EDID timing matches configured resolution (1920×1080 or 1080×1920).
   - *Fonts & Video (#8):* Verify that local fonts load without fallback serif rendering, and MP4 video plays smoothly.
   - *Restart Recovery (#10):* Confirm systemd daemon re-launches renderer and resumes playback within 45 seconds of boot.
   - *Offline Playback (#11):* Disconnect network cable; confirm player does not show an error banner or blank screen.
4. **Resolution:**
   - Once all 12 items show `Passed`, click **Finalize Commissioning** to transition the digital display to `commissioned`.

---

### RUN-06: Fleet Publication Delivery Storm or Mass Lag (SEV-2)

When multiple digital displays in a wave fail to download or report delivery lag:

1. **Open Publication Rollout View:**
   - Navigate to **Schedules** > find the active broadcast schedule > click **Rollout Progress**.
2. **Triage Delivery Stage Telemetry:**
   - Compare `Target Count` vs `Active Count` vs `Failed Count` vs `Stale Targets (>15m)`.
   - Read the aggregated `lastDeliveryError` strings across targets.
3. **Common Failure Causes & Actions:**
   - *Storage Egress Throttling / Quota Exceeded:* Check Google Cloud Console > Cloud Storage egress bandwidth. If budget alert triggered, assess bucket egress quota.
   - *SHA-256 Hash Mismatch on Network Interruption:* Player agent detects truncated downloads and rejects corrupted files. Click **Retry Incomplete Targets** in the Rollout Progress modal.
   - *Stale Telemetry (>15m):* Digital displays are online but experiencing DNS or proxy timeouts communicating with Cloud Functions. Verify local gateway DNS resolution.
4. **Targeted Safe Retry:**
   - Avoid republishing the entire schedule! Full republishing generates a new immutable manifest and forces all healthy displays to re-download.
   - Instead, use **Retry Incomplete Targets** or click the individual target retry icon to instruct only lagging displays to resume sync.

---

### RUN-07: Rollout Wave Freeze & Controlled Rollback (SEV-1 / SEV-2)

When a critical defect is identified during an expansion wave (e.g. Wave 1 or Wave 2):

1. **Freeze Staging Inventory:**
   - In **Displays** > **Rollout Inventory**, pause promoting any further planned installations to operational status.
2. **Identify Impacted Digital Displays:**
   - Check if the issue affects only newly commissioned displays in the current wave or the entire fleet.
3. **Rollback Options:**
   - *Content Package Rollback:* Admin navigates to **Schedules** > select schedule > click **Withdraw Schedule**. All digital displays immediately revert to the previous verified schedule or the permanent neutral corporate fallback.
   - *Device Secret Revocation:* If an appliance in the wave is behaving erratically, invoke `resetEnrollment` to isolate the device token.
   - *Player Daemon Rollback:* If an updated player package caused renderer errors, roll back the local agent version using the rollback script documented in `docs/player-installation.md`.
4. **Post-Rollback Root Cause Analysis:**
   - Document symptoms, affected installation references, logs, and remediation timeline in `docs/acceptance-matrix.md`.

---

## 3. Escalation Workflow & Decision Makers

```
Incident Detection (Telemetry Alert / Human Observation)
  │
  ├──► Triage Severity (SEV-1 through SEV-4)
  │
  ├──► Level 1: Site Technical Contact (Surat Tech Complex)
  │    └── Physical cable, HDMI, panel power, local network checks
  │
  ├──► Level 2: Primary Operational Owner (Deep Tailor)
  │    └── Portal review, schedule withdrawal, Cloud Run logs, pairing reset
  │
  └──► Level 3: Lead Software Architect & Stakeholder
       └── Code patch, security rule update, project rollback decision
```

- **Rollback Authority:** Only Deep Tailor (System Administrator) is authorized to trigger application rollback or database recovery.
- **Client Communication Lead:** Project Lead communicates status reports to client executive sponsors every 2 hours during SEV-1 incidents.

