# Aura DIMS — Controlled Rollout Plan (~20 Digital Displays)

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Target Fleet Size:** Approximately 20 installed digital displays in total (including 2 pilot digital displays).  
**Scope Boundary:** Controlled phased expansion to ~20 digital displays across approved sites. Fleet expansion toward 100 digital displays remains a later milestone.

---

## 1. Executive Summary & Principles

1. **Strict Terminology Invariant:**
   - The platform, user interface, operational procedures, and telemetry logs exclusively use the term **"digital display"**. The bare words "screen", "monitor", or "TV" are strictly prohibited.
2. **Planned Installations vs. Operational Fleet Separation:**
   - Digital displays in staging or planning are tracked strictly as `plannedInstallations` in the Rollout Inventory.
   - A planned digital display is NEVER counted as registered, online, commissioned, or active in operational fleet KPI aggregates until physically unboxed, mounted, and explicitly converted to active fleet status.
3. **12-Item Quality Gate Mandate:**
   - No digital display is certified for autonomous production broadcast until all 12 items of the Commissioning Checklist (5 automated telemetry checks + 7 human physical inspection checks) are verified passed by an authorized administrator.
4. **Cloud Spending Limit Guardrail:**
   - Firebase Blaze plan operates with a hard monthly budget ceiling of **\$25.00 USD**. Usage alerts trigger at 50%, 80%, and 100%. Cloud Storage caching and loopback HTTP delivery ensure zero recurring bandwidth costs for looped playback.

---

## 2. Installation Waves Breakdown (~20 Digital Displays Total)

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOTAL TARGET FLEET: 20 DIGITAL DISPLAYS                                │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│ Wave 0       │ Wave 1       │ Wave 2       │ Wave 3       │ Wave 4     │
│ Pilot (2)    │ Corp HQ (5)  │ Tech Ctr (5) │ Mfg Plant (4)│ North Hub  │
│ BLR Campus   │ BLR Campus   │ HYD Tech     │ PNE Plant    │ DEL Hub (4)│
└──────────────┴──────────────┴──────────────┴──────────────┴────────────┘
```

### Wave 0 — Client Pilot (2 Digital Displays) — Verified & Active
- **Site:** Bangalore Main Campus (`site-blr-main`)
- **Digital Display 1:**
  - *Ref:* `BLR-HQ-L01-D01`
  - *Name:* Executive Boardroom Digital Display
  - *Orientation:* Landscape (1920×1080)
  - *Department:* Corporate Communications (`dept-corp-comm`)
  - *Location:* Level 1 Boardroom East Wall
  - *Role:* High-priority corporate announcements and visitor greetings.
- **Digital Display 2:**
  - *Ref:* `BLR-HQ-L02-D02`
  - *Name:* Cafeteria Portrait Notice Kiosk
  - *Orientation:* Portrait (1080×1920)
  - *Department:* Human Resources (`dept-hr`)
  - *Location:* Level 2 Dining Atrium
  - *Role:* Daily menus, employee engagement notices, and benefits bulletins.

### Wave 1 — Corporate Headquarters Core (5 Digital Displays)
- **Site:** Bangalore Main Campus (`site-blr-main`)
- **Planned Displays:**
  1. `BLR-HQ-L01-D03`: Main Reception Digital Display (Landscape 1920×1080, Corporate Communications)
  2. `BLR-HQ-L01-D04`: Visitor Waiting Lobby Portrait Kiosk (Portrait 1080×1920, Corporate Communications)
  3. `BLR-HQ-L02-D05`: Engineering Open Bay Notice Board (Landscape 1920×1080, Engineering)
  4. `BLR-HQ-L02-D06`: Finance & Operations Notice Display (Landscape 1920×1080, Operations)
  5. `BLR-HQ-L03-D07`: Executive Lounge Digital Display (Landscape 1920×1080, Corporate Communications)

### Wave 2 — Hyderabad Technology Center (5 Digital Displays)
- **Site:** Hyderabad Technology Park (`site-hyd-tech`)
- **Planned Displays:**
  1. `HYD-TC-L01-D01`: Hyderabad Campus Entrance Display (Landscape 1920×1080, Corporate Communications)
  2. `HYD-TC-L01-D02`: Security & Badge Office Portrait Display (Portrait 1080×1920, Operations)
  3. `HYD-TC-L02-D03`: Software Development Center Display (Landscape 1920×1080, Engineering)
  4. `HYD-TC-L02-D04`: Cloud Infrastructure Operations Board (Landscape 1920×1080, Engineering)
  5. `HYD-TC-L03-D05`: Employee Wellness Center Display (Portrait 1080×1920, Human Resources)

### Wave 3 — Pune Manufacturing Facility (4 Digital Displays)
- **Site:** Pune Industrial Complex (`site-pne-mfg`)
- **Planned Displays:**
  1. `PNE-MF-L01-D01`: Factory Floor Shift Bulletin Display (Landscape 1920×1080, Manufacturing)
  2. `PNE-MF-L01-D02`: Safety & Compliance Portrait Kiosk (Portrait 1080×1920, Operations)
  3. `PNE-MF-L02-D03`: Logistics & Dispatch Dashboard Display (Landscape 1920×1080, Operations)
  4. `PNE-MF-L02-D04`: Training & Town Hall Digital Display (Landscape 1920×1080, Human Resources)

### Wave 4 — Delhi Regional Hub (4 Digital Displays)
- **Site:** Delhi Regional Office (`site-del-reg`)
- **Planned Displays:**
  1. `DEL-RO-L01-D01`: Delhi Reception Greeting Display (Landscape 1920×1080, Corporate Communications)
  2. `DEL-RO-L01-D02`: Client Briefing Center Display (Landscape 1920×1080, Corporate Communications)
  3. `DEL-RO-L02-D03`: Sales Operations Notice Board (Landscape 1920×1080, Operations)
  4. `DEL-RO-L02-D04`: Regional Hub Cafeteria Portrait Display (Portrait 1080×1920, Human Resources)

---

## 3. The 12-Item Commissioning Checklist Protocol

Each digital display undergoes a formal 12-item certification process before being approved for broadcast:

| Item # | Check Identifier | Verification Tier | Verification Requirement |
| :--- | :--- | :--- | :--- |
| **01** | `mounting_power` | **Human Physical** | Panel securely mounted, vibration-damped, connected to stable UPS power supply. |
| **02** | `orientation_resolution` | **Human Physical** | Panel aspect ratio matches landscape (16:9) or portrait (9:16) with native 1080p timing. |
| **03** | `network_connectivity` | **Automated Software** | Player loopback server active on `127.0.0.1:8999`, Cloud Function reachable, heartbeat accepted. |
| **04** | `device_enrolled` | **Automated Software** | Cryptographic device token verified, client certificate/secret persisted in restricted local storage. |
| **05** | `user_assignments` | **Automated Software** | Digital display assigned to authorized Department Head within permitted departmental scope. |
| **06** | `fallback_installed` | **Automated Software** | Bundled neutral corporate fallback asset verified with local SHA-256 integrity hash. |
| **07** | `test_publication_active` | **Automated Software** | Test broadcast schedule published, downloaded, verified, and confirmed active by telemetry. |
| **08** | `fonts_video_verified` | **Human Physical** | Typography renders crisp without glyph truncation; test MP4 video loops smoothly at 30/60 fps. |
| **09** | `physical_output_observed` | **Human Physical** | Visual inspection confirms correct panel brightness, color gamut, and ambient viewing angles. |
| **10** | `restart_recovery_verified` | **Human Physical** | Hard power cycle executed; player daemon auto-starts and resumes cached playback in < 45 seconds. |
| **11** | `offline_playback_verified` | **Human Physical** | Ethernet/Wi-Fi disconnected for 15 minutes; player continues seamless loop from local disk cache. |
| **12** | `operator_handover_completed` | **Human Physical** | Site facility manager briefed on power controls, pairing reset, and local operational runbook. |

**Finalization Rule:**  
A digital display cannot be finalized as `commissioned` if any check remains `pending`, `failed`, or `skipped`. The finalization record permanently logs the confirming administrator's UID, email, timestamp, and signoff notes.

---

## 4. Bulk Operations Governance

1. **Bulk CSV Import Safeguards:**
   - Template provided in application shell (`aura-dims-digital-displays-template.csv`).
   - Maximum file size: **2 MB**.
   - Maximum batch rows: **50 digital displays**.
   - Formula Injection Mitigation: Any value prefixed with `=`, `+`, `-`, `@`, `\t`, or `\r` is escaped with a leading single quote (`'`) during export.
   - Ambiguous matches rejected: Site and Department names must resolve uniquely.
   - Duplicate prevention: Duplicate `installationRef` values within the batch or existing fleet are detected during preflight.
2. **Bulk Department Head Assignment Boundaries:**
   - Target user must exist and have the `department_head` role.
   - Preflight strictly blocks cross-department assignments (e.g., an Engineering digital display cannot be assigned to an HR Department Head).
   - Partial failure isolation: Compliant digital displays are updated; incompatible displays report exact error causes without aborting or claiming false 100% success.

