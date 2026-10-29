# Aura DIMS - Release Readiness & Pilot Governance Report

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Document Version:** 1.0.0  
**Target Milestone:** Staging Pilot & Physical Digital Display Verification  

---

## 1. Executive Summary & Quality Gates

Aura DIMS has completed all developmental milestones across authentication, departmental role-based access control, media ingestion and validation, visual design editing, playlist authoring, editorial approvals, Asia/Kolkata scheduling, publication packaging, and offline digital display player runtime.

All pre-deployment verification criteria have been executed and validated:
- **Security Rules Coverage:** 63/63 tests passed (denies unauthenticated writes, departmental isolation, device segregation).
- **Schedule Evaluation Integrity:** 24/24 tests passed (boundary conditions, inclusive starts, exclusive ends, cross-midnight overnight schedules, Admin priority 10 overrides).
- **End-to-End Real User Journey:** 18/18 steps passed (Admin bootstrap, departmental user provisioning, display registration, media transcoding, design authoring, editorial review, pairing, package download, offline playback, reboot recovery, schedule replacement, and cross-departmental isolation).
- **TypeScript Typecheck:** 0 errors across `@aura-dims/display-schema`, `@aura-dims/functions`, `@aura-dims/player`, and `@aura-dims/web`.
- **Production Bundles:** Clean minified builds generated with no source-map leakage.

---

## 2. Go / No-Go Decision Criteria for Staging Pilot

| Quality Dimension | Standard Required | Evaluated Status | Decision |
| :--- | :--- | :--- | :--- |
| **Security Perimeter** | Deny-by-default on Firestore and Storage; privileged actions strictly executed via Cloud Functions | 63/63 Rules tests passed; all client mutations blocked | **GO** |
| **Data Integrity** | Media validated via sharp/ffmpeg; manifests verified by SHA-256 before activation | Verified in Step 5 & 12 of E2E acceptance suite | **GO** |
| **Autonomous Signage Playback** | Digital display operates purely offline without cloud pings; local hardware clock in `Asia/Kolkata` | 24 boundary tests passed; Step 14 & 15 offline tests passed | **GO** |
| **Zero Secrets in Code** | No service account JSONs, private tokens, or hardcoded passwords in git or client builds | Environment guards verified; secret manager integration ready | **GO** |
| **Cloud Target Approval** | Explicit confirmation of Google Cloud Project ID and Blaze billing plan | Awaiting stakeholder approval of `aura-dims-staging` | **NO-GO (Hold on Cloud Deploy)** |
| **Physical Hardware Bench** | Verification on physical Raspberry Pi / Linux ARM64 hardware | Pilot runbooks prepared; awaiting physical unit allocation | **HOLD (Physical Bench)** |

---

## 3. Physical Digital Display Pilot Plan

### 3.1 Pilot Digital Display Units Allocation
The physical staging pilot encompasses two distinct physical hardware configurations:

1. **Pilot Unit 1 — Landscape Digital Display (1920×1080):**
   - **Target Placement:** Surat Tech Complex — Factory Floor / Assembly Line 1.
   - **Orientation:** Landscape (`1920x1080`).
   - **Hardware Profile:** Raspberry Pi 4 (4GB RAM) or x86_64 Fanless Industrial Box.
   - **Operating System:** Raspberry Pi OS Lite (64-bit, Debian 12 Bookworm) / Ubuntu 24.04 LTS ARM64.
   - **Primary Function:** Continuous broadcast of manufacturing metrics, shift safety advisories, and emergency announcements.

2. **Pilot Unit 2 — Portrait Digital Display (1080×1920):**
   - **Target Placement:** Surat Tech Complex — R&D Center Main Entrance Totem.
   - **Orientation:** Portrait (`1080x1920`).
   - **Hardware Profile:** Raspberry Pi 5 (4GB RAM) with vertical HDMI orientation flag.
   - **Operating System:** Raspberry Pi OS Lite (64-bit, Debian 12 Bookworm).
   - **Primary Function:** Vertical signage, visitor greetings, corporate announcements, and multilingual engineering notices.

---

## 4. Offline & Soak Testing Protocols

### 4.1 24-Hour Offline Resilience Test
1. **Preparation:** Ensure both pilot digital displays are paired and displaying approved active publication content.
2. **Execution:** Disconnect the Ethernet cable / disable Wi-Fi interface (`nmcli radio wifi off`).
3. **Observation Windows:** Inspect every 4 hours for:
   - Continuous slide transitions and video playback without stutter or freeze.
   - Proper evaluation of time-of-day schedule rules in `Asia/Kolkata` time.
   - Corporate fallback presentation during unscheduled hours.
   - Zero memory leaks or process crashes in Chromium or player agent.
4. **Offline Reboot:** Hard power-cycle the digital display while offline at the 12-hour mark. Verify that the appliance boots straight into fullscreen playback from `player/data/packages/active.json` without displaying error dialogs or network connection prompts.
5. **Reconnection:** Restore network connectivity at 24:00:00. Verify the digital display transmits delivery telemetry, updates heartbeat status to `online`, and checks for publication updates seamlessly.

### 4.2 7-Day Continuous Playback Soak Test
1. **Duration:** 168 consecutive hours (7 full calendar days).
2. **Workload:** Cyclic playlist with high-resolution PNG slides, 1080p H.264 video loops, and dynamic text cards in Gujarati, Hindi, and English.
3. **Telemetry Monitoring:**
   - Agent memory consumption (target: steady state < 150 MB).
   - Chromium kiosk memory consumption (target: < 450 MB; hourly renderer refresh if leak detected).
   - Local disk cache footprint (target: strictly bounded by active assets; no orphan staging accumulation).
   - Processor core temperature (target: < 70°C in passive industrial casing).
   - Heartbeat reporting consistency (target: > 99.5% uptime).

---

## 5. Risk Assessment & Architectural Mitigations

| Risk Description | Severity | Likelihood | Architectural Mitigation |
| :--- | :--- | :--- | :--- |
| **Abrupt Power Outage During Package Download** | High | Medium | Two-phase atomic pointer activation: new package downloads into isolated staging directory; previous `active.json` is preserved until all SHA-256 hashes match. |
| **Local Clock Drift on Network Disconnection** | Medium | Low | Real-Time Clock (RTC) module recommended for offline appliances; NTP synchronization on network reconnection with smooth slew. |
| **Runaway Staging Cloud Costs** | Medium | Low | Hard instance limit (`maxInstances: 10`), 200MB file ceiling, budget alerts configured at $5, $10, and $25 USD. |
| **Unapproved Content Published to Digital Displays** | Critical | Low | Strict editorial approval workflow: Department Heads can only submit publication requests; only System Administrators can approve and generate signed manifests. |
| **Cross-Department Data Exposure** | Critical | Low | Deny-by-default Firestore and Storage security rules enforce departmental boundaries at database and bucket levels. |

---

## 6. Phased Rollout Roadmap

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│ Phase 1: Local Testing │ ───► │ Phase 2: Staging Pilot │ ───► │ Phase 3: Soak & Bench  │
│ 105 Automated Tests    │      │ Project: aura-dims-stg │      │ 2 Physical Displays    │
│ [STATUS: COMPLETED]    │      │ [STATUS: READY/HOLD]   │      │ 24h Offline + 7d Soak  │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
                                                                             │
                                                                             ▼
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│ Phase 6: Fleet Scale   │ ◄─── │ Phase 5: Pilot Fleet   │ ◄─── │ Phase 4: Production Go │
│ 100+ Enterprise Units  │      │ 20 Selected Displays   │      │ Production Bootstrap   │
│ Production Blaze Plan  │      │ Controlled Departmental│      │ Final Stakeholder Sign │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

