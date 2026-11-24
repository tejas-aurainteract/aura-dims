"use strict";
/**
 * Aura DIMS - General Projects & Membership Seeder
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Idempotent script that:
 * 1. Scans all active departments in Firestore.
 * 2. Checks and reports any departments with multiple Department Heads (leaves for manual resolution).
 * 3. Creates default General projects (`proj_general_{deptId}`) for each department if not existing.
 * 4. Enrolls all active department users into the General project respecting the role invariant:
 *      - admin / department_head -> 'lead'
 *      - creator -> 'member'
 *      - viewer -> 'viewer'
 * 5. Does NOT backfill or modify any assets, designs, playlists, or schedules.
 *
 * Usage:
 *   Dry-run (default): node functions/lib/migrations/seedGeneralProjects.js
 *   Apply writes:      node functions/lib/migrations/seedGeneralProjects.js --apply
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
exports.runGeneralProjectsSeeder = runGeneralProjectsSeeder;
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
async function runGeneralProjectsSeeder(options) {
    const { dryRun } = options;
    const now = new Date().toISOString();
    console.log('==============================================================================');
    console.log(` Aura DIMS - General Projects & Department Membership Seeder`);
    console.log(` Mode: ${dryRun ? 'DRY-RUN (No writes will be committed)' : 'APPLY (Writing to Firestore)'}`);
    console.log(` Timestamp: ${now}`);
    console.log('==============================================================================\n');
    console.log('--- PRE-SEED BACKUP INSTRUCTIONS ---');
    console.log('Before running in production, ensure a complete Firestore export has been performed:');
    console.log('  gcloud firestore export gs://[YOUR-BACKUP-BUCKET]/backups/pre-general-projects-seeder');
    console.log('For local Firebase Emulator:');
    console.log('  pnpm run emulators:export\n');
    const report = {
        timestamp: now,
        isDryRun: dryRun,
        departmentsScanned: 0,
        generalProjectsToCreate: 0,
        membersToEnroll: 0,
        multiHeadAnomalies: [],
    };
    // 1. Fetch all departments
    const deptSnap = await db.collection('departments').get();
    report.departmentsScanned = deptSnap.size;
    console.log(`Found ${deptSnap.size} department(s) to scan.`);
    // 2. Fetch all users to map by department and detect multi-head anomalies
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
    // 3. Detect multi-head anomalies
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
    // 4. Plan General projects and members
    const pendingProjects = [];
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
                createdBy: 'system_seeder',
                createdAt: now,
                updatedAt: now,
            };
            pendingProjects.push(generalProject);
        }
        // Check members for this department
        const usersInDept = deptUsersMap.get(dept.id) || [];
        for (const u of usersInDept) {
            let memberRole = 'member';
            if (u.role === 'admin' || u.role === 'department_head') {
                memberRole = 'lead';
            }
            else if (u.role === 'viewer') {
                memberRole = 'viewer';
            }
            const mRef = pRef.collection('members').doc(u.uid);
            const mDoc = await mRef.get();
            if (!mDoc.exists || mDoc.data()?.role !== memberRole) {
                pendingMembers.push({
                    uid: u.uid,
                    projectId: generalProjectId,
                    role: memberRole,
                    addedBy: 'system_seeder',
                    addedAt: now,
                    updatedAt: now,
                    userEmail: u.email,
                    userDisplayName: u.displayName,
                    userCompanyRole: u.role,
                });
            }
        }
    }
    report.generalProjectsToCreate = pendingProjects.length;
    report.membersToEnroll = pendingMembers.length;
    console.log('--- SEEDER REVIEW REPORT ---');
    console.log(`Departments Scanned:              ${report.departmentsScanned}`);
    console.log(`General Projects to Create:        ${report.generalProjectsToCreate}`);
    console.log(`Department Members to Enroll:      ${report.membersToEnroll}\n`);
    if (report.multiHeadAnomalies.length > 0) {
        console.warn('⚠️ MULTI-HEAD ANOMALIES DETECTED:');
        console.warn('The following departments have multiple active Department Heads.');
        console.warn('Per policy, they are left for manual resolution by the Administrator (no auto-demote):\n');
        for (const anomaly of report.multiHeadAnomalies) {
            console.warn(`  • Department "${anomaly.departmentName}" (${anomaly.departmentId}): ${anomaly.headCount} heads`);
            for (const h of anomaly.heads) {
                console.warn(`      - ${h.displayName} (${h.email}) [UID: ${h.uid}]`);
            }
        }
        console.warn('');
    }
    if (dryRun) {
        console.log('[Dry-Run Complete] No documents were modified. Pass --apply to commit these changes.\n');
        return report;
    }
    console.log('Committing changes to Firestore...');
    const batchLimit = 400;
    let batch = db.batch();
    let opCount = 0;
    for (const proj of pendingProjects) {
        batch.set(db.collection('projects').doc(proj.id), proj, { merge: true });
        opCount++;
        if (opCount >= batchLimit) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
        }
    }
    for (const member of pendingMembers) {
        const memberRef = db
            .collection('projects')
            .doc(member.projectId)
            .collection('members')
            .doc(member.uid);
        batch.set(memberRef, member, { merge: true });
        opCount++;
        if (opCount >= batchLimit) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
        }
    }
    if (opCount > 0) {
        await batch.commit();
    }
    console.log('✓ General Projects & Members committed successfully to Firestore.\n');
    return report;
}
if (require.main === module) {
    const args = process.argv.slice(2);
    const isApply = args.includes('--apply');
    const isDryRun = !isApply;
    runGeneralProjectsSeeder({ dryRun: isDryRun })
        .then(() => process.exit(0))
        .catch((err) => {
        console.error('Fatal seeder error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=seedGeneralProjects.js.map