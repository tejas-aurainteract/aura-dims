# Aura DIMS — Complete System Overview, Architecture & Asset Flow Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura DIMS (Aura Digital Information Management System)  
**System Purpose:** Enterprise Digital Signage & Content Management Platform  
**Target Environment:** Cloud-orchestrated CMS distributing deterministic playback manifests to autonomous, store-and-forward physical digital displays.

---

## 1. Executive Summary & Core Philosophy

**Aura DIMS** is an enterprise-grade digital signage management platform. It enables organizations to create, organize, schedule, approve, and distribute multimedia content to fleets of remote physical digital displays across distributed corporate sites, transit hubs, retail locations, and campuses.

### Foundational Principles:
1. **Terminology Requirement:** Always use the term **"digital display"** in all user-facing copy, logs, documentation, code comments, and UI components. Never use bare words like "screen", "monitor", or "TV".
2. **Autonomous Offline Playback:** Physical digital display hardware players (e.g., Raspberry Pi, Android, Linux devices) **never depend on live internet pings or Cloud Functions to transition slides**. They operate autonomously using local hardware clocks calibrated to `Asia/Kolkata`.
3. **Atomic Store-and-Forward:** A digital display will never play an incomplete or partially downloaded playlist. All media assets are verified via SHA-256 checksums before a new publication manifest is activated.
4. **Privileged Backend Boundary:** Frontend client web SDKs perform only authorized draft mutations. All sensitive and privileged operations (role provisioning, digital display enrollment, editorial approval, publication manifest compilation, rollbacks) are strictly executed via Firebase Cloud Functions (v2) using the Firebase Admin SDK.
5. **Strict Local Emulator Support:** Local development runs against the Firebase Emulator Suite using project ID `demo-aura-dims`. Production deploys to Firebase Project `aura-dims` with frontend hosting mirrored on Vercel.

---

## 2. Monorepo Structure

```
aura-dims/
├── apps/
│   └── web/                   # Vite + React 19 + TypeScript + Tailwind CSS UI
│       ├── src/
│       │   ├── components/    # Reusable UI widgets & business feature modals
│       │   │   ├── Approvals/ # Review & governance workflows
│       │   │   ├── Displays/  # Digital display fleet monitoring & commissioning
│       │   │   ├── Editor/    # Visual multi-layer slide canvas editor
│       │   │   ├── Media/     # Media library, uploader, format converter
│       │   │   ├── Playlists/ # Sequential playlist constructor & durations
│       │   │   ├── Rollout/   # Real-time manifest distribution telemetry
│       │   │   └── Schedules/ # Calendar rule builder & timeline collision simulator
│       │   ├── contexts/      # AuthContext, ProjectContext
│       │   ├── lib/           # Firebase client SDK, Cloud Function API client, rasterizer
│       │   └── pages/         # Top-level route pages (Displays, Content, Schedules, etc.)
│
├── functions/                 # Firebase Cloud Functions (v2) in TypeScript (Node 24)
│   ├── src/
│   │   ├── index.ts           # Root exports for all callable & trigger functions
│   │   ├── publishingAdmin.ts # Publishing compiler, scheduling, approval & user management
│   │   └── deviceGateway.ts   # Device registration, heartbeat, store-and-forward manifests
│   └── aura-dims-display-schema-0.1.0.tgz # Packaged shared schema for cloud builds
│
├── packages/
│   └── display-schema/        # Single Source of Truth TypeScript interfaces & domain schemas
│       └── src/index.ts       # DigitalDisplay, MediaAsset, SlideDesign, Playlist, Schedule, Manifest
│
├── player/                    # Client digital display player runtime (Electron / Chromium / Linux)
├── firebase/
│   └── emulators/data/        # Persistent emulator export directory (Auth, Firestore, Storage)
├── docs/                      # Technical specs, architecture runbooks, hardware guides
├── firestore.rules            # Deny-by-default Firestore access control rules
├── storage.rules              # Secure Storage access control rules
└── firebase.json              # Firebase service definitions & emulator ports
```

---

## 3. End-to-End System Workflow

The lifecycle of content moving from a creator's desktop to a physical digital display follows a deterministic 6-stage pipeline:

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Stage 1   │ ───► │   Stage 2    │ ───► │   Stage 3    │
│ Media Asset │      │ Slide Design │      │   Playlist   │
│ Ingestion   │      │ Composition  │      │ Sequencing   │
└─────────────┘      └──────────────┘      └──────────────┘
                                                  │
                                                  ▼
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Stage 6   │ ◄─── │   Stage 5    │ ◄─── │   Stage 4    │
│  Hardware   │      │ Publication  │      │  Scheduling  │
│  Playback   │      │ Compilation  │      │ & Governance │
└─────────────┘      └──────────────┘      └──────────────┘
```

### Stage 1: Media Asset Ingestion
- Users upload images (PNG, JPEG, WebP) or videos (MP4, WebM) through `UploadMediaModal`.
- Files are hashed (SHA-256) and uploaded to Firebase Storage under `tenants/{dept}/media/{assetId}`.
- Metadata (dimensions, duration, file size, MIME type, orientation) is recorded in Firestore `media_assets`.

### Stage 2: Slide Design Composition (Canvas Editor)
- Users create multi-layered visual slides using the built-in Canvas Editor (`DesignEditorPage`).
- Supported layers: Images, Videos, Shapes, Rich Typography, QR codes, Clock/Weather widgets.
- Each slide design targets a strict physical orientation: `Landscape (1920x1080)` or `Portrait (1080x1920)`.
- When saved, the slide structure is stored as JSON in Firestore `designs`, and the client rasterizer renders high-resolution static PNG previews.

### Stage 3: Playlist Sequencing
- Creators assemble multiple slides and raw media assets into sequential or timed loops in `PlaylistBuilderModal`.
- Each item is assigned an explicit duration (e.g. 10s for static slides, full duration for video clips).
- The playlist has an immutable revision ID (`playlistRevisionId`) created upon finalization to ensure historical fidelity.

### Stage 4: Scheduling & Editorial Governance
- **Broadcast Schedules:** Define *When* and *Where* a playlist plays:
  - **Temporal Rule:** Start Date, End Date, Time Window (e.g., `08:00 - 18:00 Asia/Kolkata`), Recurrence Days (e.g., Mon–Fri), and Broadcast Priority (1 to 10).
  - **Spatial Rule:** Targeted fleet of digital displays.
  - **Collision Engine:** Preflights schedules to detect overlapping priority conflicts on the same digital display.
- **Approval Pipeline (Two-Tier Governance):**
  - Standard Content Creators cannot publish directly. Their schedules enter the `pending_review` state.
  - Department Heads or Admins review the submission in the **Approvals & Governance** hub to `approve` or `reject` with notes.
  - Admins and approved users with `canDirectPublish: true` can bypass review and trigger publication directly.

### Stage 5: Publication Manifest Compilation
- When a schedule is triggered for publication, Cloud Function `preparePublication` compiles an immutable **Publication Package**:
  1. Resolves all slides, videos, and layouts in the playlist.
  2. Resolves all asset download URLs and their SHA-256 hashes.
  3. Formulates a single JSON document conforming to the `PublicationManifest` schema.
  4. Stores the manifest in Cloud Storage under `publications/{publicationId}/manifest.json`.
  5. Atomically sets `desiredPublicationId: publicationId` on all targeted `displays` documents in Firestore.

### Stage 6: Store-and-Forward Autonomous Playback
- The physical digital display player polls/listens for changes to its `desiredPublicationId`.
- Upon detecting a new publication ID:
  1. The player downloads `manifest.json`.
  2. It iterates through all required assets and checks its local on-disk cache.
  3. Missing assets are downloaded to local storage and verified against their `sha256` checksums.
  4. Once 100% of assets are verified, the player atomically flips playback to the new manifest.
  5. If the network drops or is permanently disconnected, the player continues cycling through the verified local assets without interruption.

---

## 4. Deep-Dive: How Assets are Handled

Assets are the visual backbone of digital signage. Aura DIMS implements strict guarantees to eliminate broken images, buffering spinners, or mismatched aspect ratios on physical displays.

### 4.1. Ingestion & Storage Architecture
- **Raw Media Upload:** Uploaded to Google Cloud Storage with strict content-type headers.
- **Pathing convention:**
  - Media Assets: `media/{departmentId}/{assetId}_{filename}`
  - Slide Raster Renders: `thumbnails/designs/{designId}.png`
  - Manifest Packages: `publications/{publicationId}/manifest.json`

### 4.2. Asset Metadata Schema (`MediaAsset`)
Every asset is indexed in Firestore with:
```typescript
export interface MediaAsset {
  id: string;
  name: string;
  originalFileName: string;
  departmentId: string;
  projectId?: string;             // Project grouping
  mediaType: 'image' | 'video' | 'document' | 'audio';
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;            // Cloud Storage path
  downloadUrl: string;            // Signed / public CDN URL
  checksumSha256: string;         // Cryptographic integrity hash
  dimensions?: { width: number; height: number };
  durationSeconds?: number;       // For videos
  orientation: 'landscape' | 'portrait' | 'square';
  status: 'ready' | 'processing' | 'archived';
  createdAt: string;
  updatedAt: string;
}
```

### 4.3. Cryptographic Verification (SHA-256)
- Digital displays located in public venues (airports, corporate lobbies) must never display corrupted or tampered media.
- During publication manifest generation, the Cloud Function computes the SHA-256 hash of each media asset and embeds it into the manifest JSON:
  ```json
  "assets": [
    {
      "assetId": "asset_xyz",
      "url": "https://storage.googleapis.com/.../video.mp4",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "fileSizeBytes": 15482910
    }
  ]
  ```
- Before the local player plays `video.mp4`, it recalculates the SHA-256 hash on local disk. If the hash does not match, the asset is discarded and redownloaded; the player remains on its previous active publication or corporate neutral fallback until resolved.

### 4.4. Slide Canvas Rasterization
- When a user constructs a complex slide (with multiple text boxes, badges, logos, shapes), Aura DIMS uses a client-side off-screen canvas rasterizer (`slideRasterizer.ts`).
- It produces a lossless high-resolution raster image that serves as:
  1. An instant visual thumbnail in the CMS UI.
  2. A fallback static frame for low-power digital display player hardware that cannot render live DOM layers at 60 FPS.

---

## 5. Projects Architecture (Asset & Content Segregation)

To prevent clutter in organizations with multiple departments, campaigns, and clients, Aura DIMS uses a **Project Workspace** model (similar to Figma and Canva):

```
                       Content Hub (/content)
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
[ General / Shared Hub ]   [ Project A: T3 Launch ]    [ Project B: HR Onboarding ]
     │                           │                           │
  - Brand Logos               - 12 Campaign Images        - 6 HR Infographics
  - Standard Disclaimers      - 3 Landscape Slides        - 2 Training Slides
  - Neutral Backgrounds       - 1 Grand Opening Loop      - 1 Weekly Orientation Loop
```

### How Projects Segregate Assets:
1. **Root Hub (`/content`):** Displays all accessible Project cards with asset counts and department tags, plus a button to **Create New Project**.
2. **Scoped Workspace (`/content/projects/:projectId`):** Clicking a project opens its scoped view containing only that project's:
   - **Canvas Designs**
   - **Playlists**
   - **Media Assets**
3. **Cross-Project Shared Brand Hub:** Company-wide assets (official logos, corporate colors, regulatory disclaimers) live in the pinned **"General / Corporate Shared Hub"**. When working inside any project, users can access these shared assets without creating duplicate uploads.

---

## 6. Digital Display Hardware & Fleet Management

Physical digital displays run an autonomous runtime that interfaces with the cloud via the **Device Gateway**:

### Enrollment & Provisioning:
1. **Claiming Code / QR Pairing:** A newly booted digital display displays a 6-character short code and QR code.
2. **Admin Claiming:** An authorized operator enters the code in the Web UI to link the device to a Site and Department.
3. **Hardware Orientation & Resolution:** Digital displays are explicitly designated as `Landscape (16:9, 1920x1080)` or `Portrait (9:16, 1080x1920)`. The scheduler ensures portrait schedules only target portrait digital displays.

### Heartbeat & Telemetry:
- Digital displays report periodic telemetry via Cloud Function `reportDeviceHeartbeat`:
  - Current CPU temperature & load
  - Available storage (e.g. `48.1 GB free / 58.8 GB`)
  - Currently presenting publication ID and slide
  - Network connection status & IP address
- Displays that fail to report within 5 minutes are marked `offline` in the dashboard.

### Emergency Fallback:
- Every digital display bundles an immutable **Corporate Neutral Fallback** loop stored in local read-only memory.
- If a schedule expires, is withdrawn, or has no valid publication assigned, the player displays this corporate neutral fallback instead of a blank screen or desktop error.

---

## 7. Role-Based Access Control (RBAC) & Governance

Aura DIMS strictly enforces four permission tiers:

| Role | Scope | Permissions |
| :--- | :--- | :--- |
| **System Admin (`admin`)** | Global (All departments) | Full platform control: assign roles, commission digital displays, publish manifests, override schedules, configure tenants. |
| **Department Head (`department_head`)** | Department-scoped | Approves or rejects schedules submitted by department creators, manages department projects, triggers direct publications. |
| **Content Creator (`creator`)** | Department-scoped | Uploads media, designs slides, creates playlists, and submits broadcast schedules for review. Cannot publish directly unless granted `canDirectPublish`. |
| **Digital Display Player (`display_device`)** | Device-specific token | Read-only access to its assigned publication manifest and media asset download URLs; reports operational heartbeats. |

---

## 8. Summary Table of Key Concepts for AI Assistance

When reasoning about or modifying code in this repository, always align with these concepts:

| Concept | Rule / Definition |
| :--- | :--- |
| **Terminology** | Use **"digital display"** at all times. Do not use screen/monitor/TV. |
| **Timezone** | All schedules and presentation windows calculate in `Asia/Kolkata` (`UTC+05:30`). |
| **Privilege Gate** | Mutations to digital displays, publications, and approvals belong in `functions/src/publishingAdmin.ts` via Admin SDK, not client Firestore. |
| **Local Dev** | Run `pnpm run emulators:start` with project ID `demo-aura-dims`. |
| **Asset Delivery** | Store-and-forward with SHA-256 verification. Players never stream live over the network during presentation. |
| **Shared Schema** | Any modification to data models must be made in `packages/display-schema/src/index.ts` and rebuilt. |
