# Aura DIMS - System Architecture Specification

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**System Purpose:** Enterprise Digital Signage and Content Management Platform  

---

## 1. Monorepo Architecture & Service Boundaries

Aura DIMS adopts a modular monorepo layout managed by `pnpm workspaces`. This isolates dependencies, establishes clear interface contracts, and prevents leaking backend privileges into client bundles.

```
aura-dims/
├── apps/
│   └── web/                   # Frontend Web Application (React + Vite + Tailwind)
├── functions/                 # Backend Compute & Privileged APIs (Cloud Functions v2)
├── packages/
│   └── display-schema/        # Shared Domain Schemas, Manifest Types & Interfaces
├── player/                    # Signage Player Client Runtime (Documented Placeholder)
├── firebase/
│   └── emulators/data/        # Persistent Local Emulator State
├── docs/                      # Technical Documentation & Service Architecture
└── tests/
    ├── rules/                 # Security Rules Unit Tests
    └── e2e/                   # Playwright Browser Smoke Suite
```

### Boundary Definitions

1. **`apps/web/` (Client Layer):**
   - Implements the administrative portal, visual creator studio, and scheduling consoles.
   - Connects directly to Firebase via the modular Web SDK.
   - **Allowed Client Actions:** Read-only access to published public assets and authorized departmental draft edits.
   - **Forbidden Client Actions:** Direct role self-assignment, direct approval of publications, direct issuance of device credentials, and direct writes to system audit logs.

2. **`functions/` (Backend Privileged Layer):**
   - Cloud Functions for Firebase (v2) implemented in TypeScript and deployed to the `asia-south1` (Mumbai) region.
   - Operates with elevated Firebase Admin SDK privileges.
   - **Mandatory Policy:** Because the Admin SDK completely bypasses Firestore and Storage Security Rules, all Cloud Functions must implement explicit, granular caller identity and role checks before executing mutations.

3. **`packages/display-schema/` (Contract Layer):**
   - Shared TypeScript types, Zod/domain schemas, manifest definitions, and language enumerations (`en`, `gu`, `hi`).
   - Ensures type parity between the administrative frontend, cloud functions, and digital display players.

4. **`player/` (Edge Display Runtime):**
   - Autonomous digital display client runtime (Android kiosk, Web PWA, or Electron).
   - Operates on a pull-and-verify model without direct dependency on cloud backend uptime for slide sequencing.

---

## 2. Privilege Separation & Authorization Model

```mermaid
flowchart TD
    subgraph Client["Web Client (apps/web)"]
        User["User / Department Head"]
    end

    subgraph SecurityPerimeter["Firebase Security Rules Perimeter"]
        FirestoreRules["Cloud Firestore Rules\n(Deny-By-Default)"]
        StorageRules["Cloud Storage Rules\n(Deny-By-Default)"]
    end

    subgraph BackendPrivileged["Privileged Compute (functions/)"]
        AuthFn["Cloud Functions (Admin SDK)\nExplicit Role & Identity Checks"]
    end

    subgraph StorageEngine["Firebase Managed Services"]
        FirestoreDB[("Firestore DB\n(Drafts, Manifests, Displays)")]
        StorageBucket[("Storage Bucket\n(Images & Videos)")]
        AuthService["Firebase Authentication\n(Custom Claims)"]
    end

    User -->|Direct Modular SDK Read/Draft| FirestoreRules
    User -->|Direct Media Download/Draft| StorageRules
    FirestoreRules -.->|Denied By Default| FirestoreDB
    StorageRules -.->|Denied By Default| StorageBucket

    User -->|Privileged Invocation: Assign/Approve/Enroll| AuthFn
    AuthFn -->|Verify Token & Custom Claims| AuthService
    AuthFn -->|Validated Administrative Mutation| FirestoreDB
    AuthFn -->|Validated Signed URL Issuance| StorageBucket
```

### 2.1 Core Authorization Principles
1. **Deny by Default:** Cloud Firestore and Cloud Storage start with a total deny posture (`allow read, write: if false;`).
2. **No Role Self-Assignment:** Users can never alter their own roles or custom claims.
3. **No Sole Email Domain Checks:** Authorization is strictly backed by cryptographically signed Firebase Custom Claims issued by backend Cloud Functions.
4. **No Default Known Administrator:** System administrators are provisioned explicitly through authenticated administrative initialization routines rather than pre-seeded hardcoded accounts.
5. **UI Visibility Is Not Security:** Hiding buttons or routes in the web application never substitutes for backend authorization.

### 2.2 Future Role Hierarchy
- **System Administrator:** Unrestricted management of all sites (Ahmedabad, Vadodara, Surat, Rajkot), all departments, user provisioning, and emergency network broadcast overrides.
- **Department Head:** Restricted scope managing content and playlists belonging strictly to their assigned department (e.g. HR, Operations, Safety).
- **Explicit Digital Display Assignments:** A Department Head can only schedule and publish content to digital displays that have been explicitly assigned to them by an Administrator.
- **Digital Display Device Identity:** Digital display players authenticate using separate, distinct device credentials (device tokens/mTLS) rather than human user credentials.

### 2.3 Secure Departmental Media Ingestion & Validation Pipeline

The Media Library enforces a three-stage upload and validation pattern that ensures zero unchecked binaries enter production storage or display manifest publications:

```mermaid
sequenceDiagram
    autonumber
    actor User as Department Head / Admin
    participant Client as Web App (apps/web)
    participant CF as Cloud Functions (functions/)
    participant FS as Cloud Firestore
    participant Storage as Cloud Storage

    User->>Client: Selects file & enters metadata
    Client->>Client: Client-side validation (MIME, size bounds)
    Client->>CF: initiateMediaUpload(fileFacts, metadata)
    CF->>CF: Verify caller role & departmental scope
    CF->>FS: Create /assets/{assetId} [status: awaiting_upload]
    CF-->>Client: Return { assetId, stagingPath }

    Client->>Storage: uploadBytesResumable(stagingPath, file)
    User-->>Client: (Optional: cancel upload task)
    Client->>CF: finalizeMediaUpload(assetId)

    CF->>FS: Update status -> validating
    CF->>Storage: Download staging file to isolated /tmp
    CF->>CF: Inspect magic bytes & metadata (sharp / ffprobe)
    CF->>CF: Enforce bounds (dimensions, duration, codecs)
    CF->>CF: Calculate SHA-256 integrity checksum
    CF->>CF: Generate WebP poster / thumbnail (sharp / ffmpeg)
    CF->>Storage: Promote file to media/{dept}/{assetId}/{fileName}
    CF->>Storage: Upload thumbnail to thumbnails/{dept}/{assetId}/thumb.webp
    CF->>Storage: Delete temporary staging file
    CF->>FS: Update /assets/{assetId} [status: ready, checksum, specs]
    CF-->>Client: Return finalized MediaAsset record
```

#### Media Constraints & Governance Standards
- **Supported Formats:**
  - **Images:** JPEG, PNG (MIME types `image/jpeg`, `image/png`). Max file size: 20 MB. Max image resolution: 40 Megapixels.
  - **Videos:** MP4 with H.264 video codec and optional AAC audio. Max file size: 200 MB. Max duration: 600s (10 min). Max resolution: 1920×1080 (landscape) or 1080×1920 (portrait).
- **Private Preview Model:**
  - No public download tokens are persisted in Firestore.
  - Previews use short-lived authenticated URLs generated on-demand via `getMediaPreviewUrl` (v4 signed URLs in production; direct emulator endpoints in local mode).
- **Offline Integrity:**
  - SHA-256 checksums are calculated server-side during finalization and stored with the asset for atomic display player verification.
- **Staging Lifecycle & Cleanup:**
  - Upload intents expire after 2 hours. Abandoned staging files and unfinalized intents can be cleaned up via `cleanupExpiredUploads` (supports `dryRun` audit mode).

### 2.4 Visual Content Creator & Reusable Templates Architecture

The Visual Content Creator delivers an enterprise signage authoring studio that guarantees visual fidelity across arbitrary display aspect ratios, prevents accidental loss of unpublished work, and provides seamless typography across supported Indian languages.

```mermaid
flowchart LR
    subgraph ClientEditor["Web Client Studio (apps/web)"]
        CanvasEngine["Logical Canvas Engine\n(1920×1080 / 1080×1920)\nDOM Renderer + Transform Scale"]
        AutosaveMgr["Debounced Autosave Manager\n(2.5s window + Revision Track)"]
        RecoveryCache[("Browser Recovery Cache\nlocalStorage: aura_dims_draft_*")]
    end

    subgraph FontStack["Bundled Font System"]
        InterFont["Inter (English)"]
        GujaratiFont["Noto Sans Gujarati"]
        DevanagariFont["Noto Sans Devanagari (Hindi)"]
    end

    subgraph Backend["Cloud Functions (asia-south1)"]
        UpdateDesignFn["updateDesign(designId, document, revision)"]
        ConflictDetection{"Revision Check:\nExpected == Stored?"}
        IncrementRevision["Monotonic Revision++\nPersist to Firestore"]
        ConflictError["Error: CONFLICT\n(Return Latest Record)"]
    end

    CanvasEngine --- FontStack
    CanvasEngine -->|State Change| AutosaveMgr
    AutosaveMgr -->|Local Backup| RecoveryCache
    AutosaveMgr -->|Save Mutation| UpdateDesignFn
    UpdateDesignFn --> ConflictDetection
    ConflictDetection -->|Yes| IncrementRevision
    ConflictDetection -->|No (Stale)| ConflictError
```

#### 1. DOM-Based Scaled Canvas Rendering
- **Why DOM over Canvas 2D/WebGL:** Indian languages (Devanagari for Hindi and Gujarati) require sophisticated OpenType HarfBuzz shaping, complex conjuncts, and vowel mark (matra) positioning. Native browser DOM typography engines render these flawlessly without font rasterization glitches or IME input breakage.
- **Fixed Logical Coordinate System:** All elements are stored in fixed logical coordinate space: 1920×1080 (Landscape) or 1080×1920 (Portrait).
- **Scale Factor & Safe Zones:** Canvas viewports calculate a uniform scaling factor `scale = Math.min(availW / canvasW, availH / canvasH)`. A 5% safe-margin guide overlay indicates the inner 90% boundary to safeguard content against hardware television overscan and physical bezel cropping on digital displays.

#### 2. Self-Hosted Font Bundling
- Typography packages `@fontsource/inter`, `@fontsource/noto-sans-gujarati`, and `@fontsource/noto-sans-devanagari` are bundled locally into the web application.
- Digital displays operating in isolated offline enterprise intranet environments render English, Gujarati, and Hindi slides with zero external CDN dependencies.

#### 3. Concurrency Protection & Local Crash Recovery
- **Optimistic Concurrency Control:** Every design document maintains an integer `revision`. Each `updateDesign` call passes the expected revision. If another user or tab updated the design in the interim, the backend returns a `CONFLICT` error with the current server record. The editor presents a side-by-side conflict dialog allowing the author to *Reload Server Version* or *Save as a New Copy*.
- **Local Storage Draft Recovery:** When unsaved edits occur, the serialized state is mirrored to `localStorage` under `aura_dims_draft_${userId}_${designId}`. If the browser tab crashes or network disconnects, the user is offered an instant restoration on next session.

#### 4. Media Asset Immutability in Designs
- Slide elements referencing images or videos store immutable `assetId` references pointing to verified Ready assets in `/assets/{assetId}`.
- Binaries are never duplicated inside the design JSON document, keeping document payloads compact and cache-friendly. Temporary preview URLs are resolved dynamically via batch queries.

### 2.5 Playlists, Approvals, Scheduling & Publication Architecture

The publication subsystem bridges creative studio drafts to physical digital displays through structured review, deterministic scheduling in `Asia/Kolkata`, collision detection, and cryptographic publication packaging.

```mermaid
flowchart TD
    subgraph Authoring["Studio & Playlists"]
        DraftDesign["Editable Draft Design\n(/designs/{id})"]
        DesignRev["Immutable Design Revision\n(/designRevisions/{id})\n• Ready Assets • SHA-256\n• Required Fonts • Content Hash"]
        DraftPlaylist["Ordered Playlist Draft\n(/playlists/{id})\n• Single Orientation\n• Preserved Dwell Times"]
        PlaylistRev["Immutable Playlist Revision\n(/playlistRevisions/{id})\n• Constituent Design Revisions\n• Deduped Asset Manifest"]
    end

    subgraph Governance["Governance & Scheduling"]
        ScheduleRule["Schedule Rule (Asia/Kolkata)\n• One-time / Recurring Mon-Sun\n• Daytime / Overnight Windows\n• Priority 1-10 (10=Emergency)"]
        TargetDisplays["Target Digital Displays\n• Orientation Match\n• Explicit Department Assignment"]
        ConflictPreflight{"Conflict Preflight\nEvaluator:\nEqual Priority Collision?"}
        ApprovalSubmission["Editorial Approval Request\n(/approvals/{id})\nStatus: pending_review"]
        ApprovalReview{"Admin Review\nor Delegated Direct Publish"}
    end

    subgraph Packaging["Publication Compilation"]
        PrepareFn["Cloud Function: preparePublication\n(Idempotent Compiler)"]
        StorageManifest["Cloud Storage Manifest\npackages/{displayId}/{pubId}/manifest.json\n• SHA-256 Checksums • Asset URLs\n• Bundled Neutral Fallback Slide"]
        FirestorePub["/publications/{pubId}\nstatus: prepared"]
        UpdateTargetDisplays["Atomically Update Displays:\ndesiredPublicationId = pubId"]
    end

    DraftDesign -->|Freeze on Submit| DesignRev
    DesignRev --> DraftPlaylist
    DraftPlaylist --> PlaylistRev
    PlaylistRev --> ScheduleRule
    TargetDisplays --> ScheduleRule
    ScheduleRule --> ConflictPreflight
    ConflictPreflight -->|Pass| ApprovalSubmission
    ApprovalSubmission --> ApprovalReview
    ApprovalReview -->|Approved| PrepareFn
    PrepareFn --> StorageManifest
    PrepareFn --> FirestorePub
    FirestorePub --> UpdateTargetDisplays
```

#### 1. Immutable Design & Playlist Revisions
- Publications are **never** resolved directly against mutable drafts.
- On approval submission or publication preparation, designs and playlists are frozen into immutable records (`/designRevisions` and `/playlistRevisions`).
- A revision captures exact Ready asset references, cryptographic SHA-256 checksums, storage generations, required font families, slide sequences, and a deterministic SHA-256 content hash.
- Subsequent edits to drafts create new revision counters without modifying previously submitted or approved publications.

#### 2. Single-Orientation Compatibility Enforcement
- Each playlist enforces strictly one orientation (`landscape` 1920×1080 or `portrait` 1080×1920).
- Mixed-orientation playlists are rejected at both frontend studio and backend API boundaries.
- Schedules reject any target digital display whose hardware orientation does not match the playlist orientation.

#### 3. Asia/Kolkata Deterministic Timezone Math
- All calendar windows, daily recurring schedules, and simulation times evaluate strictly in Indian Standard Time (`Asia/Kolkata`, UTC+05:30).
- Evaluation logic uses deterministic UTC+05:30 arithmetic (`time + 330 mins`) evaluated with pure UTC component getters (`getUTCFullYear()`, `getUTCHours()`, etc.), guaranteeing 100% identical evaluation on browser clients, Cloud Functions servers, and edge signage runtimes regardless of host operating system timezone or daylight savings settings.

#### 4. Overnight Recurrence Window Evaluation
- Aura DIMS natively supports shifts and broadcast windows that span midnight (e.g. `22:00` to `06:00` next morning).
- When `startTime > endTime`, the schedule rule marks `isOvernight = true`.
- During evaluation:
  - If current time is `>= startTime`, the rule is active if current day of week is scheduled.
  - If current time is `< endTime`, the rule is active if *yesterday's* day of week was scheduled.

#### 5. Deterministic Conflict Resolution Algorithm
- Multiple schedules may target the same digital display simultaneously.
- Schedulers evaluate candidate rules using standard ranking:
  1. Priority level (1 to 10; higher priority preempts lower priority).
  2. For equal priority, one-time scheduled events preempt recurring routines.
  3. For identical priority and recurrence, more specific date windows take precedence.
  4. If two distinct schedules share equal priority and collide on any target digital display, the conflict evaluator flags a **Collision Block** and safely falls back to corporate neutral content rather than vibrating or interleaving unpredictably.
- **Admin Emergency Override (Priority 10):** Reserved exclusively for System Administrators with mandatory expiration timestamps. Priority 10 rules preempt all standard departmental broadcasts immediately.

#### 6. Approval Policy & Delegated Direct Publishing
- System Administrators can publish directly across all departments without review.
- Department Heads require Administrator editorial approval by default (`status: 'pending_review'`).
- Administrators can selectively delegate `canDirectPublish: true` to trusted Department Heads, enabling autonomous publishing within their departmental boundary.
- Any change to schedule window, priority, playlist revision, or target digital displays invalidates previous approvals and resets status to `draft` or `awaiting_approval`.

#### 7. Honest Operational Statuses
- Aura DIMS maintains absolute operational transparency:
  - Valid statuses: `Draft`, `Awaiting approval`, `Approved`, `Preparing`, `Prepared`, `Preparation failed`, `Withdrawn`, `Superseded`.
  - Zero fabricated operational statuses: The system never claims `Delivered` or `Playing` until physical digital display player acknowledgements are received in Milestone 6.

---

## 3. Autonomous Offline Signage Player Architecture

Digital displays deployed in factory floors, lobbies, and industrial sites frequently experience severed or intermittent network connectivity.

> [!IMPORTANT]
> **Firestore offline persistence alone is NOT a complete digital signage solution.**
> Cache eviction, incomplete collection reads, and dependency on live server clocks cause signage screens to fail or display black screens during outages. Aura DIMS implements an autonomous pull-and-verify dual-process architecture.

```mermaid
flowchart TB
    subgraph Cloud["Firebase Cloud & Functions (asia-south1)"]
        FleetAdmin["Fleet Admin Functions\n(getDevicePublication, reportDeviceDelivery)"]
        PubStorage["Cloud Storage\n(Detailed Manifest & Asset Binaries)"]
    end

    subgraph PhysicalDisplay["Physical Digital Display Device (Linux ARM64 / Dev Kiosk)"]
        subgraph AgentProcess["Player Agent Process (TypeScript Daemon)"]
            Supervisor["Supervision & Timers\n(Sync Loop: 60s, Heartbeat: 30s)"]
            SyncEngine["Sync Engine & State Machine\n(discovered -> downloading -> verifying -> ready -> active)"]
            CacheMgr["Content-Addressable Cache\n(SHA-256 Verified Binaries)"]
            LocalServer["Loopback HTTP Service\n(http://127.0.0.1:8090)"]
            CredStore["Credentials Store\n(0600 device-credentials.json)"]
        end

        subgraph KioskProcess["Fullscreen Kiosk Browser (Chromium / Webview)"]
            LoopbackFetch["Fetch Local Loopback Manifest\n(Zero Firebase SDK / Pure Offline)"]
            SchedEval["Local Schedule Evaluator\n(Asia/Kolkata Hardware Clock)"]
            DOMRenderer["Aura DIMS Logical Renderer\n(1920x1080 / 1080x1920 DOM Canvas)"]
            EventPoster["Local Event Dispatcher\n(POST /api/playback-event)"]
        end
    end

    FleetAdmin -->|Poll Publication Metadata| Supervisor
    PubStorage -->|Download Assets & Manifest| SyncEngine
    Supervisor --> SyncEngine
    SyncEngine --> CacheMgr
    CacheMgr --> LocalServer
    CredStore --> Supervisor

    LocalServer -->|Loopback HTTP 8090| LoopbackFetch
    LoopbackFetch --> SchedEval
    SchedEval --> DOMRenderer
    DOMRenderer --> EventPoster
    EventPoster --> LocalServer
    LocalServer -->|Report Delivery & Presentation State| FleetAdmin
```

### 3.1 Architectural Pillars of Offline Playback

1. **Two-Component Process Separation:**
   - **Local Agent Daemon (`node player/dist/agent/index.js`):** Runs as a background service (`auradims-agent.service`). Responsible for device enrollment, credentials management, polling cloud manifest updates, staging and SHA-256 verifying asset binaries, atomic package activation, rolling log management, and serving loopback assets.
   - **Fullscreen Browser Renderer (`http://127.0.0.1:8090`):** Runs in kiosk mode (`auradims-kiosk.service`). Pure HTML5/DOM renderer reusing `@aura-dims/display-schema` slide definitions. Contains **zero Firebase SDK credentials or network dependencies**, rendering entirely from local loopback.

2. **Zero-Trust Network Perimeter & Local Loopback Security:**
   - The player HTTP server binds exclusively to `127.0.0.1:8090`.
   - Host and Origin header validation blocks non-loopback requests with `403 Forbidden` to defend against DNS rebinding or cross-site request attacks.
   - Content Security Policy (CSP) restricts `script-src` and `connect-src` exclusively to `'self' http://127.0.0.1:8090`.
   - Path traversal defenses reject malicious asset IDs attempting directory escapes.

3. **Staged Synchronization State Machine:**
   - Package synchronization transitions through strict discrete stages:
     `discovered` ➔ `downloading` ➔ `verifying` ➔ `ready` ➔ `active` (or `failed`).
   - All newly downloaded media files are placed in an isolated staging folder (`staging/{publicationId}`).
   - SHA-256 checksums are verified against the manifest before files are committed to the content-addressable cache (`player/data/cache/{sha256}`).
   - Pointer switch is atomic (`active.json` pointer), while preserving the `previous.json` package for emergency rollback.

4. **Local Hardware Clock Execution in `Asia/Kolkata`:**
   - Evaluates schedule rules locally against the hardware clock set to Indian Standard Time (UTC+05:30).
   - Dayparting, one-time windows, daily recurrences, and overnight broadcasting run autonomously without server roundtrips.
   - Transitions to neutral corporate fallback if all schedules expire or if a package fails verification.

5. **First-Run Device Pairing & Credentials Isolation:**
   - Displays boot into an enrollment screen displaying a 6-character CSPRNG pairing code input.
   - Upon pairing redemption, the device receives a signed custom auth token and writes device credentials to `player/data/credentials/device-credentials.json` with `0600` permissions.
   - Credentials persist across power cycles and restarts.

6. **Storage Management & Bounded Rolling Logs:**
   - Unreferenced cache files are pruned via safe garbage collection.
   - Agent execution logs are bounded with 5 MB rotation across 3 backup archives (`player.log`, `player.log.1`, `player.log.2`).
   - Linux systemd units and logrotate profiles (`auradims-logrotate.conf`) ensure long-term operational health on factory displays.

---

## 4. Multi-Project Firebase Strategy

Aura DIMS isolates development, testing, and production across distinct Firebase project configurations:

| Environment | Firebase Project ID | Purpose & Access Boundary |
| :--- | :--- | :--- |
| **Local Development** | `demo-aura-dims` | Offline Firebase Emulator Suite. Zero cloud credentials or billing required. |
| **Staging** | `aura-dims-staging` | Pre-production testing environment with simulated digital display devices. |
| **Production** | `aura-dims-prod` | Live multi-site signage deployment in `asia-south1` (Mumbai). |

---

## 5. Legacy Django / PostgreSQL Scaffold Retirement Proposal

During workspace auditing, no active Django or PostgreSQL code files were found in `aura-dims`. If an earlier scaffold is discovered in adjacent directories or backups, the following retirement plan will be executed without data loss:

1. **Preserve Repository Integrity:** Archive the entire Django codebase into an immutable branch (`archive/legacy-django-backend`) or dedicated read-only repository.
2. **Schema Extraction:** Execute `pg_dump --schema-only` into `docs/legacy-reference/schema.sql` to verify table definitions against the Firestore data model.
3. **Data Mapping & Verification:** Verify that all entity relationships (users, displays, schedules) map cleanly to Firestore collections.
4. **Deprecate Without Deletion:** Mark legacy endpoints as deprecated and safely power down legacy database containers after Aura DIMS reaches operational parity.

