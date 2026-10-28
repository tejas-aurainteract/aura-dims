# Aura DIMS - Digital Display Player Runtime (Placeholder)

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Component:** `player/` (Digital Display Client Runtime)

---

## 1. Overview and Purpose

The `player/` package is reserved as the dedicated runtime for digital displays deployed across Aurainteract customer sites (initially ~20 digital displays, expanding to 100+ digital displays).

Signage player hardware will consist of commercial digital display monitors, Android media boxes, Raspberry Pi / single-board computers, or dedicated kiosk hardware running in both landscape and portrait orientations.

---

## 2. Architectural Principles & Offline Playback Design

> [!IMPORTANT]
> **Firestore offline persistence alone is NOT a complete digital signage solution.**
> Network connections to digital signage screens in industrial and enterprise sites can be intermittent or severed for days. The player runtime operates on an autonomous, pull-and-verify model.

### 2.1 Autonomous Local Execution
- **Local Clock Scheduling:** All time-based slide transitions, playlist sequences, and dayparting triggers run strictly on the local hardware clock configured to `Asia/Kolkata`.
- **Zero Cloud Function Dependency for Playback:** Slide changes and scheduled playlist transitions NEVER depend on a Cloud Function or real-time network trigger. Network outages must not interrupt continuous screen playback.

### 2.2 Versioned Publication Manifest
1. The backend publishes an immutable, versioned publication manifest (`PublicationManifest`) containing:
   - Unique publication ID and version hash
   - Target digital display ID and site ID
   - Validity window (`validFrom` to `expiresAt`)
   - Playlist sequence and duration timings (in milliseconds)
   - Asset URLs with SHA-256 integrity checksums
   - Fallback slides for expired or degraded content

### 2.3 Atomic Asset Staging & Integrity Verification
1. **Download Phase:** The digital display player downloads required images and video assets into local non-volatile storage (IndexedDB, local disk, or app data sandbox).
2. **Integrity Check:** The player calculates the SHA-256 hash of each downloaded file and validates it against the manifest checksum.
3. **Atomic Activation:** The new publication manifest is **only activated once 100% of required media assets are verified on local disk**. If any asset download fails or hash mismatches, the display continues playing the previous publication without disruption.

### 2.4 Last-Known-Good (LKG) State & Fallback Content
- If a new manifest is corrupt or download fails, the player retains and loops the **Last-Known-Good (LKG)** publication.
- If a publication passes its expiration timestamp without an updated manifest, the player gracefully switches to designated department or site fallback safety notices rather than presenting a black screen or error dialog.

### 2.5 Heartbeat, Telemetry & Reconnection Reconciliation
- When network connectivity is healthy, the player sends periodic ping heartbeats (including current playing publication ID, local temperature, storage usage, and uptime) to the backend.
- During disconnection, playback logs and proof-of-play metrics are buffered locally and batched back to the server upon reconnection reconciliation.

---

## 3. Technology Roadmap for Player

Future implementations will target:
- **Web Player:** Progressive Web App (PWA) with Service Workers, CacheStorage, and IndexedDB for web-based displays.
- **Android / Native Kiosk:** Android TV / AOSP signage client for commercial display hardware.

