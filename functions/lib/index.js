"use strict";
/**
 * Aura DIMS - Backend Cloud Functions (v2)
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scope: Privileged Administrative Operations & Departmental Governance
 * Enforces explicit caller authorization on all Admin SDK mutations.
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
exports.seedStarterTemplates = exports.setTemplateArchivedStatus = exports.instantiateTemplate = exports.createTemplate = exports.listTemplates = exports.convertDesignOrientation = exports.listDesigns = exports.setDesignArchivedStatus = exports.duplicateDesign = exports.updateDesign = exports.getDesign = exports.createDesign = exports.cleanupExpiredUploads = exports.listMediaAssets = exports.setMediaArchivedStatus = exports.updateMediaMetadata = exports.getMediaPreviewUrl = exports.finalizeMediaUpload = exports.initiateMediaUpload = exports.setDepartmentStatus = exports.updateDepartment = exports.createDepartment = exports.triggerPasswordReset = exports.setUserActiveStatus = exports.updateUser = exports.provisionUser = exports.apiHealth = exports.healthCheck = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const crypto = __importStar(require("node:crypto"));
// Initialize Firebase Admin SDK once
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
const REGION = 'asia-south1'; // India (Mumbai) regional target
// ==============================================================================
// Helper Functions for Authorization and Invariant Enforcement
// ==============================================================================
/**
 * Validates caller authentication and retrieves caller profile from Firestore.
 * Does not rely on client claims alone for privileged checks.
 */
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
/**
 * Asserts that the caller is an active Administrator.
 */
async function assertAdminCaller(auth) {
    const caller = await getAuthenticatedCaller(auth);
    if (caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only System Administrators can execute this operation.');
    }
    return caller;
}
/**
 * Writes an append-only audit event to `/auditEvents` collection.
 */
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
// ==============================================================================
// Public Diagnostic & Health Check Endpoints
// ==============================================================================
exports.healthCheck = (0, https_1.onCall)({ cors: true, region: REGION }, async (request) => {
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    const projectId = process.env.GCLOUD_PROJECT || 'demo-aura-dims';
    return {
        status: 'healthy',
        service: 'Aura DIMS Cloud Functions (v2)',
        product: 'Aura Digital Information Management System',
        company: 'Aurainteract Private Limited',
        timezone: 'Asia/Kolkata',
        timestamp: new Date().toISOString(),
        emulator: isEmulator,
        projectId,
        authContext: {
            authenticated: !!request.auth,
            uid: request.auth?.uid || null,
        },
    };
});
exports.apiHealth = (0, https_1.onRequest)({ cors: true, region: REGION }, (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'Aura DIMS HTTP Gateway',
        company: 'Aurainteract Private Limited',
        timezone: 'Asia/Kolkata',
        timestamp: new Date().toISOString(),
        projectId: process.env.GCLOUD_PROJECT || 'demo-aura-dims',
        emulator: process.env.FUNCTIONS_EMULATOR === 'true',
    });
});
// ==============================================================================
// Admin User Provisioning and Lifecycle Operations
// ==============================================================================
/**
 * Provisions a new user account.
 * Accessible strictly to active System Administrators.
 */
exports.provisionUser = (0, https_1.onCall)({ cors: true, region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { email, displayName, role, departmentId } = request.data;
    // Validation
    if (!email || !email.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'A valid email address is required.');
    }
    if (!displayName || !displayName.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Display name is required.');
    }
    if (role !== 'admin' && role !== 'department_head') {
        throw new https_1.HttpsError('invalid-argument', 'Role must be either "admin" or "department_head".');
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    // Department Head must be assigned to an active department
    if (role === 'department_head') {
        if (!departmentId) {
            throw new https_1.HttpsError('invalid-argument', 'A Department Head must be assigned to a department.');
        }
        const deptDoc = await db.collection('departments').doc(departmentId).get();
        if (!deptDoc.exists || deptDoc.data().status !== 'active') {
            throw new https_1.HttpsError('failed-precondition', 'Assigned department does not exist or is inactive.');
        }
    }
    let authUser;
    let isNewAuth = false;
    // Check if user exists in Firebase Authentication
    try {
        authUser = await admin.auth().getUserByEmail(cleanEmail);
        // Check if user profile already exists in Firestore
        const existingProfile = await db.collection('users').doc(authUser.uid).get();
        if (existingProfile.exists) {
            throw new https_1.HttpsError('already-exists', 'A user profile with this email already exists.');
        }
    }
    catch (err) {
        const fbErr = err;
        if (fbErr.code === 'auth/user-not-found') {
            // User does not exist in Auth, create one with a secure random initial password
            const randomPassword = crypto.randomBytes(24).toString('base64') + '!Aa1';
            authUser = await admin.auth().createUser({
                email: cleanEmail,
                displayName: cleanName,
                password: randomPassword,
                emailVerified: true,
            });
            isNewAuth = true;
        }
        else {
            throw err;
        }
    }
    const targetUid = authUser.uid;
    const finalDepartmentId = role === 'department_head' ? (departmentId || null) : null;
    try {
        // Transactionally record user and increment activeAdminCount if admin
        await db.runTransaction(async (transaction) => {
            const countsRef = db.collection('systemMetadata').doc('counts');
            const countsDoc = await transaction.get(countsRef);
            let activeAdminCount = 0;
            let totalUserCount = 0;
            if (countsDoc.exists) {
                const cData = countsDoc.data();
                activeAdminCount = Number(cData?.activeAdminCount || 0);
                totalUserCount = Number(cData?.totalUserCount || 0);
            }
            if (role === 'admin') {
                activeAdminCount += 1;
            }
            totalUserCount += 1;
            transaction.set(countsRef, {
                activeAdminCount,
                totalUserCount,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            const userRef = db.collection('users').doc(targetUid);
            transaction.set(userRef, {
                uid: targetUid,
                email: cleanEmail,
                displayName: cleanName,
                role,
                departmentId: finalDepartmentId,
                status: 'active',
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        // Set custom claims for security rules and tokens
        await admin.auth().setCustomUserClaims(targetUid, {
            role,
            departmentId: finalDepartmentId,
            active: true,
        });
        // Generate password setup link
        let setupLink;
        try {
            setupLink = await admin.auth().generatePasswordResetLink(cleanEmail);
        }
        catch (linkErr) {
            console.warn('[Aura DIMS] Could not generate password reset link:', linkErr);
        }
        // Record Audit Event
        await writeAuditLog({
            actorId: caller.uid,
            action: 'user.provision',
            targetId: targetUid,
            targetType: 'user',
            newState: {
                email: cleanEmail,
                displayName: cleanName,
                role,
                departmentId: finalDepartmentId,
                status: 'active',
            },
        });
        return {
            uid: targetUid,
            email: cleanEmail,
            displayName: cleanName,
            role,
            departmentId: finalDepartmentId,
            status: 'active',
            setupLink,
        };
    }
    catch (firestoreErr) {
        // Partial failure cleanup: if we just created the Auth user and Firestore failed, roll back Auth user
        if (isNewAuth) {
            try {
                await admin.auth().deleteUser(targetUid);
            }
            catch (cleanupErr) {
                console.error('[Aura DIMS] Failed to roll back Auth user after failed Firestore creation:', cleanupErr);
            }
        }
        throw firestoreErr;
    }
});
/**
 * Updates an existing user's profile, role, or department assignment.
 * Implements strict Last-Admin invariant protection.
 */
exports.updateUser = (0, https_1.onCall)({ cors: true, region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { uid, displayName, role, departmentId } = request.data;
    if (!uid) {
        throw new https_1.HttpsError('invalid-argument', 'Target user UID is required.');
    }
    const userRef = db.collection('users').doc(uid);
    const countsRef = db.collection('systemMetadata').doc('counts');
    let updatedProfile = null;
    await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Target user profile does not exist.');
        }
        const current = userDoc.data();
        const targetRole = role || current.role;
        const targetName = displayName !== undefined ? displayName.trim() : current.displayName;
        let targetDept = departmentId !== undefined ? departmentId : current.departmentId;
        if (targetRole === 'admin') {
            targetDept = null;
        }
        else if (targetRole === 'department_head' && !targetDept) {
            throw new https_1.HttpsError('invalid-argument', 'A Department Head must have an assigned department.');
        }
        // Check last-admin invariant if role is being demoted
        const countsDoc = await transaction.get(countsRef);
        let activeAdminCount = countsDoc.exists ? Number(countsDoc.data()?.activeAdminCount || 0) : 0;
        if (current.role === 'admin' && current.status === 'active' && targetRole !== 'admin') {
            if (activeAdminCount <= 1) {
                throw new https_1.HttpsError('failed-precondition', 'Cannot demote the last active Administrator.');
            }
            activeAdminCount -= 1;
        }
        else if (current.role !== 'admin' && targetRole === 'admin' && current.status === 'active') {
            activeAdminCount += 1;
        }
        transaction.set(countsRef, {
            activeAdminCount,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.update(userRef, {
            displayName: targetName,
            role: targetRole,
            departmentId: targetDept,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        updatedProfile = {
            ...current,
            displayName: targetName,
            role: targetRole,
            departmentId: targetDept,
        };
    });
    if (!updatedProfile) {
        throw new https_1.HttpsError('internal', 'User update failed.');
    }
    const finalProfile = updatedProfile;
    // Update Firebase Auth claims and displayName
    await admin.auth().updateUser(uid, {
        displayName: finalProfile.displayName,
    });
    await admin.auth().setCustomUserClaims(uid, {
        role: finalProfile.role,
        departmentId: finalProfile.departmentId,
        active: finalProfile.status === 'active',
    });
    // Record Audit Event
    await writeAuditLog({
        actorId: caller.uid,
        action: 'user.update',
        targetId: uid,
        targetType: 'user',
        newState: {
            displayName: finalProfile.displayName,
            role: finalProfile.role,
            departmentId: finalProfile.departmentId,
        },
    });
    return {
        uid: finalProfile.uid,
        displayName: finalProfile.displayName,
        role: finalProfile.role,
        departmentId: finalProfile.departmentId,
        status: finalProfile.status,
    };
});
/**
 * Activates or deactivates a user's application access.
 * Implements strict Last-Admin invariant protection and immediate token revocation.
 */
exports.setUserActiveStatus = (0, https_1.onCall)({ cors: true, region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { uid, status } = request.data;
    if (!uid || (status !== 'active' && status !== 'inactive')) {
        throw new https_1.HttpsError('invalid-argument', 'Valid target UID and status ("active" | "inactive") are required.');
    }
    const userRef = db.collection('users').doc(uid);
    const countsRef = db.collection('systemMetadata').doc('counts');
    await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Target user does not exist.');
        }
        const current = userDoc.data();
        if (current.status === status) {
            return; // No-op if status unchanged
        }
        const countsDoc = await transaction.get(countsRef);
        let activeAdminCount = countsDoc.exists ? Number(countsDoc.data()?.activeAdminCount || 0) : 0;
        // Last-Admin check on deactivation
        if (current.role === 'admin' && status === 'inactive') {
            if (activeAdminCount <= 1) {
                throw new https_1.HttpsError('failed-precondition', 'Cannot deactivate the last active Administrator.');
            }
            activeAdminCount -= 1;
        }
        else if (current.role === 'admin' && status === 'active') {
            activeAdminCount += 1;
        }
        transaction.set(countsRef, {
            activeAdminCount,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.update(userRef, {
            status,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    // Synchronize Auth user state: disable account and immediately revoke tokens if deactivating
    if (status === 'inactive') {
        await admin.auth().updateUser(uid, { disabled: true });
        await admin.auth().revokeRefreshTokens(uid);
    }
    else {
        await admin.auth().updateUser(uid, { disabled: false });
    }
    // Refresh custom claims
    const userDoc = await db.collection('users').doc(uid).get();
    const current = userDoc.data();
    await admin.auth().setCustomUserClaims(uid, {
        role: current.role,
        departmentId: current.departmentId,
        active: status === 'active',
    });
    // Record Audit Event
    await writeAuditLog({
        actorId: caller.uid,
        action: status === 'active' ? 'user.activate' : 'user.deactivate',
        targetId: uid,
        targetType: 'user',
        newState: { status },
    });
    return { uid, status };
});
/**
 * Triggers an account setup or password reset flow for a user.
 */
exports.triggerPasswordReset = (0, https_1.onCall)({ cors: true, region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { email } = request.data;
    if (!email || !email.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'Valid email address is required.');
    }
    const cleanEmail = email.trim().toLowerCase();
    const link = await admin.auth().generatePasswordResetLink(cleanEmail);
    await writeAuditLog({
        actorId: caller.uid,
        action: 'user.password_reset_triggered',
        targetId: cleanEmail,
        targetType: 'user',
        metadata: { requestedEmail: cleanEmail },
    });
    return {
        success: true,
        message: 'Password reset link generated successfully.',
        resetLink: link,
    };
});
// ==============================================================================
// Admin Department Management Operations
// ==============================================================================
/**
 * Creates a new department.
 */
exports.createDepartment = (0, https_1.onCall)({ cors: true, region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { name, code } = request.data;
    if (!name || !name.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Department name is required.');
    }
    if (!code || !code.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Department code is required.');
    }
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    // Check unique code
    const existing = await db.collection('departments').where('code', '==', cleanCode).get();
    if (!existing.empty) {
        throw new https_1.HttpsError('already-exists', `A department with code "${cleanCode}" already exists.`);
    }
    const deptRef = db.collection('departments').doc();
    const newDept = {
        id: deptRef.id,
        name: cleanName,
        code: cleanCode,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await deptRef.set({
        ...newDept,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await writeAuditLog({
        actorId: caller.uid,
        action: 'department.create',
        targetId: deptRef.id,
        targetType: 'department',
        newState: { name: cleanName, code: cleanCode, status: 'active' },
    });
    return { department: newDept };
});
/**
 * Renames or updates a department.
 */
exports.updateDepartment = (0, https_1.onCall)({ cors: true, region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { id, name, code } = request.data;
    if (!id) {
        throw new https_1.HttpsError('invalid-argument', 'Department ID is required.');
    }
    const deptRef = db.collection('departments').doc(id);
    const deptDoc = await deptRef.get();
    if (!deptDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Department not found.');
    }
    const current = deptDoc.data();
    const cleanName = name !== undefined ? name.trim() : current.name;
    const cleanCode = code !== undefined ? code.trim().toUpperCase() : current.code;
    if (code !== undefined && cleanCode !== current.code) {
        const existing = await db.collection('departments').where('code', '==', cleanCode).get();
        if (!existing.empty && existing.docs[0]?.id !== id) {
            throw new https_1.HttpsError('already-exists', `Department code "${cleanCode}" is already in use.`);
        }
    }
    await deptRef.update({
        name: cleanName,
        code: cleanCode,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await writeAuditLog({
        actorId: caller.uid,
        action: 'department.update',
        targetId: id,
        targetType: 'department',
        previousState: { name: current.name, code: current.code },
        newState: { name: cleanName, code: cleanCode },
    });
    return {
        department: {
            ...current,
            name: cleanName,
            code: cleanCode,
            updatedAt: new Date().toISOString(),
        },
    };
});
/**
 * Activates or deactivates a department.
 * Reports count of assigned Department Heads affected without silently orphaning them.
 */
exports.setDepartmentStatus = (0, https_1.onCall)({ cors: true, region: REGION }, async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { id, status } = request.data;
    if (!id || (status !== 'active' && status !== 'inactive')) {
        throw new https_1.HttpsError('invalid-argument', 'Valid department ID and status are required.');
    }
    const deptRef = db.collection('departments').doc(id);
    const deptDoc = await deptRef.get();
    if (!deptDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Department not found.');
    }
    const current = deptDoc.data();
    // Count affected active users assigned to this department
    const affectedUsersQuery = await db.collection('users')
        .where('departmentId', '==', id)
        .where('status', '==', 'active')
        .get();
    const affectedCount = affectedUsersQuery.size;
    await deptRef.update({
        status,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await writeAuditLog({
        actorId: caller.uid,
        action: status === 'active' ? 'department.activate' : 'department.deactivate',
        targetId: id,
        targetType: 'department',
        newState: { status, affectedUserCount: affectedCount },
    });
    return {
        department: {
            ...current,
            status,
            updatedAt: new Date().toISOString(),
        },
        affectedUserCount: affectedCount,
    };
});
// ==============================================================================
// Media Library Operations
// ==============================================================================
var mediaAdmin_1 = require("./mediaAdmin");
Object.defineProperty(exports, "initiateMediaUpload", { enumerable: true, get: function () { return mediaAdmin_1.initiateMediaUpload; } });
Object.defineProperty(exports, "finalizeMediaUpload", { enumerable: true, get: function () { return mediaAdmin_1.finalizeMediaUpload; } });
Object.defineProperty(exports, "getMediaPreviewUrl", { enumerable: true, get: function () { return mediaAdmin_1.getMediaPreviewUrl; } });
Object.defineProperty(exports, "updateMediaMetadata", { enumerable: true, get: function () { return mediaAdmin_1.updateMediaMetadata; } });
Object.defineProperty(exports, "setMediaArchivedStatus", { enumerable: true, get: function () { return mediaAdmin_1.setMediaArchivedStatus; } });
Object.defineProperty(exports, "listMediaAssets", { enumerable: true, get: function () { return mediaAdmin_1.listMediaAssets; } });
Object.defineProperty(exports, "cleanupExpiredUploads", { enumerable: true, get: function () { return mediaAdmin_1.cleanupExpiredUploads; } });
// ==============================================================================
// Visual Content Creator & Reusable Templates Operations
// ==============================================================================
var designAdmin_1 = require("./designAdmin");
Object.defineProperty(exports, "createDesign", { enumerable: true, get: function () { return designAdmin_1.createDesign; } });
Object.defineProperty(exports, "getDesign", { enumerable: true, get: function () { return designAdmin_1.getDesign; } });
Object.defineProperty(exports, "updateDesign", { enumerable: true, get: function () { return designAdmin_1.updateDesign; } });
Object.defineProperty(exports, "duplicateDesign", { enumerable: true, get: function () { return designAdmin_1.duplicateDesign; } });
Object.defineProperty(exports, "setDesignArchivedStatus", { enumerable: true, get: function () { return designAdmin_1.setDesignArchivedStatus; } });
Object.defineProperty(exports, "listDesigns", { enumerable: true, get: function () { return designAdmin_1.listDesigns; } });
Object.defineProperty(exports, "convertDesignOrientation", { enumerable: true, get: function () { return designAdmin_1.convertDesignOrientation; } });
Object.defineProperty(exports, "listTemplates", { enumerable: true, get: function () { return designAdmin_1.listTemplates; } });
Object.defineProperty(exports, "createTemplate", { enumerable: true, get: function () { return designAdmin_1.createTemplate; } });
Object.defineProperty(exports, "instantiateTemplate", { enumerable: true, get: function () { return designAdmin_1.instantiateTemplate; } });
Object.defineProperty(exports, "setTemplateArchivedStatus", { enumerable: true, get: function () { return designAdmin_1.setTemplateArchivedStatus; } });
Object.defineProperty(exports, "seedStarterTemplates", { enumerable: true, get: function () { return designAdmin_1.seedStarterTemplates; } });
//# sourceMappingURL=index.js.map