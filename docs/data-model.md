# Aura DIMS - Firestore Data Architecture & Collection Design

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  

---

## 1. Core Principles & Governance

1. **Separation of Editable Drafts vs. Immutable Publications:**
   - Content authoring (designs, slide layouts, playlists) takes place inside mutable draft documents.
   - When a playlist is approved for broadcast, a Cloud Function compiles an **immutable, versioned publication manifest** stored in `/publications/{publicationId}`.
   - Digital displays read *only* immutable publications, shielding screens from live editing side-effects.
2. **Zero Binary Storage in Firestore:**
   - Document payloads are restricted strictly to structured metadata, coordinates, typography styles, and storage references. All media binaries (images, videos) reside in Cloud Storage.
3. **Bounded Reads & Targeted Queries:**
   - Client applications never perform unbounded queries across root collections.
   - Queries enforce query limits (`limit(25)`), pagination via `startAfter()`, and compound filters indexed via `firestore.indexes.json`.
4. **Auditability & Non-Repudiation:**
   - Security-sensitive actions (role updates, display assignments, content approvals, deletions) produce append-only audit records written exclusively via Cloud Functions.

---

## 2. Proposed Collection Hierarchy & Schema Definitions

### 2.1 `/users/{userId}`
Stores user profile information and administrative metadata.
- **Fields:**
  - `id`: string (Firebase Auth UID)
  - `email`: string
  - `displayName`: string
  - `role`: `'admin' | 'department_head'`
  - `departmentId`: string | null (assigned department)
  - `assignedDisplayIds`: string[] (explicitly assigned digital displays)
  - `createdAt`: Timestamp
  - `updatedAt`: Timestamp
- **Access Pattern:** Read by user; updated strictly via Cloud Functions.

### 2.2 `/departments/{departmentId}`
Organizational departments grouping content and users.
- **Fields:**
  - `id`: string (e.g. `'hr'`, `'operations'`, `'safety'`)
  - `name`: string (e.g. `'Human Resources'`)
  - `code`: string (e.g. `'HR'`)
  - `siteIds`: string[]
  - `createdAt`: Timestamp
- **Access Pattern:** Read by authenticated users; managed by System Admin.

### 2.3 `/sites/{siteId}`
Physical enterprise facilities.
- **Fields:**
  - `id`: string (e.g. `'ahmedabad-hq'`, `'vadodara-plant-1'`)
  - `name`: string (e.g. `'Vadodara Manufacturing Complex'`)
  - `location`: string (e.g. `'Vadodara, Gujarat'`)
  - `timezone`: string (always `'Asia/Kolkata'`)
  - `createdAt`: Timestamp
- **Access Pattern:** Read by authenticated users; managed by System Admin.

### 2.4 `/displays/{displayId}`
Digital display hardware inventory.
- **Fields:**
  - `id`: string (e.g. `'disp-ahd-01'`)
  - `name`: string (e.g. `'Main Lobby Reception'`)
  - `siteId`: string
  - `departmentId`: string
  - `orientation`: `'landscape' | 'portrait'`
  - `resolution`: `{ width: number, height: number }` (e.g. 1920×1080)
  - `status`: `'online' | 'offline' | 'unregistered'`
  - `ipAddress`: string | null
  - `currentPublicationId`: string | null
  - `assignedUserIds`: string[] (authorized Department Heads)
  - `lastPingAt`: Timestamp | null
  - `enrolledAt`: Timestamp
- **Access Pattern:** Queried by site or department with pagination.

### 2.5 `/assignments/{assignmentId}`
Explicit mappings of Department Heads to specific digital displays.
- **Fields:**
  - `id`: string
  - `userId`: string
  - `displayId`: string
  - `grantedBy`: string (Admin UID)
  - `grantedAt`: Timestamp
- **Access Pattern:** Read by assigned user; created/revoked exclusively via Admin Cloud Function.

### 2.6 `/assets/{assetId}`
Media library asset metadata and governance records.
- **Fields:**
  - `id`: string (UUID or server-allocated asset identifier)
  - `name`: string (Display name or normalized filename)
  - `fileName`: string (Original uploaded file name with extension)
  - `fileSizeBytes`: number (File size in bytes; max 20 MB for images, 200 MB for videos)
  - `mimeType`: string (`image/jpeg` | `image/png` | `video/mp4`)
  - `mediaType`: `'image' | 'video'`
  - `storagePath`: string (Permanent storage path: `media/{departmentId}/{assetId}/{fileName}`)
  - `thumbnailPath`: string | null (Derived thumbnail path: `thumbnails/{departmentId}/{assetId}/thumb.webp`)
  - `stagingPath`: string | null (Allocated upload staging path, cleared upon finalization)
  - `checksumSha256`: string | null (SHA-256 cryptographic checksum for offline digital display verification)
  - `dimensions`: `{ width: number, height: number }` | null (Image or video dimensions)
  - `durationSeconds`: number | null (Video duration in seconds; max 600 seconds)
  - `videoCodec`: string | null (Validated video stream codec, e.g. `'h264'`)
  - `audioCodec`: string | null (Validated audio stream codec, e.g. `'aac'` or null for silent)
  - `departmentId`: string (Organizational departmental boundary)
  - `ownerId`: string (UID of uploading user)
  - `uploaderDisplayName`: string | null (Display name of uploader)
  - `status`: `'awaiting_upload' | 'validating' | 'ready' | 'failed' | 'archived'`
  - `failureReason`: string | null (Diagnostic feedback if server-side validation rejected the asset)
  - `title`: string (Descriptive title; max 120 chars)
  - `description`: string (Descriptive text; max 1000 chars)
  - `tags`: string[] (Categorization tags; max 10 tags, 30 chars each)
  - `intentExpiresAt`: string | null (ISO timestamp for staging upload intent expiration; default 2 hours)
  - `createdAt`: string (ISO timestamp)
  - `updatedAt`: string (ISO timestamp)
- **Access Pattern & Indexes:**
  - Compound indexed queries in `firestore.indexes.json`:
    - `(departmentId ASC, createdAt DESC)`
    - `(departmentId ASC, mediaType ASC, createdAt DESC)`
    - `(departmentId ASC, status ASC, createdAt DESC)`
    - `(status ASC, intentExpiresAt ASC)`
  - Direct client writes are forbidden (`allow write: if false;`); mutations execute via Cloud Functions.
  - Read access is strictly scoped: Admin has global access; Department Head is restricted to their assigned department.

### 2.7 `/templates/{templateId}`
Reusable starter layouts and organizational template structures.
- **Fields:**
  - `id`: string (UUID or slug like `'announcement-landscape'`)
  - `title`: string (Descriptive template name; max 120 chars)
  - `description`: string (Descriptive overview; max 1000 chars)
  - `category`: `'announcements' | 'metrics' | 'notices' | 'branding' | 'general'`
  - `orientation`: `'landscape' | 'portrait'`
  - `dimensions`: `{ width: number, height: number }` (1920×1080 or 1080×1920)
  - `thumbnailUrl`: string | null (Preview thumbnail URL)
  - `supportedLanguages`: Array<'en' | 'gu' | 'hi'>
  - `departmentId`: string | null (null = global system template accessible to all departments)
  - `document`: `DesignDocument` (Canonical versioned design document definition)
  - `isArchived`: boolean (soft-archive toggle)
  - `isSystemTemplate`: boolean (true for built-in starter templates)
  - `createdBy`: string (UID or `'system'`)
  - `createdAt`: string (ISO timestamp)
  - `updatedAt`: string (ISO timestamp)
- **Access Pattern & Indexes:**
  - Read: Authenticated users can read global system templates (`departmentId == null`) and templates assigned to their department. Admin can read all templates.
  - Write: Direct client writes denied (`allow write: if false;`). Created and archived via Cloud Functions.
  - Compound indexed queries in `firestore.indexes.json`:
    - `(isArchived ASC, createdAt DESC)`
    - `(departmentId ASC, isArchived ASC, createdAt DESC)`
    - `(category ASC, isArchived ASC, createdAt DESC)`

### 2.8 `/designs/{designId}`
Editable slide compositions and visual signage designs created in the studio.
- **Fields:**
  - `id`: string (UUID)
  - `title`: string (Display title; max 120 chars)
  - `orientation`: `'landscape' | 'portrait'`
  - `dimensions`: `{ width: number, height: number }` (1920×1080 or 1080×1920)
  - `departmentId`: string (Organizational departmental boundary)
  - `ownerId`: string (UID of author)
  - `ownerDisplayName`: string | null
  - `document`: `DesignDocument` (The complete versioned design document)
    - `version`: `'1.0'`
    - `canvas`: `{ width: number, height: number, orientation: 'landscape' | 'portrait' }`
    - `slides`: Array<`DesignSlide`>
      - `id`: string (Stable UUID)
      - `durationSeconds`: number (Slide dwell time; 1s to 300s, default 10s)
      - `background`: `{ type: 'solid' | 'gradient' | 'image', value: string, assetId?: string }`
      - `elements`: Array<`CanvasElement`> (Ordered list of slide elements)
        - `id`: string (Stable UUID)
        - `type`: `'text' | 'shape' | 'image' | 'video'`
        - `x`: number (Logical pixel X position)
        - `y`: number (Logical pixel Y position)
        - `width`: number (Logical pixel width)
        - `height`: number (Logical pixel height)
        - `rotation`: number (Degrees 0 to 359)
        - `opacity`: number (0 to 1)
        - `zIndex`: number (Layer ordering index)
        - Type-specific properties:
          - *Text:* `content`, `fontSize`, `fontFamily` (`'Inter' | 'Noto Sans Gujarati' | 'Noto Sans Devanagari'`), `fontWeight`, `fontStyle`, `color`, `textAlign`, `verticalAlign`, `language` (`'en' | 'gu' | 'hi'`)
          - *Shape:* `shapeType` (`'rectangle' | 'circle' | 'line'`), `fillColor`, `strokeColor`, `strokeWidth`, `borderRadius`
          - *Image / Video:* `assetId` (Immutable pointer to `/assets/{assetId}`), `objectFit` (`'contain' | 'cover' | 'fill'`), `mediaType`, `durationSeconds`, `dimensions`
  - `slideCount`: number (Total number of slides; max 50 slides per design)
  - `revision`: number (Optimistic concurrency version number, incremented monotonically on every update)
  - `isArchived`: boolean (Soft-archive toggle)
  - `templateSourceId`: string | null (ID of template if instantiated from one)
  - `createdAt`: string (ISO timestamp)
  - `updatedAt`: string (ISO timestamp)
- **Access Pattern & Indexes:**
  - Read: Scoped to department for Department Heads; global for System Administrators.
  - Write: Direct client writes denied (`allow write: if false;`). Mutations executed exclusively through Cloud Functions with caller role verification and revision concurrency conflict checking.
  - Compound indexed queries in `firestore.indexes.json`:
    - `(departmentId ASC, isArchived ASC, updatedAt DESC)`
    - `(isArchived ASC, updatedAt DESC)`
    - `(departmentId ASC, orientation ASC, isArchived ASC, updatedAt DESC)`

### 2.9 `/playlists/{playlistId}`
Ordered sequence of content slides and display timings.
- **Fields:**
  - `id`: string
  - `name`: string
  - `departmentId`: string
  - `items`: Array<{ designId: string, durationMs: number, order: number }>
  - `totalDurationMs`: number
  - `status`: `'draft' | 'pending_approval' | 'approved'`
  - `updatedAt`: Timestamp
- **Access Pattern:** Filtered by `departmentId` and `status`.

### 2.10 `/schedules/{scheduleId}`
Calendar distribution rules mapping playlists to target digital displays.
- **Fields:**
  - `id`: string
  - `name`: string
  - `playlistId`: string
  - `targetDisplayIds`: string[]
  - `siteId`: string
  - `timezone`: `'Asia/Kolkata'`
  - `startDate`: string (YYYY-MM-DD)
  - `endDate`: string (YYYY-MM-DD)
  - `dayOfWeek`: number[] (0-6)
  - `startTime`: string (HH:mm)
  - `endTime`: string (HH:mm)
  - `priority`: number (1=normal, 10=emergency)
  - `createdAt`: Timestamp
- **Access Pattern:** Queried by target display ID and date window.

### 2.11 `/publications/{publicationId}`
**Immutable, compiled publication manifest** for digital display player execution.
- **Fields:**
  - `id`: string (UUID)
  - `manifestVersion`: `'1.0'`
  - `displayId`: string
  - `scheduleId`: string
  - `playlistId`: string
  - `generatedAt`: Timestamp
  - `expiresAt`: Timestamp
  - `timezone`: `'Asia/Kolkata'`
  - `integrity`: `{ algorithm: 'sha256', checksum: string }`
  - `items`: Array<{
      id: string,
      type: 'image' | 'video',
      assetUrl: string,
      checksumSha256: string,
      durationMs: number,
      sequenceOrder: number,
      fallbackUrl?: string
    }>
- **Access Pattern:** Fetched by digital display players upon polling or push notification. Once created, never updated.

### 2.12 `/approvals/{approvalId}`
Editorial approval records.
- **Fields:**
  - `id`: string
  - `playlistId`: string
  - `requestedBy`: string (User UID)
  - `status`: `'pending' | 'approved' | 'rejected'`
  - `reviewedBy`: string | null (Admin / Department Head UID)
  - `reviewedAt`: Timestamp | null
  - `comments`: string | null
- **Access Pattern:** Queried by pending status.

### 2.13 `/auditEvents/{eventId}`
Append-only compliance audit trail.
- **Fields:**
  - `id`: string
  - `actorId`: string (UID or `'system'`)
  - `action`: string (e.g. `'display.assigned'`, `'content.published'`)
  - `resourceType`: string
  - `resourceId`: string
  - `timestamp`: Timestamp
  - `metadata`: Record<string, unknown>
- **Access Pattern:** Write-only via Cloud Functions Admin SDK; queryable only by System Admin.

