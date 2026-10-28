# Aura DIMS - Firebase Services & Regional Architecture

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  

---

## 1. Service Selection & Justification Matrix

Firebase services are incorporated strictly where justified by digital signage requirements. Unnecessary optional products are omitted.

| Service | Included in Foundation | Rationale & Justification |
| :--- | :--- | :--- |
| **Firebase Authentication** | Yes (Emulated) | Centralized authentication for System Admins and Department Heads; issues secure JWT tokens and custom claims. |
| **Cloud Firestore** | Yes (Emulated) | Scalable NoSQL document store for display metadata, site definitions, playlists, schedules, and publication manifests. |
| **Cloud Storage for Firebase** | Yes (Emulated) | Resilient object storage for binary media assets (high-resolution images, videos). Media binaries are never stored directly in Firestore. |
| **Cloud Functions for Firebase (v2)** | Yes (Emulated) | Privileged serverless compute in TypeScript. Enforces role verification, compiles immutable manifests, and executes Admin SDK mutations. |
| **Firebase Hosting** | Yes (Emulated) | Global CDN hosting for the administrative web interface with custom domain and SSL support. |
| **Firebase Emulator Suite** | Yes (Primary) | Complete offline developer environment. Eliminates cloud billing during development and accelerates automated CI verification. |
| **Security Rules** | Yes (Deny-by-default) | Declarative security perimeter enforcing authorization at the database and storage bucket level. |
| **Firestore Indexes** | Yes (Configured) | Declarative composite indexes for targeted queries (e.g. querying active schedules by display ID and date window). |

---

## 1.1 Client Configuration & Secrets Policy

In accordance with enterprise security standards:
- **Zero Hardcoded Keys:** Client source code contains no hardcoded API keys, project identifiers, or secrets.
- **Environment Driven:** All parameters are loaded at build/runtime strictly through `import.meta.env.*` variables defined in `.env.local` or deployment platform secrets.
- **Example Files Use Placeholders:** Public template files (`.env.example`) contain only placeholder values (`your-api-key-placeholder`, etc.).

| Environment Variable | Description | Example Target |
| :--- | :--- | :--- |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `aura-dims` |
| `VITE_FIREBASE_API_KEY` | Client Web API Key | Retrieved from `.env.local` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `aura-dims.firebaseapp.com` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage Bucket URL | `aura-dims.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging Sender ID | Numeric ID |
| `VITE_FIREBASE_APP_ID` | Web Application ID | App ID string |
| `VITE_FIREBASE_MEASUREMENT_ID` | Optional Analytics ID | Measurement ID string |

---

## 2. Deferred & Excluded Services

The following services are intentionally omitted from the current phase:

- **Google Analytics / Firebase Analytics:** Excluded. Aura DIMS is an enterprise digital signage control system, not a consumer web application. User telemetry is captured through structured audit logs in Firestore.
- **Firebase In-App Messaging / AdMob:** Excluded. Irrelevant for enterprise digital signage.
- **Firebase Extensions:** Excluded. Custom business logic is implemented directly in Cloud Functions for tighter governance.
- **Vertex AI / Gemini Extensions:** Excluded. No speculative AI services are provisioned without concrete workflow requirements.

---

## 3. Future Infrastructure Services (Planned for Later Milestones)

1. **Firebase App Check:**
   - Will protect Cloud Functions, Firestore, and Storage endpoints against abuse, unauthorized API callers, and scraping.
   - Client surfaces will utilize reCAPTCHA Enterprise for web portals and Play Integrity / custom attestation for digital display player devices.
2. **Scheduled Cloud Functions (via Cloud Scheduler):**
   - Nightly maintenance jobs to clean up expired publication manifests, archive old audit logs, and reconcile stale display heartbeat states.
3. **Cloud Logging & Monitoring:**
   - Centralized observability capturing function latencies, security exceptions, failed asset downloads, and digital display disconnection events.

---

## 4. Regional Availability & India Region Choices

> [!IMPORTANT]
> **Regional Availability Analysis:**
> Not all Firebase/GCP services are identical in regional distribution. Aura DIMS targets Indian regional infrastructure to minimize network latency to on-premise digital displays across Gujarat and surrounding states (Ahmedabad, Vadodara, Surat, Rajkot).

### 4.1 Primary Region: `asia-south1` (Mumbai)
- **Cloud Firestore:** Regional Firestore database provisioned in `asia-south1` ensures sub-20ms roundtrip latency for control operations across western India.
- **Cloud Functions (2nd Gen):** Deployed to `asia-south1`, co-located with the Firestore database to eliminate cross-region compute-to-database latency.
- **Cloud Storage:** Storage bucket located in `asia-south1` (or dual-region `asia-south1` / `asia-south2` for disaster recovery), minimizing egress latency when displays download heavy video assets.
- **Cloud Scheduler & Tasks:** Native availability in `asia-south1`.

### 4.2 Secondary / DR Region: `asia-south2` (Delhi)
- Reserved for future multi-region disaster recovery and failover storage replication as the fleet expands beyond 100+ digital displays.

### 4.3 Global Services Exceptions
- **Firebase Authentication:** Operates as a globally distributed identity service with transparent edge termination and regional replication.
- **Firebase Hosting:** Global Content Delivery Network (CDN) with edge Points of Presence (PoPs) in Mumbai, Chennai, and Delhi for rapid static asset delivery.

---

## 5. Billing Prerequisites & Cost Drivers

### 5.1 Local Development vs Production Billing
- **Local Development (No Billing Required):** Running against the Firebase Emulator Suite with the demo project ID (`demo-aura-dims`) requires **zero Google Cloud accounts, zero credit cards, and zero billing**.
- **Production (Blaze Plan Prerequisite):**
  - Cloud Functions (2nd generation) uses Google Cloud Run and Google Container Registry/Artifact Registry under the hood. Therefore, deploying Cloud Functions to production requires an active **Firebase Blaze (Pay-as-you-go)** billing account.
  - Spark (free) plan projects cannot deploy Cloud Functions 2nd gen.

### 5.2 Usage-Sensitive Cost Drivers
In accordance with official Google Cloud and Firebase billing policies, running costs are usage-sensitive and cannot be quoted as a static fixed price prior to measuring real workload characteristics:

1. **Storage Volume (GB-months):**
   - Driven by the aggregate size of images, 1080p videos, and motion graphics stored in Cloud Storage.
2. **Network Egress (Bandwidth):**
   - Driven by digital displays downloading publication bundles. For example, 100 digital displays downloading a 500 MB video playlist update consumes 50 GB of network egress.
   - *Mitigation:* The autonomous player's SHA-256 caching architecture ensures assets are downloaded only once, drastically reducing recurring egress costs.
3. **Firestore Document Reads & Writes:**
   - Driven by digital display heartbeat frequencies.
   - *Mitigation:* Heartbeats use coalesced batches and throttle intervals (e.g., 60-120 seconds) rather than high-frequency real-time continuous writes.
4. **Cloud Functions Invocations & Compute Time:**
   - Billed based on vCPU-seconds and GiB-seconds consumed during manifest compilation, image transcoding, and approval webhooks.

