/**
 * Aura DIMS - Playlists, Approvals, Schedules & Publication Backend (Cloud Functions v2)
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scope: Privileged Playlists, Immutable Revisions, Editorial Approvals,
 * Deterministic Scheduling, Conflict Detection, and Publication Manifest Generation.
 *
 * All operations execute with explicit caller authorization checks.
 * Terminology requirement: Strictly use "digital display" in all user-facing copy.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'node:crypto';
import type {
  UserProfile,
  DigitalDisplay,
  DesignRecord,
  DesignRevision,
  DesignRevisionAsset,
  PlaylistRecord,
  PlaylistItem,
  PlaylistRevision,
  ScheduleRecord,
  ApprovalRecord,
  ApprovalStatus,
  PublicationRecord,
  DetailedPublicationManifest,
  CreateDesignRevisionRequest,
  CreateDesignRevisionResponse,
  ListDesignRevisionsRequest,
  ListDesignRevisionsResponse,
  GetDesignRevisionRequest,
  GetDesignRevisionResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  UpdatePlaylistRequest,
  UpdatePlaylistResponse,
  GetPlaylistRequest,
  GetPlaylistResponse,
  ListPlaylistsRequest,
  ListPlaylistsResponse,
  SetPlaylistArchivedRequest,
  SetPlaylistArchivedResponse,
  CreatePlaylistRevisionRequest,
  CreatePlaylistRevisionResponse,
  GetPlaylistRevisionRequest,
  GetPlaylistRevisionResponse,
  CreateScheduleRequest,
  CreateScheduleResponse,
  UpdateScheduleRequest,
  UpdateScheduleResponse,
  GetScheduleRequest,
  GetScheduleResponse,
  ListSchedulesRequest,
  ListSchedulesResponse,
  SetScheduleStatusRequest,
  SetScheduleStatusResponse,
  SubmitForApprovalRequest,
  SubmitForApprovalResponse,
  ReviewApprovalRequest,
  ReviewApprovalResponse,
  WithdrawApprovalRequest,
  WithdrawApprovalResponse,
  ListApprovalsRequest,
  ListApprovalsResponse,
  GetApprovalRequest,
  GetApprovalResponse,
  PreparePublicationRequest,
  PreparePublicationResponse,
  RollbackPublicationRequest,
  RollbackPublicationResponse,
  SetUserDirectPublishPermissionRequest,
  SetUserDirectPublishPermissionResponse,
  EvaluateSchedulePreviewRequest,
  EvaluateSchedulePreviewResponse,
} from '@aura-dims/display-schema';
import {
  validateDesignDocument,
  extractReferencedAssetIds,
  validatePlaylist,
  validateScheduleRule,
  evaluateScheduleAtTime,
  detectScheduleConflicts,
  getBundledNeutralFallback,
} from '@aura-dims/display-schema';

const db = admin.firestore();
const storage = admin.storage();
const REGION = 'asia-south1';
const CALLABLE_OPTS = { region: REGION, cors: true };

// ==============================================================================
// Authorization & Audit Helpers
// ==============================================================================

async function getAuthenticatedCaller(auth: { uid: string } | undefined): Promise<UserProfile> {
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'The operation requires an authenticated user session.');
  }

  const callerDoc = await db.collection('users').doc(auth.uid).get();
  if (!callerDoc.exists) {
    throw new HttpsError('permission-denied', 'No authorized user profile exists for this account.');
  }

  const profile = callerDoc.data() as UserProfile;
  if (profile.status !== 'active') {
    throw new HttpsError('permission-denied', 'The user account has been deactivated.');
  }

  return profile;
}

async function assertAdminCaller(auth: { uid: string } | undefined): Promise<UserProfile> {
  const caller = await getAuthenticatedCaller(auth);
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only System Administrators can execute this operation.');
  }
  return caller;
}

function assertDepartmentAccess(caller: UserProfile, targetDepartmentId: string): void {
  if (caller.role === 'admin') return;
  if (caller.departmentId !== targetDepartmentId) {
    throw new HttpsError(
      'permission-denied',
      `Access denied. You do not have permissions for department '${targetDepartmentId}'.`
    );
  }
}

async function writeAuditLog(params: {
  actorId: string;
  action: string;
  targetId: string;
  targetType: 'design_revision' | 'playlist' | 'playlist_revision' | 'schedule' | 'approval' | 'publication' | 'user';
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.collection('auditEvents').add({
    actorId: params.actorId,
    action: params.action,
    targetId: params.targetId,
    targetType: params.targetType,
    previousState: params.previousState || null,
    newState: params.newState || null,
    metadata: params.metadata || {},
    timestamp: FieldValue.serverTimestamp(),
  });
}

function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// ==============================================================================
// 1. Immutable Design Revisions
// ==============================================================================

export const createDesignRevision = onCall(
  CALLABLE_OPTS,
  async (request): Promise<CreateDesignRevisionResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { designId } = request.data as CreateDesignRevisionRequest;

    if (!designId) {
      throw new HttpsError('invalid-argument', 'Missing designId parameter.');
    }

    const designDoc = await db.collection('designs').doc(designId).get();
    if (!designDoc.exists) {
      throw new HttpsError('not-found', `Visual design '${designId}' does not exist.`);
    }

    const design = designDoc.data() as DesignRecord & { document: any };
    assertDepartmentAccess(caller, design.departmentId);

    // Validate design document
    const validation = validateDesignDocument(design.document);
    if (!validation.valid) {
      throw new HttpsError(
        'failed-precondition',
        `Cannot create revision: design document has validation errors: ${validation.errors.join('; ')}`
      );
    }

    // Extract and validate all referenced media assets
    const assetIds = extractReferencedAssetIds(design.document);
    const assetManifest: DesignRevisionAsset[] = [];

    for (const aId of assetIds) {
      const aDoc = await db.collection('assets').doc(aId).get();
      if (!aDoc.exists) {
        throw new HttpsError(
          'failed-precondition',
          `Referenced asset '${aId}' does not exist in the Media Library. Freeze blocked.`
        );
      }
      const assetData = aDoc.data() as any;
      if (assetData.status !== 'ready') {
        throw new HttpsError(
          'failed-precondition',
          `Referenced asset '${assetData.fileName || aId}' is in '${assetData.status}' status (must be 'ready'). Freeze blocked.`
        );
      }
      assetManifest.push({
        assetId: aId,
        fileName: assetData.fileName || 'asset',
        mimeType: assetData.mimeType || 'application/octet-stream',
        fileSizeBytes: assetData.fileSizeBytes || 0,
        checksumSha256: assetData.checksumSha256 || '',
        storagePath: assetData.storagePath || '',
        thumbnailPath: assetData.thumbnailPath || null,
      });
    }

    // Identify required fonts
    const fonts = new Set<string>();
    for (const slide of design.document.slides || []) {
      for (const el of slide.elements || []) {
        if (el.type === 'text' && el.fontFamily) {
          fonts.add(el.fontFamily);
        }
      }
    }

    // Calculate total duration
    const totalDuration = (design.document.slides || []).reduce(
      (acc: number, s: any) => acc + (s.durationSeconds || 10),
      0
    );

    // Deterministic canonical JSON content hash
    const canonicalJson = JSON.stringify(design.document, Object.keys(design.document).sort());
    const contentHash = computeSha256(canonicalJson);

    // Revision number is design.revision or monotonic count
    const revRef = db.collection('designRevisions').doc();
    const revisionRecord: DesignRevision = {
      id: revRef.id,
      designId,
      revisionNumber: (design.revision || 1),
      title: design.title,
      orientation: design.orientation,
      dimensions: design.dimensions,
      departmentId: design.departmentId,
      ownerId: design.ownerId,
      ownerDisplayName: (design as any).ownerDisplayName || caller.displayName,
      document: JSON.parse(JSON.stringify(design.document)),
      slideCount: (design.document.slides || []).length,
      totalDurationSeconds: totalDuration,
      referencedAssetIds: assetIds,
      assetManifest,
      requiredFonts: Array.from(fonts),
      contentHash,
      createdAt: new Date().toISOString(),
      createdBy: caller.uid,
    };

    await revRef.set(revisionRecord);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'design_revision.created',
      targetId: revisionRecord.id,
      targetType: 'design_revision',
      newState: { designId, revisionNumber: revisionRecord.revisionNumber, contentHash },
      metadata: { departmentId: design.departmentId },
    });

    return { revision: revisionRecord };
  }
);

export const listDesignRevisions = onCall(
  CALLABLE_OPTS,
  async (request): Promise<ListDesignRevisionsResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { designId, departmentId, limit: queryLimit } = (request.data || {}) as ListDesignRevisionsRequest;

    let query: admin.firestore.Query = db.collection('designRevisions');

    if (designId) {
      query = query.where('designId', '==', designId);
    }

    if (caller.role === 'department_head') {
      query = query.where('departmentId', '==', caller.departmentId);
    } else if (departmentId) {
      query = query.where('departmentId', '==', departmentId);
    }

    query = query.orderBy('createdAt', 'desc').limit(queryLimit && queryLimit > 0 ? queryLimit : 50);

    const snapshot = await query.get();
    const revisions: DesignRevision[] = [];
    snapshot.forEach((doc) => revisions.push(doc.data() as DesignRevision));

    return { revisions };
  }
);

export const getDesignRevision = onCall(
  CALLABLE_OPTS,
  async (request): Promise<GetDesignRevisionResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { revisionId } = request.data as GetDesignRevisionRequest;

    if (!revisionId) {
      throw new HttpsError('invalid-argument', 'Missing revisionId parameter.');
    }

    const doc = await db.collection('designRevisions').doc(revisionId).get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Design revision '${revisionId}' does not exist.`);
    }

    const revision = doc.data() as DesignRevision;
    assertDepartmentAccess(caller, revision.departmentId);

    return { revision };
  }
);

// ==============================================================================
// 2. Playlists & Playlist Revisions
// ==============================================================================

export const createPlaylist = onCall(
  CALLABLE_OPTS,
  async (request): Promise<CreatePlaylistResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { title, description, departmentId, orientation, items } = request.data as CreatePlaylistRequest;

    assertDepartmentAccess(caller, departmentId);

    const playlistItems: PlaylistItem[] = (items || []).map((it, idx) => {
      const item: PlaylistItem = {
        id: crypto.randomUUID(),
        designId: it.designId,
        title: it.title,
        orientation: it.orientation,
        slideCount: it.slideCount,
        durationSeconds: it.durationSeconds,
        order: idx + 1,
      };
      if ((it as any).designRevisionId) {
        item.designRevisionId = (it as any).designRevisionId;
      }
      return item;
    });

    const val = validatePlaylist({ title, orientation, items: playlistItems });
    if (!val.valid) {
      throw new HttpsError('invalid-argument', val.errors.join(' '));
    }

    const totalDurationSeconds = playlistItems.reduce((acc, it) => acc + (it.durationSeconds || 10), 0);

    const playlistRef = db.collection('playlists').doc();
    const now = new Date().toISOString();
    const playlistRecord: PlaylistRecord = {
      id: playlistRef.id,
      title: title.trim(),
      description: (description || '').trim(),
      departmentId,
      orientation,
      items: playlistItems,
      totalDurationSeconds,
      isArchived: false,
      ownerId: caller.uid,
      ownerDisplayName: caller.displayName,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };

    await playlistRef.set(playlistRecord);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'playlist.created',
      targetId: playlistRecord.id,
      targetType: 'playlist',
      newState: { title: playlistRecord.title, orientation, itemCount: playlistItems.length },
      metadata: { departmentId },
    });

    return { playlist: playlistRecord };
  }
);

export const updatePlaylist = onCall(
  CALLABLE_OPTS,
  async (request): Promise<UpdatePlaylistResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { playlistId, title, description, items, revision } = request.data as UpdatePlaylistRequest;

    if (!playlistId) {
      throw new HttpsError('invalid-argument', 'Missing playlistId parameter.');
    }

    const playlistRef = db.collection('playlists').doc(playlistId);
    const doc = await playlistRef.get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Playlist '${playlistId}' not found.`);
    }

    const current = doc.data() as PlaylistRecord;
    assertDepartmentAccess(caller, current.departmentId);

    // Concurrency conflict check
    if (current.revision !== revision) {
      throw new HttpsError(
        'failed-precondition',
        `Playlist concurrency conflict. Server revision is ${current.revision}, but your draft was based on revision ${revision}. Please reload latest version.`
      );
    }

    const playlistItems: PlaylistItem[] = (items || []).map((it, idx) => {
      const item: PlaylistItem = {
        id: it.id || crypto.randomUUID(),
        designId: it.designId,
        title: it.title,
        orientation: it.orientation,
        slideCount: it.slideCount,
        durationSeconds: it.durationSeconds,
        order: idx + 1,
      };
      if (it.designRevisionId) {
        item.designRevisionId = it.designRevisionId;
      }
      return item;
    });

    const val = validatePlaylist({ title, orientation: current.orientation, items: playlistItems });
    if (!val.valid) {
      throw new HttpsError('invalid-argument', val.errors.join(' '));
    }

    const totalDurationSeconds = playlistItems.reduce((acc, it) => acc + (it.durationSeconds || 10), 0);
    const nextRevision = (current.revision || 1) + 1;
    const now = new Date().toISOString();

    const updatedRecord: PlaylistRecord = {
      ...current,
      title: title.trim(),
      description: (description || '').trim(),
      items: playlistItems,
      totalDurationSeconds,
      revision: nextRevision,
      updatedAt: now,
    };

    await playlistRef.set(updatedRecord);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'playlist.updated',
      targetId: playlistId,
      targetType: 'playlist',
      previousState: { title: current.title, itemCount: current.items.length, revision: current.revision },
      newState: { title: updatedRecord.title, itemCount: playlistItems.length, revision: nextRevision },
      metadata: { departmentId: current.departmentId },
    });

    return { playlist: updatedRecord };
  }
);

export const getPlaylist = onCall(
  CALLABLE_OPTS,
  async (request): Promise<GetPlaylistResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { playlistId } = request.data as GetPlaylistRequest;

    const doc = await db.collection('playlists').doc(playlistId).get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Playlist '${playlistId}' not found.`);
    }

    const playlist = doc.data() as PlaylistRecord;
    assertDepartmentAccess(caller, playlist.departmentId);

    return { playlist };
  }
);

export const listPlaylists = onCall(
  CALLABLE_OPTS,
  async (request): Promise<ListPlaylistsResponse> => {
    try {
      const caller = await getAuthenticatedCaller(request.auth);
      const { departmentId, orientation, includeArchived, limit: queryLimit } = (request.data || {}) as ListPlaylistsRequest;

      let query: admin.firestore.Query = db.collection('playlists');

      if (caller.role === 'department_head') {
        query = query.where('departmentId', '==', caller.departmentId);
      } else if (departmentId) {
        query = query.where('departmentId', '==', departmentId);
      }

      if (orientation) {
        query = query.where('orientation', '==', orientation);
      }

      let playlists: PlaylistRecord[] = [];
      const fetchLimit = queryLimit && queryLimit > 0 ? queryLimit : 50;

      try {
        const orderedQuery = query.orderBy('updatedAt', 'desc').limit(fetchLimit);
        const snapshot = await orderedQuery.get();
        snapshot.forEach((doc) => playlists.push(doc.data() as PlaylistRecord));
      } catch (queryErr: any) {
        console.warn('[listPlaylists] Ordered query failed (index building/missing), falling back to in-memory sort:', queryErr?.message || queryErr);
        const snapshot = await query.limit(fetchLimit).get();
        snapshot.forEach((doc) => playlists.push(doc.data() as PlaylistRecord));
        playlists.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      }

      if (!includeArchived) {
        playlists = playlists.filter((p) => !p.isArchived);
      }

      return { playlists };
    } catch (err: any) {
      console.error('[listPlaylists] Execution error:', err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err?.message || 'Failed to list playlists.');
    }
  }
);

export const setPlaylistArchivedStatus = onCall(
  CALLABLE_OPTS,
  async (request): Promise<SetPlaylistArchivedResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { playlistId, isArchived } = request.data as SetPlaylistArchivedRequest;

    const ref = db.collection('playlists').doc(playlistId);
    const doc = await ref.get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Playlist '${playlistId}' not found.`);
    }

    const playlist = doc.data() as PlaylistRecord;
    assertDepartmentAccess(caller, playlist.departmentId);

    await ref.update({
      isArchived,
      updatedAt: new Date().toISOString(),
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: isArchived ? 'playlist.archived' : 'playlist.restored',
      targetId: playlistId,
      targetType: 'playlist',
      metadata: { departmentId: playlist.departmentId },
    });

    return { playlistId, isArchived };
  }
);

export const createPlaylistRevision = onCall(
  CALLABLE_OPTS,
  async (request): Promise<CreatePlaylistRevisionResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { playlistId } = request.data as CreatePlaylistRevisionRequest;

    const pDoc = await db.collection('playlists').doc(playlistId).get();
    if (!pDoc.exists) {
      throw new HttpsError('not-found', `Playlist '${playlistId}' not found.`);
    }

    const playlist = pDoc.data() as PlaylistRecord;
    assertDepartmentAccess(caller, playlist.departmentId);

    if (!playlist.items || playlist.items.length === 0) {
      throw new HttpsError('failed-precondition', 'Cannot create revision for an empty playlist.');
    }

    // Freeze all constituent designs into DesignRevisions
    const revItems: PlaylistRevision['items'] = [];
    const allReferencedAssets = new Set<string>();
    const assetManifestMap = new Map<string, DesignRevisionAsset>();
    const fontSet = new Set<string>();

    for (const item of playlist.items) {
      // If item already has a frozen revision, use it; otherwise freeze from latest design
      let dRev: DesignRevision;
      if (item.designRevisionId) {
        const drDoc = await db.collection('designRevisions').doc(item.designRevisionId).get();
        if (drDoc.exists) {
          dRev = drDoc.data() as DesignRevision;
        } else {
          dRev = await freezeDesignInternal(item.designId, caller);
        }
      } else {
        dRev = await freezeDesignInternal(item.designId, caller);
      }

      revItems.push({
        designId: item.designId,
        designRevisionId: dRev.id,
        title: dRev.title,
        slideCount: dRev.slideCount,
        durationSeconds: dRev.totalDurationSeconds,
        order: item.order,
        contentHash: dRev.contentHash,
      });

      dRev.referencedAssetIds.forEach((id) => allReferencedAssets.add(id));
      dRev.assetManifest.forEach((am) => assetManifestMap.set(am.assetId, am));
      dRev.requiredFonts.forEach((f) => fontSet.add(f));
    }

    const canonicalJson = JSON.stringify(revItems, Object.keys(revItems).sort());
    const playlistContentHash = computeSha256(canonicalJson);

    const prevRevs = await db.collection('playlistRevisions')
      .where('playlistId', '==', playlistId)
      .get();
    const revisionNumber = prevRevs.size + 1;

    const prRef = db.collection('playlistRevisions').doc();
    const playlistRevision: PlaylistRevision = {
      id: prRef.id,
      playlistId,
      revisionNumber,
      title: playlist.title,
      description: playlist.description,
      departmentId: playlist.departmentId,
      orientation: playlist.orientation,
      items: revItems,
      totalDurationSeconds: revItems.reduce((acc, it) => acc + it.durationSeconds, 0),
      referencedAssetIds: Array.from(allReferencedAssets),
      assetManifest: Array.from(assetManifestMap.values()),
      requiredFonts: Array.from(fontSet),
      contentHash: playlistContentHash,
      createdAt: new Date().toISOString(),
      createdBy: caller.uid,
    };

    await prRef.set(playlistRevision);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'playlist_revision.created',
      targetId: playlistRevision.id,
      targetType: 'playlist_revision',
      newState: { playlistId, revisionNumber, contentHash: playlistContentHash },
      metadata: { departmentId: playlist.departmentId },
    });

    return { revision: playlistRevision };
  }
);

async function freezeDesignInternal(designId: string, caller: UserProfile): Promise<DesignRevision> {
  const designDoc = await db.collection('designs').doc(designId).get();
  if (!designDoc.exists) {
    throw new HttpsError('not-found', `Referenced design '${designId}' not found.`);
  }

  const design = designDoc.data() as DesignRecord & { document: any };
  const validation = validateDesignDocument(design.document);
  if (!validation.valid) {
    throw new HttpsError('failed-precondition', `Design '${design.title}' has errors: ${validation.errors.join('; ')}`);
  }

  const assetIds = extractReferencedAssetIds(design.document);
  const assetManifest: DesignRevisionAsset[] = [];
  for (const aId of assetIds) {
    const aDoc = await db.collection('assets').doc(aId).get();
    if (aDoc.exists) {
      const aData = aDoc.data() as any;
      assetManifest.push({
        assetId: aId,
        fileName: aData.fileName || 'asset',
        mimeType: aData.mimeType || 'application/octet-stream',
        fileSizeBytes: aData.fileSizeBytes || 0,
        checksumSha256: aData.checksumSha256 || '',
        storagePath: aData.storagePath || '',
        thumbnailPath: aData.thumbnailPath || null,
      });
    }
  }

  const fonts = new Set<string>();
  for (const slide of design.document.slides || []) {
    for (const el of slide.elements || []) {
      if (el.type === 'text' && el.fontFamily) fonts.add(el.fontFamily);
    }
  }

  const totalDuration = (design.document.slides || []).reduce((acc: number, s: any) => acc + (s.durationSeconds || 10), 0);
  const canonicalJson = JSON.stringify(design.document, Object.keys(design.document).sort());
  const contentHash = computeSha256(canonicalJson);

  const revRef = db.collection('designRevisions').doc();
  const revision: DesignRevision = {
    id: revRef.id,
    designId,
    revisionNumber: design.revision || 1,
    title: design.title,
    orientation: design.orientation,
    dimensions: design.dimensions,
    departmentId: design.departmentId,
    ownerId: design.ownerId,
    ownerDisplayName: (design as any).ownerDisplayName || caller.displayName,
    document: JSON.parse(JSON.stringify(design.document)),
    slideCount: (design.document.slides || []).length,
    totalDurationSeconds: totalDuration,
    referencedAssetIds: assetIds,
    assetManifest,
    requiredFonts: Array.from(fonts),
    contentHash,
    createdAt: new Date().toISOString(),
    createdBy: caller.uid,
  };

  await revRef.set(revision);
  return revision;
}

export const getPlaylistRevision = onCall(
  CALLABLE_OPTS,
  async (request): Promise<GetPlaylistRevisionResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { revisionId } = request.data as GetPlaylistRevisionRequest;

    const doc = await db.collection('playlistRevisions').doc(revisionId).get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Playlist revision '${revisionId}' not found.`);
    }

    const revision = doc.data() as PlaylistRevision;
    assertDepartmentAccess(caller, revision.departmentId);

    return { revision };
  }
);

// ==============================================================================
// 3. Schedules & Target Authorization
// ==============================================================================

async function validateAndResolveTargets(
  caller: UserProfile,
  targetDisplayIds: string[],
  orientation: string,
  departmentId: string
): Promise<{ displayIds: string[]; displayNames: string[] }> {
  if (!targetDisplayIds || targetDisplayIds.length === 0) {
    throw new HttpsError('invalid-argument', 'Schedule must target at least one active digital display.');
  }

  const resolvedIds: string[] = [];
  const resolvedNames: string[] = [];

  for (const dId of targetDisplayIds) {
    const dDoc = await db.collection('displays').doc(dId).get();
    if (!dDoc.exists) {
      throw new HttpsError('not-found', `Digital display '${dId}' does not exist.`);
    }
    const display = dDoc.data() as DigitalDisplay;

    // Check active or pending enrollment lifecycle
    if (display.lifecycle !== 'active' && display.lifecycle !== 'pending_enrollment') {
      throw new HttpsError(
        'failed-precondition',
        `Digital display '${display.name || dId}' is in '${display.lifecycle}' state (must be 'active' or 'pending_enrollment').`
      );
    }

    // Check orientation compatibility
    if (display.orientation !== orientation) {
      throw new HttpsError(
        'failed-precondition',
        `Orientation mismatch: Digital display '${display.name || dId}' is configured as ${display.orientation}, but schedule is ${orientation}.`
      );
    }

    // Department Head access checks
    if (caller.role === 'department_head') {
      if (display.departmentId !== caller.departmentId) {
        throw new HttpsError(
          'permission-denied',
          `Digital display '${display.name || dId}' belongs to department '${display.departmentId}', not your assigned department '${caller.departmentId}'.`
        );
      }

      // Check explicit assignment
      const assignRef = await db.collection('displayAssignments')
        .where('displayId', '==', dId)
        .where('uid', '==', caller.uid)
        .get();

      const isDirectlyAssigned = !assignRef.empty || (display as any).assignedUserIds?.includes(caller.uid);
      if (!isDirectlyAssigned) {
        throw new HttpsError(
          'permission-denied',
          `You are not assigned to digital display '${display.name || dId}'. Digital displays must be explicitly assigned to you by an Administrator.`
        );
      }
    }

    resolvedIds.push(dId);
    resolvedNames.push(display.name || dId);
  }

  return { displayIds: resolvedIds, displayNames: resolvedNames };
}

export const createSchedule = onCall(
  CALLABLE_OPTS,
  async (request): Promise<CreateScheduleResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const {
      title,
      departmentId,
      playlistRevisionId,
      playlistTitle,
      targetDisplayIds,
      orientation,
      scheduleRule,
      fallbackConfig,
    } = request.data as CreateScheduleRequest;

    assertDepartmentAccess(caller, departmentId);

    // Validate schedule rule
    const ruleVal = validateScheduleRule(scheduleRule);
    if (!ruleVal.valid) {
      throw new HttpsError('invalid-argument', ruleVal.errors.join(' '));
    }

    // Department Heads cannot use priority 10 (Admin emergency override)
    if (caller.role === 'department_head' && scheduleRule.priority >= 10) {
      throw new HttpsError('permission-denied', 'Priority 10 is reserved exclusively for System Administrator emergency broadcasts.');
    }

    // Validate targets
    const { displayIds, displayNames } = await validateAndResolveTargets(
      caller,
      targetDisplayIds,
      orientation,
      departmentId
    );

    const schedRef = db.collection('schedules').doc();
    const now = new Date().toISOString();
    const scheduleRecord: ScheduleRecord = {
      id: schedRef.id,
      title: title.trim(),
      departmentId,
      playlistRevisionId,
      playlistTitle: playlistTitle.trim(),
      approvalId: null,
      targetDisplayIds: displayIds,
      targetDisplayNames: displayNames,
      orientation,
      scheduleRule,
      fallbackConfig: fallbackConfig || { type: 'bundled' },
      status: 'draft',
      ownerId: caller.uid,
      ownerDisplayName: caller.displayName,
      createdAt: now,
      updatedAt: now,
    };

    await schedRef.set(scheduleRecord);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'schedule.created',
      targetId: scheduleRecord.id,
      targetType: 'schedule',
      newState: { title: scheduleRecord.title, targetCount: displayIds.length },
      metadata: { departmentId },
    });

    return { schedule: scheduleRecord };
  }
);

export const updateSchedule = onCall(
  CALLABLE_OPTS,
  async (request): Promise<UpdateScheduleResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const {
      scheduleId,
      title,
      playlistRevisionId,
      playlistTitle,
      targetDisplayIds,
      scheduleRule,
      fallbackConfig,
    } = request.data as UpdateScheduleRequest;

    const ref = db.collection('schedules').doc(scheduleId);
    const doc = await ref.get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }

    const current = doc.data() as ScheduleRecord;
    assertDepartmentAccess(caller, current.departmentId);

    const ruleVal = validateScheduleRule(scheduleRule);
    if (!ruleVal.valid) {
      throw new HttpsError('invalid-argument', ruleVal.errors.join(' '));
    }

    if (caller.role === 'department_head' && scheduleRule.priority >= 10) {
      throw new HttpsError('permission-denied', 'Priority 10 is reserved for System Administrators.');
    }

    const { displayIds, displayNames } = await validateAndResolveTargets(
      caller,
      targetDisplayIds,
      current.orientation,
      current.departmentId
    );

    // If schedule was previously approved, modifying it invalidates the approval!
    const wasApproved = current.status === 'approved' || current.status === 'active';
    let newStatus: ScheduleRecord['status'] = current.status;
    let approvalId = current.approvalId;

    if (wasApproved && !caller.canDirectPublish && caller.role !== 'admin') {
      newStatus = 'draft';
      // Invalidate linked approval record
      if (approvalId) {
        await db.collection('approvals').doc(approvalId).update({
          status: 'superseded',
          updatedAt: new Date().toISOString(),
        });
        approvalId = null;
      }
    }

    const updated: ScheduleRecord = {
      ...current,
      title: title.trim(),
      playlistRevisionId,
      playlistTitle: playlistTitle.trim(),
      targetDisplayIds: displayIds,
      targetDisplayNames: displayNames,
      scheduleRule,
      fallbackConfig: fallbackConfig || current.fallbackConfig,
      status: newStatus,
      approvalId,
      updatedAt: new Date().toISOString(),
    };

    await ref.set(updated);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'schedule.updated',
      targetId: scheduleId,
      targetType: 'schedule',
      previousState: { status: current.status, title: current.title },
      newState: { status: updated.status, title: updated.title },
      metadata: { departmentId: current.departmentId },
    });

    return { schedule: updated };
  }
);

export const getSchedule = onCall(
  CALLABLE_OPTS,
  async (request): Promise<GetScheduleResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId } = request.data as GetScheduleRequest;

    const doc = await db.collection('schedules').doc(scheduleId).get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }

    const schedule = doc.data() as ScheduleRecord;
    assertDepartmentAccess(caller, schedule.departmentId);

    return { schedule };
  }
);

export const listSchedules = onCall(
  CALLABLE_OPTS,
  async (request): Promise<ListSchedulesResponse> => {
    try {
      const caller = await getAuthenticatedCaller(request.auth);
      const { departmentId, displayId, status, limit: queryLimit } = (request.data || {}) as ListSchedulesRequest;

      let query: admin.firestore.Query = db.collection('schedules');

      if (caller.role === 'department_head') {
        query = query.where('departmentId', '==', caller.departmentId);
      } else if (departmentId) {
        query = query.where('departmentId', '==', departmentId);
      }

      if (status) {
        query = query.where('status', '==', status);
      }

      let schedules: ScheduleRecord[] = [];
      const fetchLimit = queryLimit && queryLimit > 0 ? queryLimit : 50;

      try {
        const orderedQuery = query.orderBy('updatedAt', 'desc').limit(fetchLimit);
        const snap = await orderedQuery.get();
        snap.forEach((doc) => schedules.push(doc.data() as ScheduleRecord));
      } catch (queryErr: any) {
        console.warn('[listSchedules] Ordered query failed (index building/missing), falling back to in-memory sort:', queryErr?.message || queryErr);
        const snap = await query.limit(fetchLimit).get();
        snap.forEach((doc) => schedules.push(doc.data() as ScheduleRecord));
        schedules.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      }

      if (displayId) {
        schedules = schedules.filter((s) => s.targetDisplayIds && Array.isArray(s.targetDisplayIds) && s.targetDisplayIds.includes(displayId));
      }

      return { schedules };
    } catch (err: any) {
      console.error('[listSchedules] Execution error:', err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err?.message || 'Failed to list schedules.');
    }
  }
);

export const setScheduleStatus = onCall(
  CALLABLE_OPTS,
  async (request): Promise<SetScheduleStatusResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId, status } = request.data as SetScheduleStatusRequest;

    const ref = db.collection('schedules').doc(scheduleId);
    const doc = await ref.get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }

    const current = doc.data() as ScheduleRecord;
    assertDepartmentAccess(caller, current.departmentId);

    await ref.update({
      status,
      updatedAt: new Date().toISOString(),
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: `schedule.status_${status}`,
      targetId: scheduleId,
      targetType: 'schedule',
      previousState: { status: current.status },
      newState: { status },
      metadata: { departmentId: current.departmentId },
    });

    return { scheduleId, status };
  }
);

// ==============================================================================
// 4. Approval Workflows
// ==============================================================================

export const submitForApproval = onCall(
  CALLABLE_OPTS,
  async (request): Promise<SubmitForApprovalResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId } = request.data as SubmitForApprovalRequest;

    const sDoc = await db.collection('schedules').doc(scheduleId).get();
    if (!sDoc.exists) {
      throw new HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }

    const schedule = sDoc.data() as ScheduleRecord;
    assertDepartmentAccess(caller, schedule.departmentId);

    // Re-validate targets and resolve names
    const { displayIds, displayNames } = await validateAndResolveTargets(
      caller,
      schedule.targetDisplayIds,
      schedule.orientation,
      schedule.departmentId
    );

    const appRef = db.collection('approvals').doc();
    const now = new Date().toISOString();

    const approvalRecord: ApprovalRecord = {
      id: appRef.id,
      playlistRevisionId: schedule.playlistRevisionId,
      playlistTitle: schedule.playlistTitle,
      departmentId: schedule.departmentId,
      departmentName: schedule.departmentName || null,
      orientation: schedule.orientation,
      targetDisplayIds: displayIds,
      targetDisplayNames: displayNames,
      scheduleRule: schedule.scheduleRule,
      priority: schedule.scheduleRule.priority,
      fallbackConfig: schedule.fallbackConfig,
      status: 'pending_review',
      submittedBy: caller.uid,
      submittedByName: caller.displayName,
      submittedAt: now,
      decision: null,
      rejectionReason: null,
      history: [
        {
          action: 'submitted',
          actorId: caller.uid,
          actorName: caller.displayName,
          timestamp: now,
        },
      ],
      scheduleId,
      createdAt: now,
      updatedAt: now,
    };

    await appRef.set(approvalRecord);

    await db.collection('schedules').doc(scheduleId).update({
      status: 'awaiting_approval',
      approvalId: approvalRecord.id,
      updatedAt: now,
    });

    const updatedSchedule: ScheduleRecord = {
      ...schedule,
      status: 'awaiting_approval',
      approvalId: approvalRecord.id,
      updatedAt: now,
    };

    await writeAuditLog({
      actorId: caller.uid,
      action: 'approval.submitted',
      targetId: approvalRecord.id,
      targetType: 'approval',
      newState: { scheduleId, targetDisplayCount: displayIds.length },
      metadata: { departmentId: schedule.departmentId },
    });

    return { approval: approvalRecord, schedule: updatedSchedule };
  }
);

export const reviewApproval = onCall(
  CALLABLE_OPTS,
  async (request): Promise<ReviewApprovalResponse> => {
    const caller = await assertAdminCaller(request.auth);
    const { approvalId, decision, rejectionReason } = request.data as ReviewApprovalRequest;

    if (!approvalId || !decision) {
      throw new HttpsError('invalid-argument', 'Missing approvalId or decision parameter.');
    }

    if (decision === 'rejected' && (!rejectionReason || rejectionReason.trim().length === 0)) {
      throw new HttpsError('invalid-argument', 'Rejection reason is mandatory when rejecting a submission.');
    }

    const aDoc = await db.collection('approvals').doc(approvalId).get();
    if (!aDoc.exists) {
      throw new HttpsError('not-found', `Approval '${approvalId}' not found.`);
    }

    const approval = aDoc.data() as ApprovalRecord;
    if (approval.status !== 'pending_review') {
      throw new HttpsError(
        'failed-precondition',
        `Submission is in '${approval.status}' status (must be 'pending_review' to decide).`
      );
    }

    const now = new Date().toISOString();
    const newStatus: ApprovalStatus = decision === 'approved' ? 'approved' : 'rejected';

    const historyEntry: ApprovalRecord['history'][0] = {
      action: decision,
      actorId: caller.uid,
      actorName: caller.displayName,
      timestamp: now,
      reason: rejectionReason || null,
    };

    const updatedApproval: ApprovalRecord = {
      ...approval,
      status: newStatus,
      decision: {
        reviewerId: caller.uid,
        reviewerName: caller.displayName,
        decidedAt: now,
        decision,
        reason: rejectionReason || null,
      },
      rejectionReason: decision === 'rejected' ? (rejectionReason || '').trim() : null,
      history: [...approval.history, historyEntry],
      updatedAt: now,
    };

    await db.collection('approvals').doc(approvalId).set(updatedApproval);

    let updatedSchedule: ScheduleRecord | null = null;
    if (approval.scheduleId) {
      const sRef = db.collection('schedules').doc(approval.scheduleId);
      const sDoc = await sRef.get();
      if (sDoc.exists) {
        const curSchedule = sDoc.data() as ScheduleRecord;
        const newSchedStatus = decision === 'approved' ? 'approved' : 'draft';
        await sRef.update({
          status: newSchedStatus,
          updatedAt: now,
        });
        updatedSchedule = { ...curSchedule, status: newSchedStatus, updatedAt: now };
      }
    }

    await writeAuditLog({
      actorId: caller.uid,
      action: `approval.${decision}`,
      targetId: approvalId,
      targetType: 'approval',
      newState: { status: newStatus, reviewer: caller.displayName, reason: rejectionReason || null },
      metadata: { departmentId: approval.departmentId },
    });

    return { approval: updatedApproval, schedule: updatedSchedule! };
  }
);

export const withdrawApproval = onCall(
  CALLABLE_OPTS,
  async (request): Promise<WithdrawApprovalResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { approvalId, reason } = request.data as WithdrawApprovalRequest;

    const aDoc = await db.collection('approvals').doc(approvalId).get();
    if (!aDoc.exists) {
      throw new HttpsError('not-found', `Approval '${approvalId}' not found.`);
    }

    const approval = aDoc.data() as ApprovalRecord;
    assertDepartmentAccess(caller, approval.departmentId);

    if (approval.status !== 'pending_review') {
      throw new HttpsError('failed-precondition', `Cannot withdraw submission with status '${approval.status}'.`);
    }

    const now = new Date().toISOString();
    const updatedApproval: ApprovalRecord = {
      ...approval,
      status: 'withdrawn',
      history: [
        ...approval.history,
        {
          action: 'withdrawn',
          actorId: caller.uid,
          actorName: caller.displayName,
          timestamp: now,
          reason: reason || 'Withdrawn by submitter',
        },
      ],
      updatedAt: now,
    };

    await db.collection('approvals').doc(approvalId).set(updatedApproval);

    let updatedSchedule: ScheduleRecord | null = null;
    if (approval.scheduleId) {
      const sRef = db.collection('schedules').doc(approval.scheduleId);
      const sDoc = await sRef.get();
      if (sDoc.exists) {
        await sRef.update({ status: 'withdrawn', updatedAt: now });
        updatedSchedule = { ...(sDoc.data() as ScheduleRecord), status: 'withdrawn', updatedAt: now };
      }
    }

    await writeAuditLog({
      actorId: caller.uid,
      action: 'approval.withdrawn',
      targetId: approvalId,
      targetType: 'approval',
      metadata: { departmentId: approval.departmentId },
    });

    return { approval: updatedApproval, schedule: updatedSchedule! };
  }
);

export const listApprovals = onCall(
  CALLABLE_OPTS,
  async (request): Promise<ListApprovalsResponse> => {
    try {
      const caller = await getAuthenticatedCaller(request.auth);
      const { departmentId, status, limit: queryLimit } = (request.data || {}) as ListApprovalsRequest;

      let query: admin.firestore.Query = db.collection('approvals');

      if (caller.role === 'department_head') {
        query = query.where('departmentId', '==', caller.departmentId);
      } else if (departmentId) {
        query = query.where('departmentId', '==', departmentId);
      }

      if (status) {
        query = query.where('status', '==', status);
      }

      let approvals: ApprovalRecord[] = [];
      const fetchLimit = queryLimit && queryLimit > 0 ? queryLimit : 50;

      try {
        const orderedQuery = query.orderBy('createdAt', 'desc').limit(fetchLimit);
        const snap = await orderedQuery.get();
        snap.forEach((doc) => approvals.push(doc.data() as ApprovalRecord));
      } catch (queryErr: any) {
        console.warn('[listApprovals] Ordered query failed (index building/missing), falling back to in-memory sort:', queryErr?.message || queryErr);
        const snap = await query.limit(fetchLimit).get();
        snap.forEach((doc) => approvals.push(doc.data() as ApprovalRecord));
        approvals.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }

      return { approvals };
    } catch (err: any) {
      console.error('[listApprovals] Execution error:', err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err?.message || 'Failed to list approvals.');
    }
  }
);

export const getApproval = onCall(
  CALLABLE_OPTS,
  async (request): Promise<GetApprovalResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { approvalId } = request.data as GetApprovalRequest;

    const doc = await db.collection('approvals').doc(approvalId).get();
    if (!doc.exists) {
      throw new HttpsError('not-found', `Approval '${approvalId}' not found.`);
    }

    const approval = doc.data() as ApprovalRecord;
    assertDepartmentAccess(caller, approval.departmentId);

    return { approval };
  }
);

// ==============================================================================
// 5. Publication Preparation & Rollback
// ==============================================================================

export const preparePublication = onCall(
  CALLABLE_OPTS,
  async (request): Promise<PreparePublicationResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId, idempotencyKey } = request.data as PreparePublicationRequest;

    if (!scheduleId || !idempotencyKey) {
      throw new HttpsError('invalid-argument', 'Missing scheduleId or idempotencyKey.');
    }

    const sDoc = await db.collection('schedules').doc(scheduleId).get();
    if (!sDoc.exists) {
      throw new HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }

    const schedule = sDoc.data() as ScheduleRecord;
    assertDepartmentAccess(caller, schedule.departmentId);

    // Authorization check: must be Admin, or Dept Head with canDirectPublish, or approved schedule
    const isDirectAuthorized = caller.role === 'admin' || !!caller.canDirectPublish;
    if (!isDirectAuthorized && schedule.status !== 'approved') {
      throw new HttpsError(
        'permission-denied',
        `Schedule '${schedule.title}' has status '${schedule.status}'. Direct publishing is not enabled for your account; submission must be approved by an Administrator.`
      );
    }

    // Idempotency check: see if publication for this key already exists
    const existingPub = await db.collection('publications')
      .where('idempotencyKey', '==', idempotencyKey)
      .where('scheduleId', '==', scheduleId)
      .limit(1)
      .get();

    if (!existingPub.empty) {
      const pub = existingPub.docs[0].data() as PublicationRecord;
      if (pub.status === 'prepared') {
        return {
          publication: pub,
          manifest: {} as any, // manifest stored in storage
          targetedDisplayCount: schedule.targetDisplayIds.length,
        };
      }
    }

    // Preflight re-validation of all target digital displays
    const { displayIds } = await validateAndResolveTargets(
      caller,
      schedule.targetDisplayIds,
      schedule.orientation,
      schedule.departmentId
    );

    // Conflict detection across all targets
    const allSchedulesSnap = await db.collection('schedules')
      .where('departmentId', '==', schedule.departmentId)
      .get();
    const candidateSchedules: ScheduleRecord[] = [];
    allSchedulesSnap.forEach((doc) => {
      const s = doc.data() as ScheduleRecord;
      if (s.id !== scheduleId && (s.status === 'approved' || s.status === 'active')) {
        candidateSchedules.push(s);
      }
    });
    candidateSchedules.push(schedule); // Include current schedule

    for (const dId of displayIds) {
      const conflictResult = detectScheduleConflicts(candidateSchedules, dId, schedule.orientation);
      if (conflictResult.hasConflict) {
        const c = conflictResult.conflicts[0];
        throw new HttpsError(
          'failed-precondition',
          `Publication blocked by schedule collision on digital display '${dId}' at ${c.date} ${c.time}: overlapping schedules [${c.conflictingTitles.join(', ')}] have equal priority (${c.priority}).`
        );
      }
    }

    // Load PlaylistRevision and constituent DesignRevisions
    const prDoc = await db.collection('playlistRevisions').doc(schedule.playlistRevisionId).get();
    if (!prDoc.exists) {
      throw new HttpsError('not-found', `Playlist revision '${schedule.playlistRevisionId}' not found.`);
    }
    const playlistRev = prDoc.data() as PlaylistRevision;

    // Load full DesignRevisions
    const playlistItemsForManifest: Array<{
      designRevisionId: string;
      title: string;
      durationSeconds: number;
      slides: any[];
    }> = [];

    const allAssetsMap = new Map<string, DesignRevisionAsset>();

    for (const it of playlistRev.items) {
      const drDoc = await db.collection('designRevisions').doc(it.designRevisionId).get();
      if (!drDoc.exists) {
        throw new HttpsError('failed-precondition', `Missing design revision '${it.designRevisionId}'.`);
      }
      const dr = drDoc.data() as DesignRevision;
      playlistItemsForManifest.push({
        designRevisionId: dr.id,
        title: dr.title,
        durationSeconds: dr.totalDurationSeconds,
        slides: dr.document.slides,
      });
      dr.assetManifest.forEach((a) => allAssetsMap.set(a.assetId, a));
    }

    // Fallback slide
    const neutralFallback = getBundledNeutralFallback(schedule.orientation);

    const now = new Date().toISOString();
    const expiresAt = `${schedule.scheduleRule.endDate}T${schedule.scheduleRule.endTime}:00+05:30`;

    // Process publication for the first target display as master publication record
    const pubRef = db.collection('publications').doc();
    const primaryDisplayId = displayIds[0];
    const dDoc = await db.collection('displays').doc(primaryDisplayId).get();
    const displayName = dDoc.exists ? (dDoc.data() as DigitalDisplay).name : primaryDisplayId;

    const storagePath = `packages/${primaryDisplayId}/${pubRef.id}/manifest.json`;

    const manifest: DetailedPublicationManifest = {
      manifestVersion: '1.0',
      publicationId: pubRef.id,
      displayId: primaryDisplayId,
      scheduleId,
      playlistRevisionId: playlistRev.id,
      generatedAt: now,
      expiresAt,
      timezone: 'Asia/Kolkata',
      orientation: schedule.orientation,
      integrity: {
        algorithm: 'sha256',
        checksum: '', // calculated below
      },
      scheduleRule: schedule.scheduleRule,
      playlist: {
        title: playlistRev.title,
        totalDurationSeconds: playlistRev.totalDurationSeconds,
        items: playlistItemsForManifest,
      },
      assets: Array.from(allAssetsMap.values()),
      fonts: [
        { family: 'Inter', weights: [400, 600, 700] },
        { family: 'Noto Sans Gujarati', weights: [400, 600, 700] },
        { family: 'Noto Sans Devanagari', weights: [400, 600, 700] },
      ],
      fallback: {
        type: 'bundled',
        title: neutralFallback.title,
        slides: neutralFallback.slides,
      },
    };

    const manifestStringWithoutChecksum = JSON.stringify(manifest);
    const checksum = computeSha256(manifestStringWithoutChecksum);
    manifest.integrity.checksum = checksum;

    // Write manifest to Cloud Storage
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    await file.save(JSON.stringify(manifest, null, 2), {
      contentType: 'application/json',
      metadata: {
        manifestVersion: '1.0',
        publicationId: pubRef.id,
        displayId: primaryDisplayId,
        sha256: checksum,
      },
    });

    const publicationRecord: PublicationRecord = {
      id: pubRef.id,
      manifestVersion: '1.0',
      displayId: primaryDisplayId,
      displayName,
      scheduleId,
      playlistRevisionId: playlistRev.id,
      departmentId: schedule.departmentId,
      orientation: schedule.orientation,
      storagePath,
      manifestChecksumSha256: checksum,
      status: 'prepared',
      idempotencyKey,
      generatedAt: now,
      expiresAt,
      timezone: 'Asia/Kolkata',
      createdAt: now,
      updatedAt: now,
    };

    await pubRef.set(publicationRecord);

    // Atomically commit desired publication version to all targeted digital displays
    const batch = db.batch();
    for (const dId of displayIds) {
      const dRef = db.collection('displays').doc(dId);
      batch.update(dRef, {
        desiredPublicationId: pubRef.id,
        currentPublicationId: pubRef.id,
        publicationUpdatedAt: now,
        updatedAt: now,
      });
    }

    // Update schedule record
    const sRef = db.collection('schedules').doc(scheduleId);
    batch.update(sRef, {
      status: 'active',
      publishedPublicationId: pubRef.id,
      publicationStatus: 'prepared',
      updatedAt: now,
    });

    await batch.commit();

    await writeAuditLog({
      actorId: caller.uid,
      action: 'publication.prepared',
      targetId: pubRef.id,
      targetType: 'publication',
      newState: {
        scheduleId,
        displayCount: displayIds.length,
        checksum,
      },
      metadata: { departmentId: schedule.departmentId },
    });

    return {
      publication: publicationRecord,
      manifest,
      targetedDisplayCount: displayIds.length,
    };
  }
);

export const rollbackPublication = onCall(
  CALLABLE_OPTS,
  async (request): Promise<RollbackPublicationResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { displayId, targetPublicationId } = request.data as RollbackPublicationRequest;

    const dRef = db.collection('displays').doc(displayId);
    const dDoc = await dRef.get();
    if (!dDoc.exists) {
      throw new HttpsError('not-found', `Digital display '${displayId}' not found.`);
    }

    const display = dDoc.data() as DigitalDisplay;
    assertDepartmentAccess(caller, display.departmentId);

    const pubDoc = await db.collection('publications').doc(targetPublicationId).get();
    if (!pubDoc.exists) {
      throw new HttpsError('not-found', `Target publication '${targetPublicationId}' not found.`);
    }

    const targetPub = pubDoc.data() as PublicationRecord;
    if (targetPub.displayId !== displayId) {
      throw new HttpsError(
        'failed-precondition',
        `Publication '${targetPublicationId}' was compiled for digital display '${targetPub.displayId}', not '${displayId}'.`
      );
    }

    const now = new Date().toISOString();
    await dRef.update({
      desiredPublicationId: targetPublicationId,
      currentPublicationId: targetPublicationId,
      publicationUpdatedAt: now,
      updatedAt: now,
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: 'publication.rollback',
      targetId: targetPublicationId,
      targetType: 'publication',
      newState: { displayId, activePublicationId: targetPublicationId },
      metadata: { departmentId: display.departmentId },
    });

    return { displayId, activePublicationId: targetPublicationId };
  }
);

export const setUserDirectPublishPermission = onCall(
  CALLABLE_OPTS,
  async (request): Promise<SetUserDirectPublishPermissionResponse> => {
    const caller = await assertAdminCaller(request.auth);
    const { userId, canDirectPublish } = request.data as SetUserDirectPublishPermissionRequest;

    if (!userId || typeof canDirectPublish !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Missing userId or canDirectPublish boolean.');
    }

    const uRef = db.collection('users').doc(userId);
    const uDoc = await uRef.get();
    if (!uDoc.exists) {
      throw new HttpsError('not-found', `User '${userId}' not found.`);
    }

    const now = new Date().toISOString();
    await uRef.update({
      canDirectPublish,
      updatedAt: now,
    });

    // Also update Custom Claims for offline token validation
    try {
      const authUser = await admin.auth().getUser(userId);
      const currentClaims = authUser.customClaims || {};
      await admin.auth().setCustomUserClaims(userId, {
        ...currentClaims,
        canDirectPublish,
      });
    } catch (e) {
      console.warn('[Aura DIMS] Could not update custom claim for user:', e);
    }

    await writeAuditLog({
      actorId: caller.uid,
      action: 'user.direct_publish_permission_changed',
      targetId: userId,
      targetType: 'user',
      newState: { canDirectPublish },
    });

    return { userId, canDirectPublish };
  }
);

export const evaluateSchedulePreview = onCall(
  CALLABLE_OPTS,
  async (request): Promise<EvaluateSchedulePreviewResponse> => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { displayId, targetIsoString } = request.data as EvaluateSchedulePreviewRequest;

    const dDoc = await db.collection('displays').doc(displayId).get();
    if (!dDoc.exists) {
      throw new HttpsError('not-found', `Digital display '${displayId}' not found.`);
    }

    const display = dDoc.data() as DigitalDisplay;
    assertDepartmentAccess(caller, display.departmentId);

    const schedulesSnap = await db.collection('schedules')
      .where('targetDisplayIds', 'array-contains', displayId)
      .get();

    const candidateSchedules: ScheduleRecord[] = [];
    schedulesSnap.forEach((doc) => {
      const s = doc.data() as ScheduleRecord;
      if (s.status === 'active' || s.status === 'approved') {
        candidateSchedules.push(s);
      }
    });

    const evaluation = evaluateScheduleAtTime({
      schedules: candidateSchedules,
      displayId,
      targetIsoString: targetIsoString || new Date().toISOString(),
      displayOrientation: display.orientation,
      fallbackConfig: (display as any).fallbackConfig,
    });

    return { evaluation };
  }
);
