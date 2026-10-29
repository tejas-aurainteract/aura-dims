# Aura DIMS - Local Development & Emulator Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  

---

## 1. Prerequisites & Environment Setup

Before running Aura DIMS locally, confirm that your workstation has the following runtimes installed:

### 1.1 Node.js & pnpm
- **Node.js:** Node 20.x, 22.x, or 24.x LTS.
  ```bash
  node -v
  ```
- **pnpm:** Version 10.x.
  ```bash
  pnpm -v
  # If missing:
  npm install -g pnpm@latest
  ```

### 1.2 Java Runtime Environment (JRE)
The Firebase Emulator Suite requires a Java runtime (Java 17+ or OpenJDK 21 LTS) to execute the Cloud Firestore and Cloud Storage emulators.
- Verify:
  ```bash
  java -version
  ```
- If missing on Windows:
  ```powershell
  winget install EclipseAdoptium.Temurin.21.JRE
  ```

### 1.3 Firebase CLI
The Firebase Command Line Interface orchestrates local emulation.
- Verify:
  ```bash
  firebase --version
  ```
- If missing:
  ```bash
  npm install -g firebase-tools
  ```

### 1.4 Media Ingestion & Processing Binaries
Server-side validation and thumbnail generation for the departmental Media Library use:
- **`sharp`**: Native high-performance image processing library for JPEG/PNG metadata inspection, dimension verification, and WebP thumbnail generation.
- **`@ffmpeg-installer/ffmpeg` & `@ffprobe-installer/ffprobe`**: Self-contained static binaries executed via `child_process.execFile` with argument-array safety (zero shell interpolation) to validate MP4 H.264 streams, verify duration bounds, and extract video poster frames. No external system FFmpeg install is required.

---

## 2. Environment Configuration

Copy the example environment configuration into your local environment:

```bash
cp .env.example apps/web/.env.local
```

### Key Environment Variables (`apps/web/.env.local`)

```ini
# Firebase Project Identification
VITE_FIREBASE_PROJECT_ID=demo-aura-dims
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-aura-dims.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=demo-aura-dims.appspot.com

# Emulator Control
VITE_USE_FIREBASE_EMULATOR=true
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
VITE_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_FIRESTORE_EMULATOR_PORT=8080
VITE_FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_STORAGE_EMULATOR_PORT=9199
VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT=5001

# System Settings
VITE_APP_TIMEZONE=Asia/Kolkata
VITE_APP_DEFAULT_LANG=en
```

> [!NOTE]
> Setting `VITE_FIREBASE_PROJECT_ID=demo-aura-dims` instructs the Firebase Web SDK to operate purely in mock/offline mode. No Google Cloud credentials or billing accounts are contacted.

---

## 3. Starting the Development Stack

### 3.1 All-In-One Development Command
Runs the Firebase Emulator Suite (Auth, Firestore, Functions, Storage, UI) alongside the Vite frontend React server:

```bash
pnpm run dev
```

### 3.2 Firebase Emulator Suite Standalone
To run just the emulators with automatic persistent import/export:

```bash
pnpm run emulators:start
```

- When the command initializes, it loads existing seed data from `firebase/emulators/data`.
- When terminated gracefully (e.g., via `Ctrl+C`), it exports all new state back into `firebase/emulators/data`.

### 3.3 Initial Administrator Bootstrap (Local Development Only)
To seed or reset an initial System Administrator account in the local emulator:

```bash
pnpm run bootstrap:admin --email admin@aurainteract.com --password "AuraAdmin#2026" --name "System Administrator"
```

> [!CAUTION]
> The bootstrap script strictly refuses execution against live Google Cloud or non-emulator environments. For production provisioning, an authorized bootstrap Cloud Run job or Admin console is used with Cloud KMS credentials.

### 3.4 Starter Templates Seeding
To populate or refresh the 8 built-in starter templates (Corporate Announcement, Metrics Dashboard, Emergency Notice, and Brand Showcase across Landscape and Portrait orientations) in the local emulator:

```bash
pnpm run seed:templates
```

This script executes idempotently against the emulator, creating or updating global system templates with valid versioned `DesignDocument` payloads and multilingual typography configurations.

### 3.5 Digital Displays & Sites Seeding
To seed enterprise sites (`site-ahmedabad-hq`, `site-vadodara-plant`), active landscape and portrait digital displays, and explicit departmental assignments for local testing:

```bash
pnpm run seed:displays
```

This seeds:
- 2 Enterprise sites in Gujarat (`Asia/Kolkata` timezone).
- 4 Active digital displays (2 Landscape 1920×1080, 2 Portrait 1080×1920).
- Explicit display assignments to the HR Department Head (`hr.head@aurainteract.com`).

### 3.6 Manual Emulator Export
To force an export of emulator state during active testing:

```bash
pnpm run emulators:export
```

### 3.7 Digital Display Player Agent & Development Mode
Aura DIMS includes a dedicated player runtime workspace (`@aura-dims/player`) for offline signage playback:

```bash
# Start player agent and loopback server (runs on http://127.0.0.1:8090)
pnpm run player:agent

# Or build the player bundle and run simultaneously
pnpm run player:dev
```

When started, the agent:
1. Serves the static kiosk renderer on `http://127.0.0.1:8090/`.
2. Serves content-addressable verified cache binaries from `player/data/cache/`.
3. Dispatches regular heartbeats and delivery reports to backend Cloud Functions (`reportDeviceHeartbeat`, `reportDeviceDelivery`).
4. Evaluates schedule rules locally in Indian Standard Time (`Asia/Kolkata`).

---

## 4. Digital Display Timeline Simulator & Preflight Collision Detection

Milestone 5 includes interactive testing tools accessible directly from the Aura DIMS interface:
- **Preflight Collision Detection:** Integrated inside `CreateScheduleModal`, this tool evaluates the schedule rule against all existing active schedules across target digital displays in `Asia/Kolkata`, warning operators immediately of equal-priority collisions.
- **Display Schedule Simulator:** Available on the `/schedules` page via the **Timeline Simulator** button. It runs the deterministic schedule evaluator for any digital display at any instant in `Asia/Kolkata`, visually inspecting whether a scheduled broadcast wins, a collision occurs, or corporate fallback neutral content runs.

---

## 4. Port Allocation Matrix

| Service | Port | Host | URL / Direct Endpoint |
| :--- | :--- | :--- | :--- |
| **Vite Web Server** | `5175` | `127.0.0.1` | `http://127.0.0.1:5175` |
| **Player Loopback HTTP Server** | `8090` | `127.0.0.1` | `http://127.0.0.1:8090` |
| **Firebase Emulator UI** | `4000` | `127.0.0.1` | `http://127.0.0.1:4000` |
| **Auth Emulator** | `9099` | `127.0.0.1` | `http://127.0.0.1:9099` |
| **Firestore Emulator** | `8080` | `127.0.0.1` | `127.0.0.1:8080` |
| **Functions Emulator** | `5001` | `127.0.0.1` | `http://127.0.0.1:5001` |
| **Storage Emulator** | `9199` | `127.0.0.1` | `127.0.0.1:9199` |
| **Hosting Emulator** | `5000` | `127.0.0.1` | `http://127.0.0.1:5000` |

---

## 5. Testing & Verification Workflows

### 5.1 Typechecking
Executes TypeScript compilers in strict mode across the workspace:
```bash
pnpm run typecheck
```

### 5.2 Build Verification
Builds schema, functions, and the production React bundle:
```bash
pnpm run build
```

### 5.3 Security Rules Unit Tests
Runs the Vitest rules test suite validating deny-by-default behavior against the running Firestore and Storage emulators:
```bash
pnpm run test:rules
```

### 5.4 Playwright Browser Smoke Tests
Validates frontend shell rendering, navigation, and digital display terminology:
```bash
pnpm run test:e2e
```

---

## 6. Troubleshooting Common Issues

### Port Conflict (e.g. Port 8080 or 5001 already in use)
On Windows, check which process is bound to the port and terminate it:
```powershell
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object OwningProcess
Stop-Process -Id <OwningProcessId> -Force
```

### Java Not Found
If the Firestore emulator throws `java: command not found`, ensure that `JAVA_HOME` is configured in your system environment variables and that `java -version` returns a valid runtime.

