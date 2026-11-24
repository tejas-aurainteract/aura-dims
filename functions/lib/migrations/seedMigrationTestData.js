"use strict";
/**
 * Aura DIMS - Realistic Migration Test Data Seeder
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Seeds emulator with realistic test fixtures covering:
 * - Departments in multiple ID styles (dashed, kebab, underscore)
 * - Users with every company role (admin, department_head, creator, viewer)
 * - A multi-head department anomaly (dept-hr with 2 heads)
 * - Assets across every mediaType (image, video, document) and status (ready, archived, failed, awaiting_upload, validating)
 * - Designs, playlists, and schedules without projectId
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
exports.seedMigrationData = seedMigrationData;
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
async function seedMigrationData() {
    console.log('Seeding realistic migration test data into Firestore...');
    const now = new Date().toISOString();
    const batch = db.batch();
    // 1. Departments in different ID styles
    const departments = [
        { id: 'dept-hr', name: 'Human Resources', status: 'active' },
        { id: 'operations-facilities', name: 'Operations & Facilities', status: 'active' },
        { id: 'marketing_global', name: 'Global Marketing', status: 'active' },
    ];
    for (const dept of departments) {
        batch.set(db.collection('departments').doc(dept.id), {
            ...dept,
            createdAt: now,
            updatedAt: now,
        });
    }
    // 2. Users with every role (including multi-head anomaly in dept-hr)
    const users = [
        { uid: 'user-admin-global', email: 'admin@aurainteract.com', displayName: 'Global Admin', role: 'admin', departmentId: null, status: 'active' },
        // Multi-head anomaly in dept-hr
        { uid: 'user-hr-head-1', email: 'hrhead1@aurainteract.com', displayName: 'HR Head One', role: 'department_head', departmentId: 'dept-hr', status: 'active' },
        { uid: 'user-hr-head-2', email: 'hrhead2@aurainteract.com', displayName: 'HR Head Two', role: 'department_head', departmentId: 'dept-hr', status: 'active' },
        // Operations & Facilities (Head, Creator, Viewer)
        { uid: 'user-ops-head', email: 'opshead@aurainteract.com', displayName: 'Ops Head', role: 'department_head', departmentId: 'operations-facilities', status: 'active' },
        { uid: 'user-ops-creator', email: 'opscreator@aurainteract.com', displayName: 'Ops Creator', role: 'creator', departmentId: 'operations-facilities', status: 'active' },
        { uid: 'user-ops-viewer', email: 'opsviewer@aurainteract.com', displayName: 'Ops Viewer', role: 'viewer', departmentId: 'operations-facilities', status: 'active' },
        // Marketing
        { uid: 'user-mkt-head', email: 'mkthead@aurainteract.com', displayName: 'Marketing Head', role: 'department_head', departmentId: 'marketing_global', status: 'active' },
        { uid: 'user-mkt-creator', email: 'mktcreator@aurainteract.com', displayName: 'Marketing Creator', role: 'creator', departmentId: 'marketing_global', status: 'active' },
    ];
    for (const u of users) {
        batch.set(db.collection('users').doc(u.uid), {
            ...u,
            createdAt: now,
            updatedAt: now,
        });
    }
    // 3. Assets in collection 'assets' (every mediaType & status)
    const assets = [
        {
            id: 'asset-img-ready',
            title: 'Company Welcome Banner',
            fileName: 'welcome.png',
            mediaType: 'image',
            mimeType: 'image/png',
            status: 'ready',
            departmentId: 'operations-facilities',
            storagePath: 'media/operations-facilities/asset-img-ready/original.png',
            checksumSha256: 'sha_img_ready_123',
            fileSizeBytes: 204850,
        },
        {
            id: 'asset-vid-ready',
            title: 'Brand Reel 2026',
            fileName: 'reel.mp4',
            mediaType: 'video',
            mimeType: 'video/mp4',
            status: 'ready',
            departmentId: 'operations-facilities',
            storagePath: 'media/operations-facilities/asset-vid-ready/original.mp4',
            checksumSha256: 'sha_vid_ready_456',
            fileSizeBytes: 15400000,
        },
        {
            id: 'asset-doc-ready',
            title: 'Safety Evacuation Plan PDF',
            fileName: 'evac_plan.pdf',
            mediaType: 'document',
            mimeType: 'application/pdf',
            status: 'ready',
            departmentId: 'operations-facilities',
            storagePath: 'media/operations-facilities/asset-doc-ready/original.pdf',
            checksumSha256: 'sha_doc_ready_789',
            fileSizeBytes: 1048576,
        },
        {
            id: 'asset-img-archived',
            title: 'Old Christmas Promo',
            fileName: 'xmas_old.png',
            mediaType: 'image',
            mimeType: 'image/png',
            status: 'archived',
            departmentId: 'operations-facilities',
            storagePath: 'media/operations-facilities/asset-img-archived/original.png',
            checksumSha256: 'sha_archived_999',
            fileSizeBytes: 512000,
        },
        {
            id: 'asset-img-failed',
            title: 'Corrupted Ingestion Image',
            fileName: 'corrupt.jpg',
            mediaType: 'image',
            mimeType: 'image/jpeg',
            status: 'failed',
            departmentId: 'operations-facilities',
            storagePath: '',
            checksumSha256: '',
            fileSizeBytes: 1024,
            failureReason: 'Invalid image signature',
        },
        {
            id: 'asset-img-awaiting',
            title: 'In Flight Upload',
            fileName: 'in_flight.png',
            mediaType: 'image',
            mimeType: 'image/png',
            status: 'awaiting_upload',
            departmentId: 'operations-facilities',
            stagingPath: 'staging/operations-facilities/asset-img-awaiting/in_flight.png',
            checksumSha256: '',
            fileSizeBytes: 4096,
        },
        {
            id: 'asset-img-validating',
            title: 'Processing Upload',
            fileName: 'processing.png',
            mediaType: 'image',
            mimeType: 'image/png',
            status: 'validating',
            departmentId: 'operations-facilities',
            stagingPath: 'staging/operations-facilities/asset-img-validating/processing.png',
            checksumSha256: '',
            fileSizeBytes: 8192,
        },
        {
            id: 'asset-mkt-img',
            title: 'Global Campaign Graphic',
            fileName: 'campaign.png',
            mediaType: 'image',
            mimeType: 'image/png',
            status: 'ready',
            departmentId: 'marketing_global',
            storagePath: 'media/marketing_global/asset-mkt-img/original.png',
            checksumSha256: 'sha_mkt_111',
            fileSizeBytes: 307200,
        },
    ];
    for (const a of assets) {
        batch.set(db.collection('assets').doc(a.id), {
            ...a,
            ownerId: 'user-ops-head',
            createdAt: now,
            updatedAt: now,
        });
    }
    // 4. Designs lacking projectId
    batch.set(db.collection('designs').doc('design-ops-1'), {
        id: 'design-ops-1',
        title: 'Operations Daily Slide',
        departmentId: 'operations-facilities',
        orientation: 'landscape',
        status: 'draft',
        slideCount: 1,
        referencedAssetIds: ['asset-img-ready'],
        createdAt: now,
        updatedAt: now,
    });
    // 5. Playlists lacking projectId
    batch.set(db.collection('playlists').doc('playlist-ops-1'), {
        id: 'playlist-ops-1',
        title: 'HQ Lobby Display Loop',
        departmentId: 'operations-facilities',
        orientation: 'landscape',
        isArchived: false,
        totalDurationSeconds: 60,
        createdAt: now,
        updatedAt: now,
    });
    // 6. Schedules lacking projectId
    batch.set(db.collection('schedules').doc('schedule-ops-1'), {
        id: 'schedule-ops-1',
        title: 'Operations Active Signage Schedule',
        departmentId: 'operations-facilities',
        orientation: 'landscape',
        status: 'active',
        playlistRevisionId: 'rev-1',
        targetDisplayIds: ['disp-ops-1'],
        createdAt: now,
        updatedAt: now,
    });
    await batch.commit();
    console.log('✓ Seeding complete. All test entities created.');
}
if (require.main === module) {
    seedMigrationData()
        .then(() => process.exit(0))
        .catch((err) => {
        console.error('Seeding failed:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=seedMigrationTestData.js.map