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
  canDirectPublish?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export type PackageDeliveryStage =
  | 'idle'
  | 'discovered'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'active'
  | 'failed';

export interface StorageMetrics {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

export interface PlaybackPresentationState {
  currentPlaylistId: string | null;
  currentSlideId: string | null;
  designRevisionId?: string | null;
  isPlaying: boolean;
  lastSlideStartedAt: string | null;
}

/** Values reported by an enrolled device in its last accepted heartbeat. */
export interface DisplayReportedState {
  appVersion: string;
  clientKind: 'player' | 'simulator';
  screenWidth: number | null;
  screenHeight: number | null;
  availableStorageBytes: number | null;
  uptimeSeconds: number | null;
  desiredPublicationId?: string | null;
  downloadingPublicationId?: string | null;
  readyPublicationId?: string | null;
  activePublicationId?: string | null;
  deliveryStage?: PackageDeliveryStage;
  lastSyncAt?: string | null;
  storage?: StorageMetrics | null;
  playback?: PlaybackPresentationState | null;
  rendererHealth?: 'healthy' | 'stalled' | 'error';
  lastError?: string | null;
  errorCount?: number;
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
  desiredPublicationId?: string | null;
  activePublicationId?: string | null;
  deliveryStage?: PackageDeliveryStage;
  lastSyncAt?: string | null;
  lastDeliveryError?: string | null;
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
  temporaryPassword?: string;
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

export interface GetDevicePublicationRequest {
  displayId: string;
}

export interface GetDevicePublicationResponse {
  displayId: string;
  lifecycle: DisplayLifecycle;
  desiredPublicationId: string | null;
  activePublicationId: string | null;
  orientation: DisplayOrientation;
  configuredResolution: Resolution;
  serverTimestamp: string;
}

export interface GetDevicePublicationManifestRequest {
  displayId: string;
  publicationId: string;
}

export interface GetDevicePublicationManifestResponse {
  manifest: DetailedPublicationManifest;
  assetUrls: Record<string, string>;
}

export interface ReportDeviceDeliveryRequest {
  displayId: string;
  publicationId: string;
  stage: PackageDeliveryStage;
  checksumSha256?: string;
  errorMessage?: string;
}

export interface ReportDeviceDeliveryResponse {
  accepted: boolean;
  serverReceivedAt: string;
}

export interface DeviceHeartbeatRequest {
  displayId?: string;
  appVersion: string;
  clientKind?: 'player' | 'simulator';
  screen?: { width: number; height: number } | null;
  diagnostics?: { availableStorageBytes?: number; uptimeSeconds?: number } | null;
  desiredPublicationId?: string | null;
  downloadingPublicationId?: string | null;
  readyPublicationId?: string | null;
  activePublicationId?: string | null;
  deliveryStage?: PackageDeliveryStage;
  lastSyncAt?: string | null;
  storage?: StorageMetrics | null;
  playback?: PlaybackPresentationState | null;
  rendererHealth?: 'healthy' | 'stalled' | 'error';
  lastError?: string | null;
  errorCount?: number;
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

// ==============================================================================
// Milestone 5: Playlists, Immutable Revisions, Schedules & Publications
// ==============================================================================

export interface DesignRevisionAsset {
  assetId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  storagePath: string;
  thumbnailPath?: string | null;
}

/**
 * Immutable frozen snapshot of a DesignDocument for approval and publishing.
 */
export interface DesignRevision {
  id: string; // UUID
  designId: string;
  revisionNumber: number;
  title: string;
  orientation: DisplayOrientation;
  dimensions: Resolution;
  departmentId: string;
  ownerId: string;
  ownerDisplayName: string | null;
  document: DesignDocument;
  slideCount: number;
  totalDurationSeconds: number;
  referencedAssetIds: string[];
  assetManifest: DesignRevisionAsset[];
  requiredFonts: string[];
  contentHash: string; // SHA-256 of canonical document
  createdAt: string;
  createdBy: string;
}

export interface PlaylistItem {
  id: string; // UUID within playlist
  designId: string;
  designRevisionId?: string;
  title: string;
  orientation: DisplayOrientation;
  slideCount: number;
  durationSeconds: number; // Derived strictly from design slides, no conflicting override!
  order: number;
}

export interface PlaylistRecord {
  id: string;
  title: string;
  description: string;
  departmentId: string;
  orientation: DisplayOrientation;
  items: PlaylistItem[];
  totalDurationSeconds: number;
  isArchived: boolean;
  ownerId: string;
  ownerDisplayName: string | null;
  revision: number; // Monotonic counter for optimistic concurrency
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistRevisionItem {
  designId: string;
  designRevisionId: string;
  title: string;
  slideCount: number;
  durationSeconds: number;
  order: number;
  contentHash: string;
}

export interface PlaylistRevision {
  id: string; // UUID
  playlistId: string;
  revisionNumber: number;
  title: string;
  description: string;
  departmentId: string;
  orientation: DisplayOrientation;
  items: PlaylistRevisionItem[];
  totalDurationSeconds: number;
  referencedAssetIds: string[];
  assetManifest: DesignRevisionAsset[];
  requiredFonts: string[];
  contentHash: string; // Deterministic SHA-256
  createdAt: string;
  createdBy: string;
}

export type ScheduleType = 'one_time' | 'recurring';

export interface ScheduleRule {
  scheduleType: ScheduleType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  daysOfWeek: number[]; // 0-6 (0=Sun, 1=Mon, ..., 6=Sat; used when recurring)
  startTime: string; // HH:mm (24-hour, Asia/Kolkata)
  endTime: string;   // HH:mm (24-hour, Asia/Kolkata)
  isOvernight: boolean; // true if startTime > endTime
  timezone: 'Asia/Kolkata';
  priority: number;  // 1 to 10 (10 = Admin emergency override)
  overrideExpiresAt: string | null; // Mandatory if priority === 10
}

export interface FallbackConfig {
  type: 'bundled' | 'custom';
  designRevisionId?: string | null;
  title?: string;
}

export type ApprovalStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'superseded';

export interface ApprovalDecision {
  reviewerId: string;
  reviewerName: string;
  decidedAt: string;
  decision: 'approved' | 'rejected';
  reason?: string | null;
}

export interface ApprovalHistoryEntry {
  action: 'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';
  actorId: string;
  actorName: string;
  timestamp: string;
  reason?: string | null;
}

export interface ApprovalRecord {
  id: string; // UUID
  playlistRevisionId: string;
  playlistTitle: string;
  departmentId: string;
  departmentName: string | null;
  orientation: DisplayOrientation;
  targetDisplayIds: string[];
  targetDisplayNames: string[];
  scheduleRule: ScheduleRule;
  priority: number;
  fallbackConfig: FallbackConfig;
  status: ApprovalStatus;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  decision: ApprovalDecision | null;
  rejectionReason: string | null;
  history: ApprovalHistoryEntry[];
  scheduleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'active'
  | 'withdrawn'
  | 'superseded'
  | 'expired';

export interface ScheduleRecord {
  id: string;
  title: string;
  departmentId: string;
  departmentName?: string | null;
  playlistRevisionId: string;
  playlistTitle: string;
  approvalId: string | null;
  targetDisplayIds: string[];
  targetDisplayNames?: string[];
  orientation: DisplayOrientation;
  scheduleRule: ScheduleRule;
  fallbackConfig: FallbackConfig;
  status: ScheduleStatus;
  publishedPublicationId?: string | null;
  publicationStatus?: PublicationStatus | null;
  ownerId: string;
  ownerDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PublicationStatus =
  | 'preparing'
  | 'prepared'
  | 'preparation_failed'
  | 'withdrawn'
  | 'superseded';

export interface PublicationRecord {
  id: string; // UUID
  manifestVersion: '1.0';
  displayId: string;
  displayName: string;
  scheduleId: string;
  playlistRevisionId: string;
  departmentId: string;
  orientation: DisplayOrientation;
  storagePath: string; // packages/{displayId}/{publicationId}/manifest.json
  manifestChecksumSha256: string;
  status: PublicationStatus;
  failureReason?: string | null;
  idempotencyKey: string;
  generatedAt: string;
  expiresAt: string;
  timezone: 'Asia/Kolkata';
  createdAt: string;
  updatedAt: string;
}

export interface DetailedPublicationManifest {
  manifestVersion: '1.0';
  publicationId: string;
  displayId: string;
  scheduleId: string;
  playlistRevisionId: string;
  generatedAt: string;
  expiresAt: string;
  timezone: 'Asia/Kolkata';
  orientation: DisplayOrientation;
  integrity: {
    algorithm: 'sha256';
    checksum: string;
  };
  scheduleRule: ScheduleRule;
  playlist: {
    title: string;
    totalDurationSeconds: number;
    items: Array<{
      designRevisionId: string;
      title: string;
      durationSeconds: number;
      slides: DesignSlide[];
    }>;
  };
  assets: DesignRevisionAsset[];
  fonts: Array<{
    family: string;
    weights: number[];
  }>;
  fallback: {
    type: 'bundled' | 'custom';
    title: string;
    slides: DesignSlide[];
  };
}

// ==============================================================================
// Schedule Evaluator & Conflict Detector
// ==============================================================================

export interface KolkataTimeComponents {
  year: number;
  month: string;      // '01'-'12'
  day: string;        // '01'-'31'
  dateString: string; // 'YYYY-MM-DD'
  dayOfWeek: number;  // 0-6 (0=Sun, 1=Mon, ..., 6=Sat)
  hours: number;
  minutes: number;
  timeString: string; // 'HH:mm'
}

/**
 * Deterministically converts any UTC/ISO date string into exact Asia/Kolkata (UTC+05:30) components.
 * Independent of the host system timezone.
 */
export function getKolkataTimeComponents(isoOrDate: string | Date): KolkataTimeComponents {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const utcMs = date.getTime();
  const kolkataOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const kDate = new Date(utcMs + kolkataOffsetMs);

  const year = kDate.getUTCFullYear();
  const month = String(kDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kDate.getUTCDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;
  const dayOfWeek = kDate.getUTCDay();
  const hours = kDate.getUTCHours();
  const minutes = kDate.getUTCMinutes();
  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  return { year, month, day, dateString, dayOfWeek, hours, minutes, timeString };
}

/**
 * Checks whether a single ScheduleRule is active at a given target date and time in Asia/Kolkata.
 */
export function isScheduleRuleActiveAtTime(
  rule: ScheduleRule,
  kTime: KolkataTimeComponents,
  targetIso: string
): boolean {
  // Check overall date validity window [startDate, endDate]
  if (kTime.dateString < rule.startDate || kTime.dateString > rule.endDate) {
    // If it's overnight and we are in early morning (< endTime), yesterday might be within [startDate, endDate]
    if (rule.isOvernight && kTime.timeString < rule.endTime) {
      const yesterday = new Date(new Date(targetIso).getTime() - 24 * 60 * 60 * 1000);
      const yTime = getKolkataTimeComponents(yesterday);
      if (yTime.dateString < rule.startDate || yTime.dateString > rule.endDate) {
        return false;
      }
    } else {
      return false;
    }
  }

  // Check Admin override expiry if priority is 10
  if (rule.priority === 10) {
    if (!rule.overrideExpiresAt) return false;
    if (new Date(targetIso).getTime() > new Date(rule.overrideExpiresAt).getTime()) {
      return false;
    }
  }

  if (rule.scheduleType === 'one_time') {
    if (rule.startDate === rule.endDate) {
      if (kTime.dateString !== rule.startDate) return false;
      return kTime.timeString >= rule.startTime && kTime.timeString < rule.endTime;
    } else {
      // Multi-day one-time window
      const startIso = `${rule.startDate}T${rule.startTime}:00+05:30`;
      const endIso = `${rule.endDate}T${rule.endTime}:00+05:30`;
      const targetMs = new Date(targetIso).getTime();
      return targetMs >= new Date(startIso).getTime() && targetMs < new Date(endIso).getTime();
    }
  }

  // Recurring schedule
  if (!rule.isOvernight) {
    // Daytime window on matching days of week
    if (!rule.daysOfWeek.includes(kTime.dayOfWeek)) return false;
    return kTime.timeString >= rule.startTime && kTime.timeString < rule.endTime;
  } else {
    // Overnight window (e.g. 22:00 to 06:00)
    // 1. Current time is >= startTime (belongs to today's recurrence)
    if (kTime.timeString >= rule.startTime) {
      return rule.daysOfWeek.includes(kTime.dayOfWeek);
    }
    // 2. Current time is < endTime (belongs to yesterday's recurrence)
    if (kTime.timeString < rule.endTime) {
      const yesterdayDayOfWeek = (kTime.dayOfWeek + 6) % 7;
      return rule.daysOfWeek.includes(yesterdayDayOfWeek);
    }
    return false;
  }
}

export type ScheduleEvaluationResult =
  | {
      status: 'active';
      schedule: ScheduleRecord;
      isAdminOverride: boolean;
    }
  | {
      status: 'conflict';
      conflictingSchedules: ScheduleRecord[];
      message: string;
    }
  | {
      status: 'fallback';
      fallbackConfig: FallbackConfig;
      bundledFallback: { title: string; slides: DesignSlide[] };
    };

/**
 * Shared schedule evaluator: evaluates what content should play on a digital display at a specific instant.
 * Used by UI preview, conflict detection, publication preparation, and future playback.
 */
export function evaluateScheduleAtTime(params: {
  schedules: ScheduleRecord[];
  displayId: string;
  targetIsoString: string;
  displayOrientation: DisplayOrientation;
  fallbackConfig?: FallbackConfig;
}): ScheduleEvaluationResult {
  const { schedules, displayId, targetIsoString, displayOrientation, fallbackConfig } = params;
  const kTime = getKolkataTimeComponents(targetIsoString);

  // Filter schedules that target this digital display and are in active/approved state
  const candidateSchedules = schedules.filter(
    (s) =>
      s.targetDisplayIds.includes(displayId) &&
      (s.status === 'active' || s.status === 'approved') &&
      s.orientation === displayOrientation
  );

  const activeMatches: ScheduleRecord[] = [];

  for (const s of candidateSchedules) {
    if (isScheduleRuleActiveAtTime(s.scheduleRule, kTime, targetIsoString)) {
      activeMatches.push(s);
    }
  }

  if (activeMatches.length === 0) {
    return {
      status: 'fallback',
      fallbackConfig: fallbackConfig || { type: 'bundled' },
      bundledFallback: getBundledNeutralFallback(displayOrientation),
    };
  }

  // Sort by priority descending
  activeMatches.sort((a, b) => b.scheduleRule.priority - a.scheduleRule.priority);

  const firstMatch = activeMatches[0];
  if (!firstMatch) {
    return {
      status: 'fallback',
      fallbackConfig: fallbackConfig || { type: 'bundled' },
      bundledFallback: getBundledNeutralFallback(displayOrientation),
    };
  }

  const highestPriority = firstMatch.scheduleRule.priority;
  const highestMatches = activeMatches.filter((s) => s.scheduleRule.priority === highestPriority);

  if (highestMatches.length > 1) {
    return {
      status: 'conflict',
      conflictingSchedules: highestMatches,
      message: `Conflict detected on digital display ${displayId}: ${highestMatches.length} schedules overlap with equal priority (${highestPriority}) at ${kTime.dateString} ${kTime.timeString} (Asia/Kolkata).`,
    };
  }

  const winner = highestMatches[0] || firstMatch;
  return {
    status: 'active',
    schedule: winner,
    isAdminOverride: winner.scheduleRule.priority === 10,
  };
}

export interface ScheduleConflictResult {
  hasConflict: boolean;
  conflicts: Array<{
    date: string;
    time: string;
    displayId: string;
    conflictingScheduleIds: string[];
    conflictingTitles: string[];
    priority: number;
  }>;
}

/**
 * Scans schedules across their validity span to detect equal-priority collisions on a digital display.
 */
export function detectScheduleConflicts(
  schedules: ScheduleRecord[],
  displayId: string,
  displayOrientation: DisplayOrientation
): ScheduleConflictResult {
  const conflicts: ScheduleConflictResult['conflicts'] = [];
  const activeSchedules = schedules.filter(
    (s) =>
      s.targetDisplayIds.includes(displayId) &&
      (s.status === 'active' || s.status === 'approved') &&
      s.orientation === displayOrientation
  );

  if (activeSchedules.length < 2) {
    return { hasConflict: false, conflicts: [] };
  }

  // Determine span of dates to sample
  let minDate = '9999-12-31';
  let maxDate = '0000-01-01';

  for (const s of activeSchedules) {
    if (s.scheduleRule.startDate < minDate) minDate = s.scheduleRule.startDate;
    if (s.scheduleRule.endDate > maxDate) maxDate = s.scheduleRule.endDate;
  }

  // Sample check boundaries and intermediate points
  const timePoints = [
    '00:00', '06:00', '08:00', '09:00', '12:00', '13:00', '15:00', '17:00', '18:00', '21:00', '22:00', '23:30',
  ];

  // Collect distinct dates to check (up to 30 days ahead from today or span)
  const today = getKolkataTimeComponents(new Date()).dateString;
  const startCheck = minDate > today ? minDate : today;
  const datesToCheck: string[] = [];

  const startDateObj = new Date(`${startCheck}T00:00:00+05:30`);
  for (let i = 0; i < 30; i++) {
    const cur = new Date(startDateObj.getTime() + i * 24 * 60 * 60 * 1000);
    const kCur = getKolkataTimeComponents(cur);
    if (kCur.dateString > maxDate) break;
    datesToCheck.push(kCur.dateString);
  }

  for (const d of datesToCheck) {
    for (const t of timePoints) {
      const iso = `${d}T${t}:00+05:30`;
      const evalResult = evaluateScheduleAtTime({
        schedules: activeSchedules,
        displayId,
        targetIsoString: iso,
        displayOrientation,
      });

      if (evalResult.status === 'conflict') {
        const ids = evalResult.conflictingSchedules.map((s) => s.id);
        const alreadyFound = conflicts.some(
          (c) => c.displayId === displayId && c.conflictingScheduleIds.sort().join() === ids.sort().join()
        );
        if (!alreadyFound) {
          conflicts.push({
            date: d,
            time: t,
            displayId,
            conflictingScheduleIds: ids,
            conflictingTitles: evalResult.conflictingSchedules.map((s) => s.title),
            priority: evalResult.conflictingSchedules[0]?.scheduleRule.priority ?? 5,
          });
        }
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Validates a ScheduleRule for consistency and completeness.
 */
export function validateScheduleRule(rule: ScheduleRule): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!rule.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(rule.startDate)) {
    errors.push('Start date must be in YYYY-MM-DD format.');
  }
  if (!rule.endDate || !/^\d{4}-\d{2}-\d{2}$/.test(rule.endDate)) {
    errors.push('End date must be in YYYY-MM-DD format.');
  }
  if (rule.startDate && rule.endDate && rule.startDate > rule.endDate) {
    errors.push('Start date cannot be after end date.');
  }

  if (!rule.startTime || !/^\d{2}:\d{2}$/.test(rule.startTime)) {
    errors.push('Start time must be in HH:mm format.');
  }
  if (!rule.endTime || !/^\d{2}:\d{2}$/.test(rule.endTime)) {
    errors.push('End time must be in HH:mm format.');
  }
  if (rule.startTime === rule.endTime) {
    errors.push('Start time and end time cannot be identical.');
  }

  if (rule.scheduleType === 'recurring') {
    if (!Array.isArray(rule.daysOfWeek) || rule.daysOfWeek.length === 0) {
      errors.push('Recurring schedules must select at least one day of the week.');
    } else if (rule.daysOfWeek.some((d) => d < 0 || d > 6)) {
      errors.push('Days of the week must be integers between 0 (Sunday) and 6 (Saturday).');
    }
  }

  if (rule.priority < 1 || rule.priority > 10) {
    errors.push('Priority must be an integer between 1 and 10.');
  }

  if (rule.priority === 10) {
    if (!rule.overrideExpiresAt) {
      errors.push('Admin emergency overrides (priority 10) must specify a mandatory expiration timestamp.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates playlist items for orientation compatibility and non-empty items.
 */
export function validatePlaylist(playlist: {
  title: string;
  orientation: DisplayOrientation;
  items: PlaylistItem[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!playlist.title || playlist.title.trim().length === 0) {
    errors.push('Playlist title cannot be blank.');
  }
  if (playlist.items.length === 0) {
    errors.push('Playlist must contain at least one visual design.');
  }

  const incompatible = playlist.items.filter((item) => item.orientation !== playlist.orientation);
  if (incompatible.length > 0) {
    const firstBad = incompatible[0]?.orientation || 'incompatible';
    errors.push(
      `This playlist is formatted for ${playlist.orientation} digital displays. To broadcast ${firstBad} designs, please create a separate playlist with matching orientation.`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns a bundled neutral corporate fallback slide when no custom fallback is provisioned.
 * Guarantees that digital displays never encounter black or unrenderable states.
 */
export function getBundledNeutralFallback(orientation: DisplayOrientation): {
  title: string;
  slides: DesignSlide[];
} {
  return {
    title: 'Aura DIMS Corporate Neutral Fallback',
    slides: [
      {
        id: 'fallback-slide-default',
        durationSeconds: 15,
        background: {
          type: 'gradient',
          value: 'linear-gradient(135deg, #090d16 0%, #0f172a 100%)',
        },
        elements: [
          {
            id: 'fallback-brand-title',
            name: 'Brand Title',
            type: 'text',
            content: 'Aura DIMS',
            x: orientation === 'landscape' ? 120 : 80,
            y: orientation === 'landscape' ? 440 : 800,
            width: orientation === 'landscape' ? 1680 : 920,
            height: 120,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            fontSize: orientation === 'landscape' ? 72 : 56,
            fontFamily: 'Inter',
            fontWeight: 700,
            color: '#14b8a6',
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: 0,
            language: 'en',
          },
          {
            id: 'fallback-company-subtitle',
            name: 'Company Subtitle',
            type: 'text',
            content: 'Aurainteract Private Limited • Enterprise Digital Signage',
            x: orientation === 'landscape' ? 120 : 80,
            y: orientation === 'landscape' ? 580 : 940,
            width: orientation === 'landscape' ? 1680 : 920,
            height: 60,
            rotation: 0,
            opacity: 0.8,
            zIndex: 2,
            fontSize: orientation === 'landscape' ? 28 : 24,
            fontFamily: 'Inter',
            fontWeight: 400,
            color: '#94a3b8',
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: 0,
            language: 'en',
          },
        ],
      },
    ],
  };
}

// ==============================================================================
// Callable Cloud Functions API Interfaces for Milestone 5
// ==============================================================================

export interface CreateDesignRevisionRequest {
  designId: string;
}

export interface CreateDesignRevisionResponse {
  revision: DesignRevision;
}

export interface ListDesignRevisionsRequest {
  designId?: string;
  departmentId?: string;
  limit?: number;
}

export interface ListDesignRevisionsResponse {
  revisions: DesignRevision[];
}

export interface GetDesignRevisionRequest {
  revisionId: string;
}

export interface GetDesignRevisionResponse {
  revision: DesignRevision;
}

export interface CreatePlaylistRequest {
  title: string;
  description: string;
  departmentId: string;
  orientation: DisplayOrientation;
  items: Array<{
    id?: string;
    designId: string;
    designRevisionId?: string;
    title: string;
    orientation: DisplayOrientation;
    slideCount: number;
    durationSeconds: number;
    order: number;
  }>;
}

export interface CreatePlaylistResponse {
  playlist: PlaylistRecord;
}

export interface UpdatePlaylistRequest {
  playlistId: string;
  title: string;
  description: string;
  items: Array<{
    id?: string;
    designId: string;
    designRevisionId?: string;
    title: string;
    orientation: DisplayOrientation;
    slideCount: number;
    durationSeconds: number;
    order: number;
  }>;
  revision: number;
}

export interface UpdatePlaylistResponse {
  playlist: PlaylistRecord;
}

export interface GetPlaylistRequest {
  playlistId: string;
}

export interface GetPlaylistResponse {
  playlist: PlaylistRecord;
}

export interface ListPlaylistsRequest {
  departmentId?: string;
  orientation?: DisplayOrientation;
  includeArchived?: boolean;
  limit?: number;
}

export interface ListPlaylistsResponse {
  playlists: PlaylistRecord[];
}

export interface SetPlaylistArchivedRequest {
  playlistId: string;
  isArchived: boolean;
}

export interface SetPlaylistArchivedResponse {
  playlistId: string;
  isArchived: boolean;
}

export interface CreatePlaylistRevisionRequest {
  playlistId: string;
}

export interface CreatePlaylistRevisionResponse {
  revision: PlaylistRevision;
}

export interface GetPlaylistRevisionRequest {
  revisionId: string;
}

export interface GetPlaylistRevisionResponse {
  revision: PlaylistRevision;
}

export interface CreateScheduleRequest {
  title: string;
  departmentId: string;
  playlistRevisionId: string;
  playlistTitle: string;
  targetDisplayIds: string[];
  orientation: DisplayOrientation;
  scheduleRule: ScheduleRule;
  fallbackConfig: FallbackConfig;
}

export interface CreateScheduleResponse {
  schedule: ScheduleRecord;
}

export interface UpdateScheduleRequest {
  scheduleId: string;
  title: string;
  playlistRevisionId: string;
  playlistTitle: string;
  targetDisplayIds: string[];
  scheduleRule: ScheduleRule;
  fallbackConfig: FallbackConfig;
}

export interface UpdateScheduleResponse {
  schedule: ScheduleRecord;
}

export interface GetScheduleRequest {
  scheduleId: string;
}

export interface GetScheduleResponse {
  schedule: ScheduleRecord;
}

export interface ListSchedulesRequest {
  departmentId?: string;
  displayId?: string;
  status?: ScheduleStatus;
  limit?: number;
}

export interface ListSchedulesResponse {
  schedules: ScheduleRecord[];
}

export interface SetScheduleStatusRequest {
  scheduleId: string;
  status: ScheduleStatus;
}

export interface SetScheduleStatusResponse {
  scheduleId: string;
  status: ScheduleStatus;
}

export interface SubmitForApprovalRequest {
  scheduleId: string;
}

export interface SubmitForApprovalResponse {
  approval: ApprovalRecord;
  schedule: ScheduleRecord;
}

export interface ReviewApprovalRequest {
  approvalId: string;
  decision: 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface ReviewApprovalResponse {
  approval: ApprovalRecord;
  schedule: ScheduleRecord;
}

export interface WithdrawApprovalRequest {
  approvalId: string;
  reason?: string;
}

export interface WithdrawApprovalResponse {
  approval: ApprovalRecord;
  schedule: ScheduleRecord;
}

export interface ListApprovalsRequest {
  departmentId?: string;
  status?: ApprovalStatus;
  limit?: number;
}

export interface ListApprovalsResponse {
  approvals: ApprovalRecord[];
}

export interface GetApprovalRequest {
  approvalId: string;
}

export interface GetApprovalResponse {
  approval: ApprovalRecord;
}

export interface PreparePublicationRequest {
  scheduleId: string;
  idempotencyKey: string;
}

export interface PreparePublicationResponse {
  publication: PublicationRecord;
  manifest: DetailedPublicationManifest;
  targetedDisplayCount: number;
}

export interface RollbackPublicationRequest {
  displayId: string;
  targetPublicationId: string;
}

export interface RollbackPublicationResponse {
  displayId: string;
  activePublicationId: string;
}

export interface SetUserDirectPublishPermissionRequest {
  userId: string;
  canDirectPublish: boolean;
}

export interface SetUserDirectPublishPermissionResponse {
  userId: string;
  canDirectPublish: boolean;
}

export interface EvaluateSchedulePreviewRequest {
  displayId: string;
  targetIsoString: string;
}

export interface EvaluateSchedulePreviewResponse {
  evaluation: ScheduleEvaluationResult;
}


