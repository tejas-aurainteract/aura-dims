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

export interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'video';
  storagePath: string;
  downloadUrl?: string;
  sizeBytes: number;
  mimeType: string;
  checksumSha256: string;
  dimensions: Resolution;
  durationSeconds?: number;
  language: ContentLanguage;
  departmentId: string;
  uploadedBy: string;
  createdAt: string;
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
