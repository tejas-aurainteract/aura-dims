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

export interface Resolution {
  width: number;
  height: number;
}

export interface Site {
  id: string;
  name: string;
  location: string;
  timezone: string; // e.g., 'Asia/Kolkata'
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  name: string;
  code: string; // e.g., 'HR', 'OPERATIONS', 'SAFETY'
  siteIds: string[];
  createdAt: string;
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
  resourceType: 'display' | 'asset' | 'schedule' | 'playlist' | 'publication' | 'user' | 'role';
  resourceId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
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

