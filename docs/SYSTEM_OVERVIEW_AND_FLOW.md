# Aura DIMS — Complete System Overview, Architecture & Implementation Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura DIMS (Aura Digital Information Management System)  
**System Purpose:** Enterprise Digital Signage & Content Management Platform  
**Target Environment:** Cloud-orchestrated CMS distributing deterministic playback manifests to autonomous, store-and-forward physical digital displays.

> [!NOTE]
> This document describes the **exact, currently implemented architecture, flows, and capabilities** in this codebase. It contains no speculative or proposed features.

---

## 1. System Philosophy & Ground Rules

1. **Strict Terminology Requirement:**
   - Always use the term **"digital display"** in all user-facing copy, logs, documentation, and UI components. Never use bare words like "screen", "monitor", or "TV".
2. **Autonomous Offline Playback:**
   - Client digital display players operate autonomously using local hardware clocks calibrated to `Asia/Kolkata` (`UTC+05:30`).
   - Slide transitions and schedule window evaluations **never depend on live cloud pings or Cloud Functions**.
   - Downloaded assets are cryptographically verified via **SHA-256** before a publication manifest is atomically activated.
3. **Privileged Operations Boundary:**
   - The React web frontend SDK performs only authenticated reads and draft mutations within department bounds.
   - Privileged operations (role assignment, digital display enrollment, editorial review, publication manifest compilation, fleet maintenance commands) **must execute strictly through backend Cloud Functions** using the Firebase Admin SDK.
4. **Strict Local Emulator Support:**
   - All local development and testing run against the Firebase Emulator Suite using the demo project ID `demo-aura-dims`.
   - Production runs on Firebase project `aura-dims` with web frontend hosting on Firebase Hosting and Vercel.

---

## 2. Monorepo Architecture

```
aura-dims/
├── apps/
│   └── web/                   # Vite + React 19 + TypeScript + Tailwind CSS Frontend
│       ├── src/
│       │   ├── components/    # Domain-specific UI modules & modals
│       │   │   ├── Approvals/ # Review & approval governance hub
│       │   │   ├── Displays/  # Digital display fleet cards, maintenance & Wi-Fi modals
│       │   │   ├── Editor/    # Multi-layer canvas slide editor & asset picker
│       │   │   ├── Media/     # Media library, uploader & preview
│       │   │   ├── Playlists/ # Sequential playlist sequencing & duration editor
│       │   │   ├── Rollout/   # Manifest distribution telemetry & bulk assignment
│       │   │   └── Schedules/ # Broadcast scheduling & timeline conflict simulator
│       │   ├── contexts/      # AuthContext (user profile, claims, roles)
│       │   ├── lib/           # Firebase client SDK, Cloud Functions callable API wrapper, slide rasterizer
│       │   └── pages/         # Top-level views (Displays, Content, Schedules, Approvals, Users, Diagnostics)
│
├── functions/                 # Firebase Cloud Functions (v2) in TypeScript (Node 24)
│   ├── src/
│   │   ├── index.ts           # Root exports for all callable & scheduled functions
│   │   ├── publishingAdmin.ts # Publishing compiler, approvals, scheduling, media, users & departments
│   │   └── deviceGateway.ts   # Device registration, pairing, heartbeats, manifests, fleet operations
│   └── aura-dims-display-schema-0.1.0.tgz # Packaged domain schema used in cloud builds
│
├── packages/
│   └── display-schema/        # Single source of truth TypeScript domain interfaces & types
│       └── src/index.ts       # DigitalDisplay, MediaAsset, SlideDesign, Playlist, Schedule, Manifest types
│
├── player/                    # Client digital display player runtime
├── firebase/
│   └── emulators/data/        # Persistent emulator export directory (Auth, Firestore, Storage)
├── firestore.rules            # Deny-by-default Firestore security rules
├── storage.rules              # Deny-by-default Storage access rules
└── firebase.json              # Firebase service definitions & emulator ports
```

---

## 3. Authentication & Authorization (RBAC)

### 3.1. Authentication Architecture
- Authentication is handled by **Firebase Authentication** (Email & Password).
- Custom User Claims (`role`, `departmentId`, `canDirectPublish`) are stored directly on the Firebase Auth JWT token.
- When an administrator provisions or updates a user via `provisionUser` or `updateUser`, the Cloud Function updates both the Firestore `users/{uid}` document and calls `admin.auth().setCustomUserClaims(uid, claims)`.
- Client applications access the decoded token and profile via `AuthContext.tsx`.

### 3.2. Role-Based Access Control (RBAC)

| Role | Scope | Permissions & Capabilities |
| :--- | :--- | :--- |
| **System Admin (`admin`)** | Global (All Departments) | • Manage all users, departments, and roles.<br>• View, enroll, commission, and command all digital displays.<br>• Create, edit, and publish content across any department.<br>• Direct publish bypass (no approval required).<br>• Access system diagnostics and audit logs. |
| **Department Head (`department_head`)** | Department Scoped (`departmentId`) | • Full access to assets, designs, playlists, and schedules in their department.<br>• Review, approve, or reject broadcast schedules submitted by creators.<br>• Direct publish content to digital displays assigned to their department.<br>• View and manage department-assigned digital displays. |
| **Content Creator (`creator`)** | Department Scoped (`departmentId`) | • Upload media assets and create slide designs within their department.<br>• Build and sequence playlists.<br>• Create draft schedules and submit them for review.<br>• Cannot publish directly unless explicitly granted `canDirectPublish: true`. |
| **Digital Display Device (`display_device`)** | Individual Device Scoped | • Authenticates via device credentials generated during pairing (`deviceSignIn`).<br>• Fetches its active publication manifest and downloads media assets.<br>• Reports periodic operational heartbeats and execution telemetry. |

### 3.3. Privilege Boundary Enforcement
- **Backend Enforcement:** Cloud Functions use strict caller asserting helpers:
  - `assertAdminCaller(auth)`: Rejects any caller whose `role !== 'admin'`.
  - `assertDepartmentAccess(caller, targetDepartmentId)`: Verifies caller is either an `admin` or belongs to the target `departmentId`.
- **Database Enforcement (`firestore.rules`):**
  - Deny-by-default.
  - Read access to collections (`media_assets`, `designs`, `playlists`, `schedules`, `displays`) requires authentication and department matching.
  - Privileged mutations to `displays`, `publications`, and `approvals` cannot be performed via client SDK; they are handled exclusively by Admin Cloud Functions.

---

## 4. Current Content & Asset Segregation Model

### Is Project-Level Segregation Implemented?
**No.** Project-level segregation is currently not implemented in the codebase.

### How Content & Assets are Segregated Today:
All assets and content are segregated strictly by **Department (`departmentId`)**:
1. **Department Isolation:**
   - Every `MediaAsset`, `SlideDesign`, `Playlist`, `ScheduleRecord`, and `DigitalDisplay` has a required `departmentId` property.
   - A non-admin user (Department Head or Creator) only sees and interacts with content matching their assigned `departmentId`.
   - In Firestore queries, `api.listMediaAssets`, `api.listDesigns`, `api.listPlaylists`, and `api.listSchedules` pass the caller's `departmentId` to scope returned records.
2. **Display Assignment Scoping:**
   - Digital displays are assigned to a specific Department and Site.
   - When a creator creates a schedule, only digital displays assigned to their department are available for targeting.

---

## 5. Assets Management

Assets represent images, videos, and rasterized slides distributed across the digital signage network.

### 5.1. Asset Ingestion Flow
1. **Upload Initiation:**
   - The user selects a file (PNG, JPEG, WebP, MP4, WebM) in `UploadMediaModal`.
   - The web app invokes Cloud Function `initiateMediaUpload`, specifying the filename, MIME type, file size, and `departmentId`.
   - The Cloud Function validates permissions, ensures the file type is supported, generates an asset ID, and returns a signed direct-upload URL.
2. **Direct Cloud Storage Upload:**
   - The browser uploads the binary directly to Firebase Cloud Storage under `media/{departmentId}/{assetId}_{filename}`.
3. **Upload Finalization & Hashing:**
   - The client calls `finalizeMediaUpload`.
   - The Cloud Function verifies the uploaded object in Cloud Storage, extracts media dimensions/duration, computes its **SHA-256 cryptographic checksum**, and creates the `MediaAsset` record in Firestore under `media_assets/{assetId}` with status `'ready'`.

### 5.2. Supported Media Types & Orientations
- **Images:** PNG, JPEG, WebP, SVG. Automatically categorized as `landscape`, `portrait`, or `square` based on pixel aspect ratio.
- **Videos:** MP4, WebM (H.264 / AAC recommended for hardware player hardware acceleration).
- **Documents:** PDF (converted to slide pages).

### 5.3. Slide Canvas Rasterization
- When a user builds a rich multi-layer slide in the Canvas Editor, `slideRasterizer.ts` renders the design off-screen to produce a high-resolution PNG render.
- This render is uploaded as a thumbnail and serves as a static fallback image for low-power digital display hardware.

---

## 6. Slide Designs & Media Playlists

The content authoring pipeline allows users to move from standalone media to rich slides and structured playlists.

### 6.1. Visual Canvas Editor (`DesignEditorPage`)
- A drag-and-drop slide composition canvas with pixel-exact dimensions:
  - **Landscape:** 1920 × 1080 (16:9)
  - **Portrait:** 1080 × 1920 (9:16)
- **Supported Layer Types:**
  - `image`: Uploaded images from the Media Library.
  - `video`: Video clips with playback loop parameters.
  - `text`: Typography with custom fonts, colors, alignment, and formatting.
  - `shape`: Rectangles, circles, dividers, cards.
  - `widget`: Dynamic widgets (digital clock, date, weather, QR codes).
- Designs are saved in the `designs` collection as structured JSON layers.

### 6.2. Playlist Construction (`PlaylistBuilderModal`)
- An ordered collection of items sequenced for continuous playback:
  - Can mix **Canvas Slide Designs** and **Raw Media Assets**.
  - Explicit per-item duration (e.g. 10 seconds for a static slide, full video duration for clips).
  - Configurable slide transitions (fade, slide, cut).
- **Immutable Revision Generation:**
  - When a playlist is saved, an immutable playlist revision document is created in Firestore (`playlist_revisions/{revId}`).
  - Schedules reference the revision ID rather than the mutable playlist draft, ensuring that future edits to a playlist do not unexpectedly alter an active broadcast.

---

## 7. Broadcast Scheduling & Approval Governance

### 7.1. Broadcast Schedules
A schedule defines the rules for presenting a playlist revision on targeted digital displays:
- **Temporal Parameters (Calibrated to `Asia/Kolkata`):**
  - Start Date & End Date (e.g. `2026-11-23` to `2026-12-23`).
  - Daily Active Window (e.g. `08:00 AM` to `06:00 PM`).
  - Recurrence Pattern: Weekly Recurring (specific days: Mon–Fri) or One-Time Window.
  - Overnight schedule support (e.g., 20:00 to 06:00 next day).
  - Broadcast Priority (1 = Normal Background, 5 = Standard Scheduled, 9–10 = High Priority / Emergency Takeover).
- **Spatial Parameters:** List of targeted `targetDisplayIds`. Must match the playlist's orientation (Landscape vs Portrait).
- **Collision Detection:** The web UI runs real-time conflict preflights (`api.evaluateSchedulePreview`) to alert operators if another schedule with equal or higher priority overlaps the same digital displays during the same time window.

### 7.2. Two-Tier Approval Pipeline
1. **Submission:**
   - Content Creators create schedules in `'draft'` status.
   - Clicking **"Submit for Review"** invokes Cloud Function `submitForApproval`, setting status to `'pending_review'` and creating an `approvals` record.
2. **Review & Decision:**
   - In the **Approvals & Governance** page (`/approvals`), Department Heads and Admins inspect pending requests, view playlist previews, and inspect conflict reports.
   - Decision choices:
     - **Approve:** Invokes `reviewApproval(decision: 'approved')`. The schedule transitions to `'approved'`.
     - **Reject:** Invokes `reviewApproval(decision: 'rejected', comments: '...')`. The schedule returns to `'rejected'`.
3. **Direct Publishing Bypass:**
   - Administrators and users with `canDirectPublish: true` can bypass review and publish directly from draft or approved states.

---

## 8. Publication Compilation & Hardware Delivery

### 8.1. Publication Manifest Compilation
When an approved schedule is published via **"Publish Package"** (`preparePublication`):
1. The Cloud Function fetches the schedule and its immutable playlist revision.
2. It resolves all media assets and slide designs referenced in the playlist.
3. It packages the metadata, schedule rules, and assets into an immutable `PublicationManifest` JSON document:
   ```json
   {
     "manifestVersion": "1.0",
     "publicationId": "pub_abc123",
     "scheduleId": "sched_456",
     "orientation": "landscape",
     "timezone": "Asia/Kolkata",
     "scheduleRule": {
       "startDate": "2026-11-23",
       "endDate": "2026-12-23",
       "startTime": "08:00",
       "endTime": "18:00",
       "daysOfWeek": [1, 2, 3, 4, 5],
       "priority": 5
     },
     "assets": [
       {
         "assetId": "media_001",
         "url": "https://storage.googleapis.com/.../promo.mp4",
         "sha256": "3a7bd3e2360a3d29eea436cdfb27d37feeacab603545",
         "fileSizeBytes": 12450892
       }
     ],
     "playlist": {
       "items": [
         { "type": "video", "assetId": "media_001", "durationSeconds": 15 }
       ]
     }
   }
   ```
4. The manifest is written to Cloud Storage at `publications/{pubId}/manifest.json`.
5. A Firestore `publications/{pubId}` record is created with status `'prepared'`.
6. The Cloud Function atomically updates all targeted `displays/{displayId}` documents:
   - `desiredPublicationId = pubId`
   - `publishedScheduleId = schedule.id`
   - `publishedScheduleTitle = schedule.title`
   - `publishedScheduleWindow = "08:00 - 18:00"`

### 8.2. Showing Content on Hardware (Store-and-Forward Playback)
1. **Device Manifest Discovery:**
   - Physical digital display hardware (Raspberry Pi, Linux player, Android device) listens to its `displays/{displayId}` Firestore document or queries `getDevicePublicationManifest`.
2. **Download & Cache Phase:**
   - Upon seeing a new `desiredPublicationId`, the device downloads `manifest.json`.
   - The device checks its local on-disk storage (`/var/aura/cache/assets/`).
   - For every asset in `manifest.assets`:
     - If the file is not on disk, it downloads it from `asset.url`.
     - It computes the local file's SHA-256 hash.
     - If the hash matches `asset.sha256`, the file is marked verified.
3. **Atomic Cutover:**
   - Only when **100% of assets are downloaded and verified**, the player atomically cuts over playback to the new playlist.
   - If a download fails or an asset is corrupted, the player keeps running its current content and reports an error via `reportDeviceDelivery(status: 'failed')`.
4. **Autonomous Offline Playback:**
   - The player evaluates current time against `manifest.scheduleRule` using its local hardware clock in `Asia/Kolkata`.
   - It transitions slides locally using hardware acceleration.
   - If the network goes down, the display continues cycling through the schedule uninterrupted.
5. **Corporate Neutral Fallback:**
   - If a schedule's date window ends, or no publication is assigned, the player displays a locally bundled **Corporate Neutral Fallback** loop (never a black screen or desktop error).

---

## 9. Digital Display Fleet Management

The **Digital Displays** page (`/displays`) provides real-time fleet administration:

### 9.1. Digital Display Onboarding & Commissioning
1. **Pairing Mode:** A newly installed player boots up in pairing mode, showing a 6-character short code and QR code on the physical digital display.
2. **Claiming:** An administrator in the web UI clicks **"Pair Digital Display"**, enters the short code, selects the Site, Department, and physical Orientation (`Landscape` or `Portrait`).
3. **Commissioning Checklist:**
   - The dashboard provides a step-by-step checklist (`getCommissioningChecklist`, `updateCommissioningCheck`, `finalizeCommissioning`):
     - Wi-Fi/Ethernet connectivity test.
     - Physical orientation alignment check.
     - Test slide render verification.
     - Ambient sensor check.
   - Once all checks pass, the status changes from `'commissioning'` to `'active'`.

### 9.2. Telemetry & Heartbeat Monitoring
Physical digital displays report health status every 60 seconds via `reportDeviceHeartbeat`:
- **Online / Offline Status:** Digital displays reporting within 5 minutes are green (`online`); otherwise amber/red (`offline`).
- **Hardware Telemetry:** CPU temperature, CPU load, and free disk storage (e.g. `48.1 GB free / 58.8 GB`).
- **Active Presentation State:** Current publication ID, currently playing slide, and playback status (`Active Presentation`, `Idle / Standby`).
- **Rollout Progress Modal (`PublicationRolloutModal`):**
  - Allows operators to monitor a publication's deployment across the fleet.
  - Shows which digital displays have received the manifest, finished downloading, and reached active playback.
  - Provides a **Retry Target** button to re-trigger distribution for any display that had network drops.

### 9.3. Remote Device Maintenance & Operations
Administrators can issue remote commands to digital displays via `requestDisplayOperation`:
- **Remote Screenshot Preview:** Digital display captures its active framebuffer, uploads it to Cloud Storage (`uploadDevicePreview`), and displays it in the dashboard.
- **Wi-Fi Credential Provisioning:** Remote update of SSID and security keys.
- **Reboot / Reload Runtime:** Triggers a clean hardware reboot or Chromium runtime restart.
- **Maintenance Mode:** Temporarily pauses scheduled broadcasts to run diagnostics.
- **Bulk Import & Assignment:** CSV-based bulk digital display provisioning and bulk department re-assignment modals.
