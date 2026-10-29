# Aura DIMS - Staging Deployment & Operations Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Document Version:** 1.0.0  
**Target Environment:** Staging (`aura-dims-staging`)  

---

## 1. Staging Purpose & Guiding Principles

The staging environment provides a high-fidelity replica of production operating on live Google Cloud and Firebase infrastructure in `asia-south1` (Mumbai, India). It serves to validate cloud-specific behaviors that cannot be fully verified in the local Firebase Emulator Suite:
1. Cloud Storage trigger latencies and signed URL lifecycles.
2. Cloud Functions v2 cold-start performance and container concurrency on Google Cloud Run.
3. Live Firestore composite index query optimization.
4. Fastly-backed Firebase Hosting CDN cache behavior, SSL termination, and Content Security Policy enforcement.
5. Real hardware digital display pairing, persistent caching, and network resilience.

> [!IMPORTANT]
> **Strict Pre-Condition:** No cloud projects, billing accounts, or deployments will be created or modified until the specific staging target and associated financial/cloud approvals are formally granted by the stakeholder. All local preparations are completed and verified in advance.

---

## 2. Proposed Staging Target & Cloud Architecture

### Project Identification
- **Proposed Project ID:** `aura-dims-staging`
- **Fallback Project IDs (if globally taken):** `aura-dims-stage-mumbai`, `aura-dims-stg-in`
- **Display Name:** `Aura DIMS Staging`
- **Target Organization / Folder:** Aurainteract Private Limited

### Regional Data Residency Plan
All stateful and compute resources are pinned to the Indian subcontinent:

| Service | Selected Region | Data Residency Rationale | Changeability |
| :--- | :--- | :--- | :--- |
| **Cloud Firestore** | `asia-south1` (Mumbai) | Ultra-low read/write latency (<15ms) across Indian enterprise sites; compliance with data sovereignty principles. | **IMMUTABLE** (Cannot be changed after database creation) |
| **Cloud Storage** | `asia-south1` (Mumbai) | Collocated with Firestore and Cloud Functions to eliminate cross-region data egress charges and minimize asset download latency. | **IMMUTABLE** (Bucket location is fixed upon creation) |
| **Cloud Functions (v2)** | `asia-south1` (Mumbai) | Co-located with data storage; zero inter-region network traversal. | Configurable per function (default in code: `asia-south1`) |
| **Firebase Auth** | Global | Google Identity platform automatically routes authentication globally with edge caching. | Global service |
| **Firebase Hosting** | Global Edge CDN | Global Fastly Anycast edge CDN with local Points of Presence (PoPs) in Mumbai, Delhi, and Chennai. | Edge-replicated |

---

## 3. Billing Architecture & Financial Safeguards

### Billing Plan Requirement
- **Plan:** Firebase Blaze (Pay-as-you-go).
- **Prerequisite Justification:** Cloud Functions (2nd Generation) run as containerized services on Google Cloud Run, requiring Google Cloud Build and Google Artifact Registry, which are only accessible on the Blaze billing tier.

### Staging Usage Assumptions & Cost Modeling

| Resource Dimension | Staging Assumption | Free Tier Allowance | Monthly Charge Estimate |
| :--- | :--- | :--- | :--- |
| **Active Dashboard Users** | 3 to 5 users (1 Admin, 2 Dept Heads, QA) | Unlimited | $0.00 |
| **Enrolled Digital Displays** | 2 pilot units (1 Landscape, 1 Portrait) | N/A | $0.00 |
| **Heartbeat Frequency** | 30s to 60s per digital display (~5,760 calls/day) | 2,000,000 Function calls/mo | $0.00 (within free tier) |
| **Daily Firestore Writes** | ~6,000 writes/day | 20,000 writes/day free | $0.00 (within free tier) |
| **Daily Firestore Reads** | ~12,000 reads/day | 50,000 reads/day free | $0.00 (within free tier) |
| **Cloud Storage Volume** | 10–20 test assets (~200 MB total) | 5 GB free tier | $0.00 (within free tier) |
| **Network Egress** | ~5 GB/month (digital display downloads) | 10 GB/month free | $0.00 (within free tier) |
| **Artifact Registry** | 2 Function container images (~1.2 GB) | 500 MB free tier | **~$0.10 to $0.30 / month** |
| **TOTAL ESTIMATE** | — | — | **< $1.00 USD / month** |

### Usage & Cost Safeguards

> [!WARNING]
> Google Cloud Billing Budget Alerts notify administrators via email and webhooks but **do not automatically shut down services**. Hard architectural limits have been implemented in the codebase to prevent runaway consumption:

1. **Budget Threshold Alerts:**
   - Level 1: $5.00 USD (Notification to Engineering)
   - Level 2: $10.00 USD (Warning to Project Lead)
   - Level 3: $25.00 USD (Executive Review / Pilot Freeze)
2. **Function Instance Capping:** All Cloud Functions default to `maxInstances: 10` to prevent sudden concurrent scale-out during testing.
3. **Memory Quotas:** Fleet APIs run at 256MiB; `finalizeMediaUpload` is capped at 1GiB with a 120-second timeout.
4. **Media Upload Ceiling:** Hard 200 MB maximum file size enforced in `storage.rules` and `mediaAdmin.ts`.
5. **Log Retention:** Stackdriver / Cloud Logging configured to 30-day retention to avoid log volume storage charges.

---

## 4. Environment Separation & Secret Hygiene

### Separation Invariants
- **Local Development:** Strictly targets `demo-aura-dims` against local emulators (`127.0.0.1`).
- **Staging:** Targets `aura-dims-staging` on live Google Cloud infrastructure.
- **Production:** Target `aura-dims-prod` (completely segregated; separate billing, separate IAM, separate database).

### Public Configuration vs. Secret Credentials

```
┌────────────────────────────────────────────────────────┐
│ PUBLIC CLIENT ENVIRONMENT (apps/web/.env.staging)      │
│ - VITE_FIREBASE_PROJECT_ID (aura-dims-staging)         │
│ - VITE_FIREBASE_API_KEY (Browser client identifier)    │
│ - VITE_FIREBASE_AUTH_DOMAIN                            │
│ - VITE_FIREBASE_STORAGE_BUCKET                         │
│ - VITE_USE_FIREBASE_EMULATOR=false                     │
│ * Safe to include in frontend build output             │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ BACKEND SECRETS (Google Cloud Secret Manager)          │
│ - AURA_CREDENTIAL_PEPPER (32+ byte CSPRNG hex secret)   │
│ * NEVER exposed in client environment, logs, or git    │
└────────────────────────────────────────────────────────┘
```

---

## 5. Security & Network Perimeter Review

### Firestore Security Perimeter
- Deny-by-default on all collections (`match /{document=**} { allow read, write: if false; }`).
- Authenticated human read access strictly partitioned by user role and `departmentId`.
- Direct client writes to sensitive collections (`/users`, `/auditEvents`, `/displays`, `/displayAssignments`, `/designs`, `/playlists`, `/schedules`, `/publications`, `/approvals`) are **100% blocked**. All mutations must execute via backend Cloud Functions.

### Cloud Storage Security Perimeter
- Deny-by-default across all buckets.
- Staging directory `/staging/{departmentId}/{assetId}/{fileName}`: write-once, read-only to Admin or assigned Department Head.
- Permanent verified media `/media/{departmentId}/{assetId}/{fileName}`: direct client writes forbidden; readable only by authorized department users or verified digital displays via time-limited signed URLs.

### Web Hosting & Content Security Policy (CSP)
Defined in `firebase.json`:
- `X-Frame-Options: DENY`: Complete clickjacking prevention.
- `X-Content-Type-Options: nosniff`: MIME-sniffing protection.
- `Strict Content Security Policy`:
  ```
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com;
  img-src 'self' data: blob: https://*.googleapis.com https://*.google.com;
  media-src 'self' blob: https://*.googleapis.com;
  connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';
  ```
- Cache Policies:
  - `/assets/**`: `public, max-age=31536000, immutable` (cache-busting via Vite hash).
  - `index.html`: `no-cache, no-store, must-revalidate` (instant version deployment).

---

## 6. Step-by-Step Staging Deployment Runbook

Once the staging project is approved and provisioned, execute the following commands in sequence:

### Phase 1: Pre-Flight Verification
```bash
# 1. Strict TypeScript validation across all workspaces
pnpm run typecheck

# 2. Security Rules unit tests against emulators
pnpm run test:rules

# 3. Schedule evaluation boundary verification
pnpm vitest run tests/acceptance/schedule-evaluation.test.ts

# 4. Full 18-step user journey verification
pnpm vitest run tests/acceptance/e2e-user-journey.test.ts
```

### Phase 2: Project Binding & Secret Configuration
```bash
# Authenticate with authorized Google Account
firebase login

# Set active project alias to staging
firebase use staging

# Verify active project
firebase projects:list

# Provision backend credential pepper secret in Google Cloud Secret Manager
firebase functions:secrets:set AURA_CREDENTIAL_PEPPER -P staging
```

### Phase 3: Infrastructure Deployment (Database & Storage)
```bash
# 1. Deploy Firestore composite indexes
pnpm run deploy:staging:indexes

# 2. Deploy Firestore and Cloud Storage security rules
pnpm run deploy:staging:rules
```

### Phase 4: Backend Compute Deployment (Cloud Functions v2)
```bash
# Deploy Cloud Functions to asia-south1
pnpm run deploy:staging:functions
```

### Phase 5: Web Frontend Deployment (Firebase Hosting)
```bash
# Build Vite web bundle in staging mode and deploy to Hosting
pnpm run deploy:staging:hosting
```

### Phase 6: Staging Initialization & Fixture Seeding
```bash
# 1. Bootstrap the first Staging Administrator
AURA_STAGING_CONFIRM=true AURA_STAGING_PROJECT_ID=aura-dims-staging node scripts/bootstrap-staging-admin.ts

# 2. Seed initial isolated staging test dataset (Departments, Dept Heads, Site, Digital Displays)
AURA_STAGING_CONFIRM=true AURA_STAGING_PROJECT_ID=aura-dims-staging node scripts/seed-staging.ts
```

---

## 7. Rollback & Disaster Recovery Runbook

| Failure Scenario | Recovery Action | Estimated RTO |
| :--- | :--- | :--- |
| **Frontend Regressions** | `pnpm run rollback:staging:hosting` (Instantly reverts Hosting CDN pointer to previous release) | < 1 minute |
| **Cloud Function Defect** | Redeploy previous stable release tag via `git checkout <tag> && pnpm run deploy:staging:functions` | 3 to 5 minutes |
| **Security Rules Regression** | Redeploy known secure rules commit via `firebase deploy --only firestore:rules,storage:rules -P staging` | < 1 minute |
| **Defective Publication Version** | Admin navigates to Schedule details in Dashboard and clicks **Withdraw Schedule**; target digital displays revert to neutral fallback instantly. | < 30 seconds |
| **Corrupted Digital Display State** | Delete `player/data/packages/active.json` on digital display appliance; player automatically restores from `player/data/packages/previous.json` or fallback. | < 10 seconds |

---

## 8. Staging Pilot Acceptance Checklist

Upon completion of staging deployment, verify the following acceptance gates:
- [ ] Staging Web Dashboard loads over HTTPS at `https://aura-dims-staging.web.app` with zero CSP console errors.
- [ ] Admin logs in via `admin.staging@aurainteract.com` and sees both staging departments (`STG-MFG`, `STG-ENG`).
- [ ] Manufacturing Department Head uploads a valid test PNG and MP4 video; server returns `ready` status with SHA-256 checksum.
- [ ] Visual design created and saved with multi-lingual fonts (Gujarati, Hindi, English).
- [ ] Playlist and recurring schedule submitted for editorial review.
- [ ] Admin reviews and approves exact publication package.
- [ ] Digital display pairing code generated and redeemed by physical pilot digital display player.
- [ ] Digital display downloads package, verifies SHA-256 checksums, and begins scheduled playback in `Asia/Kolkata` time.
- [ ] 24-hour offline playback resilience verified with network disconnected.
- [ ] Scheduled withdrawal verified; digital display displays corporate neutral fallback.

