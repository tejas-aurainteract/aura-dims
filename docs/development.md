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

### 3.4 Manual Emulator Export
To force an export of emulator state during active testing:

```bash
pnpm run emulators:export
```

---

## 4. Port Allocation Matrix

| Service | Port | Host | URL / Direct Endpoint |
| :--- | :--- | :--- | :--- |
| **Vite Web Server** | `5175` | `127.0.0.1` | `http://127.0.0.1:5175` |
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

