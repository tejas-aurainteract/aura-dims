# AGENTS.md - Developer & Agent Guide for Aura DIMS

**Company:** Aurainteract Private Limited  
**Product:** Aura DIMS (Aura Digital Information Management System)  
**System Purpose:** Enterprise Digital Signage and Content Management Platform  

---

## 1. Ground Rules & Behavioral Guidelines

1. **Terminology Requirement:**
   - Always use the term **"digital display"** in all user-facing copy, logs, documentation, and UI components. Never use bare words like "screen", "monitor", or "TV".
2. **Strict Emulator Mode for Local Development:**
   - All local development and tests execute strictly against the Firebase Emulator Suite using the demo project ID `demo-aura-dims`.
   - Never fall back silently to live Google Cloud or Firebase services.
   - Never commit or inject service account JSON credentials into client applications.
3. **Privileged Operations Boundary:**
   - Frontend client SDK performs reads and permitted draft edits only within authorized bounds.
   - Privileged operations (role assignment, digital display enrollment, publishing immutable manifests, approving content) MUST be executed through backend Cloud Functions using the Firebase Admin SDK.
   - Cloud Functions using the Admin SDK bypass Security Rules; therefore, **functions must implement explicit authorization checks** before mutating data.
4. **Offline Signage Playback Integrity:**
   - Client digital display players operate autonomously using local hardware clocks in `Asia/Kolkata`.
   - Slide transitions and schedule evaluations NEVER depend on live network pings or Cloud Functions.
   - Downloaded assets must be verified via SHA-256 before atomic publication manifest activation.
5. **No Speculative Deployments or Costs:**
   - Never claim fixed running costs before usage is measured. Explain usage-sensitive drivers and Blaze plan prerequisites clearly.

---

## 2. Monorepo Structure

```
aura-dims/
├── apps/
│   └── web/                   # Vite + React + TypeScript + Tailwind shell
├── functions/                 # Firebase Cloud Functions (v2) in TypeScript
├── packages/
│   └── display-schema/        # Shared domain types, interfaces & schemas
├── player/                    # Placeholder for future digital display client runtime
├── firebase/
│   └── emulators/data/        # Persistent emulator export directory
├── docs/                      # Architectural, data model, and service documentation
├── tests/
│   ├── rules/                 # Vitest Security Rules unit tests
│   └── e2e/                   # Playwright smoke test suite
├── firebase.json              # Firebase services and emulator configuration
├── firestore.rules            # Deny-by-default Firestore rules
├── storage.rules              # Deny-by-default Storage rules
├── firestore.indexes.json     # Firestore composite indexes definition
└── .firebaserc                # Firebase project aliases (demo-aura-dims default)
```

---

## 3. Core Developer Commands

| Action | Command | Purpose |
| :--- | :--- | :--- |
| **Install Dependencies** | `pnpm install` | Install monorepo dependencies |
| **Start Everything** | `pnpm run dev` | Concurrently starts Emulators & React dev server |
| **Start Emulators Only** | `pnpm run emulators:start` | Runs Auth, Firestore, Functions, Storage emulators with persistence |
| **Export Emulator Data** | `pnpm run emulators:export`| Saves current emulator state to `firebase/emulators/data` |
| **Typecheck All** | `pnpm run typecheck` | Strict TypeScript validation across all workspaces |
| **Build All** | `pnpm run build` | Builds display-schema, functions, and web app |
| **Security Rules Tests** | `pnpm run test:rules` | Runs Vitest tests against running emulators |
| **E2E Smoke Tests** | `pnpm run test:e2e` | Runs Playwright browser smoke test suite |

---

## 4. Current Milestone vs Next Milestone

- **Current Completed Milestone:** Foundation & Local Firebase Emulator Suite setup, monorepo scaffolding, deny-by-default security rules, diagnostic probe, and placeholder application shell.
- **Next Milestone:** **Login, user provisioning, and role management** (Authentication flows, Admin vs Department Head role provisioning, and custom claims).

