/**
 * Aura DIMS - Core Domain Types & Schemas
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Always use "digital display" in user-facing naming.
 */

export type DisplayOrientation = 'landscape' | 'portrait';

export type DisplayStatus = 'online' | 'offline' | 'unregistered';

export type ContentLanguage = 'en' | 'gu' | 'hi'; // English, Gujarati, Hindi

export type UserRole = 'admin' | 'department_head';

export type UserStatus = 'active' | 'inactive';

export type DepartmentStatus = 'active' | 'inactive';

export interface Resolution {
  width: number;
  height: number;
}

export interface Site {
  id: string;
  name: string;
  location: string;
  timezone: string; // 'Asia/Kolkata'
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

export interface DigitalDisplay {
  id: string;
  name: string;
  siteId: string;
  departmentId: string;
  status: DisplayStatus;
  orientation: DisplayOrientation;
  resolution: Resolution;
  ipAddress?: string;
  assignedUserIds: string[];
  currentPublicationId?: string;
  lastPingAt?: string;
  enrolledAt: string;
  updatedAt: string;
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

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  targetType: 'user' | 'department' | 'role' | 'display' | 'asset' | 'schedule' | 'playlist' | 'publication';
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
