# Aura DIMS - Production Operator & Administrator Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Document Version:** 1.0.0  
**Target Audience:** System Administrators, Department Heads, and Operations Personnel  

---

## 1. Operating Principles & Roles

Aura DIMS enforces strict separation of responsibilities to ensure content integrity and perimeter security:

1. **System Administrator:**
   - Full governance across all departments, user accounts, and physical digital display assets.
   - Authorizes user provisioning and revokes permissions.
   - Enrolls new digital display appliances and manages pairing codes.
   - Sole authority to review and approve publication requests, converting draft playlists into immutable publication packages.
   - Executes immediate emergency broadcasts and content withdrawals.

2. **Department Head:**
   - Scoped strictly to their allocated organizational department (e.g. Manufacturing Operations, Product Engineering).
   - Ingests and manages raw departmental media assets (images, videos).
   - Authors multi-slide visual designs using validated templates.
   - Compiles ordered playlists and submits calendar-based broadcast schedules for administrative review.
   - Can only target digital displays assigned to their department or user identity.

---

## 2. Standard Operating Procedures (SOPs)

### SOP-01: Ingesting Departmental Media
1. Log in to the Aura DIMS portal at `https://aura-dims.vercel.app` using your departmental credentials.
2. Navigate to **Content** > **Media Library**.
3. Click **Upload Media**.
4. Drag and drop or browse for asset files.
   - **Supported Images:** PNG or JPEG (Max 200 MB, RGB colorspace).
   - **Supported Video:** MP4 container, H.264 video codec, AAC audio codec (Max 200 MB, up to 1080p).
5. The system automatically performs two-phase ingestion:
   - File uploads to an isolated staging path in Cloud Storage.
   - Backend Cloud Function (`finalizeMediaUpload`) invokes `sharp` (images) or `ffmpeg` (videos) to extract exact dimensions, duration, format attributes, and generates a SHA-256 integrity hash.
6. Verify the asset badge changes from `Validating` to `Ready`. Only `Ready` assets can be incorporated into visual designs.

### SOP-02: Creating a Visual Design Notice
1. Navigate to **Content** > **Designs**.
2. Click **+ Create Design** and select **Start from Blank** or **Start from Template**.
3. Choose the target orientation:
   - **Landscape (1920 × 1080):** For overhead manufacturing and standard horizontal digital displays.
   - **Portrait (1080 × 1920):** For totem digital displays and vertical lobby kiosks.
4. In the visual canvas editor:
   - **Add Elements:** Insert text boxes, shapes, verified media assets, or videos.
   - **Typography:** Select from bundled multilingual Google Fonts (Inter for Latin, Noto Sans Devanagari for Hindi, Noto Sans Gujarati for Gujarati).
   - **Timing:** Set slide durations (minimum 3 seconds, recommended 10–15 seconds per slide).
   - **Layers:** Use layer controls to order visual elements on the z-axis.
5. Click **Save Draft**. Aura DIMS performs optimistic revision checking to prevent concurrent overwrites.

### SOP-03: Compiling a Playlist
1. Navigate to **Content** > **Playlists**.
2. Click **+ Create Playlist**.
3. Provide a clear title, description, and select the orientation (Landscape or Portrait).
4. Click **Add Design** to append saved design revisions to the sequence.
5. Drag to reorder slides. Review the calculated total loop duration.
6. Click **Save Playlist**.

### SOP-04: Submitting a Broadcast Schedule for Approval
1. Navigate to **Schedules** > Click **+ Create Schedule**.
2. Select the source playlist and check the target digital displays permitted for your department.
3. Configure the schedule window in **`Asia/Kolkata`** standard time:
   - **Date Range:** Start date and optional end date.
   - **Daily Time Window:** E.g., `09:00:00` to `18:00:00` (inclusive start, exclusive end).
   - **Days of Week:** Select active broadcasting days (Monday through Saturday).
   - **Priority:** Departmental schedules default to priority 1 to 5.
4. Click **Preflight & Submit for Approval**. The backend validates all asset dependencies and schedules, moving the record to `Pending Review`.

### SOP-05: Editorial Review & Publication Approval (Admin Only)
1. Administrator navigates to **Approvals** queue.
2. Select the pending submission to inspect:
   - Requester identity and department.
   - Target digital display names and orientations.
   - Complete slide sequence preview, duration, and asset checksums.
3. If adjustments are needed: Click **Reject** and provide a clear editorial reason.
4. If approved: Click **Approve & Publish**.
   - Cloud Function compiles an immutable publication manifest.
   - Generates deterministic package checksum and freezes dependencies in Cloud Storage.
   - Atomically updates target digital display pointers in Firestore.

---

## 3. Digital Display Fleet Management

### SOP-06: Onboarding a New Physical Digital Display
1. Mount the physical digital display panel and connect the Linux appliance (Raspberry Pi 4/5 or industrial x86_64 PC) to the display panel via HDMI.
2. Connect the appliance to the authorized signage local network via Ethernet or Wi-Fi.
3. Power on the digital display appliance. The appliance will boot into the Aura DIMS pairing screen displaying a clean, branded first-run window with status `Awaiting Pairing`.
4. Administrator logs into Aura DIMS web dashboard > **Digital Displays** > **+ Register Digital Display**:
   - Enter digital display name (e.g. `DISP-SURAT-01`), physical location, department, and orientation.
5. Click **Generate Pairing Code**. The dashboard generates a high-entropy, 10-symbol code (31-symbol unambiguous alphabet, e.g. `7K9M-P2X4-AB`).
6. Enter the 10-symbol pairing code on the physical digital display appliance (or via the local agent configuration interface).
7. The agent contacts `redeemPairingCode` on Cloud Functions:
   - Verifies the HMAC-SHA256 verifier.
   - Issues a permanent device secret stored locally in `player/data/credentials/device.json` with POSIX `0600` permissions.
   - Digital display status transitions from `enrolling` to `active`.
8. Complete the **12-Item Digital Display Commissioning Checklist** (see `docs/rollout-plan.md`) before certifying for broadcast.

### SOP-07: Digital Display Hardware Replacement
*Use when a physical appliance, power supply, or panel has failed and must be swapped without losing historical telemetry or assignments.*
1. Physically disconnect and power down the defective hardware appliance.
2. Mount the replacement hardware appliance and connect HDMI, power, and local network.
3. In the Aura DIMS portal, navigate to **Displays** > find the affected digital display card.
4. Click **Pairing Code**. The portal invokes `resetEnrollment` to revoke the old appliance's cryptographic credentials.
5. Power on the replacement appliance. It will display the Aura DIMS enrollment screen.
6. Enter the newly generated 10-symbol pairing code into the replacement appliance.
7. The replacement appliance registers with the identical digital display ID, instantly inheriting its site assignments, department permissions, and desired publication package.
8. Execute a quick physical check of items 1, 2, 8, and 9 of the Commissioning Checklist to verify HDMI timing and visual output.

### SOP-08: Safe Enrollment Reset & Credential Revocation
*Use when an appliance's credentials may have been compromised, or when migrating an appliance between physical locations.*
1. Administrator navigates to **Displays** in the Aura DIMS dashboard.
2. Select the target digital display > Click **Pairing Code**.
3. The platform invokes backend `resetEnrollment`:
   - Immediately revokes the existing `deviceSecret` and invalidates any outstanding pairing codes in Firestore.
   - Transitions the digital display lifecycle to `pending_enrollment`.
   - Any telemetry submissions from the old credentials will now receive `403 Permission Denied`.
4. On the physical appliance, the local agent detects authentication revocation on its next sync cycle and automatically reverts to the loopback first-run pairing screen.
5. To re-link, provide the newly generated pairing code.

### SOP-09: Local Wi-Fi & Network Recovery
*Use when network configuration changes (SSID, pre-shared key, DHCP range, or static IP subnet) cause digital displays to report offline.*
1. **Verify Playback Continuity:** Confirm that the digital display continues autonomous presentation. Aura DIMS caches assets and evaluates schedules locally; temporary network loss does not interrupt playback.
2. **Access Local Network Config:** Connect an administrative keyboard to the digital display appliance or access via local recovery console on loopback (`http://127.0.0.1:8999/status`).
3. **Update Wi-Fi / IP Settings:**
   - Linux Kiosk: Update NetworkManager profile via `nmcli connection modify <SSID> wifi-sec.psk <NEW_KEY>` or edit `/etc/netplan/01-netcfg.yaml`.
   - Apply settings: `sudo netplan apply` or `sudo nmcli connection up <SSID>`.
4. **Confirm Connectivity:** Observe player agent log output. When network connectivity is restored:
   - Heartbeat resumes automatically within 60 seconds.
   - Status badge in Aura DIMS changes from `Offline` to `Online`.
   - Any queued delivery telemetry is flushed to Firestore.

### SOP-10: Resolving Outdated or Stuck Publications (Safe Target Retry)
*Use when a digital display exhibits version sync lag (desired publication != active publication) or verification failure.*
1. Administrator or Department Head navigates to **Schedules** > find the active broadcast schedule.
2. Click **Rollout Progress**.
3. Inspect the progress breakdown:
   - Identify targets marked `Verification Failed`, `Downloading`, or `Telemetry Stale (>15m)`.
   - Review the recorded `lastDeliveryError` string (e.g., `SHA-256 mismatch on slide-02.mp4` or `Network timeout during download`).
4. **Targeted Safe Retry:** Click the **Retry** icon adjacent to the failing digital display (or click **Retry Incomplete Targets**).
   - Resets delivery failure counters and resets `deliveryStage` to `discovered`.
   - Re-dispatches sync instructions exclusively to lagging devices without disrupting active displays or republishing the entire manifest.
5. If verification errors persist, verify local disk storage (SOP-11) or inspect network firewall rules for Cloud Storage access.

### SOP-11: Low Storage Recovery & Cache Rotation
*Use when a digital display reports low local storage (< 1GB free or disk utilization > 90%).*
1. Identify the warning badge `Low Storage (<1GB)` on the digital display card in **Displays**.
2. Aura DIMS automatically protects the permanent corporate fallback package (`permanent_fallback.json` and associated media) from cache eviction.
3. The local agent automatically executes LRU (Least Recently Used) cache purging for retired or superseded publication packages.
4. If manual purging is required on an appliance with heavy video accumulation:
   - Access the local agent data directory: `player/data/packages/`.
   - Active package is symlinked to `player/data/packages/active.json`.
   - Remove retired directories: `rm -rf player/data/packages/pub_old_*`.
   - Verify available disk space: `df -h /`. Free space should exceed 4 GB.

### SOP-12: Digital Display Decommissioning & Retirement
*Use when permanently retiring a digital display from service.*
1. Administrator navigates to **Displays** > Select target digital display > **Full Telemetry**.
2. Click **Suspend / Retire Display**.
3. The platform invokes backend `setDisplayLifecycle` with `lifecycle: 'suspended'`:
   - Immediately blocks future publication distribution.
   - Revokes device heartbeat acceptance and pairing validity.
   - Omits the digital display from future scheduling conflict checks.
4. Unmount physical hardware. Wipe local storage using `shred` or reflash the OS image before disposal or reassignment.

### SOP-13: Departmental Digital Display Reassignment
*Use when an operational digital display is transferred to a different Department Head.*
1. Administrator navigates to **Displays**.
2. Select the checkbox on the desired digital display card(s).
3. In the floating action bar, click **Assign to Department Head**.
4. Select the target Department Head from the dropdown.
5. Review the preflight preview:
   - Preflight verifies the target user is active and belongs to the digital display's department.
   - If a cross-department assignment is attempted, the preflight strictly rejects the mismatch with an explanatory warning.
6. Click **Apply Assignment**.
7. The target Department Head immediately receives operating permissions in their portal.

### SOP-14: Multi-Tier Error Escalation Runbook
*Defines escalation protocol when local field operators encounter unresolved hardware or network blockers.*

```
[ Tier 1: Local Field Operator ]
   │  - Physical mounting, power, HDMI timing (Checklist items 1-2)
   │  - Wi-Fi SSID / Ethernet cable connection (SOP-09)
   │  - Enter 10-symbol pairing code (SOP-06)
   ▼ (Unresolved after 30 mins)
[ Tier 2: System Administrator ]
   │  - Review backend Cloud Functions logs via Firebase Console / CLI
   │  - Perform enrollment reset or bulk re-assignment (SOP-08, SOP-13)
   │  - Execute targeted publication sync retry (SOP-10)
   ▼ (Systemic service degradation / cloud incident)
[ Tier 3: Cloud & Software Engineering ]
   │  - Aurainteract Cloud Ops (cloud-ops@aurainteract.com)
   │  - Emergency schedule withdrawal & neutral corporate fallback activation
   │  - Firebase Blaze plan budget & quota expansion
```

---

## 4. Exception Handling & Incident Resolution

| Incident Scenario | Primary Symptom | Root Cause | Operator Action |
| :--- | :--- | :--- | :--- |
| **Digital Display Marked Offline** | Red badge on dashboard; last heartbeat > 5 mins | Network disconnection or local appliance power loss | 1. Check physical power LED on digital display appliance.<br>2. Verify network cable or Wi-Fi connectivity.<br>3. Confirm appliance is still playing cached content autonomously.<br>4. Note: Playback continues uninterrupted from local cache. |
| **Failed Media Processing** | Asset stuck in `Validating` or shows `Failed` | Unsupported video codec, audio sample rate, or corrupted container | 1. Open asset details to read backend validation log.<br>2. Ensure video is H.264 baseline/main profile and MP4 container.<br>3. Re-encode video using ffmpeg (`ffmpeg -i in.mov -c:v libx264 -pix_fmt yuv420p -c:a aac out.mp4`). |
| **Outdated Publication on Display** | Desired version differs from active version reported | Digital display was offline during publication or asset download incomplete | 1. Inspect digital display diagnostics drawer.<br>2. Verify download progress in delivery telemetry.<br>3. If download failed, check local disk space on appliance (`df -h`).<br>4. Reconnect network; agent automatically retries download. |
| **Emergency Content Withdrawal** | Unapproved or erroneous content live on displays | Schedule error or urgent operational requirement | 1. Admin navigates to **Schedules** > Select active schedule.<br>2. Click **Withdraw Schedule**.<br>3. Digital displays immediately fall back to the neutral corporate safety playlist.<br>4. If appliance is offline, withdrawal takes effect upon next network check-in or when the scheduled time window expires locally. |

---

## 5. Operations Roster & Escalation Path

- **Primary Operational Owner:** Deep Tailor (`deep@aurainteract.com`, System Administrator)
- **Backup Operational Owner:** Aurainteract Cloud Operations Team (`cloud-ops@aurainteract.com`)
- **Site Infrastructure Contact:** Surat Tech Complex Facility Support (`facility.surat@aurainteract.com`)
- **Support Window:** Pilot period standard business hours (09:00 to 19:00 IST Monday through Saturday). *Note: 24x7 support SLA is not active during this pilot phase.*

