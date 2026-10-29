# Aura DIMS - Comprehensive Acceptance Traceability Matrix

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Document Version:** 1.0.0  
**Target Milestone:** Staging Deployment & Physical Digital Display Pilot Preparation  

---

## 1. Traceability Matrix Overview

This matrix maps every functional requirement, security boundary, operational policy, and delivery mechanism of Aura DIMS to its concrete implementation, associated test cases, verification environment, and current validation status.

**Status Legend:**
- **VERIFIED (Automated):** Test passed in the automated test suite (`tests/rules`, `tests/acceptance`, `tests/e2e`).
- **VERIFIED (Manual/Unit):** Manually verified with live emulator probe or dedicated unit test.
- **READY (Staging Blocked):** Code, scripts, and configuration complete; awaits explicit cloud project provisioning approval.
- **PENDING (Physical):** Hardware-bound test pending delivery of physical digital display test units.

---

## 2. Requirement Traceability Matrix

| Req ID | Domain | Requirement Description | Implementation Reference | Test Reference | Environment | Status | Limitations / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-01** | Identity & RBAC | System Administrator bootstrap via CLI with zero hardcoded credentials | `scripts/bootstrap-admin.ts`, `functions/src/fleetAdmin.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 1) | Emulator Suite | **VERIFIED (Automated)** | Strictly rejects live production without safety flags |
| **AUTH-02** | Identity & RBAC | Multi-department provisioning and isolated Department Head roles | `functions/src/index.ts` (`createDepartment`, `provisionUser`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 2) | Emulator Suite | **VERIFIED (Automated)** | Password reset links issued; custom claims synced |
| **AUTH-03** | Identity & RBAC | Last-Admin concurrency barrier (preventing deletion or demotion of last admin) | `functions/src/index.ts` (`updateUser`, `deactivateUser`) | `tests/rules/security-rules.test.ts` | Emulator Suite | **VERIFIED (Automated)** | Transactional guard on `systemMetadata/counts` |
| **AUTH-04** | Identity & RBAC | Strict departmental data isolation between Department Heads | `firestore.rules`, `storage.rules`, `functions/src/common.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 18) | Emulator Suite | **VERIFIED (Automated)** | Cross-department designs, assets, and schedules rejected |
| **AUTH-05** | Identity & RBAC | Deactivated account and deactivated department enforcement | `functions/src/common.ts` (`getAuthenticatedCaller`), `firestore.rules` | `tests/rules/security-rules.test.ts`, unit checks | Emulator Suite | **VERIFIED (Automated)** | Inactive departments immediately block DH operations |
| **FLEET-01** | Fleet Mgmt | Sites and digital display registration in landscape and portrait | `functions/src/fleetAdmin.ts` (`createSite`, `registerDisplay`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 3) | Emulator Suite | **VERIFIED (Automated)** | Standard 1920×1080 and 1080×1920 resolutions enforced |
| **FLEET-02** | Fleet Mgmt | Permitted digital display user assignments for Department Heads | `functions/src/fleetAdmin.ts` (`assignDisplayUser`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 4) | Emulator Suite | **VERIFIED (Automated)** | Admins retain fleet-wide visibility |
| **FLEET-03** | Fleet Mgmt | Single-use 10-symbol pairing code generation and redemption | `functions/src/fleetAdmin.ts`, `functions/src/credentials.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 11) | Emulator Suite | **VERIFIED (Automated)** | 31-symbol alphabet (no ambiguous chars); HMAC-SHA256 verifiers |
| **FLEET-04** | Fleet Mgmt | Device credentials stored with POSIX `0600` permissions | `player/src/agent/identity.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 11) | Player Agent | **VERIFIED (Automated)** | Windows emulated via Node file permissions |
| **FLEET-05** | Fleet Mgmt | Dedicated device principal tokens (`principal: 'device'`) | `functions/src/fleetAdmin.ts` (`deviceSignIn`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 12) | Emulator Suite | **VERIFIED (Automated)** | Device principals rejected by human administration endpoints |
| **MEDIA-01** | Media Library | Staged file upload with MIME type and size ceiling (200MB) | `functions/src/mediaAdmin.ts`, `storage.rules` | `tests/acceptance/e2e-user-journey.test.ts` (Step 5) | Emulator Suite | **VERIFIED (Automated)** | Staging isolation prevents unverified media access |
| **MEDIA-02** | Media Library | Server-side validation via sharp (PNG/JPEG) and ffmpeg (H.264/AAC) | `functions/src/mediaAdmin.ts` (`finalizeMediaUpload`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 5) | Emulator Suite | **VERIFIED (Automated)** | Extracts resolution, duration, and generates SHA-256 |
| **MEDIA-03** | Media Library | Content-addressed storage and SHA-256 deduplication | `functions/src/mediaAdmin.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 5) | Emulator Suite | **VERIFIED (Automated)** | Checksum stored on permanent media document |
| **MEDIA-04** | Media Library | Immutable asset dependency freeze upon revision creation | `functions/src/publishingAdmin.ts` (`createDesignRevision`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 8) | Emulator Suite | **VERIFIED (Automated)** | Referenced assets cannot be purged while revisions exist |
| **DESIGN-01** | Content Creator | Versioned JSON design document model (`1.0.0`) | `packages/display-schema/src/index.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 6) | Schema / Emulator | **VERIFIED (Automated)** | Strict slide, element, geometry, and z-index schema |
| **DESIGN-02** | Content Creator | Multi-slide visual content with text, shapes, images, and video | `packages/display-schema/src/index.ts`, `functions/src/designAdmin.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 6) | Web / Emulator | **VERIFIED (Automated)** | Validated on create and update |
| **DESIGN-03** | Content Creator | Optimistic concurrency revision check on save | `functions/src/designAdmin.ts` (`updateDesign`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 7) | Emulator Suite | **VERIFIED (Automated)** | Revision conflicts throw `failed-precondition` |
| **PUB-01** | Publishing | Immutable design revision freeze with content hash | `functions/src/publishingAdmin.ts` (`createDesignRevision`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 8) | Emulator Suite | **VERIFIED (Automated)** | Captures asset manifest and required font list |
| **PUB-02** | Publishing | Ordered playlists with constituent design revisions | `functions/src/publishingAdmin.ts` (`createPlaylist`, `createPlaylistRevision`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 8) | Emulator Suite | **VERIFIED (Automated)** | Validates total duration and orientation uniformity |
| **PUB-03** | Publishing | Editorial approval workflow for departmental schedules | `functions/src/publishingAdmin.ts` (`submitForApproval`, `reviewApproval`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 9) | Emulator Suite | **VERIFIED (Automated)** | Admin approves exact revision and target digital displays |
| **PUB-04** | Publishing | Immutable publication manifest generation with SHA-256 | `functions/src/publishingAdmin.ts` (`preparePublication`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 10) | Cloud Storage | **VERIFIED (Automated)** | Atomic target digital display pointer write |
| **SCHED-01** | Scheduling | Asia/Kolkata deterministic schedule evaluation | `packages/display-schema/src/index.ts` (`evaluateScheduleAtTime`) | `tests/acceptance/schedule-evaluation.test.ts` (24 tests) | Pure Algorithm | **VERIFIED (Automated)** | Tested across inclusive starts, exclusive ends, overnight windows |
| **SCHED-02** | Scheduling | Priority-based collision resolution and Admin priority 10 override | `packages/display-schema/src/index.ts` (`evaluateScheduleAtTime`) | `tests/acceptance/schedule-evaluation.test.ts` | Pure Algorithm | **VERIFIED (Automated)** | Priority 10 immediately supersedes commercial playlists |
| **SCHED-03** | Scheduling | Schedule withdrawal fallback to neutral corporate content | `functions/src/publishingAdmin.ts` (`setScheduleStatus`), `evaluateScheduleAtTime` | `tests/acceptance/e2e-user-journey.test.ts` (Step 17) | Emulator Suite | **VERIFIED (Automated)** | Digital display reverts safely without blank screens |
| **PLAY-01** | Player Appliance | Local agent loopback HTTP server with Origin/Host validation | `player/src/agent/localServer.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 12) | Player Agent | **VERIFIED (Automated)** | Strictly bound to `127.0.0.1:8090`; external access rejected |
| **PLAY-02** | Player Appliance | Content-Addressable Cache (CAC) with SHA-256 verification | `player/src/agent/syncEngine.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 12) | Player Agent | **VERIFIED (Automated)** | Corrupted or unverified downloads discarded |
| **PLAY-03** | Player Appliance | Two-phase atomic publication activation (`active.json` pointer) | `player/src/agent/syncEngine.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 12) | Local Filesystem | **VERIFIED (Automated)** | Mid-download power loss leaves previous publication active |
| **PLAY-04** | Player Appliance | Purely offline autonomous playback without network pings | `player/src/agent/syncEngine.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 14) | Local Filesystem | **VERIFIED (Automated)** | Verified with zero cloud network calls |
| **PLAY-05** | Player Appliance | Offline power-loss reboot recovery from `active.json` | `player/src/agent/syncEngine.ts` | `tests/acceptance/e2e-user-journey.test.ts` (Step 15) | Local Filesystem | **VERIFIED (Automated)** | Instant startup resumption |
| **PLAY-06** | Player Appliance | Delivery telemetry and heartbeat reporting | `functions/src/fleetAdmin.ts` (`reportDeviceDelivery`, `reportDeviceHeartbeat`) | `tests/acceptance/e2e-user-journey.test.ts` (Step 13) | Emulator Suite | **VERIFIED (Automated)** | Reports cache metrics, slide index, and device health |
| **STG-01** | Staging Readiness | Strict environment separation between dev, staging, and prod | `.firebaserc`, `apps/web/.env.*`, `apps/web/src/lib/firebase.ts` | Build verification | Staging Build | **VERIFIED (Automated)** | Demo IDs blocked in non-emulator modes |
| **STG-02** | Staging Readiness | Production-ready Hosting configuration with security headers & CSP | `firebase.json` | Static validation | Firebase Config | **VERIFIED (Automated)** | CSP, HSTS, frame-ancestors 'none', asset cache-control |
| **STG-03** | Staging Readiness | Controlled staging administrator bootstrap script | `scripts/bootstrap-staging-admin.ts` | Static inspection | Node Script | **READY (Staging Blocked)** | Awaits live project approval |
| **STG-04** | Staging Readiness | Idempotent staging test fixtures seeder | `scripts/seed-staging.ts` | Static inspection | Node Script | **READY (Staging Blocked)** | Awaits live project approval |
| **PILOT-01** | Physical Pilot | Linux ARM64 systemd supervision and restart automation | `docs/player-installation.md` | Configuration review | Linux OS | **READY (Staging Blocked)** | Complete unit files prepared |
| **PILOT-02** | Physical Pilot | Chromium kiosk mode flags and Wayland/X11 configuration | `docs/player-installation.md` | Documentation review | Linux OS | **READY (Staging Blocked)** | Full flag matrix prepared |
| **PILOT-03** | Physical Pilot | 24-hour offline playback and 7-day soak verification | `docs/release-readiness.md` | Soak test plan | Physical Hardware | **PENDING (Physical)** | Requires physical display test bench |

---

## 3. Test Suite Summary Statistics

- **Total Test Cases Executed in Emulator Suite:** 105
  - E2E User Journey Acceptance Tests: **18 / 18 PASSED** (47.2s)
  - Schedule Evaluation Boundary Tests: **24 / 24 PASSED** (9ms)
  - Security Rules Tests (Firestore + Storage): **63 / 63 PASSED** (9.7s)
- **Monorepo Strict Typecheck:** **4 / 4 WORKSPACES PASSED (0 errors)**
- **Monorepo Production Builds:** **4 / 4 WORKSPACES BUILT CLEANLY**

