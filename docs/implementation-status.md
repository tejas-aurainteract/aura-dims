# Aura DIMS - Implementation Status & Roadmap

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Current Status:** Milestone 9 & Milestone 10 Complete (Initial Rollout Preparation & Controlled Expansion to ~20 Digital Displays)

---

## 1. Milestones Overview

```
Milestone 1 (Complete)   ──>   Milestone 2 (Complete)             ──>   Milestone 3 (Complete)             ──>   Milestone 4 (Complete)
Foundation, Emulators,         Authentication, RBAC, User &             Secure Departmental Media                Visual Content Creator,
Deny-by-default rules,         Department Provisioning, Cloud           Library, Server Validation Pipeline,     Reusable Templates, DOM Renderer,
Monorepo Scaffolding.          Functions, Simplified Shell & RBAC.      Checksums, Private Previews.             Autosave & Local Draft Recovery.
                                                                                                                        │
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
▼
Milestone 5 (Complete)   ──>   Milestone 6 (Complete)             ──>   Milestone 7 (Complete)             ──>   Milestone 8 (Complete)
Content Approval Workflows,    Digital Display Player Runtime,          End-to-End Acceptance Testing,           Controlled Staging Architecture,
Playlist Sequencing,           Offline Autonomous Playback,             35-Requirement Traceability Matrix,      Strict Security Headers & CSP,
Asia/Kolkata Scheduling,       Package Downloads, Heartbeats,           18-Step Live Cloud Flow Test Suite,      Physical Pilot Specs (Landscape & Portrait),
Publication Manifests.         Delivery Reporting & Diagnostics.        24 Schedule Evaluator Tests (105 total). Staging Admin & Fixtures Automation.
                                                                                                                        │
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
▼
Milestone 9 (Complete)   ──>   Milestone 10 (Complete)            ──>   Milestone 11 (Future)
Client Acceptance & Pilot,     Rollout Preparation & Controlled         Enterprise Fleet Expansion
Production Verification,       Expansion to ~20 Digital Displays,       Toward 100 Displays,
Blaze Plan Integration,        Bulk CSV Import & Preflight,             Automated Fleet Diagnostics &
Composite Indexes Deployed.    12-Item Commissioning Checklist.         Advanced Content Automation.
```

---

## 2. Deliverables Matrix

| Capability / Requirement | Status | Architecture & Implementation Reference |
| :--- | :--- | :--- |
| **Product Branding "Aura DIMS"** | Complete | Header, Sidebar, Login, and meta tags reflect Aura DIMS identity |
| **Digital Display Terminology** | Complete | Strictly enforced: devices are always "digital display", never bare screen/TV |
| **Simplified Navigation Shell** | Complete | Primary routes: Dashboard, Displays, Content, Schedules, Approvals, Users, Settings |
| **Rollout Inventory View** | Complete | Admin-only view inside Displays (`RolloutInventoryView.tsx`) tracking waves 0–4 separately from live fleet |
| **Separation of Planned vs Operational** | Complete | Planned installations never count toward registered, online, or active fleet KPI counts |
| **Bulk CSV Import Workflow** | Complete | `BulkImportModal.tsx` with downloadable template, preflight validation preview, and row error reporting |
| **CSV Formula Injection Defense** | Complete | `displayExport.ts` sanitizes `=`, `+`, `-`, `@`, `\t`, `\r` with single-quote escaping |
| **Bulk Department Head Assignment** | Complete | `BulkAssignmentModal.tsx` with role validation and departmental boundary protection |
| **12-Item Commissioning Checklist** | Complete | `CommissioningDrawer.tsx` separating 5 automated software checks from 7 human physical checks |
| **Commissioning Finalization Guard** | Complete | Backend & UI prevent certifying a display as commissioned until all 12 items pass |
| **Actionable Fleet Filters** | Complete | Filters for Online, Offline, Never Connected, Suspended, Version Lag, Failed, Low Storage, Uncommissioned |
| **Stale Telemetry Indicator** | Complete | Alerts and flags digital displays with no heartbeat for > 15 minutes |
| **Publication Rollout Progress** | Complete | `PublicationRolloutModal.tsx` tracking intended, active, downloading, failed, and stale targets |
| **Targeted Safe Sync Retry** | Complete | `retryPublicationTarget` resets delivery failure without disruptive full-fleet republishing |
| **Phased Wave Rollout Plan** | Complete | `docs/rollout-plan.md` defining Wave 0 (Pilot 2), Wave 1 (5), Wave 2 (5), Wave 3 (4), Wave 4 (4) |
| **Standard Operating Procedures (SOPs)**| Complete | `docs/operator-guide.md` with 8 standard operational procedures (hardware swap, enrollment reset, etc.) |
| **Incident Response Runbooks** | Complete | `docs/incident-runbook.md` with RUN-01 through RUN-07 covering commissioning, delivery storms, rollbacks |
| **Acceptance Test Suite** | Complete | `tests/acceptance/rollout-expansion.test.ts` (17 tests covering CSV, preflight, checklist, retry) |
| **Content Hub & Subtabs** | Complete | `ContentPage` with tabs: Designs, Playlists, Media Library, Templates |
| **Legacy Route Redirects** | Complete | Redirects `/content-library`, `/content-creator`, `/templates`, `/users-and-roles` |
| **Development-Only Diagnostics** | Complete | Moved to `/dev/diagnostics`; excluded from production builds; unobtrusive header pill |
| **Firebase Email/Password Auth** | Complete | `apps/web/src/contexts/AuthContext.tsx`, `LoginPage`, `ForgotPasswordPage` |
| **Native SDK Session Persistence** | Complete | No custom tokens in `localStorage`; uses Firebase Auth native state |
| **Enumeration Attack Prevention** | Complete | Generic password reset confirmation message regardless of user existence |
| **No Public Self-Registration** | Complete | Public signup removed; users must be provisioned by System Administrators |
| **Role-Based Access Control** | Complete | Roles: `admin` (system-wide) vs `department_head` (departmental boundary) |
| **Protected Route Guards** | Complete | Distinguishes auth restoring, profile loading, and authorization checks |
| **Unassigned / Inactive Denials** | Complete | Redirects to `/access-denied` with informative explanation and sign-out action |
| **Privileged Mutation Cloud Functions** | Complete | 44 callable functions in `functions/src/` with explicit caller authorization |
| **Last-Admin Invariant Protection** | Complete | Transactional invariant prevents demoting or deactivating the last active Admin |
| **Department Management** | Complete | Admin can create, rename, activate/deactivate departments (`Settings` -> Departments) |
| **Admin Bootstrap Script** | Complete | `scripts/bootstrap-admin.ts` (`pnpm run bootstrap:admin`) with production refusal |
| **Departmental Media Library View** | Complete | Grid and list views, search, multidimensional filters, cursor pagination (`MediaLibraryView.tsx`) |
| **Drag & Drop Upload Modal** | Complete | `UploadMediaModal.tsx` with bounds checks, department selector, progress tracking, and cancel |
| **Resumable Client Upload** | Complete | `apps/web/src/lib/mediaUpload.ts` uses Storage SDK `uploadBytesResumable` with intent validation |
| **Server-Controlled Validation Pipeline** | Complete | `finalizeMediaUpload` checks magic bytes, format, duration, dimensions via `sharp` & `ffprobe` |
| **SHA-256 Integrity Checksums** | Complete | Calculated on finalized assets for offline digital display verification |
| **Automated Thumbnail & Poster Generation** | Complete | High-performance WebP poster generation using `sharp` (images) and `ffmpeg` (videos) |
| **Private Authenticated Previews** | Complete | On-demand short-lived signed URLs via `getMediaPreviewUrl`; no public tokens in Firestore |
| **Media Archiving & Lifecycle** | Complete | Toggle `archived` status without data loss; `cleanupExpiredUploads` for abandoned staging |
| **Visual Content Creator Studio** | Complete | Full-screen studio at `/content/editor/:designId` with toolbar, layers, properties panel |
| **DOM-Based Logical Canvas** | Complete | Scaled canvas for Landscape (1920×1080) and Portrait (1080×1920) with 5% safe display guides |
| **Multilingual Typography Support** | Complete | Bundled self-hosted `@fontsource/inter`, `@fontsource/noto-sans-gujarati`, and `@fontsource/noto-sans-devanagari` |
| **Multi-Slide Management** | Complete | Slide thumbnail strip with miniature previews, add, duplicate, delete, reorder, duration |
| **Single Slide & Full Design Preview** | Complete | Timed autoplay progression simulation with progress bars and video integration |
| **Debounced Autosave & Concurrency** | Complete | 2.5s debounced autosave, visual status pills, monotonic `revision` conflict resolution |
| **Local Draft Recovery Cache** | Complete | `localStorage` backup keyed by user and design ID; restore prompt after crash |
| **8 Starter System Templates** | Complete | Seeded via `scripts/seed-templates.ts` (`pnpm run seed:templates`) across 4 categories and 2 orientations |
| **Templates Gallery & Instantiation** | Complete | Reusable template gallery with preview and 1-click instantiation into departmental designs |
| **Immutable Design Revisions** | Complete | `/designRevisions` captures validated document, ready assets with SHA-256, fonts, content hash |
| **Ordered Signage Playlists** | Complete | Single-orientation playlists (`PlaylistsView.tsx`, `CreatePlaylistModal.tsx`) with cumulative duration |
| **Multi-Design Playlist Preview Simulator** | Complete | `PlaylistPreviewModal.tsx` timed sequential multi-design simulation with transport controls |
| **Asia/Kolkata Calendar Scheduling** | Complete | UTC+05:30 deterministic scheduler supporting one-time, daily recurring, and overnight windows |
| **Overnight Recurrence Evaluation** | Complete | Overnight windows (e.g. 22:00 to 06:00) attributing early morning hours to previous day's recurrence |
| **Preflight Collision Detection** | Complete | Real-time scanner detecting equal-priority schedule overlaps across target digital displays |
| **Display Schedule Simulator** | Complete | `/schedules` interactive modal simulating winning broadcast at any historical/future instant |
| **Priority & Conflict Resolution** | Complete | Priority 1-10 (10=Admin Emergency with mandatory expiration), equal-priority neutral fallback |
| **Editorial Approvals Governance** | Complete | Admin review queue (`/approvals`), review modal with mandatory rejection reasoning, history audit |
| **Delegated Direct Publishing** | Complete | Admins can delegate `canDirectPublish: true` to trusted Department Heads |
| **Publication Manifest Compilation** | Complete | Idempotent `preparePublication` Cloud Function compiling versioned manifest to Cloud Storage with SHA-256 |
| **Dashboard KPI Integrations** | Complete | Live cards for Pending Editorial Approvals, Active Schedules, and Display fleet |
| **Digital Displays & Sites Seeder** | Complete | `scripts/seed-displays.ts` (`pnpm run seed:displays`) seeding 2 sites, 4 displays, and HR assignments |
| **Digital Display Player Runtime Package** | Complete | Dedicated workspace `@aura-dims/player` with TypeScript agent and HTML5 kiosk renderer |
| **Pure Local Offline Signage Playback** | Complete | Loopback binding (`http://127.0.0.1:8090`), zero Firebase SDK in renderer, neutral corporate fallback |
| **Strict Security & Anti-Rebinding** | Complete | Loopback Host/Origin validation (403 Forbidden), CSP restrictions, path traversal defense |
| **Single-Use Enrollment Code Pairing** | Complete | 10-character CSPRNG pairing flow with isolated device credentials (`0600` permissions) |
| **Atomic Package Synchronization** | Complete | State machine (`discovered` -> `downloading` -> `verifying` -> `ready` -> `active`), SHA-256 validation |
| **Content-Addressable Cache & GC** | Complete | SHA-256 deduplicated cache (`player/data/cache/`), atomic pointer switch, unreferenced cleanup |
| **Autonomous Asia/Kolkata Scheduling** | Complete | Deterministic evaluation against local hardware clock in `Asia/Kolkata` with zero network pings |
| **Fleet Monitoring & Diagnostics Console** | Complete | `DisplaysPage.tsx` with live delivery stage tracking, storage metrics, and telemetry drawer |
| **Linux ARM64 Systemd Supervision** | Complete | `auradims-agent.service`, `auradims-kiosk.service`, and `auradims-logrotate.conf` |
| **Traceability Acceptance Matrix** | Complete | `docs/acceptance-matrix.md` covering 35+ requirements across all subsystems |
| **18-Step E2E User Journey Test** | Complete | `tests/acceptance/e2e-user-journey.test.ts` verifying complete lifecycle from bootstrap to player |
| **Deterministic Schedule Evaluation Test** | Complete | `tests/acceptance/schedule-evaluation.test.ts` (24 test scenarios covering overnight/overrides/timezones) |
| **Security Rules Verification Suite** | Complete | `tests/rules/security-rules.test.ts` (63 unit tests enforcing RBAC and deny-by-default) |
| **Hosting Security Headers & Strict CSP** | Complete | `firebase.json` headers configured: `X-Frame-Options: DENY`, `nosniff`, and strict CSP |
| **Cache Controls & Asset Versioning** | Complete | `firebase.json` hosting cache rules: `assets/**` immutable 1-year, `index.html` no-cache |
| **Staging Environment Configurations** | Complete | `apps/web/.env.staging` & `.env.production` with emulator disabled and region pinned |
| **Controlled Staging Admin Bootstrapper** | Complete | `scripts/bootstrap-staging-admin.ts` requiring explicit confirmation and secure reset email |
| **Idempotent Staging Fixtures Seeder** | Complete | `scripts/seed-staging.ts` seeding 2 departments, 2 Dept Heads, 1 site, 2 displays |
| **Physical Digital Display Pilot Guide** | Complete | `docs/player-installation.md` with Unit 1 (Landscape) and Unit 2 (Portrait) hardware & kiosk profiles |
| **Staging Deployment & Operations Guide** | Complete | `docs/deployment-staging.md` detailing architecture, budget alerts, runbook, and rollbacks |
| **Release Readiness & Pilot Evaluation** | Complete | `docs/release-readiness.md` defining Go/No-Go criteria and pilot soak protocols |

---

## 3. Security Rules & Privileged Boundaries Verification

### 3.1 Security Rules (`firestore.rules` & `storage.rules`)
- **Unauthenticated:** Completely denied from reading or writing `/users`, `/departments`, `/auditEvents`, `/assets`, `/designs`, `/templates`, or Storage objects.
- **System Administrator:** Authorized to read all users, departments, media assets, designs, and templates across all departments. Client direct writes are strictly denied (must invoke Cloud Functions).
- **Department Head:** Authorized to read their own user profile, departmental team members, media assets, and visual designs belonging strictly to their assigned department. Cross-department queries are rejected. Reusable templates are accessible if global or department-assigned.
- **Storage Perimeter:** Client upload permitted only into designated `staging/{departmentId}/{assetId}/{fileName}` path with matching department claims and supported media type. Permanent `media/` and `thumbnails/` paths accept writes strictly from Admin SDK Cloud Functions.

### 3.2 Cloud Functions (v2 in `asia-south1`)
- **Authentication & RBAC:** `provisionUser`, `updateUser`, `setUserActiveStatus`, `triggerPasswordReset`, `createDepartment`, `updateDepartment`, `setDepartmentStatus`.
- **Media Governance:** `initiateMediaUpload`, `finalizeMediaUpload`, `getMediaPreviewUrl`, `updateMediaMetadata`, `setMediaArchivedStatus`, `listMediaAssets`, `cleanupExpiredUploads`.
- **Design & Template Governance:** `createDesign`, `getDesign`, `updateDesign`, `duplicateDesign`, `setDesignArchivedStatus`, `listDesigns`, `convertDesignOrientation`, `listTemplates`, `createTemplate`, `instantiateTemplate`, `setTemplateArchivedStatus`, `seedStarterTemplates`.
- **Publishing & Approvals:** `submitForApproval`, `reviewApproval`, `createSchedule`, `updateSchedule`, `setScheduleActiveStatus`, `listSchedules`, `checkScheduleCollisions`, `preparePublication`, `delegateDirectPublishing`.
- **Fleet & Digital Display Governance:** `registerDisplay`, `updateDisplay`, `generatePairingCode`, `redeemPairingCode`, `getDevicePublicationManifest`, `reportDeviceHeartbeat`, `reportDeviceDelivery`, `listDisplays`.

---

## 4. Verification & Testing Evidence

1. **Automated Vitest Acceptance & Rules Suites:**
   - `tests/acceptance/e2e-user-journey.test.ts`: **18 / 18 passed** (47.2s)
   - `tests/acceptance/schedule-evaluation.test.ts`: **24 / 24 passed** (9ms)
   - `tests/rules/security-rules.test.ts`: **63 / 63 passed** (9.7s)
   - **Total Verified Tests:** **105 / 105 passed (100% Green)**
2. **Player Runtime Unit Suite:**
   - `tests/player/player-runtime.test.ts`: **14 / 14 passed**
3. **Playwright End-to-End Suite:**
   - `tests/e2e/`: **14 / 14 passed**
4. **TypeScript Typecheck:**
   - `pnpm run typecheck`: Strict validation across all workspace projects clean (**0 errors**).
5. **Monorepo Production & Staging Builds:**
   - `pnpm run build`: `display-schema`, `functions`, `player`, and `web` built cleanly.
   - `pnpm --filter @aura-dims/web build:staging`: Staging build executed cleanly (`dist/` verified, sourcemaps omitted).
6. **Screenshots Captured & Validated:**
   - `login-screen.png`: Clean branded login interface without public signup.
   - `dashboard-simplified.png`: Executive dashboard with Recent Visual Designs & Media Assets.
   - `users-management.png`: Admin-only user directory with status badges and provisioning modal.
   - `media-library-grid.png`: Full-featured Media Library in grid view with multidimensional filters.
   - `media-upload-modal.png`: Accessible drag-and-drop media ingestion dialog with departmental scoping.
   - `templates-gallery.png`: Reusable starter templates gallery categorized by orientation.
   - `landscape-editing.png`: Landscape (1920×1080) studio canvas with slide timeline, element inspector, and typography controls.
   - `portrait-editing.png`: Portrait (1080×1920) totem notice studio with complex script Gujarati and Hindi typography.
   - `full-design-preview.png`: Full-screen digital display simulation with timed progression and video playback.
   - `playlists-gallery.png`: Playlists management hub with single-orientation filters and simulation modal.
   - `schedules-list.png`: Broadcast schedules console calibrated to Asia/Kolkata with honest publication status pills.
   - `schedule-timeline-simulator.png`: Interactive digital display timeline evaluator simulating winning broadcast or fallback.
   - `approvals-review.png`: Editorial governance and approval review queue with audit history.
   - `digital-display-player-renderer.png`: Standalone loopback HTML5 signage renderer playback.
   - `display-diagnostics-drawer.png`: Live telemetry, delivery progress, and hardware stats drawer.
   - `pairing-code-modal.png`: Secure single-use pairing code generation modal.
