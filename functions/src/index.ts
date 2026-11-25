/**
 * Aura DIMS - Backend Cloud Functions (v2)
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scope: Privileged Administrative Operations & Departmental Governance
 * Enforces explicit caller authorization on all Admin SDK mutations.
 */

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'node:crypto';
import type {
  UserRole,
  UserStatus,
  UserProfile,
  Department,
  ProvisionUserRequest,
  ProvisionUserResponse,
  UpdateUserRequest,
  UpdateUserResponse,
  SetUserStatusRequest,
  SetUserStatusResponse,
  TriggerPasswordResetRequest,
  TriggerPasswordResetResponse,
  CreateDepartmentRequest,
  CreateDepartmentResponse,
  UpdateDepartmentRequest,
  UpdateDepartmentResponse,
  SetDepartmentStatusRequest,
  SetDepartmentStatusResponse,
  ProjectMember,
  ProjectMemberRole,
} from '@aura-dims/display-schema';

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

/**
 * Asserts that the caller is an active Administrator.
 */
async function assertAdminCaller(auth: { uid: string } | undefined): Promise<UserProfile> {
  const caller = await getAuthenticatedCaller(auth);
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only System Administrators can execute this operation.');
  }
  return caller;
}

/**
 * Writes an append-only audit event to `/auditEvents` collection.
 */
async function writeAuditLog(params: {
  actorId: string;
  action: string;
  targetId: string;
  targetType: 'user' | 'department' | 'role';
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
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

// ==============================================================================
// Public Diagnostic & Health Check Endpoints
// ==============================================================================

export const healthCheck = onCall(
  { cors: true, region: REGION },
  async (request) => {
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
  }
);

export const apiHealth = onRequest(
  { cors: true, region: REGION },
  (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'Aura DIMS HTTP Gateway',
      company: 'Aurainteract Private Limited',
      timezone: 'Asia/Kolkata',
      timestamp: new Date().toISOString(),
      projectId: process.env.GCLOUD_PROJECT || 'demo-aura-dims',
      emulator: process.env.FUNCTIONS_EMULATOR === 'true',
    });
  }
);

// ==============================================================================
// Project Enrollment & Department Membership Helpers
// ==============================================================================

export { ensureGeneralProject } from './projectsAdmin';
import { ensureGeneralProject } from './projectsAdmin';

/**
 * Automatically enrolls a user into their department's default General project.
 */
async function enrollUserInGeneralProject(
  uid: string,
  departmentId: string,
  userProfile: { email?: string; displayName?: string; role: UserRole },
  actorId: string
): Promise<void> {
  await ensureGeneralProject(departmentId, undefined, actorId);
  const generalProjectId = `proj_general_${departmentId}`;
  const now = new Date().toISOString();

  let memberRole: ProjectMemberRole = 'member';
  if (userProfile.role === 'admin' || userProfile.role === 'department_head') {
    memberRole = 'lead';
  } else if (userProfile.role === 'viewer') {
    memberRole = 'viewer';
  }

  const memberRef = db.collection('projects').doc(generalProjectId).collection('members').doc(uid);
  const memberData: ProjectMember = {
    uid,
    projectId: generalProjectId,
    role: memberRole,
    addedBy: actorId,
    addedAt: now,
    updatedAt: now,
    userEmail: userProfile.email,
    userDisplayName: userProfile.displayName,
    userCompanyRole: userProfile.role,
  };
  await memberRef.set(memberData, { merge: true });
}

/**
 * Removes user memberships from all projects in a specific department (or all projects).
 */
async function removeUserFromDepartmentProjects(uid: string, departmentId?: string | null): Promise<void> {
  try {
    const memberSnaps = await db.collectionGroup('members').where('uid', '==', uid).get();
    for (const doc of memberSnaps.docs) {
      const pRef = doc.ref.parent.parent;
      if (pRef) {
        if (!departmentId) {
          await doc.ref.delete();
        } else {
          const pDoc = await pRef.get();
          if (pDoc.exists && pDoc.data()?.departmentId === departmentId) {
            await doc.ref.delete();
          }
        }
      }
    }
  } catch (err) {
    console.warn('[removeUserFromDepartmentProjects] Failed to cleanup project memberships:', err);
  }
}

// ==============================================================================
// Admin User Provisioning and Lifecycle Operations
// ==============================================================================

/**
 * Provisions a new user account.
 * Accessible strictly to active System Administrators.
 */
export const provisionUser = onCall<ProvisionUserRequest, Promise<ProvisionUserResponse>>(
  { cors: true, region: REGION },
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { email, displayName, role, departmentId, temporaryPassword, replaceExistingHead } = request.data;

    // Validation
    if (!email || !email.includes('@')) {
      throw new HttpsError('invalid-argument', 'A valid email address is required.');
    }
    if (!displayName || !displayName.trim()) {
      throw new HttpsError('invalid-argument', 'Display name is required.');
    }
    if (role !== 'admin' && role !== 'department_head' && role !== 'creator' && role !== 'viewer') {
      throw new HttpsError('invalid-argument', 'Role must be "admin", "department_head", "creator", or "viewer".');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();

    // Department Head, Creator, and Viewer must be assigned to an active department
    if (role !== 'admin') {
      if (!departmentId) {
        throw new HttpsError('invalid-argument', `Role "${role}" must be assigned to a department.`);
      }
      const deptDoc = await db.collection('departments').doc(departmentId).get();
      if (!deptDoc.exists || (deptDoc.data() as Department).status !== 'active') {
        throw new HttpsError('failed-precondition', 'Assigned department does not exist or is inactive.');
      }
    }

    let authUser: admin.auth.UserRecord;
    let isNewAuth = false;

    // Check if user exists in Firebase Authentication
    try {
      authUser = await admin.auth().getUserByEmail(cleanEmail);
      if (temporaryPassword && temporaryPassword.length >= 6) {
        await admin.auth().updateUser(authUser.uid, { password: temporaryPassword });
      }
      // Check if user profile already exists in Firestore
      const existingProfile = await db.collection('users').doc(authUser.uid).get();
      if (existingProfile.exists) {
        throw new HttpsError('already-exists', 'A user profile with this email already exists.');
      }
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      if (fbErr.code === 'auth/user-not-found') {
        // User does not exist in Auth, create one with a secure initial password
        const initialPassword = temporaryPassword && temporaryPassword.length >= 6
          ? temporaryPassword
          : (crypto.randomBytes(24).toString('base64') + '!Aa1');
        authUser = await admin.auth().createUser({
          email: cleanEmail,
          displayName: cleanName,
          password: initialPassword,
          emailVerified: true,
        });
        isNewAuth = true;
      } else {
        throw err;
      }
    }

    const targetUid = authUser.uid;
    const finalDepartmentId = role !== 'admin' ? (departmentId || null) : null;
    let demotedHeadProfile: UserProfile | null = null;

    try {
      // Transactionally record user and increment activeAdminCount if admin
      await db.runTransaction(async (transaction) => {
        const countsRef = db.collection('systemMetadata').doc('counts');
        const countsDoc = await transaction.get(countsRef);

        let existingHeadDocToDemote: FirebaseFirestore.DocumentSnapshot | null = null;

        // Enforce: One head per department (reject unless replaceExistingHead is true)
        if (role === 'department_head' && finalDepartmentId) {
          const headsSnap = await transaction.get(
            db.collection('users')
              .where('departmentId', '==', finalDepartmentId)
              .where('role', '==', 'department_head')
              .where('status', '==', 'active')
          );

          const existingHeadDoc = headsSnap.docs.find((d) => d.id !== targetUid);
          if (existingHeadDoc) {
            const existingHead = existingHeadDoc.data() as UserProfile;
            if (!replaceExistingHead) {
              throw new HttpsError(
                'already-exists',
                `Department already has an active Department Head (${existingHead.displayName || existingHead.email}). Set replaceExistingHead=true to demote the current head to creator.`
              );
            }
            demotedHeadProfile = existingHead;
            existingHeadDocToDemote = existingHeadDoc;
          }
        }

        // Writes begin after all reads
        if (existingHeadDocToDemote) {
          transaction.update(existingHeadDocToDemote.ref, {
            role: 'creator',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

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

        transaction.set(
          countsRef,
          {
            activeAdminCount,
            totalUserCount,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        const userRef = db.collection('users').doc(targetUid);
        transaction.set(userRef, {
          uid: targetUid,
          email: cleanEmail,
          displayName: cleanName,
          role,
          departmentId: finalDepartmentId,
          status: 'active' as UserStatus,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      // If an existing head was demoted, update their claims, revoke tokens and log audit
      if (demotedHeadProfile) {
        const dh = demotedHeadProfile as UserProfile;
        await admin.auth().setCustomUserClaims(dh.uid, {
          role: 'creator',
          departmentId: dh.departmentId,
          active: true,
        });
        await admin.auth().revokeRefreshTokens(dh.uid);
        await writeAuditLog({
          actorId: caller.uid,
          action: 'user.head_demoted',
          targetId: dh.uid,
          targetType: 'user',
          previousState: { role: 'department_head' },
          newState: { role: 'creator' },
          metadata: { departmentId: finalDepartmentId, replacedByUid: targetUid },
        });
      }

      // Set custom claims for security rules and tokens
      await admin.auth().setCustomUserClaims(targetUid, {
        role,
        departmentId: finalDepartmentId,
        active: true,
      });

      // Auto-enroll user in their department's default General project
      if (finalDepartmentId) {
        await enrollUserInGeneralProject(
          targetUid,
          finalDepartmentId,
          { email: cleanEmail, displayName: cleanName, role },
          caller.uid
        );
      }

      // Generate password setup link
      let setupLink: string | undefined;
      try {
        setupLink = await admin.auth().generatePasswordResetLink(cleanEmail);
      } catch (linkErr) {
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
    } catch (firestoreErr) {
      // Partial failure cleanup: if we just created the Auth user and Firestore failed, roll back Auth user
      if (isNewAuth) {
        try {
          await admin.auth().deleteUser(targetUid);
        } catch (cleanupErr) {
          console.error('[Aura DIMS] Failed to roll back Auth user after failed Firestore creation:', cleanupErr);
        }
      }
      throw firestoreErr;
    }
  }
);

/**
 * Updates an existing user's profile, role, or department assignment.
 * Implements strict Last-Admin invariant protection.
 */
export const updateUser = onCall<UpdateUserRequest, Promise<UpdateUserResponse>>(
  { cors: true, region: REGION },
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { uid, displayName, role, departmentId, replaceExistingHead } = request.data;

    if (!uid) {
      throw new HttpsError('invalid-argument', 'Target user UID is required.');
    }

    const userRef = db.collection('users').doc(uid);
    const countsRef = db.collection('systemMetadata').doc('counts');

    let updatedProfile: UserProfile | null = null;
    let demotedHeadProfile: UserProfile | null = null;
    let oldDeptId: string | null = null;
    let roleChanged = false;

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'Target user profile does not exist.');
      }

      const current = userDoc.data() as UserProfile;
      oldDeptId = current.departmentId;
      const targetRole: UserRole = role || current.role;
      const targetName: string = displayName !== undefined ? displayName.trim() : current.displayName;
      let targetDept: string | null = departmentId !== undefined ? departmentId : current.departmentId;

      if (targetRole === 'admin') {
        targetDept = null;
      } else if (!targetDept) {
        throw new HttpsError('invalid-argument', `Role "${targetRole}" must be assigned to an active department.`);
      }

      roleChanged = current.role !== targetRole || current.departmentId !== targetDept;

      // 1. ALL READS: Read countsDoc and head check before executing any writes
      const countsDoc = await transaction.get(countsRef);
      let activeAdminCount = countsDoc.exists ? Number(countsDoc.data()?.activeAdminCount || 0) : 0;

      let existingHeadDocToDemote: FirebaseFirestore.DocumentSnapshot | null = null;

      // Enforce: One head per department (reject unless replaceExistingHead is true)
      if (targetRole === 'department_head' && targetDept) {
        const headsSnap = await transaction.get(
          db.collection('users')
            .where('departmentId', '==', targetDept)
            .where('role', '==', 'department_head')
            .where('status', '==', 'active')
        );

        const existingHeadDoc = headsSnap.docs.find((d) => d.id !== uid);
        if (existingHeadDoc) {
          const existingHead = existingHeadDoc.data() as UserProfile;
          if (!replaceExistingHead) {
            throw new HttpsError(
              'already-exists',
              `Department already has an active Department Head (${existingHead.displayName || existingHead.email}). Set replaceExistingHead=true to demote the current head to creator.`
            );
          }
          demotedHeadProfile = existingHead;
          existingHeadDocToDemote = existingHeadDoc;
        }
      }

      // 2. ALL WRITES: Execute writes now that all reads are completed
      if (existingHeadDocToDemote) {
        transaction.update(existingHeadDocToDemote.ref, {
          role: 'creator',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Check last-admin invariant if role is being demoted
      if (current.role === 'admin' && current.status === 'active' && targetRole !== 'admin') {
        if (activeAdminCount <= 1) {
          throw new HttpsError('failed-precondition', 'Cannot demote the last active Administrator.');
        }
        activeAdminCount -= 1;
      } else if (current.role !== 'admin' && targetRole === 'admin' && current.status === 'active') {
        activeAdminCount += 1;
      }

      transaction.set(
        countsRef,
        {
          activeAdminCount,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.update(userRef, {
        displayName: targetName,
        role: targetRole,
        departmentId: targetDept,
        updatedAt: FieldValue.serverTimestamp(),
      });

      updatedProfile = {
        ...current,
        displayName: targetName,
        role: targetRole,
        departmentId: targetDept,
      };
    });

    if (!updatedProfile) {
      throw new HttpsError('internal', 'User update failed.');
    }

    const finalProfile = updatedProfile as UserProfile;

    // If an existing head was demoted, update their claims, revoke tokens and log audit
    if (demotedHeadProfile) {
      const dh = demotedHeadProfile as UserProfile;
      try {
        await admin.auth().setCustomUserClaims(dh.uid, {
          role: 'creator',
          departmentId: dh.departmentId,
          active: true,
        });
        await admin.auth().revokeRefreshTokens(dh.uid);
      } catch (authErr: any) {
        if (authErr?.code !== 'auth/user-not-found') {
          throw authErr;
        }
      }
      await writeAuditLog({
        actorId: caller.uid,
        action: 'user.head_demoted',
        targetId: dh.uid,
        targetType: 'user',
        previousState: { role: 'department_head' },
        newState: { role: 'creator' },
        metadata: { departmentId: finalProfile.departmentId, replacedByUid: uid },
      });
    }

    // Update Firebase Auth claims and displayName
    try {
      await admin.auth().updateUser(uid, {
        displayName: finalProfile.displayName,
      });
      await admin.auth().setCustomUserClaims(uid, {
        role: finalProfile.role,
        departmentId: finalProfile.departmentId,
        active: finalProfile.status === 'active',
      });

      // After any role change, revoke refresh tokens
      if (roleChanged) {
        await admin.auth().revokeRefreshTokens(uid);
      }
    } catch (authErr: any) {
      if (authErr?.code !== 'auth/user-not-found') {
        throw authErr;
      }
      console.warn(`[updateUser] Auth user ${uid} not found in Firebase Auth; skipping auth record update.`);
    }

    // Department change: cleanup old project memberships and enroll in new General project
    if (oldDeptId && oldDeptId !== finalProfile.departmentId) {
      await removeUserFromDepartmentProjects(uid, oldDeptId);
    }
    if (finalProfile.departmentId) {
      await enrollUserInGeneralProject(
        uid,
        finalProfile.departmentId,
        { email: finalProfile.email, displayName: finalProfile.displayName, role: finalProfile.role },
        caller.uid
      );
    }

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
  }
);

/**
 * Activates or deactivates a user's application access.
 * Implements strict Last-Admin invariant protection and immediate token revocation.
 */
export const setUserActiveStatus = onCall<SetUserStatusRequest, Promise<SetUserStatusResponse>>(
  { cors: true, region: REGION },
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { uid, status } = request.data;

    if (!uid || (status !== 'active' && status !== 'inactive')) {
      throw new HttpsError('invalid-argument', 'Valid target UID and status ("active" | "inactive") are required.');
    }

    const userRef = db.collection('users').doc(uid);
    const countsRef = db.collection('systemMetadata').doc('counts');

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'Target user does not exist.');
      }

      const current = userDoc.data() as UserProfile;
      if (current.status === status) {
        return; // No-op if status unchanged
      }

      const countsDoc = await transaction.get(countsRef);
      let activeAdminCount = countsDoc.exists ? Number(countsDoc.data()?.activeAdminCount || 0) : 0;

      // Last-Admin check on deactivation
      if (current.role === 'admin' && status === 'inactive') {
        if (activeAdminCount <= 1) {
          throw new HttpsError('failed-precondition', 'Cannot deactivate the last active Administrator.');
        }
        activeAdminCount -= 1;
      } else if (current.role === 'admin' && status === 'active') {
        activeAdminCount += 1;
      }

      transaction.set(
        countsRef,
        {
          activeAdminCount,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.update(userRef, {
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Synchronize Auth user state: disable account and immediately revoke tokens if deactivating
    try {
      if (status === 'inactive') {
        await admin.auth().updateUser(uid, { disabled: true });
        await admin.auth().revokeRefreshTokens(uid);
      } else {
        await admin.auth().updateUser(uid, { disabled: false });
      }

      // Refresh custom claims
      const userDoc = await db.collection('users').doc(uid).get();
      const current = userDoc.data() as UserProfile;
      await admin.auth().setCustomUserClaims(uid, {
        role: current.role,
        departmentId: current.departmentId,
        active: status === 'active',
      });
    } catch (authErr: any) {
      if (authErr?.code !== 'auth/user-not-found') {
        throw authErr;
      }
      console.warn(`[setUserActiveStatus] Auth user ${uid} not found in Firebase Auth; skipping auth record update.`);
    }

    if (status === 'inactive') {
      await removeUserFromDepartmentProjects(uid);
    }

    // Record Audit Event
    await writeAuditLog({
      actorId: caller.uid,
      action: status === 'active' ? 'user.activate' : 'user.deactivate',
      targetId: uid,
      targetType: 'user',
      newState: { status },
    });

    return { uid, status };
  }
);

/**
 * Triggers an account setup or password reset flow for a user.
 */
export const triggerPasswordReset = onCall<TriggerPasswordResetRequest, Promise<TriggerPasswordResetResponse>>(
  { cors: true, region: REGION },
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { email } = request.data;

    if (!email || !email.includes('@')) {
      throw new HttpsError('invalid-argument', 'Valid email address is required.');
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
  }
);

// ==============================================================================
// Admin Department Management Operations
// ==============================================================================

/**
 * Creates a new department.
 */
export const createDepartment = onCall<CreateDepartmentRequest, Promise<CreateDepartmentResponse>>(
  { cors: true, region: REGION },
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { name, code } = request.data;

    if (!name || !name.trim()) {
      throw new HttpsError('invalid-argument', 'Department name is required.');
    }
    if (!code || !code.trim()) {
      throw new HttpsError('invalid-argument', 'Department code is required.');
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    // Check unique code
    const existing = await db.collection('departments').where('code', '==', cleanCode).get();
    if (!existing.empty) {
      throw new HttpsError('already-exists', `A department with code "${cleanCode}" already exists.`);
    }

    const deptRef = db.collection('departments').doc();
    const newDept: Department = {
      id: deptRef.id,
      name: cleanName,
      code: cleanCode,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await deptRef.set({
      ...newDept,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Automatically create default General project for the new department
    await ensureGeneralProject(deptRef.id, cleanName, caller.uid);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'department.create',
      targetId: deptRef.id,
      targetType: 'department',
      newState: { name: cleanName, code: cleanCode, status: 'active' },
    });

    return { department: newDept };
  }
);

/**
 * Renames or updates a department.
 */
export const updateDepartment = onCall<UpdateDepartmentRequest, Promise<UpdateDepartmentResponse>>(
  { cors: true, region: REGION },
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { id, name, code } = request.data;

    if (!id) {
      throw new HttpsError('invalid-argument', 'Department ID is required.');
    }

    const deptRef = db.collection('departments').doc(id);
    const deptDoc = await deptRef.get();
    if (!deptDoc.exists) {
      throw new HttpsError('not-found', 'Department not found.');
    }

    const current = deptDoc.data() as Department;
    const cleanName = name !== undefined ? name.trim() : current.name;
    const cleanCode = code !== undefined ? code.trim().toUpperCase() : current.code;

    if (code !== undefined && cleanCode !== current.code) {
      const existing = await db.collection('departments').where('code', '==', cleanCode).get();
      if (!existing.empty && existing.docs[0]?.id !== id) {
        throw new HttpsError('already-exists', `Department code "${cleanCode}" is already in use.`);
      }
    }

    await deptRef.update({
      name: cleanName,
      code: cleanCode,
      updatedAt: FieldValue.serverTimestamp(),
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
  }
);

/**
 * Activates or deactivates a department.
 * Reports count of assigned Department Heads affected without silently orphaning them.
 */
export const setDepartmentStatus = onCall<SetDepartmentStatusRequest, Promise<SetDepartmentStatusResponse>>(
  { cors: true, region: REGION },
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { id, status } = request.data;

    if (!id || (status !== 'active' && status !== 'inactive')) {
      throw new HttpsError('invalid-argument', 'Valid department ID and status are required.');
    }

    const deptRef = db.collection('departments').doc(id);
    const deptDoc = await deptRef.get();
    if (!deptDoc.exists) {
      throw new HttpsError('not-found', 'Department not found.');
    }

    const current = deptDoc.data() as Department;

    // Count affected active users assigned to this department
    const affectedUsersQuery = await db.collection('users')
      .where('departmentId', '==', id)
      .where('status', '==', 'active')
      .get();
    const affectedCount = affectedUsersQuery.size;

    await deptRef.update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
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
  }
);


// ==============================================================================
// Media Library Operations
// ==============================================================================
export {
  initiateMediaUpload,
  finalizeMediaUpload,
  getMediaPreviewUrl,
  updateMediaMetadata,
  setMediaArchivedStatus,
  listMediaAssets,
  cleanupExpiredUploads,
} from './mediaAdmin';

// ==============================================================================
// Visual Content Creator & Reusable Templates Operations
// ==============================================================================
export {
  createDesign,
  getDesign,
  updateDesign,
  duplicateDesign,
  setDesignArchivedStatus,
  listDesigns,
  convertDesignOrientation,
  listTemplates,
  createTemplate,
  instantiateTemplate,
  setTemplateArchivedStatus,
  seedStarterTemplates,
} from './designAdmin';

// ==============================================================================
// Playlists, Approvals, Schedules & Publication Operations
// ==============================================================================
export {
  createDesignRevision,
  listDesignRevisions,
  getDesignRevision,
  createPlaylist,
  updatePlaylist,
  getPlaylist,
  listPlaylists,
  setPlaylistArchivedStatus,
  createPlaylistRevision,
  getPlaylistRevision,
  createSchedule,
  updateSchedule,
  getSchedule,
  listSchedules,
  setScheduleStatus,
  submitForApproval,
  reviewApproval,
  withdrawApproval,
  listApprovals,
  getApproval,
  preparePublication,
  rollbackPublication,
  setUserDirectPublishPermission,
  evaluateSchedulePreview,
} from './publishingAdmin';


// ==============================================================================
// Fleet Management & Digital Display Device Protocol Operations
// ==============================================================================
export {
  createSite,
  updateSite,
  createDisplayGroup,
  updateDisplayGroup,
  setDisplayGroupStatus,
  registerDisplay,
  updateDisplay,
  setDisplayLifecycle,
  resetEnrollment,
  generateDisplayPairingCode,
  assignDisplayUser,
  unassignDisplayUser,
  listUserAssignments,
  redeemPairingCode,
  deviceSignIn,
  getDevicePublication,
  getDevicePublicationManifest,
  reportDeviceDelivery,
  reportDeviceHeartbeat,
  listDisplays,
  getDisplay,
} from './fleetAdmin';


// ==============================================================================
// Rollout Inventory, Bulk Registration, Bulk Assignment & Commissioning
// ==============================================================================
export {
  preflightBulkDisplayImport,
  executeBulkDisplayImport,
  preflightBulkAssignDisplays,
  executeBulkAssignDisplays,
  getCommissioningChecklist,
  updateCommissioningCheck,
  finalizeCommissioning,
  listPlannedInstallations,
  createPlannedInstallation,
  updatePlannedInstallation,
  convertPlannedToRegistered,
  getPublicationRolloutProgress,
  retryPublicationTarget,
} from './rolloutAdmin';

// ==============================================================================
// Hardware Integration, Durable Device Operations & Private Display Previews
// ==============================================================================
export {
  requestDisplayOperation,
  listDisplayOperations,
  claimDeviceOperation,
  renewOperationLease,
  reportDeviceOperation,
  cancelDisplayOperation,
  retryDisplayOperation,
  expireStaleOperationsScheduled,
  uploadDevicePreview,
  getDisplayPreviewUrl,
  discardDisplayPreview,
  reportDeviceShutdown,
} from './deviceOperations';

// ==============================================================================
// Project Workspace & Member Administration
// ==============================================================================
export {
  createProject,
  updateProject,
  archiveProject,
  listProjects,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
  listProjectMembers,
  moveAssetProject,
  ALLOWED_PROJECT_CREATOR_ROLES,
} from './projectsAdmin';


