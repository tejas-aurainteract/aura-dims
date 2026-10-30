# Aura DIMS - Production Deployment Specification & Release Guide

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Document Version:** 1.0.0  
**Target Environment:** Production (`aura-dims-prod`)  

---

## 1. Production Release Governance

This document establishes the formal production deployment specification for Aura DIMS. Production represents the isolated live environment hosting genuine enterprise user credentials, real digital display appliance pairing records, client-approved notices, and production broadcast manifests.

> [!CAUTION]
> **Strict Pre-Condition for Production Cloud Mutations:**
> Production resources (`aura-dims-prod`) will NOT be created, billed, modified, or populated with live data until explicit formal stakeholder sign-off is granted. All preparations, compilation checks, quality gates, and deployment manifests must be completed in advance.

---

## 2. Target Production Architecture & Configuration

### 2.1 Project Identification & Domain
- **Firebase / GCP Project ID:** `aura-dims-prod`
- **GCP Project Display Name:** `Aura DIMS Production`
- **Hosting URL:** `https://aura-dims.web.app` / `https://aura-dims.firebaseapp.com`
- **Approved Custom Domain (Proposed):** `dims.aurainteract.com` (Requires DNS CNAME record to Fastly CDN)
- **Vercel Web Shell (Optional Mirror):** `https://aura-dims.vercel.app` (Configured via production environment variables)

### 2.2 Regional Data Sovereignty
To comply with enterprise data residency standards and ensure sub-15ms latency across Indian digital display networks, all stateful services are strictly pinned to India:

| Cloud Service | Selected Region | Data Residency Standard | Changeability |
| :--- | :--- | :--- | :--- |
| **Cloud Firestore** | `asia-south1` (Mumbai) | Enterprise database storing users, departments, sites, digital displays, designs, and schedules. | **IMMUTABLE** |
| **Cloud Storage** | `asia-south1` (Mumbai) | Default bucket `aura-dims-prod.firebasestorage.app` storing media assets and publication manifests. | **IMMUTABLE** |
| **Cloud Functions (2nd Gen)** | `asia-south1` (Mumbai) | 73 callable backend microservices running on Google Cloud Run. | Configured via `CALLABLE_OPTS` |
| **Google Cloud Build** | `asia-south1` (Mumbai) | Container packaging environment for Cloud Functions deployment. | Regionalized |
| **Artifact Registry** | `asia-south1` (Mumbai) | Docker image storage for Cloud Run service revisions. | Regionalized |
| **Firebase Auth** | Global | Identity platform with Indian edge routing. | Global |
| **Firebase Hosting** | Global Fastly Edge | Edge Points of Presence in Mumbai, Delhi, and Chennai. | Edge-replicated |

---

## 3. Financial Plan & Cost Safeguards

### 3.1 Firebase Blaze Billing Plan
- **Tier:** Pay-as-you-go (Blaze).
- **Prerequisite Justification:** Google Cloud Functions 2nd Generation and Cloud Run require billing enablement for Artifact Registry and container build compute.
- **Estimated Pilot Operating Cost:** Less than **$2.00 USD / month** for 2 pilot digital displays and up to 5 users under standard operational volumes (fully within monthly free allowances of 2M function invocations and 5GB Storage).

### 3.2 Usage Limits & Hard Architectural Safeguards
1. **Google Cloud Billing Budget Thresholds:**
   - Level 1: $10.00 USD (Warning to Delivery Lead)
   - Level 2: $25.00 USD (Escalation to Engineering Director)
   - Level 3: $50.00 USD (Executive Review / Operational Freeze)
2. **Compute Instance Capping:** All 73 functions configured with `maxInstances: 10` to eliminate runaway scaling spikes.
3. **Memory Limits:** Standard functions run at 256 MiB; `finalizeMediaUpload` is allocated 1 GiB memory with a 120-second timeout.
4. **Media Ingestion Ceiling:** Hard 200 MB maximum file size enforced in `storage.rules` and `mediaAdmin.ts`.
5. **No Data Re-use:** Zero synthetic test records or staging device tokens may be copied into production.

---

## 4. Release Quality Gate Confirmation

Before executing production deployment commands, the codebase must pass all 6 quality gates:

| Quality Gate | Required Standard | Current Result | Status |
| :--- | :--- | :--- | :--- |
| **1. Strict Typecheck** | 0 TypeScript errors across monorepo workspaces | 0 errors (`pnpm run typecheck`) | **PASSED** |
| **2. Production Builds** | Minified bundles without source maps or dev hooks | 4/4 packages built (`dist/` & `lib/`) | **PASSED** |
| **3. Security Rules** | 63 automated tests verifying deny-by-default & isolation | 63/63 tests passed (`pnpm run test:rules`) | **PASSED** |
| **4. Schedule Math** | 24 boundary tests verifying `Asia/Kolkata` evaluation | 24/24 tests passed (`schedule-evaluation.test.ts`) | **PASSED** |
| **5. E2E User Journey** | Complete 18-step user journey with offline player verification | 18/18 steps passed (`e2e-user-journey.test.ts`) | **PASSED** |
| **6. Zero Leaked Secrets** | Zero private keys, service accounts, or hardcoded passwords in git | Verified clean | **PASSED** |

---

## 5. Production Deployment Sequence

Once formal stakeholder approval is recorded:

```powershell
# Step 1: Confirm Active Firebase Project Alias
firebase use aura-dims-prod

# Step 2: Deploy Firestore Security Rules & Composite Indexes
firebase deploy --only firestore:rules,firestore:indexes --project aura-dims-prod

# Step 3: Deploy Cloud Storage Perimeter Security Rules
firebase deploy --only storage --project aura-dims-prod

# Step 4: Build & Deploy 2nd Generation Cloud Functions
pnpm run build:functions
firebase deploy --only functions --project aura-dims-prod

# Step 5: Grant Cloud Run Public Invoker Policy Across All Services
node scripts/grant-all-functions-invoker.mjs

# Step 6: Deploy Production Web Dashboard Shell to Firebase Hosting
pnpm --filter @aura-dims/web build:production
firebase deploy --only hosting --project aura-dims-prod

# Step 7: Bootstrap Initial Production Administrator (One-Time Explicit Command)
node --experimental-strip-types scripts/bootstrap-admin.ts --live --email "admin@aurainteract.com"
```

---

## 6. Backup, Disaster Recovery & Business Continuity

### 6.1 Data Protection Architecture
1. **Firestore Automated Backups:**
   - Daily scheduled backups configured via Google Cloud Scheduler invoking Cloud Datastore export API to a dedicated cold bucket (`gs://aura-dims-prod-backups-asia-south1`).
   - 30-day retention policy with object versioning enabled.
2. **Cloud Storage Asset Durability:**
   - Permanent media assets (`media/{deptId}/{assetId}/`) are stored with Standard Multi-Regional/Regional 99.999999999% (11 9's) durability.
   - Soft-delete enabled with a 7-day retention window to protect against accidental administrative deletion.
3. **Configuration & Secrets:**
   - Security rules, composite indexes, and Cloud Run specs are version-controlled in git.
   - Device enrollment signing keys are managed in Cloud Secret Manager.

### 6.2 Recovery Objectives
- **Recovery Point Objective (RPO):** Maximum 24 hours for Firestore documents; 0 hours for immutable publication assets stored in Cloud Storage.
- **Recovery Time Objective (RTO):** Full database restore and Cloud Functions redeployment within 60 minutes.
- **Autonomous Digital Display Immunity:** Even during a complete catastrophic cloud outage, all digital displays continue autonomous offline playback indefinitely from their local Content-Addressable Cache (CAC).

---

## 7. Rollback Protocol

If a release defect is discovered post-deployment:

1. **Web Dashboard Rollback:**
   ```powershell
   firebase hosting:rollback --project aura-dims-prod
   ```
2. **Cloud Functions Rollback:**
   - Redeploy the previous verified release tag from git.
   - Individual Cloud Run services can be instantly rolled back to the previous revision via Cloud Console if isolated to a single microservice.
3. **Database Rules Rollback:**
   - Rules are version-controlled; redeploy previous `firestore.rules` via `firebase deploy --only firestore:rules`.
   - Never weaken rules or bypass departmental isolation as a quick-fix shortcut.
4. **Notice Rollback on Digital Displays:**
   - Administrators use the web dashboard to withdraw the schedule or approve a replacement publication.
   - Digital displays automatically download and atomically switch to the updated manifest upon their next check-in.

