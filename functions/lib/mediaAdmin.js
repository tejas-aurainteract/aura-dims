"use strict";
/**
 * Aura DIMS - Secure Departmental Media Library Backend
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scope: Privileged Media Upload Initiation, Validation, Thumbnail Processing,
 * Metadata Governance, Private Previews, Archiving, and Cleanup.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredUploads = exports.listMediaAssets = exports.setMediaArchivedStatus = exports.updateMediaMetadata = exports.getMediaPreviewUrl = exports.finalizeMediaUpload = exports.initiateMediaUpload = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("node:crypto"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs/promises"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const sharp_1 = __importDefault(require("sharp"));
const display_schema_1 = require("@aura-dims/display-schema");
const execFilePromise = (0, node_util_1.promisify)(node_child_process_1.execFile);
const db = admin.firestore();
const REGION = 'asia-south1'; // India (Mumbai) regional target
const CALLABLE_OPTS = { region: REGION, cors: true };
// Lazy binary path resolution
function getFfmpegPath() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@ffmpeg-installer/ffmpeg').path;
    }
    catch {
        return 'ffmpeg';
    }
}
function getFfprobePath() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@ffprobe-installer/ffprobe').path;
    }
    catch {
        return 'ffprobe';
    }
}
// ==============================================================================
// Helper Functions for Authorization and Invariant Enforcement
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
function sanitizeFileName(rawName) {
    const base = path.basename(rawName).trim();
    // Strip control chars and invalid filename characters
    const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    return clean || 'unnamed_file';
}
function sanitizeTags(rawTags) {
    if (!Array.isArray(rawTags))
        return [];
    const set = new Set();
    for (const t of rawTags) {
        if (typeof t === 'string') {
            const clean = t.trim().toLowerCase().slice(0, display_schema_1.MEDIA_CONSTRAINTS.MAX_TAG_LENGTH);
            if (clean)
                set.add(clean);
            if (set.size >= display_schema_1.MEDIA_CONSTRAINTS.MAX_TAGS_COUNT)
                break;
        }
    }
    return Array.from(set);
}
// Magic bytes validation
function detectSignature(buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'jpeg';
    }
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a) {
        return 'png';
    }
    if (buffer.length >= 12) {
        // ISO base media file format (MP4) contains 'ftyp' in bytes 4-7
        const ftyp = buffer.toString('ascii', 4, 8);
        if (ftyp === 'ftyp') {
            return 'mp4';
        }
    }
    return 'unknown';
}
// Audit event logger
async function recordMediaAudit(actorId, action, targetId, departmentId, details) {
    try {
        await db.collection('auditEvents').add({
            actorId,
            action,
            targetId,
            targetType: 'asset',
            departmentId,
            timestamp: new Date().toISOString(),
            details: details || {},
        });
    }
    catch (err) {
        console.error('[Aura DIMS Media Audit Error]', err);
    }
}
// ==============================================================================
// 1. initiateMediaUpload
// ==============================================================================
exports.initiateMediaUpload = (0, https_1.onCall)(CALLABLE_OPTS, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { fileName, fileSizeBytes, declaredMimeType, departmentId, title, description, tags } = request.data;
    if (!fileName || typeof fileName !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A valid file name must be provided.');
    }
    if (!fileSizeBytes || typeof fileSizeBytes !== 'number' || fileSizeBytes <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'File size must be a positive integer in bytes.');
    }
    if (!declaredMimeType || typeof declaredMimeType !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A declared MIME type is required.');
    }
    // Resolve target department
    let targetDeptId = caller.departmentId;
    if (caller.role === 'admin') {
        if (departmentId) {
            targetDeptId = departmentId;
        }
        else if (!targetDeptId) {
            throw new https_1.HttpsError('invalid-argument', 'System Administrator must designate a target department for the uploaded asset.');
        }
    }
    else {
        if (!targetDeptId) {
            throw new https_1.HttpsError('failed-precondition', 'Department Head is not assigned to an active department.');
        }
        if (departmentId && departmentId !== targetDeptId) {
            throw new https_1.HttpsError('permission-denied', 'Department Heads cannot initiate uploads into other departments.');
        }
    }
    // Validate department exists and is active
    const deptDoc = await db.collection('departments').doc(targetDeptId).get();
    if (!deptDoc.exists || deptDoc.data()?.status !== 'active') {
        throw new https_1.HttpsError('failed-precondition', 'The selected department does not exist or has been deactivated.');
    }
    // Validate size bounds by declared media type
    const isImage = declaredMimeType === 'image/jpeg' || declaredMimeType === 'image/png';
    const isVideo = declaredMimeType === 'video/mp4';
    if (!isImage && !isVideo) {
        throw new https_1.HttpsError('invalid-argument', `Unsupported media type "${declaredMimeType}". Supported formats are JPEG, PNG, and MP4 (H.264/AAC).`);
    }
    if (isImage && fileSizeBytes > display_schema_1.MEDIA_CONSTRAINTS.MAX_IMAGE_SIZE_BYTES) {
        throw new https_1.HttpsError('invalid-argument', `Image file size exceeds maximum limit of 20 MB (declared: ${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB).`);
    }
    if (isVideo && fileSizeBytes > display_schema_1.MEDIA_CONSTRAINTS.MAX_VIDEO_SIZE_BYTES) {
        throw new https_1.HttpsError('invalid-argument', `Video file size exceeds maximum limit of 200 MB (declared: ${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB).`);
    }
    const sanitized = sanitizeFileName(fileName);
    const assetId = crypto.randomUUID();
    const stagingPath = `staging/${targetDeptId}/${assetId}/${sanitized}`;
    const expiresAt = new Date(Date.now() + display_schema_1.MEDIA_CONSTRAINTS.UPLOAD_INTENT_EXPIRY_MS).toISOString();
    const cleanTitle = (title && typeof title === 'string' ? title.trim() : '') || sanitized.replace(/\.[^/.]+$/, '');
    const cleanDesc = description && typeof description === 'string' ? description.trim() : '';
    const newAsset = {
        id: assetId,
        title: cleanTitle.slice(0, display_schema_1.MEDIA_CONSTRAINTS.MAX_TITLE_LENGTH),
        name: cleanTitle.slice(0, display_schema_1.MEDIA_CONSTRAINTS.MAX_TITLE_LENGTH),
        description: cleanDesc.slice(0, display_schema_1.MEDIA_CONSTRAINTS.MAX_DESCRIPTION_LENGTH),
        tags: sanitizeTags(tags || []),
        fileName: sanitized,
        mediaType: isImage ? 'image' : 'video',
        type: isImage ? 'image' : 'video',
        mimeType: declaredMimeType,
        declaredMimeType,
        fileSizeBytes,
        sizeBytes: fileSizeBytes,
        checksumSha256: '',
        dimensions: { width: 0, height: 0 },
        durationSeconds: null,
        videoCodec: null,
        audioCodec: null,
        departmentId: targetDeptId,
        ownerId: caller.uid,
        uploadedBy: caller.uid,
        uploaderDisplayName: caller.displayName || caller.email,
        storagePath: '',
        stagingPath,
        thumbnailPath: '',
        status: 'awaiting_upload',
        failureReason: null,
        intentExpiresAt: expiresAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        validatedAt: null,
        archivedAt: null,
    };
    await db.collection('assets').doc(assetId).set(newAsset);
    await recordMediaAudit(caller.uid, 'media_upload_initiated', assetId, targetDeptId, {
        fileName: sanitized,
        declaredMimeType,
        fileSizeBytes,
    });
    return {
        assetId,
        stagingPath,
        departmentId: targetDeptId,
        expiresAt,
    };
});
// ==============================================================================
// 2. finalizeMediaUpload
// ==============================================================================
exports.finalizeMediaUpload = (0, https_1.onCall)({ ...CALLABLE_OPTS, memory: '1GiB', timeoutSeconds: 120 }, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { assetId } = request.data;
    if (!assetId || typeof assetId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Valid assetId is required.');
    }
    const assetRef = db.collection('assets').doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Asset upload record not found.');
    }
    const asset = assetSnap.data();
    // Authorization check
    if (caller.role !== 'admin' && caller.departmentId !== asset.departmentId) {
        throw new https_1.HttpsError('permission-denied', 'You do not have access to finalize assets in another department.');
    }
    // Idempotency: If already ready, return immediately
    if (asset.status === 'ready') {
        return { asset };
    }
    if (asset.status === 'archived') {
        return { asset };
    }
    if (!asset.stagingPath) {
        throw new https_1.HttpsError('failed-precondition', 'Asset does not have an allocated staging path.');
    }
    const bucket = admin.storage().bucket();
    const stagingFile = bucket.file(asset.stagingPath);
    const [exists] = await stagingFile.exists();
    if (!exists) {
        throw new https_1.HttpsError('failed-precondition', 'Staged file was not found in Cloud Storage. Ensure client transfer completed.');
    }
    const [metadata] = await stagingFile.getMetadata();
    const actualSizeBytes = Number(metadata.size || 0);
    // Transition to 'validating'
    await assetRef.update({
        status: 'validating',
        updatedAt: new Date().toISOString(),
    });
    const tempDir = os.tmpdir();
    const localStagingPath = path.join(tempDir, `staging-${assetId}-${Date.now()}`);
    let localThumbPath = null;
    try {
        // Download staging object to temp file
        await stagingFile.download({ destination: localStagingPath });
        // 1. Compute Checksum
        const fileBytes = await fs.readFile(localStagingPath);
        const checksumSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
        // 2. Magic byte / Signature verification
        const signature = detectSignature(fileBytes);
        if (signature === 'unknown') {
            throw new Error('Unsupported or unrecognized file signature. File header does not match JPEG, PNG, or MP4.');
        }
        let detectedMimeType = '';
        let detectedExt = '';
        let dimensions = { width: 0, height: 0 };
        let durationSeconds = null;
        let videoCodec = null;
        let audioCodec = null;
        if (signature === 'jpeg' || signature === 'png') {
            detectedMimeType = signature === 'jpeg' ? 'image/jpeg' : 'image/png';
            detectedExt = signature === 'jpeg' ? 'jpg' : 'png';
            // Check image file size against limit
            if (actualSizeBytes > display_schema_1.MEDIA_CONSTRAINTS.MAX_IMAGE_SIZE_BYTES) {
                throw new Error(`Image size exceeds maximum limit of 20 MB (actual: ${(actualSizeBytes / 1024 / 1024).toFixed(1)} MB).`);
            }
            // Validate image dimensions with sharp
            const imageMetadata = await (0, sharp_1.default)(localStagingPath).metadata();
            const w = imageMetadata.width || 0;
            const h = imageMetadata.height || 0;
            if (w === 0 || h === 0) {
                throw new Error('Could not decode image dimensions. The image file appears corrupt.');
            }
            if (w * h > display_schema_1.MEDIA_CONSTRAINTS.MAX_IMAGE_PIXELS) {
                throw new Error(`Image resolution of ${w}x${h} (${((w * h) / 1_000_000).toFixed(1)} MP) exceeds the 40 megapixel limit.`);
            }
            dimensions = { width: w, height: h };
            // Generate private thumbnail (WebP 400x400 bounded)
            localThumbPath = path.join(tempDir, `thumb-${assetId}.webp`);
            await (0, sharp_1.default)(localStagingPath)
                .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(localThumbPath);
        }
        else if (signature === 'mp4') {
            detectedMimeType = 'video/mp4';
            detectedExt = 'mp4';
            if (actualSizeBytes > display_schema_1.MEDIA_CONSTRAINTS.MAX_VIDEO_SIZE_BYTES) {
                throw new Error(`Video size exceeds maximum limit of 200 MB (actual: ${(actualSizeBytes / 1024 / 1024).toFixed(1)} MB).`);
            }
            // Probe video metadata with ffprobe (argument-based, shell-free)
            const ffprobePath = getFfprobePath();
            const { stdout } = await execFilePromise(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', localStagingPath], { timeout: 30000 });
            const probeData = JSON.parse(stdout);
            const videoStream = (probeData.streams || []).find((s) => s.codec_type === 'video');
            if (!videoStream) {
                throw new Error('No valid video stream found inside the MP4 container.');
            }
            videoCodec = String(videoStream.codec_name || '').toLowerCase();
            if (videoCodec !== 'h264') {
                throw new Error(`Unsupported video codec "${videoCodec}". Digital signage playback strictly requires H.264 video.`);
            }
            const rawDuration = Number(probeData.format?.duration) || Number(videoStream.duration) || 0;
            durationSeconds = Math.round(rawDuration);
            if (durationSeconds > display_schema_1.MEDIA_CONSTRAINTS.MAX_VIDEO_DURATION_SECONDS) {
                throw new Error(`Video duration (${durationSeconds}s) exceeds maximum permitted limit of 10 minutes (600s).`);
            }
            const vw = Number(videoStream.width || 0);
            const vh = Number(videoStream.height || 0);
            dimensions = { width: vw, height: vh };
            // Video dimension constraints (max 1920x1080 landscape or 1080x1920 portrait)
            const isLandscape = vw >= vh;
            if (isLandscape) {
                if (vw > 1920 || vh > 1080) {
                    throw new Error(`Video resolution ${vw}x${vh} exceeds maximum landscape dimensions (1920×1080) for digital displays.`);
                }
            }
            else {
                if (vw > 1080 || vh > 1920) {
                    throw new Error(`Video resolution ${vw}x${vh} exceeds maximum portrait dimensions (1080×1920) for digital displays.`);
                }
            }
            // Check audio stream (optional, but must be AAC if present)
            const audioStream = (probeData.streams || []).find((s) => s.codec_type === 'audio');
            if (audioStream) {
                audioCodec = String(audioStream.codec_name || '').toLowerCase();
                if (audioCodec !== 'aac') {
                    throw new Error(`Unsupported audio codec "${audioCodec}". Only AAC audio is permitted in MP4 videos for digital displays.`);
                }
            }
            // Generate poster thumbnail with ffmpeg (argument-based, shell-free)
            const ffmpegPath = getFfmpegPath();
            localThumbPath = path.join(tempDir, `poster-${assetId}.webp`);
            const seekTime = durationSeconds >= 1 ? '00:00:01' : '00:00:00';
            await execFilePromise(ffmpegPath, [
                '-ss',
                seekTime,
                '-i',
                localStagingPath,
                '-vframes',
                '1',
                '-vf',
                "scale='min(400,iw)':-1",
                '-y',
                localThumbPath,
            ], { timeout: 30000 });
        }
        // Promote file to permanent departmental storage
        const finalMediaPath = `media/${asset.departmentId}/${assetId}/original.${detectedExt}`;
        const finalThumbPath = `thumbnails/${asset.departmentId}/${assetId}/thumb.webp`;
        // Upload permanent original
        await bucket.upload(localStagingPath, {
            destination: finalMediaPath,
            metadata: {
                contentType: detectedMimeType,
                metadata: {
                    assetId,
                    departmentId: asset.departmentId,
                    checksumSha256,
                },
            },
        });
        // Upload generated thumbnail
        if (localThumbPath) {
            await bucket.upload(localThumbPath, {
                destination: finalThumbPath,
                metadata: {
                    contentType: 'image/webp',
                    metadata: {
                        assetId,
                        departmentId: asset.departmentId,
                    },
                },
            });
        }
        // Delete staging file in Cloud Storage
        await stagingFile.delete({ ignoreNotFound: true });
        // Update Firestore record to 'ready'
        const updatedData = {
            status: 'ready',
            storagePath: finalMediaPath,
            thumbnailPath: finalThumbPath,
            fileSizeBytes: actualSizeBytes,
            sizeBytes: actualSizeBytes,
            mimeType: detectedMimeType,
            checksumSha256,
            dimensions,
            durationSeconds,
            videoCodec,
            audioCodec,
            failureReason: null,
            validatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await assetRef.update(updatedData);
        await recordMediaAudit(caller.uid, 'media_validation_succeeded', assetId, asset.departmentId, {
            fileSizeBytes: actualSizeBytes,
            mimeType: detectedMimeType,
            dimensions,
            durationSeconds,
            checksumSha256,
        });
        return {
            asset: {
                ...asset,
                ...updatedData,
            },
        };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[Aura DIMS Media Validation Failure] ${assetId}:`, errorMessage);
        // Record failure state
        await assetRef.update({
            status: 'failed',
            failureReason: errorMessage,
            updatedAt: new Date().toISOString(),
        });
        // Clean staging file on failure to prevent unbounded bucket pollution
        await stagingFile.delete({ ignoreNotFound: true }).catch(() => { });
        await recordMediaAudit(caller.uid, 'media_validation_failed', assetId, asset.departmentId, {
            errorMessage,
        });
        throw new https_1.HttpsError('invalid-argument', `Media validation failed: ${errorMessage}`);
    }
    finally {
        // Local temp file cleanup
        await fs.unlink(localStagingPath).catch(() => { });
        if (localThumbPath) {
            await fs.unlink(localThumbPath).catch(() => { });
        }
    }
});
// ==============================================================================
// 3. getMediaPreviewUrl
// ==============================================================================
exports.getMediaPreviewUrl = (0, https_1.onCall)(CALLABLE_OPTS, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { assetId, kind = 'thumbnail' } = request.data;
    if (!assetId || typeof assetId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Valid assetId is required.');
    }
    const assetDoc = await db.collection('assets').doc(assetId).get();
    if (!assetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Asset not found.');
    }
    const asset = assetDoc.data();
    // Enforce departmental access
    if (caller.role !== 'admin' && caller.departmentId !== asset.departmentId) {
        throw new https_1.HttpsError('permission-denied', 'Cannot access media previews belonging to another department.');
    }
    const bucket = admin.storage().bucket();
    const targetPath = kind === 'original'
        ? asset.storagePath
        : asset.thumbnailPath || asset.storagePath;
    if (!targetPath) {
        throw new https_1.HttpsError('failed-precondition', 'Target media storage path is not yet allocated or ready.');
    }
    // Check if running in local emulator mode
    const isEmulator = Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    if (isEmulator) {
        const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
        const bucketName = bucket.name || 'demo-aura-dims.appspot.com';
        const directUrl = `http://${host}/v0/b/${bucketName}/o/${encodeURIComponent(targetPath)}?alt=media`;
        return {
            url: directUrl,
            expiresAt,
            kind,
        };
    }
    try {
        const [signedUrl] = await bucket.file(targetPath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15-minute short-lived token
        });
        return {
            url: signedUrl,
            expiresAt,
            kind,
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new https_1.HttpsError('internal', `Failed to generate secure preview URL: ${msg}`);
    }
});
// ==============================================================================
// 4. updateMediaMetadata
// ==============================================================================
exports.updateMediaMetadata = (0, https_1.onCall)(CALLABLE_OPTS, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { assetId, title, description, tags } = request.data;
    if (!assetId || typeof assetId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Valid assetId is required.');
    }
    const assetRef = db.collection('assets').doc(assetId);
    const assetDoc = await assetRef.get();
    if (!assetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Asset not found.');
    }
    const asset = assetDoc.data();
    // Enforce departmental access
    if (caller.role !== 'admin' && caller.departmentId !== asset.departmentId) {
        throw new https_1.HttpsError('permission-denied', 'Cannot edit metadata for an asset in another department.');
    }
    const updates = {
        updatedAt: new Date().toISOString(),
    };
    if (title !== undefined) {
        if (typeof title !== 'string' || !title.trim()) {
            throw new https_1.HttpsError('invalid-argument', 'Title must be a non-empty string.');
        }
        updates.title = title.trim().slice(0, display_schema_1.MEDIA_CONSTRAINTS.MAX_TITLE_LENGTH);
        updates.name = updates.title;
    }
    if (description !== undefined) {
        updates.description = (typeof description === 'string' ? description.trim() : '').slice(0, display_schema_1.MEDIA_CONSTRAINTS.MAX_DESCRIPTION_LENGTH);
    }
    if (tags !== undefined) {
        updates.tags = sanitizeTags(tags);
    }
    await assetRef.update(updates);
    await recordMediaAudit(caller.uid, 'media_metadata_updated', assetId, asset.departmentId, {
        title: updates.title,
        tags: updates.tags,
    });
    return {
        asset: {
            ...asset,
            ...updates,
        },
    };
});
// ==============================================================================
// 5. setMediaArchivedStatus
// ==============================================================================
exports.setMediaArchivedStatus = (0, https_1.onCall)(CALLABLE_OPTS, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { assetId, archived } = request.data;
    if (!assetId || typeof assetId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Valid assetId is required.');
    }
    if (typeof archived !== 'boolean') {
        throw new https_1.HttpsError('invalid-argument', 'Archived flag must be a boolean.');
    }
    const assetRef = db.collection('assets').doc(assetId);
    const assetDoc = await assetRef.get();
    if (!assetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Asset not found.');
    }
    const asset = assetDoc.data();
    // Enforce departmental access
    if (caller.role !== 'admin' && caller.departmentId !== asset.departmentId) {
        throw new https_1.HttpsError('permission-denied', 'Cannot archive or restore media in another department.');
    }
    if (archived && asset.status !== 'ready') {
        throw new https_1.HttpsError('failed-precondition', `Only media in "ready" state can be archived (current state: ${asset.status}).`);
    }
    if (!archived && asset.status !== 'archived') {
        throw new https_1.HttpsError('failed-precondition', 'Only archived media can be restored.');
    }
    const updates = {
        status: archived ? 'archived' : 'ready',
        archivedAt: archived ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
    };
    await assetRef.update(updates);
    await recordMediaAudit(caller.uid, archived ? 'media_archived' : 'media_restored', assetId, asset.departmentId);
    return {
        asset: {
            ...asset,
            ...updates,
        },
    };
});
// ==============================================================================
// 6. listMediaAssets
// ==============================================================================
exports.listMediaAssets = (0, https_1.onCall)(CALLABLE_OPTS, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { departmentId, mediaType, status, search, pageSize = 24, cursor, includeArchived = false } = request.data || {};
    let query = db.collection('assets');
    // Scoped filtering
    if (caller.role === 'admin') {
        if (departmentId && departmentId !== 'all') {
            query = query.where('departmentId', '==', departmentId);
        }
    }
    else {
        query = query.where('departmentId', '==', caller.departmentId);
    }
    if (mediaType && mediaType !== 'all') {
        query = query.where('mediaType', '==', mediaType);
    }
    if (status && status !== 'all') {
        query = query.where('status', '==', status);
    }
    else if (!includeArchived) {
        // Exclude archived by default
        query = query.where('status', 'in', ['ready', 'validating', 'failed', 'awaiting_upload']);
    }
    const boundedLimit = Math.min(Math.max(Number(pageSize) || 24, 1), 50);
    let docs = [];
    let hasNext = false;
    let resultDocs = [];
    try {
        let orderedQuery = query.orderBy('createdAt', 'desc');
        if (cursor) {
            const cursorDoc = await db.collection('assets').doc(cursor).get();
            if (cursorDoc.exists) {
                orderedQuery = orderedQuery.startAfter(cursorDoc);
            }
        }
        const snapshot = await orderedQuery.limit(boundedLimit + 1).get();
        docs = snapshot.docs;
        hasNext = docs.length > boundedLimit;
        resultDocs = hasNext ? docs.slice(0, boundedLimit) : docs;
    }
    catch (queryErr) {
        console.warn('[listMediaAssets] Ordered query failed (index building/missing), falling back to in-memory sort:', queryErr?.message || queryErr);
        const snapshot = await query.limit(boundedLimit + 1).get();
        docs = [...snapshot.docs].sort((a, b) => {
            const aDate = a.data().createdAt || '';
            const bDate = b.data().createdAt || '';
            return bDate.localeCompare(aDate);
        });
        hasNext = docs.length > boundedLimit;
        resultDocs = hasNext ? docs.slice(0, boundedLimit) : docs;
    }
    let assets = resultDocs.map((d) => d.data());
    // Optional text search filter (by title or fileName)
    if (search && typeof search === 'string' && search.trim()) {
        const term = search.trim().toLowerCase();
        assets = assets.filter((a) => (a.title && a.title.toLowerCase().includes(term)) ||
            (a.fileName && a.fileName.toLowerCase().includes(term)) ||
            (a.tags && a.tags.some((t) => t.toLowerCase().includes(term))));
    }
    const nextCursor = hasNext && resultDocs.length > 0 ? resultDocs[resultDocs.length - 1].id : null;
    return {
        assets,
        nextCursor,
    };
});
// ==============================================================================
// 7. cleanupExpiredUploads
// ==============================================================================
exports.cleanupExpiredUploads = (0, https_1.onCall)(CALLABLE_OPTS, async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    if (caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only System Administrators can invoke storage cleanup.');
    }
    const { dryRun = true } = request.data || {};
    const nowIso = new Date().toISOString();
    const snapshot = await db
        .collection('assets')
        .where('status', '==', 'awaiting_upload')
        .where('intentExpiresAt', '<', nowIso)
        .limit(100)
        .get();
    const bucket = admin.storage().bucket();
    const details = [];
    let cleanedCount = 0;
    for (const doc of snapshot.docs) {
        const asset = doc.data();
        details.push({
            assetId: asset.id,
            stagingPath: asset.stagingPath || '',
            expiredAt: asset.intentExpiresAt || '',
        });
        if (!dryRun) {
            if (asset.stagingPath) {
                await bucket.file(asset.stagingPath).delete({ ignoreNotFound: true }).catch(() => { });
            }
            await doc.ref.delete();
            cleanedCount++;
        }
    }
    if (!dryRun && cleanedCount > 0) {
        await recordMediaAudit(caller.uid, 'media_staging_cleanup', 'system', 'all', {
            cleanedCount,
            dryRun: false,
        });
    }
    return {
        scannedCount: snapshot.docs.length,
        cleanedCount: dryRun ? 0 : cleanedCount,
        details,
    };
});
//# sourceMappingURL=mediaAdmin.js.map