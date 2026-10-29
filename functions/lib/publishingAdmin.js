"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateSchedulePreview = exports.setUserDirectPublishPermission = exports.rollbackPublication = exports.preparePublication = exports.getApproval = exports.listApprovals = exports.withdrawApproval = exports.reviewApproval = exports.submitForApproval = exports.setScheduleStatus = exports.listSchedules = exports.getSchedule = exports.updateSchedule = exports.createSchedule = exports.getPlaylistRevision = exports.createPlaylistRevision = exports.setPlaylistArchivedStatus = exports.listPlaylists = exports.getPlaylist = exports.updatePlaylist = exports.createPlaylist = exports.getDesignRevision = exports.listDesignRevisions = exports.createDesignRevision = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const crypto = __importStar(require("node:crypto"));
const display_schema_1 = require("@aura-dims/display-schema");
const db = admin.firestore();
const storage = admin.storage();
const REGION = 'asia-south1';
// ==============================================================================
// Authorization & Audit Helpers
// ==============================================================================
async function getAuthenticatedCaller(auth) {
    if (!auth || !auth.uid) {
        throw new https_1.HttpsError('unauthenticated', 'The operation requires an authenticated user session.');
    }
    const callerDoc = await db.collection('users').doc(auth.uid).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('permission-denied', 'No authorized user profile exists for this account.');
    }
    const profile = callerDoc.data();
    if (profile.status !== 'active') {
        throw new https_1.HttpsError('permission-denied', 'The user account has been deactivated.');
    }
    return profile;
}
async function assertAdminCaller(auth) {
    const caller = await getAuthenticatedCaller(auth);
    if (caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only System Administrators can execute this operation.');
    }
    return caller;
}
function assertDepartmentAccess(caller, targetDepartmentId) {
    if (caller.role === 'admin')
        return;
    if (caller.departmentId !== targetDepartmentId) {
        throw new https_1.HttpsError('permission-denied', `Access denied. You do not have permissions for department '${targetDepartmentId}'.`);
    }
}
async function writeAuditLog(params) {
    await db.collection('auditEvents').add({
        actorId: params.actorId,
        action: params.action,
        targetId: params.targetId,
        targetType: params.targetType,
        previousState: params.previousState || null,
        newState: params.newState || null,
        metadata: params.metadata || {},
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    });
}
function computeSha256(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}
// ==============================================================================
// 1. Immutable Design Revisions
// ==============================================================================
exports.createDesignRevision = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { designId } = request.data;
    if (!designId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing designId parameter.');
    }
    const designDoc = await db.collection('designs').doc(designId).get();
    if (!designDoc.exists) {
        throw new https_1.HttpsError('not-found', `Visual design '${designId}' does not exist.`);
    }
    const design = designDoc.data();
    assertDepartmentAccess(caller, design.departmentId);
    // Validate design document
    const validation = (0, display_schema_1.validateDesignDocument)(design.document);
    if (!validation.valid) {
        throw new https_1.HttpsError('failed-precondition', `Cannot create revision: design document has validation errors: ${validation.errors.join('; ')}`);
    }
    // Extract and validate all referenced media assets
    const assetIds = (0, display_schema_1.extractReferencedAssetIds)(design.document);
    const assetManifest = [];
    for (const aId of assetIds) {
        const aDoc = await db.collection('assets').doc(aId).get();
        if (!aDoc.exists) {
            throw new https_1.HttpsError('failed-precondition', `Referenced asset '${aId}' does not exist in the Media Library. Freeze blocked.`);
        }
        const assetData = aDoc.data();
        if (assetData.status !== 'ready') {
            throw new https_1.HttpsError('failed-precondition', `Referenced asset '${assetData.fileName || aId}' is in '${assetData.status}' status (must be 'ready'). Freeze blocked.`);
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
    const fonts = new Set();
    for (const slide of design.document.slides || []) {
        for (const el of slide.elements || []) {
            if (el.type === 'text' && el.fontFamily) {
                fonts.add(el.fontFamily);
            }
        }
    }
    // Calculate total duration
    const totalDuration = (design.document.slides || []).reduce((acc, s) => acc + (s.durationSeconds || 10), 0);
    // Deterministic canonical JSON content hash
    const canonicalJson = JSON.stringify(design.document, Object.keys(design.document).sort());
    const contentHash = computeSha256(canonicalJson);
    // Revision number is design.revision or monotonic count
    const revRef = db.collection('designRevisions').doc();
    const revisionRecord = {
        id: revRef.id,
        designId,
        revisionNumber: (design.revision || 1),
        title: design.title,
        orientation: design.orientation,
        dimensions: design.dimensions,
        departmentId: design.departmentId,
        ownerId: design.ownerId,
        ownerDisplayName: design.ownerDisplayName || caller.displayName,
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
});
exports.listDesignRevisions = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { designId, departmentId, limit: queryLimit } = (request.data || {});
    let query = db.collection('designRevisions');
    if (designId) {
        query = query.where('designId', '==', designId);
    }
    if (caller.role === 'department_head') {
        query = query.where('departmentId', '==', caller.departmentId);
    }
    else if (departmentId) {
        query = query.where('departmentId', '==', departmentId);
    }
    query = query.orderBy('createdAt', 'desc').limit(queryLimit && queryLimit > 0 ? queryLimit : 50);
    const snapshot = await query.get();
    const revisions = [];
    snapshot.forEach((doc) => revisions.push(doc.data()));
    return { revisions };
});
exports.getDesignRevision = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { revisionId } = request.data;
    if (!revisionId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing revisionId parameter.');
    }
    const doc = await db.collection('designRevisions').doc(revisionId).get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Design revision '${revisionId}' does not exist.`);
    }
    const revision = doc.data();
    assertDepartmentAccess(caller, revision.departmentId);
    return { revision };
});
// ==============================================================================
// 2. Playlists & Playlist Revisions
// ==============================================================================
exports.createPlaylist = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { title, description, departmentId, orientation, items } = request.data;
    assertDepartmentAccess(caller, departmentId);
    const playlistItems = (items || []).map((it, idx) => {
        const item = {
            id: crypto.randomUUID(),
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
    const val = (0, display_schema_1.validatePlaylist)({ title, orientation, items: playlistItems });
    if (!val.valid) {
        throw new https_1.HttpsError('invalid-argument', val.errors.join(' '));
    }
    const totalDurationSeconds = playlistItems.reduce((acc, it) => acc + (it.durationSeconds || 10), 0);
    const playlistRef = db.collection('playlists').doc();
    const now = new Date().toISOString();
    const playlistRecord = {
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
});
exports.updatePlaylist = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { playlistId, title, description, items, revision } = request.data;
    if (!playlistId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing playlistId parameter.');
    }
    const playlistRef = db.collection('playlists').doc(playlistId);
    const doc = await playlistRef.get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Playlist '${playlistId}' not found.`);
    }
    const current = doc.data();
    assertDepartmentAccess(caller, current.departmentId);
    // Concurrency conflict check
    if (current.revision !== revision) {
        throw new https_1.HttpsError('failed-precondition', `Playlist concurrency conflict. Server revision is ${current.revision}, but your draft was based on revision ${revision}. Please reload latest version.`);
    }
    const playlistItems = (items || []).map((it, idx) => {
        const item = {
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
    const val = (0, display_schema_1.validatePlaylist)({ title, orientation: current.orientation, items: playlistItems });
    if (!val.valid) {
        throw new https_1.HttpsError('invalid-argument', val.errors.join(' '));
    }
    const totalDurationSeconds = playlistItems.reduce((acc, it) => acc + (it.durationSeconds || 10), 0);
    const nextRevision = (current.revision || 1) + 1;
    const now = new Date().toISOString();
    const updatedRecord = {
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
});
exports.getPlaylist = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { playlistId } = request.data;
    const doc = await db.collection('playlists').doc(playlistId).get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Playlist '${playlistId}' not found.`);
    }
    const playlist = doc.data();
    assertDepartmentAccess(caller, playlist.departmentId);
    return { playlist };
});
exports.listPlaylists = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { departmentId, orientation, includeArchived, limit: queryLimit } = (request.data || {});
    let query = db.collection('playlists');
    if (caller.role === 'department_head') {
        query = query.where('departmentId', '==', caller.departmentId);
    }
    else if (departmentId) {
        query = query.where('departmentId', '==', departmentId);
    }
    if (orientation) {
        query = query.where('orientation', '==', orientation);
    }
    query = query.orderBy('updatedAt', 'desc').limit(queryLimit && queryLimit > 0 ? queryLimit : 50);
    const snapshot = await query.get();
    let playlists = [];
    snapshot.forEach((doc) => playlists.push(doc.data()));
    if (!includeArchived) {
        playlists = playlists.filter((p) => !p.isArchived);
    }
    return { playlists };
});
exports.setPlaylistArchivedStatus = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { playlistId, isArchived } = request.data;
    const ref = db.collection('playlists').doc(playlistId);
    const doc = await ref.get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Playlist '${playlistId}' not found.`);
    }
    const playlist = doc.data();
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
});
exports.createPlaylistRevision = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { playlistId } = request.data;
    const pDoc = await db.collection('playlists').doc(playlistId).get();
    if (!pDoc.exists) {
        throw new https_1.HttpsError('not-found', `Playlist '${playlistId}' not found.`);
    }
    const playlist = pDoc.data();
    assertDepartmentAccess(caller, playlist.departmentId);
    if (!playlist.items || playlist.items.length === 0) {
        throw new https_1.HttpsError('failed-precondition', 'Cannot create revision for an empty playlist.');
    }
    // Freeze all constituent designs into DesignRevisions
    const revItems = [];
    const allReferencedAssets = new Set();
    const assetManifestMap = new Map();
    const fontSet = new Set();
    for (const item of playlist.items) {
        // If item already has a frozen revision, use it; otherwise freeze from latest design
        let dRev;
        if (item.designRevisionId) {
            const drDoc = await db.collection('designRevisions').doc(item.designRevisionId).get();
            if (drDoc.exists) {
                dRev = drDoc.data();
            }
            else {
                dRev = await freezeDesignInternal(item.designId, caller);
            }
        }
        else {
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
    const playlistRevision = {
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
});
async function freezeDesignInternal(designId, caller) {
    const designDoc = await db.collection('designs').doc(designId).get();
    if (!designDoc.exists) {
        throw new https_1.HttpsError('not-found', `Referenced design '${designId}' not found.`);
    }
    const design = designDoc.data();
    const validation = (0, display_schema_1.validateDesignDocument)(design.document);
    if (!validation.valid) {
        throw new https_1.HttpsError('failed-precondition', `Design '${design.title}' has errors: ${validation.errors.join('; ')}`);
    }
    const assetIds = (0, display_schema_1.extractReferencedAssetIds)(design.document);
    const assetManifest = [];
    for (const aId of assetIds) {
        const aDoc = await db.collection('assets').doc(aId).get();
        if (aDoc.exists) {
            const aData = aDoc.data();
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
    const fonts = new Set();
    for (const slide of design.document.slides || []) {
        for (const el of slide.elements || []) {
            if (el.type === 'text' && el.fontFamily)
                fonts.add(el.fontFamily);
        }
    }
    const totalDuration = (design.document.slides || []).reduce((acc, s) => acc + (s.durationSeconds || 10), 0);
    const canonicalJson = JSON.stringify(design.document, Object.keys(design.document).sort());
    const contentHash = computeSha256(canonicalJson);
    const revRef = db.collection('designRevisions').doc();
    const revision = {
        id: revRef.id,
        designId,
        revisionNumber: design.revision || 1,
        title: design.title,
        orientation: design.orientation,
        dimensions: design.dimensions,
        departmentId: design.departmentId,
        ownerId: design.ownerId,
        ownerDisplayName: design.ownerDisplayName || caller.displayName,
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
exports.getPlaylistRevision = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { revisionId } = request.data;
    const doc = await db.collection('playlistRevisions').doc(revisionId).get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Playlist revision '${revisionId}' not found.`);
    }
    const revision = doc.data();
    assertDepartmentAccess(caller, revision.departmentId);
    return { revision };
});
// ==============================================================================
// 3. Schedules & Target Authorization
// ==============================================================================
async function validateAndResolveTargets(caller, targetDisplayIds, orientation, departmentId) {
    if (!targetDisplayIds || targetDisplayIds.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Schedule must target at least one active digital display.');
    }
    const resolvedIds = [];
    const resolvedNames = [];
    for (const dId of targetDisplayIds) {
        const dDoc = await db.collection('displays').doc(dId).get();
        if (!dDoc.exists) {
            throw new https_1.HttpsError('not-found', `Digital display '${dId}' does not exist.`);
        }
        const display = dDoc.data();
        // Check active lifecycle
        if (display.lifecycle !== 'active') {
            throw new https_1.HttpsError('failed-precondition', `Digital display '${display.name || dId}' is in '${display.lifecycle}' state (must be 'active').`);
        }
        // Check orientation compatibility
        if (display.orientation !== orientation) {
            throw new https_1.HttpsError('failed-precondition', `Orientation mismatch: Digital display '${display.name || dId}' is configured as ${display.orientation}, but schedule is ${orientation}.`);
        }
        // Department Head access checks
        if (caller.role === 'department_head') {
            if (display.departmentId !== caller.departmentId) {
                throw new https_1.HttpsError('permission-denied', `Digital display '${display.name || dId}' belongs to department '${display.departmentId}', not your assigned department '${caller.departmentId}'.`);
            }
            // Check explicit assignment
            const assignRef = await db.collection('displayAssignments')
                .where('displayId', '==', dId)
                .where('uid', '==', caller.uid)
                .get();
            const isDirectlyAssigned = !assignRef.empty || display.assignedUserIds?.includes(caller.uid);
            if (!isDirectlyAssigned) {
                throw new https_1.HttpsError('permission-denied', `You are not assigned to digital display '${display.name || dId}'. Digital displays must be explicitly assigned to you by an Administrator.`);
            }
        }
        resolvedIds.push(dId);
        resolvedNames.push(display.name || dId);
    }
    return { displayIds: resolvedIds, displayNames: resolvedNames };
}
exports.createSchedule = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { title, departmentId, playlistRevisionId, playlistTitle, targetDisplayIds, orientation, scheduleRule, fallbackConfig, } = request.data;
    assertDepartmentAccess(caller, departmentId);
    // Validate schedule rule
    const ruleVal = (0, display_schema_1.validateScheduleRule)(scheduleRule);
    if (!ruleVal.valid) {
        throw new https_1.HttpsError('invalid-argument', ruleVal.errors.join(' '));
    }
    // Department Heads cannot use priority 10 (Admin emergency override)
    if (caller.role === 'department_head' && scheduleRule.priority >= 10) {
        throw new https_1.HttpsError('permission-denied', 'Priority 10 is reserved exclusively for System Administrator emergency broadcasts.');
    }
    // Validate targets
    const { displayIds, displayNames } = await validateAndResolveTargets(caller, targetDisplayIds, orientation, departmentId);
    const schedRef = db.collection('schedules').doc();
    const now = new Date().toISOString();
    const scheduleRecord = {
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
});
exports.updateSchedule = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId, title, playlistRevisionId, playlistTitle, targetDisplayIds, scheduleRule, fallbackConfig, } = request.data;
    const ref = db.collection('schedules').doc(scheduleId);
    const doc = await ref.get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }
    const current = doc.data();
    assertDepartmentAccess(caller, current.departmentId);
    const ruleVal = (0, display_schema_1.validateScheduleRule)(scheduleRule);
    if (!ruleVal.valid) {
        throw new https_1.HttpsError('invalid-argument', ruleVal.errors.join(' '));
    }
    if (caller.role === 'department_head' && scheduleRule.priority >= 10) {
        throw new https_1.HttpsError('permission-denied', 'Priority 10 is reserved for System Administrators.');
    }
    const { displayIds, displayNames } = await validateAndResolveTargets(caller, targetDisplayIds, current.orientation, current.departmentId);
    // If schedule was previously approved, modifying it invalidates the approval!
    const wasApproved = current.status === 'approved' || current.status === 'active';
    let newStatus = current.status;
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
    const updated = {
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
});
exports.getSchedule = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId } = request.data;
    const doc = await db.collection('schedules').doc(scheduleId).get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }
    const schedule = doc.data();
    assertDepartmentAccess(caller, schedule.departmentId);
    return { schedule };
});
exports.listSchedules = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { departmentId, displayId, status, limit: queryLimit } = (request.data || {});
    let query = db.collection('schedules');
    if (caller.role === 'department_head') {
        query = query.where('departmentId', '==', caller.departmentId);
    }
    else if (departmentId) {
        query = query.where('departmentId', '==', departmentId);
    }
    if (status) {
        query = query.where('status', '==', status);
    }
    query = query.orderBy('updatedAt', 'desc').limit(queryLimit && queryLimit > 0 ? queryLimit : 50);
    const snap = await query.get();
    let schedules = [];
    snap.forEach((doc) => schedules.push(doc.data()));
    if (displayId) {
        schedules = schedules.filter((s) => s.targetDisplayIds.includes(displayId));
    }
    return { schedules };
});
exports.setScheduleStatus = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId, status } = request.data;
    const ref = db.collection('schedules').doc(scheduleId);
    const doc = await ref.get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }
    const current = doc.data();
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
});
// ==============================================================================
// 4. Approval Workflows
// ==============================================================================
exports.submitForApproval = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId } = request.data;
    const sDoc = await db.collection('schedules').doc(scheduleId).get();
    if (!sDoc.exists) {
        throw new https_1.HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }
    const schedule = sDoc.data();
    assertDepartmentAccess(caller, schedule.departmentId);
    // Re-validate targets and resolve names
    const { displayIds, displayNames } = await validateAndResolveTargets(caller, schedule.targetDisplayIds, schedule.orientation, schedule.departmentId);
    const appRef = db.collection('approvals').doc();
    const now = new Date().toISOString();
    const approvalRecord = {
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
    const updatedSchedule = {
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
});
exports.reviewApproval = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { approvalId, decision, rejectionReason } = request.data;
    if (!approvalId || !decision) {
        throw new https_1.HttpsError('invalid-argument', 'Missing approvalId or decision parameter.');
    }
    if (decision === 'rejected' && (!rejectionReason || rejectionReason.trim().length === 0)) {
        throw new https_1.HttpsError('invalid-argument', 'Rejection reason is mandatory when rejecting a submission.');
    }
    const aDoc = await db.collection('approvals').doc(approvalId).get();
    if (!aDoc.exists) {
        throw new https_1.HttpsError('not-found', `Approval '${approvalId}' not found.`);
    }
    const approval = aDoc.data();
    if (approval.status !== 'pending_review') {
        throw new https_1.HttpsError('failed-precondition', `Submission is in '${approval.status}' status (must be 'pending_review' to decide).`);
    }
    const now = new Date().toISOString();
    const newStatus = decision === 'approved' ? 'approved' : 'rejected';
    const historyEntry = {
        action: decision,
        actorId: caller.uid,
        actorName: caller.displayName,
        timestamp: now,
        reason: rejectionReason || null,
    };
    const updatedApproval = {
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
    let updatedSchedule = null;
    if (approval.scheduleId) {
        const sRef = db.collection('schedules').doc(approval.scheduleId);
        const sDoc = await sRef.get();
        if (sDoc.exists) {
            const curSchedule = sDoc.data();
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
    return { approval: updatedApproval, schedule: updatedSchedule };
});
exports.withdrawApproval = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { approvalId, reason } = request.data;
    const aDoc = await db.collection('approvals').doc(approvalId).get();
    if (!aDoc.exists) {
        throw new https_1.HttpsError('not-found', `Approval '${approvalId}' not found.`);
    }
    const approval = aDoc.data();
    assertDepartmentAccess(caller, approval.departmentId);
    if (approval.status !== 'pending_review') {
        throw new https_1.HttpsError('failed-precondition', `Cannot withdraw submission with status '${approval.status}'.`);
    }
    const now = new Date().toISOString();
    const updatedApproval = {
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
    let updatedSchedule = null;
    if (approval.scheduleId) {
        const sRef = db.collection('schedules').doc(approval.scheduleId);
        const sDoc = await sRef.get();
        if (sDoc.exists) {
            await sRef.update({ status: 'withdrawn', updatedAt: now });
            updatedSchedule = { ...sDoc.data(), status: 'withdrawn', updatedAt: now };
        }
    }
    await writeAuditLog({
        actorId: caller.uid,
        action: 'approval.withdrawn',
        targetId: approvalId,
        targetType: 'approval',
        metadata: { departmentId: approval.departmentId },
    });
    return { approval: updatedApproval, schedule: updatedSchedule };
});
exports.listApprovals = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { departmentId, status, limit: queryLimit } = (request.data || {});
    let query = db.collection('approvals');
    if (caller.role === 'department_head') {
        query = query.where('departmentId', '==', caller.departmentId);
    }
    else if (departmentId) {
        query = query.where('departmentId', '==', departmentId);
    }
    if (status) {
        query = query.where('status', '==', status);
    }
    query = query.orderBy('createdAt', 'desc').limit(queryLimit && queryLimit > 0 ? queryLimit : 50);
    const snap = await query.get();
    const approvals = [];
    snap.forEach((doc) => approvals.push(doc.data()));
    return { approvals };
});
exports.getApproval = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { approvalId } = request.data;
    const doc = await db.collection('approvals').doc(approvalId).get();
    if (!doc.exists) {
        throw new https_1.HttpsError('not-found', `Approval '${approvalId}' not found.`);
    }
    const approval = doc.data();
    assertDepartmentAccess(caller, approval.departmentId);
    return { approval };
});
// ==============================================================================
// 5. Publication Preparation & Rollback
// ==============================================================================
exports.preparePublication = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { scheduleId, idempotencyKey } = request.data;
    if (!scheduleId || !idempotencyKey) {
        throw new https_1.HttpsError('invalid-argument', 'Missing scheduleId or idempotencyKey.');
    }
    const sDoc = await db.collection('schedules').doc(scheduleId).get();
    if (!sDoc.exists) {
        throw new https_1.HttpsError('not-found', `Schedule '${scheduleId}' not found.`);
    }
    const schedule = sDoc.data();
    assertDepartmentAccess(caller, schedule.departmentId);
    // Authorization check: must be Admin, or Dept Head with canDirectPublish, or approved schedule
    const isDirectAuthorized = caller.role === 'admin' || !!caller.canDirectPublish;
    if (!isDirectAuthorized && schedule.status !== 'approved') {
        throw new https_1.HttpsError('permission-denied', `Schedule '${schedule.title}' has status '${schedule.status}'. Direct publishing is not enabled for your account; submission must be approved by an Administrator.`);
    }
    // Idempotency check: see if publication for this key already exists
    const existingPub = await db.collection('publications')
        .where('idempotencyKey', '==', idempotencyKey)
        .where('scheduleId', '==', scheduleId)
        .limit(1)
        .get();
    if (!existingPub.empty) {
        const pub = existingPub.docs[0].data();
        if (pub.status === 'prepared') {
            return {
                publication: pub,
                manifest: {}, // manifest stored in storage
                targetedDisplayCount: schedule.targetDisplayIds.length,
            };
        }
    }
    // Preflight re-validation of all target digital displays
    const { displayIds } = await validateAndResolveTargets(caller, schedule.targetDisplayIds, schedule.orientation, schedule.departmentId);
    // Conflict detection across all targets
    const allSchedulesSnap = await db.collection('schedules')
        .where('departmentId', '==', schedule.departmentId)
        .get();
    const candidateSchedules = [];
    allSchedulesSnap.forEach((doc) => {
        const s = doc.data();
        if (s.id !== scheduleId && (s.status === 'approved' || s.status === 'active')) {
            candidateSchedules.push(s);
        }
    });
    candidateSchedules.push(schedule); // Include current schedule
    for (const dId of displayIds) {
        const conflictResult = (0, display_schema_1.detectScheduleConflicts)(candidateSchedules, dId, schedule.orientation);
        if (conflictResult.hasConflict) {
            const c = conflictResult.conflicts[0];
            throw new https_1.HttpsError('failed-precondition', `Publication blocked by schedule collision on digital display '${dId}' at ${c.date} ${c.time}: overlapping schedules [${c.conflictingTitles.join(', ')}] have equal priority (${c.priority}).`);
        }
    }
    // Load PlaylistRevision and constituent DesignRevisions
    const prDoc = await db.collection('playlistRevisions').doc(schedule.playlistRevisionId).get();
    if (!prDoc.exists) {
        throw new https_1.HttpsError('not-found', `Playlist revision '${schedule.playlistRevisionId}' not found.`);
    }
    const playlistRev = prDoc.data();
    // Load full DesignRevisions
    const playlistItemsForManifest = [];
    const allAssetsMap = new Map();
    for (const it of playlistRev.items) {
        const drDoc = await db.collection('designRevisions').doc(it.designRevisionId).get();
        if (!drDoc.exists) {
            throw new https_1.HttpsError('failed-precondition', `Missing design revision '${it.designRevisionId}'.`);
        }
        const dr = drDoc.data();
        playlistItemsForManifest.push({
            designRevisionId: dr.id,
            title: dr.title,
            durationSeconds: dr.totalDurationSeconds,
            slides: dr.document.slides,
        });
        dr.assetManifest.forEach((a) => allAssetsMap.set(a.assetId, a));
    }
    // Fallback slide
    const neutralFallback = (0, display_schema_1.getBundledNeutralFallback)(schedule.orientation);
    const now = new Date().toISOString();
    const expiresAt = `${schedule.scheduleRule.endDate}T${schedule.scheduleRule.endTime}:00+05:30`;
    // Process publication for the first target display as master publication record
    const pubRef = db.collection('publications').doc();
    const primaryDisplayId = displayIds[0];
    const dDoc = await db.collection('displays').doc(primaryDisplayId).get();
    const displayName = dDoc.exists ? dDoc.data().name : primaryDisplayId;
    const storagePath = `packages/${primaryDisplayId}/${pubRef.id}/manifest.json`;
    const manifest = {
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
    const publicationRecord = {
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
});
exports.rollbackPublication = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { displayId, targetPublicationId } = request.data;
    const dRef = db.collection('displays').doc(displayId);
    const dDoc = await dRef.get();
    if (!dDoc.exists) {
        throw new https_1.HttpsError('not-found', `Digital display '${displayId}' not found.`);
    }
    const display = dDoc.data();
    assertDepartmentAccess(caller, display.departmentId);
    const pubDoc = await db.collection('publications').doc(targetPublicationId).get();
    if (!pubDoc.exists) {
        throw new https_1.HttpsError('not-found', `Target publication '${targetPublicationId}' not found.`);
    }
    const targetPub = pubDoc.data();
    if (targetPub.displayId !== displayId) {
        throw new https_1.HttpsError('failed-precondition', `Publication '${targetPublicationId}' was compiled for digital display '${targetPub.displayId}', not '${displayId}'.`);
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
});
exports.setUserDirectPublishPermission = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { userId, canDirectPublish } = request.data;
    if (!userId || typeof canDirectPublish !== 'boolean') {
        throw new https_1.HttpsError('invalid-argument', 'Missing userId or canDirectPublish boolean.');
    }
    const uRef = db.collection('users').doc(userId);
    const uDoc = await uRef.get();
    if (!uDoc.exists) {
        throw new https_1.HttpsError('not-found', `User '${userId}' not found.`);
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
    }
    catch (e) {
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
});
exports.evaluateSchedulePreview = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { displayId, targetIsoString } = request.data;
    const dDoc = await db.collection('displays').doc(displayId).get();
    if (!dDoc.exists) {
        throw new https_1.HttpsError('not-found', `Digital display '${displayId}' not found.`);
    }
    const display = dDoc.data();
    assertDepartmentAccess(caller, display.departmentId);
    const schedulesSnap = await db.collection('schedules')
        .where('targetDisplayIds', 'array-contains', displayId)
        .get();
    const candidateSchedules = [];
    schedulesSnap.forEach((doc) => {
        const s = doc.data();
        if (s.status === 'active' || s.status === 'approved') {
            candidateSchedules.push(s);
        }
    });
    const evaluation = (0, display_schema_1.evaluateScheduleAtTime)({
        schedules: candidateSchedules,
        displayId,
        targetIsoString: targetIsoString || new Date().toISOString(),
        displayOrientation: display.orientation,
        fallbackConfig: display.fallbackConfig,
    });
    return { evaluation };
});
//# sourceMappingURL=publishingAdmin.js.map