/**
 * Aura DIMS - Core Domain Types & Schemas
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Always use "digital display" in user-facing naming.
 */

export type DisplayOrientation = 'landscape' | 'portrait';

/**
 * Administrative lifecycle of a digital display record.
 * Independent from connectivity (derived from heartbeats) and from
 * application readiness (future publication/playback telemetry).
 */
export type DisplayLifecycle = 'pending_enrollment' | 'active' | 'suspended' | 'retired';

/**
 * Connectivity is DERIVED at read time from `lastHeartbeatAt` and the
 * configured online threshold. It is never stored as a boolean.
 */
export type DisplayConnectivity = 'never_connected' | 'online' | 'offline';

export type ContentLanguage = 'en' | 'gu' | 'hi'; // English, Gujarati, Hindi

export type UserRole = 'admin' | 'department_head';

export type UserStatus = 'active' | 'inactive';

export type DepartmentStatus = 'active' | 'inactive';

export type RecordStatus = 'active' | 'inactive';

export interface Resolution {
  width: number;
  height: number;
}

/** Configured physical site (no sites are seeded; Admins create them). */
export interface Site {
  id: string;
  name: string;
  location: string;
  status: RecordStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Display group. Belongs to exactly one site. Grants NO permissions. */
export interface DisplayGroup {
  id: string;
  name: string;
  siteId: string;
  description: string;
  status: RecordStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  name: string;
  code: string; // e.g., 'HR', 'OPERATIONS', 'SAFETY'
  status: DepartmentStatus;
  siteIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  departmentId: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

/** Values reported by an enrolled device in its last accepted heartbeat. */
export interface DisplayReportedState {
  appVersion: string;
  clientKind: 'player' | 'simulator';
  screenWidth: number | null;
  screenHeight: number | null;
  availableStorageBytes: number | null;
  uptimeSeconds: number | null;
}

/**
 * Digital display record as returned by backend query endpoints.
 * Timestamps are ISO-8601 strings. Credential material is NEVER part of this record.
 */
export interface DigitalDisplay {
  id: string;
  name: string;
  siteId: string;
  locationDescription: string;
  departmentId: string;
  groupIds: string[];
  /** Configured values (set by Admin). */
  orientation: DisplayOrientation;
  configuredResolution: Resolution;
  lifecycle: DisplayLifecycle;
  /** Server receipt time of the last accepted heartbeat. */
  lastHeartbeatAt: string | null;
  reported: DisplayReportedState | null;
  enrolledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Display view enriched with derived connectivity and resolved labels. */
export interface DisplayView extends DigitalDisplay {
  connectivity: DisplayConnectivity;
  siteName: string | null;
  departmentName: string | null;
  groupNames: string[];
}

/**
 * Authoritative assignment record: /displayAssignments/{displayId}__{uid}
 * This is the ONLY source of display access for Department Heads.
 */
export interface DisplayAssignment {
  id: string;
  displayId: string;
  uid: string;
  departmentId: string;
  assignedBy: string;
  assignedAt: string;
}

export interface AssignmentView extends DisplayAssignment {
  userDisplayName: string | null;
  userEmail: string | null;
  userStatus: UserStatus | null;
  displayName: string | null;
  displayLifecycle: DisplayLifecycle | null;
}

export interface EnrollmentState {
  enrolled: boolean;
  pairingCodeActive: boolean;
  pairingCodeExpiresAt: string | null;
}

export type MediaAssetType = 'image' | 'video';

export type MediaProcessingStatus =
  | 'awaiting_upload'
  | 'uploading'
  | 'validating'
  | 'ready'
  | 'failed'
  | 'archived';

export interface MediaDimensions {
  width: number;
  height: number;
}

export const MEDIA_CONSTRAINTS = {
  MAX_IMAGE_SIZE_BYTES: 20 * 1024 * 1024, // 20 MB
  MAX_VIDEO_SIZE_BYTES: 200 * 1024 * 1024, // 200 MB
  MAX_VIDEO_DURATION_SECONDS: 600, // 10 minutes
  MAX_VIDEO_WIDTH: 1920,
  MAX_VIDEO_HEIGHT: 1920,
  MAX_VIDEO_PIXELS: 1920 * 1080,
  MAX_IMAGE_PIXELS: 40_000_000, // 40 Megapixels
  ALLOWED_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png'] as const,
  ALLOWED_VIDEO_MIME_TYPES: ['video/mp4'] as const,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'video/mp4'] as const,
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.mp4'] as const,
  UPLOAD_INTENT_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_TAGS_COUNT: 20,
  MAX_TAG_LENGTH: 30,
} as const;

export interface MediaAsset {
  id: string;
  title: string;
  name?: string;
  description: string;
  tags: string[];
  fileName: string;
  mediaType: MediaAssetType;
  type?: MediaAssetType;
  mimeType: string;
  declaredMimeType?: string;
  fileSizeBytes: number;
  sizeBytes?: number;
  checksumSha256: string;
  dimensions: MediaDimensions;
  durationSeconds: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  departmentId: string;
  ownerId: string;
  uploadedBy?: string;
  uploaderDisplayName: string | null;
  storagePath: string;
  stagingPath?: string;
  thumbnailPath: string;
  status: MediaProcessingStatus;
  failureReason: string | null;
  intentExpiresAt?: string | null;
  language?: ContentLanguage;
  createdAt: string;
  updatedAt: string;
  validatedAt: string | null;
  archivedAt: string | null;
}

export interface PublicationItem {
  id: string;
  type: 'image' | 'video';
  assetId: string;
  assetUrl: string;
  checksumSha256: string;
  durationMs: number;
  sequenceOrder: number;
  language: ContentLanguage;
  fallbackUrl?: string;
}

export interface PublicationManifest {
  manifestVersion: '1.0';
  publicationId: string;
  displayId: string;
  scheduleId: string;
  playlistId: string;
  generatedAt: string;
  expiresAt: string;
  timezone: 'Asia/Kolkata';
  integrity: {
    algorithm: 'sha256';
    checksum: string;
  };
  items: PublicationItem[];
}

export type AuditTargetType =
  | 'user'
  | 'department'
  | 'role'
  | 'site'
  | 'display_group'
  | 'display'
  | 'display_assignment'
  | 'asset'
  | 'schedule'
  | 'playlist'
  | 'publication';

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  targetType: AuditTargetType;
  timestamp: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SystemHealthSummary {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  timestamp: string;
  timezone: string;
  project: string;
  services: {
    auth: boolean;
    firestore: boolean;
    storage: boolean;
    functions: boolean;
  };
}

export interface SystemCounts {
  activeAdminCount: number;
  totalUserCount: number;
  activeDepartmentCount: number;
  updatedAt: string;
}

// ==========================================
// Cloud Function Payloads
// ==========================================

export interface ProvisionUserRequest {
  email: string;
  displayName: string;
  role: UserRole;
  departmentId?: string | null;
}

export interface ProvisionUserResponse {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  departmentId: string | null;
  status: UserStatus;
  setupLink?: string;
}

export interface UpdateUserRequest {
  uid: string;
  displayName?: string;
  role?: UserRole;
  departmentId?: string | null;
}

export interface UpdateUserResponse {
  uid: string;
  displayName: string;
  role: UserRole;
  departmentId: string | null;
  status: UserStatus;
}

export interface SetUserStatusRequest {
  uid: string;
  status: UserStatus;
}

export interface SetUserStatusResponse {
  uid: string;
  status: UserStatus;
}

export interface TriggerPasswordResetRequest {
  email: string;
}

export interface TriggerPasswordResetResponse {
  success: boolean;
  message: string;
  resetLink?: string;
}

export interface CreateDepartmentRequest {
  name: string;
  code: string;
}

export interface CreateDepartmentResponse {
  department: Department;
}

export interface UpdateDepartmentRequest {
  id: string;
  name?: string;
  code?: string;
}

export interface UpdateDepartmentResponse {
  department: Department;
}

export interface SetDepartmentStatusRequest {
  id: string;
  status: DepartmentStatus;
}

export interface SetDepartmentStatusResponse {
  department: Department;
  affectedUserCount: number;
}

// ==========================================
// Milestone 3: Sites, Groups, Displays, Assignments, Enrollment
// ==========================================

export interface CreateSiteRequest { name: string; location: string }
export interface UpdateSiteRequest { id: string; name?: string; location?: string }
export interface SetSiteStatusRequest { id: string; status: RecordStatus }
export interface SiteResponse { site: Site }

export interface CreateDisplayGroupRequest { name: string; siteId: string; description?: string }
export interface UpdateDisplayGroupRequest { id: string; name?: string; description?: string }
export interface SetDisplayGroupStatusRequest { id: string; status: RecordStatus }
export interface DisplayGroupResponse { group: DisplayGroup }

export interface RegisterDisplayRequest {
  name: string;
  siteId: string;
  locationDescription: string;
  departmentId: string;
  groupIds?: string[];
  orientation: DisplayOrientation;
  configuredResolution: Resolution;
}

export interface UpdateDisplayRequest {
  displayId: string;
  name?: string;
  siteId?: string;
  locationDescription?: string;
  departmentId?: string;
  groupIds?: string[];
  orientation?: DisplayOrientation;
  configuredResolution?: Resolution;
}

export interface DisplayMutationResponse {
  display: DisplayView;
  /** Assignments revoked because they became department-incompatible. */
  revokedAssignmentCount?: number;
}

export type DisplayLifecycleAction = 'suspend' | 'reactivate' | 'retire';
export interface SetDisplayLifecycleRequest { displayId: string; action: DisplayLifecycleAction }

export interface ListDisplaysRequest {
  pageSize?: number;
  cursor?: string | null;
  search?: string;
  siteId?: string;
  departmentId?: string;
  /** 'non_retired' (default) | specific lifecycle | 'all' */
  lifecycle?: DisplayLifecycle | 'non_retired' | 'all';
  connectivity?: DisplayConnectivity;
}

export interface ListDisplaysResponse {
  displays: DisplayView[];
  nextCursor: string | null;
  /** True when the server stopped scanning early (bounded scan). */
  scanLimited: boolean;
  thresholds: ConnectivityThresholds;
}

export interface ConnectivityThresholds {
  onlineWindowSeconds: number;
  recommendedHeartbeatSeconds: number;
}

export interface GetDisplayRequest { displayId: string }
export interface GetDisplayResponse {
  display: DisplayView;
  /** Admin only; omitted for Department Heads. */
  assignments?: AssignmentView[];
  /** Admin only; never includes verifiers or credentials. */
  enrollment?: EnrollmentState;
  thresholds: ConnectivityThresholds;
}

export interface AssignDisplayUserRequest { displayId: string; uid: string }
export interface UnassignDisplayUserRequest { displayId: string; uid: string }
export interface AssignmentMutationResponse { assignment: DisplayAssignment | null; removed?: boolean }

export interface ListUserAssignmentsRequest { uid: string }
export interface ListUserAssignmentsResponse { assignments: AssignmentView[] }

export interface GeneratePairingCodeRequest { displayId: string }
export interface GeneratePairingCodeResponse {
  /** Shown once to the Admin. Never stored in plaintext. */
  pairingCode: string;
  expiresAt: string;
}

export interface ResetEnrollmentRequest { displayId: string }

export interface DashboardSummaryResponse {
  scope: 'all' | 'assigned';
  registered: number;
  online: number;
  offline: number;
  neverConnected: number;
  suspended: number;
  pendingEnrollment: number;
  recent: DisplayView[];
  thresholds: ConnectivityThresholds;
  generatedAt: string;
}

// ---- Device protocol (used by real players and the local simulator) ----

export interface RedeemPairingCodeRequest { pairingCode: string }
export interface RedeemPairingCodeResponse {
  displayId: string;
  /** Long-lived device secret. Store securely; never log. */
  deviceSecret: string;
  /** Short-lived Firebase custom token for signInWithCustomToken. */
  customToken: string;
}

export interface DeviceSignInRequest { displayId: string; deviceSecret: string }
export interface DeviceSignInResponse { customToken: string }

export interface DeviceHeartbeatRequest {
  appVersion: string;
  clientKind?: 'player' | 'simulator';
  screen?: { width: number; height: number } | null;
  diagnostics?: { availableStorageBytes?: number; uptimeSeconds?: number } | null;
}

export interface DeviceHeartbeatResponse {
  accepted: true;
  serverReceivedAt: string;
  recommendedHeartbeatSeconds: number;
}

export interface DeviceConfigResponse {
  displayId: string;
  name: string;
  orientation: DisplayOrientation;
  configuredResolution: Resolution;
  lifecycle: DisplayLifecycle;
  recommendedHeartbeatSeconds: number;
}


// ==========================================
// Milestone: Secure Departmental Media Library APIs
// ==========================================

export interface InitiateMediaUploadRequest {
  fileName: string;
  fileSizeBytes: number;
  declaredMimeType: string;
  departmentId?: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface InitiateMediaUploadResponse {
  assetId: string;
  stagingPath: string;
  departmentId: string;
  expiresAt: string;
}

export interface FinalizeMediaUploadRequest {
  assetId: string;
}

export interface FinalizeMediaUploadResponse {
  asset: MediaAsset;
}

export interface GetMediaPreviewUrlRequest {
  assetId: string;
  kind?: 'thumbnail' | 'original';
}

export interface GetMediaPreviewUrlResponse {
  url: string;
  expiresAt: string;
  kind: 'thumbnail' | 'original';
}

export interface UpdateMediaMetadataRequest {
  assetId: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface UpdateMediaMetadataResponse {
  asset: MediaAsset;
}

export interface SetMediaArchivedRequest {
  assetId: string;
  archived: boolean;
}

export interface SetMediaArchivedResponse {
  asset: MediaAsset;
}

export interface ListMediaAssetsRequest {
  departmentId?: string;
  mediaType?: 'all' | 'image' | 'video';
  status?: 'all' | 'ready' | 'validating' | 'failed' | 'archived';
  search?: string;
  pageSize?: number;
  cursor?: string | null;
  includeArchived?: boolean;
}

export interface ListMediaAssetsResponse {
  assets: MediaAsset[];
  nextCursor: string | null;
  totalCount?: number;
}

export interface CleanupExpiredUploadsRequest {
  dryRun?: boolean;
}

export interface CleanupExpiredUploadsResponse {
  scannedCount: number;
  cleanedCount: number;
  details: Array<{
    assetId: string;
    stagingPath: string;
    expiredAt: string;
  }>;
}

// ==========================================
// Milestone: Visual Content Creator & Reusable Templates
// ==========================================

export const DESIGN_CONSTRAINTS = {
  MAX_SLIDES_PER_DESIGN: 20,
  MAX_ELEMENTS_PER_SLIDE: 50,
  MAX_VIDEOS_PER_SLIDE: 1,
  MAX_TITLE_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 1000,
  MIN_SLIDE_DURATION_SECONDS: 1,
  MAX_SLIDE_DURATION_SECONDS: 3600,
  DEFAULT_SLIDE_DURATION_SECONDS: 10,
  LANDSCAPE_DIMENSIONS: { width: 1920, height: 1080 } as const,
  PORTRAIT_DIMENSIONS: { width: 1080, height: 1920 } as const,
  SUPPORTED_FONT_FAMILIES: [
    'Inter',
    'Noto Sans Gujarati',
    'Noto Sans Devanagari',
  ] as const,
  SUPPORTED_SCHEMA_VERSIONS: ['1.0.0'] as const,
};

export type SupportedFontFamily = (typeof DESIGN_CONSTRAINTS.SUPPORTED_FONT_FAMILIES)[number];

export type CanvasElementType = 'text' | 'shape' | 'image' | 'video';

export type ShapeType = 'rectangle' | 'rounded_rectangle' | 'ellipse' | 'line';

export type TextAlignment = 'left' | 'center' | 'right';

export interface BaseCanvasElement {
  id: string;
  type: CanvasElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  opacity: number;
  locked?: boolean;
}

export interface TextElement extends BaseCanvasElement {
  type: 'text';
  content: string;
  fontFamily: SupportedFontFamily;
  fontSize: number;
  fontWeight: 'normal' | 'medium' | 'bold' | 400 | 600 | 700;
  italic?: boolean;
  underline?: boolean;
  color: string;
  textAlign: TextAlignment;
  lineHeight: number;
  letterSpacing: number;
  language?: ContentLanguage;
}

export interface ShapeElement extends BaseCanvasElement {
  type: 'shape';
  shapeType: ShapeType;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius?: number;
}

export interface ImageElement extends BaseCanvasElement {
  type: 'image';
  assetId: string;
  fit: 'contain' | 'cover' | 'fill';
  preserveAspectRatio?: boolean;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface VideoElement extends BaseCanvasElement {
  type: 'video';
  assetId: string;
  fit: 'contain' | 'cover';
  muted: boolean;
  loop: boolean;
  autoDuration?: boolean;
}

export type CanvasElement = TextElement | ShapeElement | ImageElement | VideoElement;

export interface SlideBackground {
  type: 'color' | 'gradient' | 'asset';
  value: string;
  assetId?: string;
}

export interface DesignSlide {
  id: string;
  durationSeconds: number;
  background: SlideBackground;
  elements: CanvasElement[];
}

export interface DesignDocument {
  schemaVersion: '1.0.0';
  orientation: DisplayOrientation;
  dimensions: Resolution;
  slides: DesignSlide[];
}

export type DesignStatus = 'draft' | 'archived';

export interface DesignRecord {
  id: string;
  title: string;
  description: string;
  orientation: DisplayOrientation;
  dimensions: Resolution;
  departmentId: string;
  ownerId: string;
  uploaderDisplayName?: string;
  status: DesignStatus;
  revision: number;
  slideCount: number;
  referencedAssetIds: string[];
  thumbnailSvg?: string | null;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignWithDocument extends DesignRecord {
  document: DesignDocument;
}

export type TemplateScope = 'global' | 'department';
export type TemplateCategory = 'notice' | 'poster' | 'announcement' | 'board';

export interface TemplateRecord {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  scope: TemplateScope;
  departmentId: string | null;
  orientation: DisplayOrientation;
  dimensions: Resolution;
  schemaVersion: string;
  status: 'active' | 'archived';
  document: DesignDocument;
  thumbnailSvg?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDesignRequest {
  title: string;
  description?: string;
  orientation: DisplayOrientation;
  departmentId?: string;
  initialDocument?: DesignDocument;
}

export interface CreateDesignResponse {
  design: DesignWithDocument;
}

export interface GetDesignRequest {
  designId: string;
}

export interface GetDesignResponse {
  design: DesignWithDocument;
}

export interface UpdateDesignRequest {
  designId: string;
  title?: string;
  description?: string;
  expectedRevision: number;
  document: DesignDocument;
  thumbnailSvg?: string;
}

export interface UpdateDesignResponse {
  design: DesignWithDocument;
}

export interface DuplicateDesignRequest {
  designId: string;
  newTitle?: string;
}

export interface DuplicateDesignResponse {
  design: DesignWithDocument;
}

export interface SetDesignArchivedRequest {
  designId: string;
  archived: boolean;
}

export interface SetDesignArchivedResponse {
  design: DesignRecord;
}

export interface ListDesignsRequest {
  departmentId?: string;
  orientation?: DisplayOrientation | 'all';
  status?: DesignStatus | 'all';
  search?: string;
  pageSize?: number;
  cursor?: string | null;
}

export interface ListDesignsResponse {
  designs: DesignRecord[];
  nextCursor: string | null;
  totalCount?: number;
}

export interface ConvertDesignOrientationRequest {
  designId: string;
  targetOrientation: DisplayOrientation;
  expectedRevision: number;
}

export interface ConvertDesignOrientationResponse {
  design: DesignWithDocument;
}

export interface ListTemplatesRequest {
  departmentId?: string;
  category?: TemplateCategory | 'all';
  orientation?: DisplayOrientation | 'all';
  includeArchived?: boolean;
}

export interface ListTemplatesResponse {
  templates: TemplateRecord[];
}

export interface CreateTemplateRequest {
  title: string;
  description?: string;
  category: TemplateCategory;
  scope: TemplateScope;
  departmentId?: string | null;
  document: DesignDocument;
  thumbnailSvg?: string;
}

export interface CreateTemplateResponse {
  template: TemplateRecord;
}

export interface InstantiateTemplateRequest {
  templateId: string;
  title: string;
  departmentId?: string;
}

export interface InstantiateTemplateResponse {
  design: DesignWithDocument;
}

export interface SetTemplateArchivedRequest {
  templateId: string;
  archived: boolean;
}

export interface SetTemplateArchivedResponse {
  template: TemplateRecord;
}

export interface SeedStarterTemplatesRequest {
  dryRun?: boolean;
}

export interface SeedStarterTemplatesResponse {
  createdCount: number;
  updatedCount: number;
  templateIds: string[];
}

/**
 * Validates a DesignDocument against all schema invariants and bounds.
 */
export function validateDesignDocument(doc: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['Document must be an object.'] };
  }

  const d = doc as Partial<DesignDocument>;

  if (!d.schemaVersion || !DESIGN_CONSTRAINTS.SUPPORTED_SCHEMA_VERSIONS.includes(d.schemaVersion as any)) {
    errors.push(`Unsupported or missing schemaVersion: ${d.schemaVersion}`);
  }

  if (d.orientation !== 'landscape' && d.orientation !== 'portrait') {
    errors.push(`Invalid orientation: ${d.orientation}. Must be 'landscape' or 'portrait'.`);
  }

  const expectedDimensions =
    d.orientation === 'landscape'
      ? DESIGN_CONSTRAINTS.LANDSCAPE_DIMENSIONS
      : DESIGN_CONSTRAINTS.PORTRAIT_DIMENSIONS;

  if (
    !d.dimensions ||
    d.dimensions.width !== expectedDimensions.width ||
    d.dimensions.height !== expectedDimensions.height
  ) {
    errors.push(
      `Invalid dimensions for ${d.orientation}: expected ${expectedDimensions.width}x${expectedDimensions.height}, got ${d.dimensions?.width}x${d.dimensions?.height}`
    );
  }

  if (!Array.isArray(d.slides)) {
    errors.push('Document must contain a slides array.');
    return { valid: false, errors };
  }

  if (d.slides.length === 0) {
    errors.push('Design must contain at least one slide.');
  }

  if (d.slides.length > DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN) {
    errors.push(
      `Design exceeds maximum slide limit of ${DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN} (has ${d.slides.length}).`
    );
  }

  const slideIds = new Set<string>();

  d.slides.forEach((slide, sIdx) => {
    if (!slide.id || typeof slide.id !== 'string') {
      errors.push(`Slide #${sIdx + 1} is missing a valid string id.`);
    } else if (slideIds.has(slide.id)) {
      errors.push(`Duplicate slide id detected: ${slide.id}`);
    } else {
      slideIds.add(slide.id);
    }

    if (
      typeof slide.durationSeconds !== 'number' ||
      !Number.isFinite(slide.durationSeconds) ||
      slide.durationSeconds < DESIGN_CONSTRAINTS.MIN_SLIDE_DURATION_SECONDS ||
      slide.durationSeconds > DESIGN_CONSTRAINTS.MAX_SLIDE_DURATION_SECONDS
    ) {
      errors.push(
        `Slide #${sIdx + 1} duration must be between ${DESIGN_CONSTRAINTS.MIN_SLIDE_DURATION_SECONDS} and ${DESIGN_CONSTRAINTS.MAX_SLIDE_DURATION_SECONDS} seconds.`
      );
    }

    if (!Array.isArray(slide.elements)) {
      errors.push(`Slide #${sIdx + 1} elements must be an array.`);
      return;
    }

    if (slide.elements.length > DESIGN_CONSTRAINTS.MAX_ELEMENTS_PER_SLIDE) {
      errors.push(
        `Slide #${sIdx + 1} exceeds maximum element count of ${DESIGN_CONSTRAINTS.MAX_ELEMENTS_PER_SLIDE} (has ${slide.elements.length}).`
      );
    }

    let videoCount = 0;
    const elementIds = new Set<string>();

    slide.elements.forEach((el, eIdx) => {
      if (!el.id || typeof el.id !== 'string') {
        errors.push(`Slide #${sIdx + 1} Element #${eIdx + 1} is missing an id.`);
      } else if (elementIds.has(el.id)) {
        errors.push(`Slide #${sIdx + 1} has duplicate element id: ${el.id}`);
      } else {
        elementIds.add(el.id);
      }

      if (
        !Number.isFinite(el.x) ||
        !Number.isFinite(el.y) ||
        !Number.isFinite(el.width) ||
        !Number.isFinite(el.height) ||
        el.width <= 0 ||
        el.height <= 0
      ) {
        errors.push(
          `Slide #${sIdx + 1} Element ${el.id || eIdx + 1} has invalid geometry (w, h must be > 0 and coordinates finite).`
        );
      }

      if (el.type === 'video') {
        videoCount++;
        if (!el.assetId || typeof el.assetId !== 'string') {
          errors.push(`Slide #${sIdx + 1} Video element ${el.id} is missing an assetId.`);
        }
      } else if (el.type === 'image') {
        if (!el.assetId || typeof el.assetId !== 'string') {
          errors.push(`Slide #${sIdx + 1} Image element ${el.id} is missing an assetId.`);
        }
      } else if (el.type === 'text') {
        if (typeof el.content !== 'string') {
          errors.push(`Slide #${sIdx + 1} Text element ${el.id} is missing content.`);
        }
        if (
          el.fontFamily &&
          !DESIGN_CONSTRAINTS.SUPPORTED_FONT_FAMILIES.includes(el.fontFamily as any)
        ) {
          errors.push(`Slide #${sIdx + 1} Text element ${el.id} uses unsupported font: ${el.fontFamily}`);
        }
      } else if (el.type === 'shape') {
        if (!['rectangle', 'rounded_rectangle', 'ellipse', 'line'].includes(el.shapeType)) {
          errors.push(`Slide #${sIdx + 1} Shape element ${el.id} has unknown shapeType: ${el.shapeType}`);
        }
      } else {
        errors.push(`Slide #${sIdx + 1} Element ${(el as any)?.id || eIdx + 1} has unknown type: ${(el as any)?.type}`);
      }
    });

    if (videoCount > DESIGN_CONSTRAINTS.MAX_VIDEOS_PER_SLIDE) {
      errors.push(
        `Slide #${sIdx + 1} has ${videoCount} video elements. Maximum allowed is ${DESIGN_CONSTRAINTS.MAX_VIDEOS_PER_SLIDE}.`
      );
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Extracts unique referenced asset IDs from a DesignDocument.
 */
export function extractReferencedAssetIds(doc: DesignDocument): string[] {
  const ids = new Set<string>();
  if (!doc?.slides) return [];

  for (const slide of doc.slides) {
    if (slide.background?.type === 'asset' && (slide.background as any).assetId) {
      ids.add((slide.background as any).assetId);
    }
    if (Array.isArray(slide.elements)) {
      for (const el of slide.elements) {
        if ((el.type === 'image' || el.type === 'video') && el.assetId) {
          ids.add(el.assetId);
        }
      }
    }
  }

  return Array.from(ids);
}

