# Aura DIMS (Aura Digital Information Management System)

**Company:** Aurainteract Private Limited  
**Product:** Aura DIMS  
**Expansion:** Aura Digital Information Management System  
**Purpose:** Enterprise Digital Signage and Content Management Platform  

---

## 1. Executive Summary & Deployment Context

Aura DIMS is an enterprise-grade digital signage management platform purpose-built by **Aurainteract Private Limited**. The platform provides centralized media scheduling, multi-layer canvas content creation, departmental governance, and autonomous offline playback across networks of commercial digital displays.

- **Initial Deployment Fleet:** Approximately 20 digital displays across pilot facilities.
- **Planned Expansion:** 100+ digital displays across distributed industrial and enterprise sites in India (Ahmedabad, Vadodara, Surat, Rajkot, etc.).
- **System Scheduling Timezone:** `Asia/Kolkata` (Indian Standard Time, UTC+05:30).
- **Supported Content Languages:** English, Gujarati, and Hindi.
- **Naming Rule:** The phrase **"digital display"** is strictly used in all user-facing copy and system interfaces.

---

## 2. Technology Stack

| Layer | Technology | Specification / Version |
| :--- | :--- | :--- |
| **Frontend Framework** | React + TypeScript | React 19, Strict Mode, JSX transform |
| **Build & Dev Tool** | Vite | Vite 6 with React HMR |
| **Styling & Components** | Tailwind CSS | Tailwind CSS 3.4 with custom Aura teal palette |
| **Routing** | React Router | React Router DOM v7 |
| **Package Management** | pnpm | pnpm 10 with workspace protocol and committed lockfile |
| **Client SDK** | Firebase Modular Web SDK | Firebase v11, tree-shakable modular API |
| **Backend Compute** | Cloud Functions for Firebase | 2nd Generation Cloud Functions (TypeScript, Node 20+) |
| **Database** | Cloud Firestore | NoSQL document store with regional targeting |
| **Asset Storage** | Cloud Storage for Firebase | Object storage for high-resolution images & videos |
| **Local Development** | Firebase Emulator Suite | Local offline emulation for Auth, Firestore, Functions, Storage, and UI |
| **Security Rules Testing**| Vitest + Rules Unit Testing | `@firebase/rules-unit-testing` v4 with Vitest v3 |
| **End-to-End Testing** | Playwright | Headless browser smoke verification suite |

---

## 3. Local Development Prerequisites

Ensure the following prerequisites are installed on your workstation:

1. **Node.js:** Node.js version 20.x or 22.x LTS (compatible with Node 24).
   - Check: `node -v`
2. **pnpm:** Package manager version 10.x.
   - Install if missing: `npm install -g pnpm@latest`
   - Check: `pnpm -v`
3. **Java Runtime (JRE/JDK):** Required by Firebase Emulator Suite (Firestore and Storage emulators).
   - Java 17+ or OpenJDK 21 LTS.
   - Check: `java -version`
   - Install on Windows via winget if missing: `winget install EclipseAdoptium.Temurin.21.JRE`
4. **Firebase CLI:** Version 13.x or 15.x.
   - Install if missing: `npm install -g firebase-tools`
   - Check: `firebase --version`

---

## 4. Quickstart & Commands

### 4.1 Dependency Installation
```bash
pnpm install
```

### 4.2 Start Complete Local Development Environment
Starts both the Firebase Emulator Suite and the Vite React development server concurrently:
```bash
pnpm run dev
```

### 4.3 Dedicated Firebase Emulator Commands
Start emulators with persistent state loading and automatic export on shutdown:
```bash
pnpm run emulators:start
```

Manually export emulator state to `firebase/emulators/data`:
```bash
pnpm run emulators:export
```

### 4.4 Quality & Test Commands
```bash
# Typecheck all packages and applications strictly
pnpm run typecheck

# Build all packages and the production web bundle
pnpm run build

# Run deny-by-default Security Rules tests (requires running emulators or executes via emulator wrapper)
pnpm run test:rules

# Run Playwright end-to-end smoke tests against web application
pnpm run test:e2e
```

---

## 5. Local Service Ports & Endpoints

When running locally, services bind to localhost with no cloud dependencies:

| Service | Local Address | Description |
| :--- | :--- | :--- |
| **React Web Shell** | `http://127.0.0.1:5173` | Aura DIMS frontend web interface |
| **Firebase Emulator UI** | `http://127.0.0.1:4000` | Web dashboard for inspecting emulator data |
| **Authentication Emulator** | `http://127.0.0.1:9099` | Local user authentication service |
| **Cloud Firestore Emulator** | `127.0.0.1:8080` | Document database emulator |
| **Cloud Functions Emulator** | `http://127.0.0.1:5001` | Local Cloud Functions runtime (region: asia-south1) |
| **Cloud Storage Emulator** | `127.0.0.1:9199` | Local media asset bucket emulator |
| **Firebase Hosting Emulator** | `http://127.0.0.1:5000` | Local preview of static assets |

---

## 6. Monorepo Structure

```
aura-dims/
├── apps/
│   └── web/                   # Vite + React application shell & UI components
├── functions/                 # TypeScript Cloud Functions (diagnostic & future privileged APIs)
├── packages/
│   └── display-schema/        # Shared domain types, interfaces & schemas
├── player/                    # Signage player client runtime (documented placeholder)
├── firebase/
│   └── emulators/data/        # Persistent emulator export directory
├── docs/                      # Architectural, data model, and service documentation
├── tests/
│   ├── rules/                 # Vitest Security Rules unit tests
│   └── e2e/                   # Playwright smoke test suite
├── firebase.json              # Firebase service declarations & emulator ports
├── firestore.rules            # Deny-by-default Firestore rules
├── storage.rules              # Deny-by-default Storage rules
├── firestore.indexes.json     # Firestore composite index configuration
└── .firebaserc                # Firebase project aliases (demo-aura-dims default)
```

---

## 7. Legacy Django / PostgreSQL Scaffold Retirement Proposal

During initial workspace inspection, no active Django or PostgreSQL scaffold files were found inside `aura-dims` (the repository was initialized as a clean repository on branch `main`).

In the event that legacy Django/PostgreSQL codebases exist externally or are introduced:
1. **Zero Automated File Deletion:** No legacy source code or historical database tables will be deleted automatically.
2. **Immutable Archiving:** Archive the legacy repository or branch to `archive/legacy-django-backend` with read-only permissions.
3. **Schema Extraction:** Execute `pg_dump --schema-only` to dump table definitions into `docs/legacy-reference/schema.sql` for field-by-field verification against the new Firestore data model.
4. **Data Migration Pipeline:** If legacy display records or user accounts must be preserved, author a one-time migration script using the Firebase Admin SDK to populate Firestore collections in batches.
5. **Infrastructure Deprecation:** Decommission old PostgreSQL databases and Docker containers only after the new Firebase architecture satisfies all production digital signage requirements.

---

## 8. Next Development Milestone

- **Milestone 2:** **Login, User Provisioning, and Role Management**
  - Firebase Authentication with email/password and multi-factor authentication.
  - Role-Based Access Control (Admin and Department Head roles).
  - Explicit assignment of digital displays to Department Heads.
  - Custom claims validation via Cloud Functions Admin SDK.

