"use strict";
/**
 * Aura DIMS - Projects & Asset Visibility Migration Script
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Idempotent migration script that:
 * 1. Checks and reports any departments with multiple Department Heads (leaves for manual resolution).
 * 2. Creates deterministic default General projects (proj_general_{deptId}) for each department.
 * 3. Enrolls existing department users into the General project.
 * 4. Backfills assets with ownerDepartmentId, ownerProjectId, kind, visibility, and accessScopes.
 * 5. Backfills designs, playlists, and schedules with default projectId.
 *
 * Usage:
 *   Dry-Run (Default): npx ts-node functions/src/migrations/migrateProjectsAndAssets.ts --dry-run
 *   Apply Changes:     npx ts-node functions/src/migrations/migrateProjectsAndAssets.ts --apply
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
exports.runMigration = runMigration;
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
async function runMigration(options) {
    const { dryRun } = options;
    const now = new Date().toISOString();
    console.log('==============================================================================');
    console.log(` Aura DIMS - Projects & Asset Hierarchy Migration`);
    console.log(` Mode: ${dryRun ? 'DRY-RUN (No writes will be committed)' : 'APPLY (Writing to Firestore)'}`);
    console.log(` Timestamp: ${now}`);
    console.log('==============================================================================\n');
    console.log('--- PRE-MIGRATION BACKUP INSTRUCTIONS ---');
    console.log('Before running in production, ensure a complete Firestore export has been performed:');
    console.log('  gcloud firestore export gs://[YOUR-BACKUP-BUCKET]/backups/pre-projects-migration');
    console.log('For local Firebase Emulator:');
    console.log('  pnpm run emulators:export\n');
    const report = {
        timestamp: now,
        isDryRun: dryRun,
        departmentsScanned: 0,
        generalProjectsCreated: 0,
        membersEnrolled: 0,
        assetsBackfilled: 0,
        designsBackfilled: 0,
        playlistsBackfilled: 0,
        schedulesBackfilled: 0,
        multiHeadAnomalies: [],
    };
    // 1. Fetch all departments
    const deptSnap = await db.collection('departments').get();
    report.departmentsScanned = deptSnap.size;
    console.log(`Found ${deptSnap.size} department(s) to scan.`);
    // 2. Scan users to detect multi-head anomalies and prepare General project enrollments
    const usersSnap = await db.collection('users').get();
    const allUsers = usersSnap.docs.map((d) => d.data());
    const deptUsersMap = new Map();
    for (const u of allUsers) {
        if (u.departmentId && u.status === 'active') {
            const existing = deptUsersMap.get(u.departmentId) || [];
            existing.push(u);
            deptUsersMap.set(u.departmentId, existing);
        }
    }
    // Check each department for multi-head anomalies
    for (const dDoc of deptSnap.docs) {
        const dept = dDoc.data();
        const usersInDept = deptUsersMap.get(dept.id) || [];
        const activeHeads = usersInDept.filter((u) => u.role === 'department_head');
        if (activeHeads.length > 1) {
            report.multiHeadAnomalies.push({
                departmentId: dept.id,
                departmentName: dept.name,
                headCount: activeHeads.length,
                heads: activeHeads.map((h) => ({
                    uid: h.uid,
                    email: h.email,
                    displayName: h.displayName,
                })),
            });
        }
    }
    // 3. Process General Projects and Members
    const pendingGeneralProjects = [];
    const pendingMembers = [];
    for (const dDoc of deptSnap.docs) {
        const dept = dDoc.data();
        const generalProjectId = `proj_general_${dept.id}`;
        const pRef = db.collection('projects').doc(generalProjectId);
        const pDoc = await pRef.get();
        if (!pDoc.exists) {
            const generalProject = {
                id: generalProjectId,
                departmentId: dept.id,
                name: 'General',
                description: `Default workspace for ${dept.name}`,
                status: 'active',
                isGeneral: true,
                createdBy: 'system_migration',
                createdAt: now,
                updatedAt: now,
            };
            pendingGeneralProjects.push(generalProject);
            report.generalProjectsCreated += 1;
        }
        // Prepare members from this department
        const usersInDept = deptUsersMap.get(dept.id) || [];
        for (const u of usersInDept) {
            let memberRole = 'member';
            if (u.role === 'admin' || u.role === 'department_head') {
                memberRole = 'lead';
            }
            else if (u.role === 'viewer') {
                memberRole = 'viewer';
            }
            pendingMembers.push({
                uid: u.uid,
                projectId: generalProjectId,
                role: memberRole,
                addedBy: 'system_migration',
                addedAt: now,
                updatedAt: now,
                userEmail: u.email,
                userDisplayName: u.displayName,
                userCompanyRole: u.role,
            });
            report.membersEnrolled += 1;
        }
    }
    // 4. Scan Assets for Backfill
    const assetsSnap = await db.collection('assets').get();
    const pendingAssetUpdates = [];
    for (const aDoc of assetsSnap.docs) {
        const asset = aDoc.data();
        const deptId = asset.departmentId;
        if (!asset.ownerProjectId || !asset.accessScopes) {
            const generalProjectId = `proj_general_${deptId}`;
            const isDisplayable = asset.mediaType === 'image' || asset.mediaType === 'video';
            const updatePayload = {
                ownerDepartmentId: deptId,
                ownerProjectId: generalProjectId,
                kind: isDisplayable ? 'displayable' : 'reference',
                visibility: 'department', // As required: visibility 'department' so nobody loses access
                sharedWith: asset.sharedWith || [],
                accessScopes: [`dept:${deptId}`, `proj:${generalProjectId}`],
                globalApprovalState: 'none',
                version: asset.version || 1,
                updatedAt: now,
            };
            pendingAssetUpdates.push({ id: asset.id, data: updatePayload });
            report.assetsBackfilled += 1;
        }
    }
    // 5. Scan Designs, Playlists, Schedules for projectId Backfill
    const designsSnap = await db.collection('designs').get();
    const pendingDesignUpdates = [];
    for (const d of designsSnap.docs) {
        const data = d.data();
        if (!data.projectId && data.departmentId) {
            pendingDesignUpdates.push({ id: d.id, projectId: `proj_general_${data.departmentId}` });
            report.designsBackfilled += 1;
        }
    }
    const playlistsSnap = await db.collection('playlists').get();
    const pendingPlaylistUpdates = [];
    for (const p of playlistsSnap.docs) {
        const data = p.data();
        if (!data.projectId && data.departmentId) {
            pendingPlaylistUpdates.push({ id: p.id, projectId: `proj_general_${data.departmentId}` });
            report.playlistsBackfilled += 1;
        }
    }
    const schedulesSnap = await db.collection('schedules').get();
    const pendingScheduleUpdates = [];
    for (const s of schedulesSnap.docs) {
        const data = s.data();
        if (!data.projectId && data.departmentId) {
            pendingScheduleUpdates.push({ id: s.id, projectId: `proj_general_${data.departmentId}` });
            report.schedulesBackfilled += 1;
        }
    }
    // Output review report
    console.log('--- MIGRATION REVIEW REPORT ---');
    console.log(`Departments Scanned:              ${report.departmentsScanned}`);
    console.log(`General Projects to Create:        ${report.generalProjectsCreated}`);
    console.log(`Department Members to Enroll:      ${report.membersEnrolled}`);
    console.log(`Assets to Backfill:                ${report.assetsBackfilled}`);
    console.log(`Designs to Backfill:               ${report.designsBackfilled}`);
    console.log(`Playlists to Backfill:             ${report.playlistsBackfilled}`);
    console.log(`Schedules to Backfill:             ${report.schedulesBackfilled}`);
    if (report.multiHeadAnomalies.length > 0) {
        console.log('\n⚠️ MULTI-HEAD ANOMALIES DETECTED:');
        console.log('The following departments have multiple active Department Heads.');
        console.log('Per policy, they are left for manual resolution by the Administrator (no auto-demote):\n');
        for (const anom of report.multiHeadAnomalies) {
            console.log(`  • Department "${anom.departmentName}" (${anom.departmentId}): ${anom.headCount} heads`);
            for (const h of anom.heads) {
                console.log(`      - ${h.displayName} (${h.email}) [UID: ${h.uid}]`);
            }
        }
    }
    else {
        console.log('\n✓ No multi-head anomalies detected across active departments.');
    }
    // 6. If not dry-run, execute batched writes in chunks of 400
    if (!dryRun) {
        console.log('\nCommitting changes to Firestore...');
        let batch = db.batch();
        let opsCount = 0;
        const commitBatchIfNeeded = async () => {
            if (opsCount >= 400) {
                await batch.commit();
                batch = db.batch();
                opsCount = 0;
            }
        };
        // Commit general projects
        for (const p of pendingGeneralProjects) {
            const ref = db.collection('projects').doc(p.id);
            batch.set(ref, p);
            opsCount++;
            await commitBatchIfNeeded();
        }
        // Commit members
        for (const m of pendingMembers) {
            const ref = db.collection('projects').doc(m.projectId).collection('members').doc(m.uid);
            batch.set(ref, m, { merge: true });
            opsCount++;
            await commitBatchIfNeeded();
        }
        // Commit assets
        for (const a of pendingAssetUpdates) {
            const ref = db.collection('assets').doc(a.id);
            batch.update(ref, a.data);
            opsCount++;
            await commitBatchIfNeeded();
        }
        // Commit designs
        for (const d of pendingDesignUpdates) {
            const ref = db.collection('designs').doc(d.id);
            batch.update(ref, { projectId: d.projectId, updatedAt: now });
            opsCount++;
            await commitBatchIfNeeded();
        }
        // Commit playlists
        for (const p of pendingPlaylistUpdates) {
            const ref = db.collection('playlists').doc(p.id);
            batch.update(ref, { projectId: p.projectId, updatedAt: now });
            opsCount++;
            await commitBatchIfNeeded();
        }
        // Commit schedules
        for (const s of pendingScheduleUpdates) {
            const ref = db.collection('schedules').doc(s.id);
            batch.update(ref, { projectId: s.projectId, updatedAt: now });
            opsCount++;
            await commitBatchIfNeeded();
        }
        if (opsCount > 0) {
            await batch.commit();
        }
        console.log('✓ Migration committed successfully to Firestore.');
    }
    else {
        console.log('\n[Dry-Run Complete] No documents were modified. Pass --apply to commit these changes.');
    }
    return report;
}
// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);
    const isApply = args.includes('--apply');
    const isDryRun = !isApply || args.includes('--dry-run');
    runMigration({ dryRun: isDryRun })
        .then(() => process.exit(0))
        .catch((err) => {
        console.error('Migration failed with error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=migrateProjectsAndAssets.js.map