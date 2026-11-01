# Aura DIMS — Hardware Integration & Client Adaptation Plan

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Document Purpose:** Source-grounded architecture, evidence audit, file mapping, security boundaries, and verification plan for integrating verified hardware-management behaviors into Aura DIMS.

---

## 1. Executive Summary & Architectural Decision

**Aura DIMS remains the single authoritative content, governance, and administration platform.** Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Functions (v2, `asia-south1`), the React operational dashboard, departmental RBAC, explicit digital display assignments, multi-step approvals, immutable design/playlist revisions, `Asia/Kolkata` priority/daypart scheduling, and the offline loopback renderer remain authoritative.

This integration adapts proven hardware-management and playback techniques from the legacy deployment and inspected Raspberry Pi digital display runtime into the existing TypeScript/Node/Firebase architecture—**without** merging the legacy Flask control plane, SQLite weekly scheduler, static credentials, unauthenticated media routes, or arbitrary remote shell execution.

---

## 2. Audit of Supplied Inputs & Source Evidence

### 2.1 Reference Server Backup (`/Users/tejasmishradev/Downloads/Aura-Server-Backup-2026-10-30/`)
Read-only inspection verified all 13 files in `DEPLOYED_MANIFEST.json` against their SHA-256 digests:
- [`server/cloud_app.py`](file:///Users/tejasmishradev/Downloads/Aura-Server-Backup-2026-10-30/server/cloud_app.py): Legacy Flask dashboard, media upload/FFmpeg queue, weekly playlist assignment, device command proxy, and `/api/device/<device_id>/schedule` endpoint. **Security note:** Contains embedded static login credentials (excluded and never copied).
- [`server/cloud_ws.py`](file:///Users/tejasmishradev/Downloads/Aura-Server-Backup-2026-10-30/server/cloud_ws.py): `aiohttp` WebSocket hub (`127.0.0.1:8765`, `/ws`) handling `auth`, `heartbeat`, `file_inventory`, `command_response`, and `transfer_progress`, plus unauthenticated loopback endpoints (`/internal/dispatch`, `/internal/status`, `/internal/transfers/{device_id}`, `/internal/device_files/{device_id}`).
- [`server/publishing.py`](file:///Users/tejasmishradev/Downloads/Aura-Server-Backup-2026-10-30/server/publishing.py): Per-device target plan builder (`build_plan`), live transfer readiness calculator (`readiness`), and `PREFETCH_ASSET` dispatcher (`start_downloads`).
- [`server/cloud_db.py`](file:///Users/tejasmishradev/Downloads/Aura-Server-Backup-2026-10-30/server/cloud_db.py): SQLite schema (`devices`, `assets`, `playlists`, `playlist_items`, `device_weekly_schedule`, `device_excluded_assets`) with a seeded example token (excluded and never copied).
- [`server/signage_common.py`](file:///Users/tejasmishradev/Downloads/Aura-Server-Backup-2026-10-30/server/signage_common.py): `DISPLAY_TIMEZONE = UTC+05:30 (Asia/Kolkata)`, `local_weekday()` (Monday=0..Sunday=6), path-traversal check `media_path()`, and `schedule_revision()`.
- [`server/static/dashboard.js`](file:///Users/tejasmishradev/Downloads/Aura-Server-Backup-2026-10-30/server/static/dashboard.js): Operator UI patterns for device health cards, applied vs desired schedule revision, per-file transfer progress, live preview modal, and device operations.

### 2.2 Inspected Hardware Client Snapshot (`device-source/` & `Aura-DIMS-Hardware-Assessment.md`)
Read-only SSH inspection of the operating Raspberry Pi digital display (`/home/aura/tv_signage`) on Raspbian GNU/Linux 12 (bookworm, `aarch64`, kernel `6.6.51+rpt-rpi-v8`, Python 3.11, Chromium `130.0.6723.116`) captured:
- [`device-source/cloud_agent.py`](file:///Users/tejasmishradev/Documents/ChatGPT/Digital Display System/outputs/hardware-integration/Aura-DIMS-Hardware-Integration-Handoff/device-source/cloud_agent.py):
  - Connects to `cloud_ws_url` with `device_id` and `token`.
  - Reads thermal sensor `/sys/class/thermal/thermal_zone0/temp` (with `vcgencmd measure_temp` fallback), `/proc/meminfo` (`MemTotal`, `MemAvailable`), and `shutil.disk_usage`.
  - Streams downloads (`download_verified`) in 128 KiB chunks to a unique `.part` file, checks free space, `flush` + `os.fsync`, verifies byte size and SHA-256, and atomically replaces destination via `os.replace`.
  - Executes remote commands: `PREFETCH_ASSET`, `SYNC_SCHEDULE`, `REFRESH` (syncs then runs `pkill -f /usr/lib/chromium/chromium`), `SCREENSHOT` (`env DISPLAY=:0 scrot -z -q 50 -o /tmp/live_stream.jpg`), `REBOOT` (`sudo reboot`), `DELETE_FILE`, `CLEAR_STORAGE`, and `TERMINAL` (arbitrary `shell=True`).
  - **Flaws to correct in adaptation:** 2-second full-directory inventory loop (`verify_inventory`), 0.05s reconnect loop on clean close, 5 MiB free-space floor, broad `pkill` process matching, base64 screenshot over WebSocket, and `TERMINAL` arbitrary shell execution.
- [`device-source/app.py`](file:///Users/tejasmishradev/Documents/ChatGPT/Digital Display System/outputs/hardware-integration/Aura-DIMS-Hardware-Integration-Handoff/device-source/app.py) & [`device-source/templates/player.html`](file:///Users/tejasmishradev/Documents/ChatGPT/Digital Display System/outputs/hardware-integration/Aura-DIMS-Hardware-Integration-Handoff/device-source/templates/player.html):
  - Serves `/player` and `/api/player/current` on `0.0.0.0:5000`.
  - Uses dual `<img>` (`#img-a`, `#img-b`) and dual `<video>` (`#video-player`, `#video-buffer`) elements so decoded media stays visible while the next item preloads.
  - Guards async media callbacks with a monotonic `generation` counter.
  - Starts dwell timers only at `reveal()` (after `onload` or `onloadeddata`/`onplaying`) with a 15-second preparation watchdog.
  - Preserves current browser playback when `/api/player/current` returns `pending: true` or fails.
  - **Limitations:** Supports only flat full-bleed ordered images/videos—cannot render Aura DIMS multi-element visual designs, shapes, positioned text, Gujarati/Devanagari typography, priority overrides, or time-of-day windows.

### 2.3 Reconciliation with Destination Repository (`a3f9318`)
Note: `AGENTS.md` Section 4 still listed Milestone 1 as current, whereas the destination codebase at commit `a3f9318` already implements:
- Full user/department provisioning, custom claims, and departmental RBAC (`functions/src/index.ts`, `firestore.rules`, `storage.rules`).
- Fleet management, pairing code enrollment, device custom tokens, and commissioning checklists (`functions/src/fleetAdmin.ts`, `functions/src/rolloutAdmin.ts`).
- Departmental media library with SHA-256 verification (`functions/src/mediaAdmin.ts`).
- Visual design studio, templates, immutable design/playlist revisions, editorial approvals, `Asia/Kolkata` schedule evaluator, and immutable publication manifests (`functions/src/designAdmin.ts`, `functions/src/publishingAdmin.ts`).
- Node player agent (`player/src/agent/`) and loopback renderer (`player/src/renderer/`).

---

## 3. Capability & Integration Matrix

| Capability | Legacy / Hardware Source | Aura DIMS Destination Implementation |
| :--- | :--- | :--- |
| **Control & Sync Transport** | Python WebSocket (`cloud_ws.py`) + unauthenticated HTTP manifest | Shared `PlayerTransport` (`player/src/agent/transport.ts`) supporting explicit `emulator` (`demo-aura-dims`) and `cloud` modes over authenticated Firebase Callable protocol |
| **Scheduling & Content Model** | SQLite Monday=0..Sunday=6 weekly playlist of raw files | Existing Aura DIMS `ScheduleRule` (`Asia/Kolkata`, date windows, overnight dayparts, priorities 1–10, emergency expiry) + visual `DesignDocument` slides |
| **Verified Asset Download** | `download_verified` (`.part` stream, `fsync`, size + SHA-256 check, `os.replace`) | Ported into `player/src/agent/syncEngine.ts` with configurable reserve margin (default 50 MiB), per-asset progress telemetry, signed URL refresh on expiry, and URL host/scheme validation |
| **Package Activation** | Per-file replacement + SQLite commit | Preserved staging isolation (`packages/staging/<pubId>`), full package verification, previous package retention (`previous.json`), and atomic pointer switch (`active.json`) |
| **Buffered Media Transitions** | `player.html` dual `<img>`/`<video>` layers, `generation` counter, reveal-timed dwell, 15s prep watchdog | Ported into `player/src/renderer/renderer.js` for slide & media transitions while preserving multi-element visual design rendering, fonts, and orientation scaling |
| **Hardware Telemetry** | String-formatted `temp`, `ram`, `disk` in `get_system_stats()` | Typed numeric `HardwareMetrics` (`cpuTempCelsius`, `memoryUsedBytes`, `memoryTotalBytes`, `diskFreeBytes`, `diskTotalBytes`, `osPlatform`, `osRelease`, `arch`, `bootId`) via `player/src/agent/hardwareAdapter.ts` |
| **Device Capabilities** | Implicit / hardcoded | Versioned `DeviceCapabilities` reported in heartbeats (`capturePreview`, `refreshRenderer`, `reboot`, `safeCacheCleanup`, `visualDesigns`, `supportedMediaTypes`) |
| **Remote Operations** | Ephemeral WebSocket `command` dispatch | Durable Firestore subcollection `/displays/{displayId}/operations/{operationId}` with RBAC scope checks, transactional device lease, persistent local deduplication, expiry, rate limits, and audit logs |
| **Renderer Refresh** | `pkill -f /usr/lib/chromium/chromium` | Controlled refresh via loopback SSE/poll reload signal (`reloadGeneration`) plus optional owned-process/service restart without broad `pkill` |
| **On-Demand Preview** | `scrot` base64 string over WebSocket | Capability-gated X11 capture (`scrot` to unique temp file with size ceiling), uploaded to private Cloud Storage `previews/{displayId}/{operationId}.jpg` via authorized callable, served via short-lived signed/tokenized URL |
| **Device Reboot** | Immediate `sudo reboot` returning HTTP 202 as success | Admin-only, confirmation-required operation with short TTL (5 min); leased device records `awaiting_reconnect` with pre-reboot `bootId`/`uptimeSeconds` and only reconciles to `succeeded` after post-reboot reconnect evidence |
| **Cache Inventory & Cleanup** | `DELETE_FILE` / `CLEAR_STORAGE` mutating active SQLite playlists | Bounded cache inventory reporting + `SAFE_CLEANUP_CACHE` operation that re-verifies active, previous, and in-use staged package references before pruning unreferenced cache blobs |
| **Remote Terminal** | `handle_terminal` (`shell=True`) | **Explicitly excluded** (security boundary) |
| **Local Port 5000 Admin UI** | `app.py` on `0.0.0.0:5000` | **Explicitly excluded**; single renderer owner on loopback `127.0.0.1:8090` |

---

## 4. Exact Destination Files to Create & Modify

### 4.1 Shared Schema (`packages/display-schema`)
- **Modify** [`packages/display-schema/src/index.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/packages/display-schema/src/index.ts):
  - Add `DeviceCapabilities`, `HardwareMetrics`, `AssetTransferProgress`, `CacheInventoryItem`, `CacheInventorySummary`, `DisplayPreviewMetadata`.
  - Add durable device operation types (`DeviceOperationType`: `'SYNC_NOW' | 'REFRESH_RENDERER' | 'CAPTURE_PREVIEW' | 'SAFE_CLEANUP_CACHE' | 'REBOOT'`, `DeviceOperationState`: `'queued' | 'leased' | 'running' | 'awaiting_reconnect' | 'succeeded' | 'failed' | 'expired' | 'cancelled'`, `DeviceOperationRecord`).
  - Extend `DisplayReportedState`, `DigitalDisplay`, `DeviceHeartbeatRequest`, `DeviceHeartbeatResponse`, `ReportDeviceDeliveryRequest`.
  - Add callable request/response contracts: `RequestDisplayOperationRequest`, `RequestDisplayOperationResponse`, `ListDisplayOperationsRequest`, `ListDisplayOperationsResponse`, `ClaimDeviceOperationRequest`, `ClaimDeviceOperationResponse`, `ReportDeviceOperationRequest`, `ReportDeviceOperationResponse`, `UploadDevicePreviewRequest`, `UploadDevicePreviewResponse`, `GetDisplayPreviewUrlRequest`, `GetDisplayPreviewUrlResponse`.
  - Add `checkLegacyManifestCompatibility()` helper to explicitly detect and reject Aura DIMS features (multi-element visual designs, dayparts, priorities, emergency overrides) that cannot be represented in a legacy weekly media manifest.

### 4.2 Cloud Functions (`functions`)
- **Modify** [`functions/src/operational.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/functions/src/operational.ts):
  - Add operation TTL, lease duration, rate-limit, and payload ceiling constants/helpers.
- **Create** [`functions/src/deviceOperations.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/functions/src/deviceOperations.ts):
  - `requestDisplayOperation`: Validates human caller (`getAuthenticatedCaller`), enforces Admin vs Department Head explicit display assignment (`loadAuthorizedDisplay`), enforces Admin-only + explicit confirmation for `REBOOT`, checks device capability support, enforces rate limits and idempotency key, creates `/displays/{displayId}/operations/{operationId}`, and writes an audit event.
  - `listDisplayOperations`: Authorized read of recent operations for a digital display (merges/sweeps expired queued/leased operations).
  - `claimDeviceOperation`: Device-authenticated transactional lease acquisition for the next non-expired `queued` operation (or reconciles `awaiting_reconnect` `REBOOT` operations when post-reboot `bootId`/uptime evidence proves a reboot occurred).
  - `reportDeviceOperation`: Device-authenticated progress/result transition (`running`, `awaiting_reconnect`, `succeeded`, `failed`), bounded output validation, cache inventory / delivery refresh, and audit logging.
  - `uploadDevicePreview`: Device-authenticated upload of bounded JPEG preview bytes (`<= 2 MiB`) for an active leased `CAPTURE_PREVIEW` operation into private Cloud Storage (`previews/{displayId}/{operationId}.jpg`), recording metadata and pruning previous preview objects.
  - `getDisplayPreviewUrl`: Human-authorized callable (re-checking Admin or assigned Department Head access) returning a short-lived signed/emulator URL and capture metadata for the latest on-demand preview.
- **Modify** [`functions/src/fleetAdmin.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/functions/src/fleetAdmin.ts) & [`functions/src/displayModel.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/functions/src/displayModel.ts):
  - Bound and sanitize incoming `hardwareMetrics`, `capabilities`, `assetProgress`, `cacheInventory`, and `playback` in `reportDeviceHeartbeat` and `reportDeviceDelivery`.
  - Reconcile any pending `awaiting_reconnect` reboot operations upon heartbeat receipt when `bootId` changed or `uptimeSeconds` reset.
  - Return `pendingOperationCount` in `DeviceHeartbeatResponse` so the player can immediately claim queued operations.
- **Modify** [`functions/src/index.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/functions/src/index.ts):
  - Export the new device operation and preview callables.
- **Modify** [`firestore.rules`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/firestore.rules) & [`storage.rules`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/storage.rules):
  - Explicitly deny direct client writes to `/displays/{displayId}/operations/{operationId}` and `/previews/{allPaths=**}` so all authority and preview access flow through server-authorized callables.

### 4.3 Player Agent & Renderer (`player`)
- **Modify** [`player/src/agent/config.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/agent/config.ts):
  - Add explicit `mode: 'emulator' | 'cloud'`, Firebase client config fields (`apiKey`, `appId`, `authDomain`, `storageBucket`, `functionsBaseUrl`, `allowedDownloadHosts`), reserve disk threshold (`minFreeDiskBytes`), and operation polling configuration.
  - Enforce fail-closed validation: `emulator` mode locks to `demo-aura-dims` and local emulator hosts; `cloud` mode rejects `demo-*` project IDs, missing `FIREBASE_API_KEY`, or emulator hosts, and keeps local HTTP server strictly on `127.0.0.1`.
- **Create** [`player/src/agent/transport.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/agent/transport.ts):
  - Single transport abstraction for `emulator` and `cloud` modes.
  - Invokes Firebase callable endpoints with valid `{ data }` envelope and `Authorization: Bearer <idToken>`, handles `401`/`403` token refresh and credential revocation detection, and validates download URLs against allowed schemes/hosts.
- **Create** [`player/src/agent/hardwareAdapter.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/agent/hardwareAdapter.ts):
  - Collects real numeric OS telemetry: Linux `/sys/class/thermal/thermal_zone0/temp` (with `vcgencmd` fallback), `/proc/meminfo`, `/proc/sys/kernel/random/boot_id`, `fs.statfsSync`, and `os.uptime()`, returning `null` for unavailable metrics.
  - Discovers versioned `DeviceCapabilities` (checks platform, X11 `DISPLAY` + `scrot` binary availability for `capturePreview`, controlled renderer refresh support, and dedicated reboot helper availability).
  - Implements safe capability adapters for `captureScreenPreview` (unique temp file, timeout, max byte limit, guaranteed cleanup) and controlled `triggerSystemReboot` (never raw shell strings).
- **Modify** [`player/src/agent/identity.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/agent/identity.ts):
  - Use `PlayerTransport` and validated config; support automatic token renewal and clear revocation state handling.
- **Modify** [`player/src/agent/syncEngine.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/agent/syncEngine.ts):
  - Use `PlayerTransport`.
  - Stream downloads to unique `.part` files with `fsync`, disk reserve check, byte-size and SHA-256 verification, per-asset progress tracking (`AssetTransferProgress`), automatic manifest URL refresh when signed URLs expire mid-download, and stale-revision race protection (re-checking desired publication before atomic pointer switch).
  - Provide bounded `getCacheInventory()` and reference-safe `runSafeCacheCleanup()` protecting active, previous, and in-use staging files.
- **Create** [`player/src/agent/operationsAgent.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/agent/operationsAgent.ts):
  - Single-flight operation claim/execution loop with bounded backoff/jitter and persistent local ledger (`operations-ledger.json`) to prevent duplicate execution across restarts and reconcile `REBOOT` after reconnect.
- **Modify** [`player/src/agent/localServer.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/agent/localServer.ts) & [`player/src/agent/supervision.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/agent/supervision.ts):
  - Track `reloadGeneration` and `firstPresentedAt` per publication so package activation is never conflated with actual visible presentation.
  - Report hardware metrics, capabilities, asset progress, and cache inventory in heartbeats; trigger immediate operation claim when `pendingOperationCount > 0`.
- **Modify** [`player/src/renderer/renderer.js`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/renderer/renderer.js) & [`player/src/renderer/renderer.css`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/player/src/renderer/renderer.css):
  - Port dual-buffered slide/media transitions, monotonic `generation` counter, reveal-timed dwell (after image decode / video `loadeddata` or `playing`), 15s preparation watchdog, audio-then-muted video autoplay fallback, and remote refresh (`reloadGeneration`) handling while preserving full multi-element `DesignDocument` rendering.

### 4.4 Web Application (`apps/web`)
- **Modify** [`apps/web/src/lib/api.ts`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/apps/web/src/lib/api.ts):
  - Add typed client wrappers for `requestDisplayOperation`, `listDisplayOperations`, and `getDisplayPreviewUrl`.
- **Create** [`apps/web/src/components/Displays/DisplayDetailsDrawer.tsx`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/apps/web/src/components/Displays/DisplayDetailsDrawer.tsx) & **Modify** [`apps/web/src/pages/DisplaysPage.tsx`](file:///Users/tejasmishradev/antigravity-projects/org/aura-dims/apps/web/src/pages/DisplaysPage.tsx):
  - Extend the Digital Displays detail drawer with **Health**, **Delivery**, **Files**, and **Operations** tabs:
    - **Health:** Real CPU temperature, RAM usage, disk usage, OS/arch, boot ID, uptime, connectivity vs renderer health, and versioned capability badges.
    - **Delivery:** Desired vs ready vs active vs actually presented publication ID, first-presentation timestamp, and per-asset transfer/checksum progress table.
    - **Files:** Reference-tagged cache inventory (`active`, `previous`, `staged`, `unreferenced`) and safe cache cleanup action.
    - **Operations:** Scoped buttons for `Sync Now`, `Refresh Renderer`, `Capture Preview` (with time-labelled software-capture notice and unsupported reason when disabled), `Safe Cache Cleanup`, and Admin-only confirmed `Reboot Digital Display`, plus live operation history table.

---

## 5. Missing Inputs & Pending Physical Acceptance

1. **Uncaptured OS Provisioning Artifacts:**
   - Live `/home/aura/tv_signage/cloud_agent.json` values (deliberately excluded for security).
   - CustomPiOS helper scripts in `/opt/custompios/scripts/` (`refresh`, `safe-refresh`, rotation scripts) and `/boot/firmware/` display rotation flags.
   - Live SQLite database (`cloud.db` / `signage.db`) and uploaded media files (if historical playlist migration is later requested).
2. **Physical Acceptance Pending:**
   - End-to-end cloud enrollment and token renewal on the physical Raspberry Pi digital display.
   - Physical HDMI output observation for landscape/portrait orientations, Gujarati/Devanagari font shaping, dual-buffered video transitions, `scrot` X11 preview capture, and controlled systemd cutover from `tv-signage.service` / `tv-agent.service` to `auradims-agent.service` / `auradims-kiosk.service`.

---

## 6. Verification & Test Plan

1. **Transport & Configuration Isolation Tests (`tests/player/hardware-integration.test.ts`):**
   - Emulator mode locks to `demo-aura-dims`; cloud mode fails closed on `demo-*` project ID, missing API key, or emulator host leak; untrusted download URL schemes/hosts are rejected; 401 triggers token renewal; revoked device credentials clear state safely.
2. **Hardware Telemetry, Capabilities & Renderer Buffering Tests (`tests/player/hardware-integration.test.ts`):**
   - Linux thermal/meminfo/statfs parser fixtures, unavailable metrics returning `null`, capability detection, per-asset progress tracking, checksum mismatch rejection preserving active package, stale revision race guard, reference-safe cache GC protecting active/previous/staged assets, and separation of package activation from renderer presentation.
3. **Backend Authorization & Durable Operations Lifecycle Tests (`tests/acceptance/device-operations.test.ts`):**
   - Cross-department and unassigned Department Head denial, inactive user/device rejection, device lease transaction exclusivity, duplicate claim prevention, operation expiry, Admin-only reboot confirmation and post-reconnect `bootId`/uptime reconciliation, and private preview upload/access control.
4. **Security Rules & Full Workspace Validation:**
   - `pnpm run typecheck`, `pnpm run build`, `pnpm run test:rules`, unit/integration suites via Vitest.

