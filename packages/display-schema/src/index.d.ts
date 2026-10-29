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
export type ContentLanguage = 'en' | 'gu' | 'hi';
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
    code: string;
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
export type PackageDeliveryStage = 'idle' | 'discovered' | 'downloading' | 'verifying' | 'ready' | 'active' | 'failed';
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
export type MediaProcessingStatus = 'awaiting_upload' | 'uploading' | 'validating' | 'ready' | 'failed' | 'archived';
export interface MediaDimensions {
    width: number;
    height: number;
}
export declare const MEDIA_CONSTRAINTS: {
    readonly MAX_IMAGE_SIZE_BYTES: number;
    readonly MAX_VIDEO_SIZE_BYTES: number;
    readonly MAX_VIDEO_DURATION_SECONDS: 600;
    readonly MAX_VIDEO_WIDTH: 1920;
    readonly MAX_VIDEO_HEIGHT: 1920;
    readonly MAX_VIDEO_PIXELS: number;
    readonly MAX_IMAGE_PIXELS: 40000000;
    readonly ALLOWED_IMAGE_MIME_TYPES: readonly ["image/jpeg", "image/png"];
    readonly ALLOWED_VIDEO_MIME_TYPES: readonly ["video/mp4"];
    readonly ALLOWED_MIME_TYPES: readonly ["image/jpeg", "image/png", "video/mp4"];
    readonly ALLOWED_EXTENSIONS: readonly [".jpg", ".jpeg", ".png", ".mp4"];
    readonly UPLOAD_INTENT_EXPIRY_MS: number;
    readonly MAX_TITLE_LENGTH: 100;
    readonly MAX_DESCRIPTION_LENGTH: 500;
    readonly MAX_TAGS_COUNT: 20;
    readonly MAX_TAG_LENGTH: 30;
};
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
export type AuditTargetType = 'user' | 'department' | 'role' | 'site' | 'display_group' | 'display' | 'display_assignment' | 'asset' | 'schedule' | 'playlist' | 'publication';
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
export interface CreateSiteRequest {
    name: string;
    location: string;
}
export interface UpdateSiteRequest {
    id: string;
    name?: string;
    location?: string;
}
export interface SetSiteStatusRequest {
    id: string;
    status: RecordStatus;
}
export interface SiteResponse {
    site: Site;
}
export interface CreateDisplayGroupRequest {
    name: string;
    siteId: string;
    description?: string;
}
export interface UpdateDisplayGroupRequest {
    id: string;
    name?: string;
    description?: string;
}
export interface SetDisplayGroupStatusRequest {
    id: string;
    status: RecordStatus;
}
export interface DisplayGroupResponse {
    group: DisplayGroup;
}
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
export interface SetDisplayLifecycleRequest {
    displayId: string;
    action: DisplayLifecycleAction;
}
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
export interface GetDisplayRequest {
    displayId: string;
}
export interface GetDisplayResponse {
    display: DisplayView;
    /** Admin only; omitted for Department Heads. */
    assignments?: AssignmentView[];
    /** Admin only; never includes verifiers or credentials. */
    enrollment?: EnrollmentState;
    thresholds: ConnectivityThresholds;
}
export interface AssignDisplayUserRequest {
    displayId: string;
    uid: string;
}
export interface UnassignDisplayUserRequest {
    displayId: string;
    uid: string;
}
export interface AssignmentMutationResponse {
    assignment: DisplayAssignment | null;
    removed?: boolean;
}
export interface ListUserAssignmentsRequest {
    uid: string;
}
export interface ListUserAssignmentsResponse {
    assignments: AssignmentView[];
}
export interface GeneratePairingCodeRequest {
    displayId: string;
}
export interface GeneratePairingCodeResponse {
    /** Shown once to the Admin. Never stored in plaintext. */
    pairingCode: string;
    expiresAt: string;
}
export interface ResetEnrollmentRequest {
    displayId: string;
}
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
export interface RedeemPairingCodeRequest {
    pairingCode: string;
}
export interface RedeemPairingCodeResponse {
    displayId: string;
    /** Long-lived device secret. Store securely; never log. */
    deviceSecret: string;
    /** Short-lived Firebase custom token for signInWithCustomToken. */
    customToken: string;
}
export interface DeviceSignInRequest {
    displayId: string;
    deviceSecret: string;
}
export interface DeviceSignInResponse {
    customToken: string;
}
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
    screen?: {
        width: number;
        height: number;
    } | null;
    diagnostics?: {
        availableStorageBytes?: number;
        uptimeSeconds?: number;
    } | null;
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
export declare const DESIGN_CONSTRAINTS: {
    MAX_SLIDES_PER_DESIGN: number;
    MAX_ELEMENTS_PER_SLIDE: number;
    MAX_VIDEOS_PER_SLIDE: number;
    MAX_TITLE_LENGTH: number;
    MAX_DESCRIPTION_LENGTH: number;
    MIN_SLIDE_DURATION_SECONDS: number;
    MAX_SLIDE_DURATION_SECONDS: number;
    DEFAULT_SLIDE_DURATION_SECONDS: number;
    LANDSCAPE_DIMENSIONS: {
        readonly width: 1920;
        readonly height: 1080;
    };
    PORTRAIT_DIMENSIONS: {
        readonly width: 1080;
        readonly height: 1920;
    };
    SUPPORTED_FONT_FAMILIES: readonly ["Inter", "Noto Sans Gujarati", "Noto Sans Devanagari"];
    SUPPORTED_SCHEMA_VERSIONS: readonly ["1.0.0"];
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
export declare function validateDesignDocument(doc: unknown): {
    valid: boolean;
    errors: string[];
};
/**
 * Extracts unique referenced asset IDs from a DesignDocument.
 */
export declare function extractReferencedAssetIds(doc: DesignDocument): string[];
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
    id: string;
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
    contentHash: string;
    createdAt: string;
    createdBy: string;
}
export interface PlaylistItem {
    id: string;
    designId: string;
    designRevisionId?: string;
    title: string;
    orientation: DisplayOrientation;
    slideCount: number;
    durationSeconds: number;
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
    revision: number;
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
    id: string;
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
    contentHash: string;
    createdAt: string;
    createdBy: string;
}
export type ScheduleType = 'one_time' | 'recurring';
export interface ScheduleRule {
    scheduleType: ScheduleType;
    startDate: string;
    endDate: string;
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    isOvernight: boolean;
    timezone: 'Asia/Kolkata';
    priority: number;
    overrideExpiresAt: string | null;
}
export interface FallbackConfig {
    type: 'bundled' | 'custom';
    designRevisionId?: string | null;
    title?: string;
}
export type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';
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
    id: string;
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
export type ScheduleStatus = 'draft' | 'awaiting_approval' | 'approved' | 'active' | 'withdrawn' | 'superseded' | 'expired';
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
export type PublicationStatus = 'preparing' | 'prepared' | 'preparation_failed' | 'withdrawn' | 'superseded';
export interface PublicationRecord {
    id: string;
    manifestVersion: '1.0';
    displayId: string;
    displayName: string;
    scheduleId: string;
    playlistRevisionId: string;
    departmentId: string;
    orientation: DisplayOrientation;
    storagePath: string;
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
export interface KolkataTimeComponents {
    year: number;
    month: string;
    day: string;
    dateString: string;
    dayOfWeek: number;
    hours: number;
    minutes: number;
    timeString: string;
}
/**
 * Deterministically converts any UTC/ISO date string into exact Asia/Kolkata (UTC+05:30) components.
 * Independent of the host system timezone.
 */
export declare function getKolkataTimeComponents(isoOrDate: string | Date): KolkataTimeComponents;
/**
 * Checks whether a single ScheduleRule is active at a given target date and time in Asia/Kolkata.
 */
export declare function isScheduleRuleActiveAtTime(rule: ScheduleRule, kTime: KolkataTimeComponents, targetIso: string): boolean;
export type ScheduleEvaluationResult = {
    status: 'active';
    schedule: ScheduleRecord;
    isAdminOverride: boolean;
} | {
    status: 'conflict';
    conflictingSchedules: ScheduleRecord[];
    message: string;
} | {
    status: 'fallback';
    fallbackConfig: FallbackConfig;
    bundledFallback: {
        title: string;
        slides: DesignSlide[];
    };
};
/**
 * Shared schedule evaluator: evaluates what content should play on a digital display at a specific instant.
 * Used by UI preview, conflict detection, publication preparation, and future playback.
 */
export declare function evaluateScheduleAtTime(params: {
    schedules: ScheduleRecord[];
    displayId: string;
    targetIsoString: string;
    displayOrientation: DisplayOrientation;
    fallbackConfig?: FallbackConfig;
}): ScheduleEvaluationResult;
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
export declare function detectScheduleConflicts(schedules: ScheduleRecord[], displayId: string, displayOrientation: DisplayOrientation): ScheduleConflictResult;
/**
 * Validates a ScheduleRule for consistency and completeness.
 */
export declare function validateScheduleRule(rule: ScheduleRule): {
    valid: boolean;
    errors: string[];
};
/**
 * Validates playlist items for orientation compatibility and non-empty items.
 */
export declare function validatePlaylist(playlist: {
    title: string;
    orientation: DisplayOrientation;
    items: PlaylistItem[];
}): {
    valid: boolean;
    errors: string[];
};
/**
 * Returns a bundled neutral corporate fallback slide when no custom fallback is provisioned.
 * Guarantees that digital displays never encounter black or unrenderable states.
 */
export declare function getBundledNeutralFallback(orientation: DisplayOrientation): {
    title: string;
    slides: DesignSlide[];
};
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
//# sourceMappingURL=index.d.ts.map