# Aura DIMS - Controlled Production Pilot Plan & Protocol

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Document Version:** 1.0.0  
**Target Milestone:** Client Acceptance & Controlled Production Pilot  

---

## 1. Pilot Executive Summary & Objectives

The primary objective of this controlled pilot is to validate Aura DIMS in a bounded, real-world deployment under live operational conditions with actual users and physical hardware. This pilot evaluates end-to-end reliability, departmental governance, offline signage autonomy, and operational support readiness before fleet expansion.

> [!IMPORTANT]
> **Pilot Boundary Rule:** The pilot is strictly limited to **two digital displays** at **one approved physical site**. Expansion toward 20 digital displays requires an explicit gate decision after the 7-day observation window, and fleet expansion toward 100 digital displays represents a separate subsequent milestone.

---

## 2. Pilot Scope & Stakeholder Roster

### 2.1 Approved Site
- **Site Name:** Surat Tech Complex
- **Physical Address:** Plot 14-16, Electronic Park, Ichhapore, Surat, Gujarat 394510
- **Site Infrastructure:** Uninterruptible Power Supply (UPS) backed power, 100 Mbps primary fibre with secondary 4G LTE failover, isolated signage VLAN (Subnet `192.168.10.0/24`).

### 2.2 Approved Digital Display Fleet
The pilot encompasses exactly two digital display units running the Aura DIMS Linux player agent under `systemd` supervision with Chromium in kiosk mode:

| Display Identifier | Placement Description | Orientation | Physical Resolution | Hardware Specification | Department Assignment | Initial Publication Target |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DISP-SURAT-01** | Factory Floor — Assembly Line 1 Overhead Panel | Landscape | 1920 × 1080 @ 60Hz | Raspberry Pi 4 Model B (4GB RAM), 32GB High-Endurance MicroSD, Micro-HDMI | Manufacturing Operations (`dept-mfg`) | Shift safety protocols, operational metrics, emergency broadcast overrides |
| **DISP-SURAT-02** | R&D Centre Main Entrance Lobby Totem | Portrait | 1080 × 1920 @ 60Hz | Raspberry Pi 5 (4GB RAM), 32GB Industrial NVMe SSD, Micro-HDMI (90° rotated) | Product Engineering (`dept-eng`) | Visitor greetings, engineering sprint milestones, corporate announcements |

### 2.3 User & Operational Stakeholder Roles

| Role | Name | Email Identifier | Departmental Responsibility | Primary Pilot Tasks |
| :--- | :--- | :--- | :--- | :--- |
| **System Administrator** | Deep Tailor | `deep@aurainteract.com` | Global Fleet & Security Administration | User provisioning, digital display registration & pairing, editorial approval, emergency overrides |
| **Department Head (MFG)** | To be confirmed by client | `mfg.lead@aurainteract.com` | Manufacturing Operations | Media upload, shift safety notice creation, playlist compilation, schedule submission |
| **Department Head (ENG)** | To be confirmed by client | `eng.lead@aurainteract.com` | Product Engineering | Totem notice creation, multilingual greeting slides, engineering notice publication submission |
| **Site Technical Contact** | Site Operations Lead | `ops.surat@aurainteract.com` | Physical Facility & Network Support | Hardware mounting, physical cable verification, manual power-cycle observation |

### 2.4 Approved Notice Set for Initial Publication
1. **Notice 1 (Landscape - MFG):** "Standard Operating Safety Protocol — Shift A" (H.264 video loop + text advisories in English & Hindi).
2. **Notice 2 (Portrait - ENG):** "Welcome to Aurainteract R&D Centre" (High-resolution imagery + typography in English, Hindi & Gujarati).
3. **Emergency Override Notice (Global):** "Facility Advisory / Evacuation Notice" (Priority 10 Administrator override test).

---

## 3. Seven-Day Pilot Observation Protocol

The pilot will run for a continuous 168-hour (7 calendar days) observation window once both digital displays are physically mounted and paired.

### 3.1 Observation Schedule & Checkpoints

```
Day 1: Physical Mounting, Pairing & Baseline Telemetry
  ├── Physical panel inspection (viewing distance, orientation, contrast)
  ├── 10-symbol pairing code generation and redemption
  └── First publication delivery & human verification of rendered slides

Day 2: Departmental Workflow & Multilingual Content Publishing
  ├── Department Head media ingestion (PNG & MP4 assets)
  ├── Visual content authoring with Gujarati & Devanagari fonts
  └── Editorial review, Admin approval, and atomic publication activation

Day 3: Priority Collision & Emergency Override Testing
  ├── Concurrent schedule overlap resolution (highest priority activation)
  └── Admin Priority 10 emergency broadcast broadcast and immediate restoration

Day 4: Network Disconnection & 24-Hour Offline Resilience Soak
  ├── Disconnect Ethernet / disable Wi-Fi interface at 09:00 IST
  ├── Verify continuous autonomous playback from local Content-Addressable Cache (CAC)
  └── Confirm zero Cloud Function or network ping dependencies for slide transitions

Day 5: Abrupt Power-Loss Reboot Recovery While Offline
  ├── Hard power-cycle of DISP-SURAT-01 and DISP-SURAT-02 while network remains offline
  ├── Time time-to-render from power application to slide 1 playback (< 45s target)
  └── Verify resumption from local `packages/active.json` pointer without error dialogues

Day 6: Reconnection, Telemetry Slew & Replacement Publication
  ├── Restore network interface at 09:00 IST
  ├── Verify buffered delivery telemetry and heartbeat synchronization
  └── Publish scheduled replacement notice and observe seamless atomic switch

Day 7: Pilot Review, Operational Audit & Exit Evaluation
  ├── Complete client acceptance sign-off checklist
  ├── Audit Cloud Functions invocations, Firestore reads/writes, and Storage footprint
  └── Convene stakeholder pilot exit review for expansion decision
```

---

## 4. Bounded 7-Day Pilot Observation Log Template

This structured record must be maintained daily by the assigned technical contact and signed off jointly by Aurainteract delivery lead and client operations lead:

| Day | Date (IST) | Display ID | Desired Version | Active Version Reported | Heartbeat Status | Memory (Agent / Kiosk) | Temperature | Physical Screen Output Verified? | Observations / Incidents | Sign-off Initials |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Day 1** | Pending | DISP-SURAT-01 | `pub_mfg_v1` | Pending | Pending | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Hardware paired; baseline active | — |
| **Day 1** | Pending | DISP-SURAT-02 | `pub_eng_v1` | Pending | Pending | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Totem aligned in portrait | — |
| **Day 2** | Pending | DISP-SURAT-01 | `pub_mfg_v2` | Pending | Pending | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Multilingual slide rendered | — |
| **Day 2** | Pending | DISP-SURAT-02 | `pub_eng_v2` | Pending | Pending | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Media transcoded cleanly | — |
| **Day 3** | Pending | DISP-SURAT-01 | `pub_emerg_v1`| Pending | Pending | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Priority 10 override tested | — |
| **Day 3** | Pending | DISP-SURAT-02 | `pub_eng_v2` | Pending | Pending | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Unaffected by mfg override | — |
| **Day 4** | Pending | DISP-SURAT-01 | `pub_mfg_v2` | Pending | OFFLINE (Planned) | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Disconnected; playback ok | — |
| **Day 4** | Pending | DISP-SURAT-02 | `pub_eng_v2` | Pending | OFFLINE (Planned) | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Disconnected; playback ok | — |
| **Day 5** | Pending | DISP-SURAT-01 | `pub_mfg_v2` | Pending | OFFLINE (Reboot) | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Offline boot to active.json | — |
| **Day 5** | Pending | DISP-SURAT-02 | `pub_eng_v2` | Pending | OFFLINE (Reboot) | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Cold reboot resumed <45s | — |
| **Day 6** | Pending | DISP-SURAT-01 | `pub_mfg_v3` | Pending | ONLINE | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Reconnected; telemetry synced | — |
| **Day 6** | Pending | DISP-SURAT-02 | `pub_eng_v3` | Pending | ONLINE | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | Switched package atomically | — |
| **Day 7** | Pending | DISP-SURAT-01 | `pub_mfg_v3` | Pending | ONLINE | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | 7-day soak complete | — |
| **Day 7** | Pending | DISP-SURAT-02 | `pub_eng_v3` | Pending | ONLINE | Target <150MB / <450MB | Target <70°C | [ ] Yes  [ ] No | 7-day soak complete | — |

---

## 5. Pilot Review Thresholds & SLA Metrics

If any of the following boundaries are breached during the observation window, the pilot is immediately flagged for engineering review:

1. **Publication Compilation / Delivery Failure Rate:** > 0.0% (Zero tolerance for corrupt packages).
2. **Unplanned Display Offline Duration:** > 30 consecutive minutes while site network is confirmed healthy.
3. **Renderer Process Restarts:** > 2 unexpected Chromium or agent crashes per appliance per 24-hour cycle.
4. **Appliance Memory Drift:** Process resident set size (RSS) exceeding 600 MB on Linux ARM64.
5. **Storage Footprint:** Digital display local cache exceeding 10 GB or orphan staging files not pruned after 24 hours.
6. **Cloud Spending Ceiling:** Project billings reaching $15.00 USD during the 7-day pilot window.

---

## 6. Pre-Pilot Verification Confirmation

Prior to physical mounting, the delivery team completed all software and security prerequisites:
- **Automated Tests:** 107/107 passed across security rules, schedule evaluation, web unit tests, and the 18-step user journey.
- **Backend Infrastructure:** 73 Cloud Functions v2 and Storage security rules deployed to `asia-south1` with public invoker policy active.
- **CORS Preflight:** Verified live from `https://aura-dims.vercel.app` across all publishing and fleet endpoints.
- **Hardware Profile:** Linux ARM64 systemd unit files and kiosk profile verified in accordance with `docs/player-installation.md`.

*Current Pilot Status:* **READY FOR PHYSICAL MOUNTING & CLIENT SCHEDULING**. Formal pilot outcome remains **PENDING** real-time 7-day soak execution.

