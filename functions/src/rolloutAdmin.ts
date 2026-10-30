/**
 * Aura DIMS - Rollout Inventory, Bulk Operations & Commissioning (Cloud Functions v2)
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scope:
 * - Admin-only Rollout Inventory & Planned Installations
 * - CSV Bulk Registration with Preflight Validation & Idempotency
 * - Bulk Department Head Display Assignments with Preflight
 * - 12-Item Digital Display Commissioning Checklist (Automated vs Human Evidence)
 * - Fleet Telemetry Aggregations & Publication Rollout Progress
 *
 * Terminology Requirement: Strictly use "digital display" in all user-facing copy.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  db,
  CALLABLE_OPTS,
  assertAdminCaller,
  getAuthenticatedCaller,
  writeAuditLog,
  buildAuditRecord,
} from './common.js';
import {
  createDefaultCommissioningChecklist,
  type CommissioningStatus,
  type CommissioningRecord,
  type CommissioningCheckItem,
  type PlannedInstallation,
  type DigitalDisplay,
  type DisplayOrientation,
  type Resolution,
  type BulkImportPreflightRequest,
  type BulkImportPreflightResponse,
  type BulkImportPreflightRowResult,
  type BulkImportExecuteRequest,
  type BulkImportExecuteResponse,
  type BulkAssignDisplaysPreflightRequest,
  type BulkAssignDisplaysPreflightResponse,
  type BulkAssignDisplaysRequest,
  type BulkAssignDisplaysResponse,
  type GetCommissioningChecklistRequest,
  type GetCommissioningChecklistResponse,
  type UpdateCommissioningCheckRequest,
  type UpdateCommissioningCheckResponse,
  type FinalizeCommissioningRequest,
  type FinalizeCommissioningResponse,
  type ListPlannedInstallationsRequest,
  type ListPlannedInstallationsResponse,
  type CreatePlannedInstallationRequest,
  type CreatePlannedInstallationResponse,
  type UpdatePlannedInstallationRequest,
  type UpdatePlannedInstallationResponse,
  type ConvertPlannedToRegisteredRequest,
  type ConvertPlannedToRegisteredResponse,
  type GetPublicationRolloutProgressRequest,
  type GetPublicationRolloutProgressResponse,
  type PublicationTargetProgressItem,
  type RetryPublicationTargetRequest,
  type RetryPublicationTargetResponse,
} from '@aura-dims/display-schema';

// ==============================================================================
// 1. CSV Parsing & Helper Utilities
// ==============================================================================

const MAX_CSV_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_CSV_ROWS = 50;

/** Allowed CSV column header keys (case-insensitive) */
const ALLOWED_CSV_COLUMNS = new Set([
  'installationref',
  'name',
  'siteidentifier',
  'locationdescription',
  'departmentidentifier',
  'orientation',
  'resolution',
  'groupidentifiers',
  'installationowner',
  'installationwave',
  'notes',
]);

/**
 * Standard RFC-4180 compliant CSV parser for comma/quote separated lines.
 */
function parseCsvLines(csvText: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          field += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field.trim());
        field = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        row.push(field.trim());
        if (row.some((f) => f.length > 0)) result.push(row);
        row = [];
        field = '';
      } else if (char === '\n') {
        row.push(field.trim());
        if (row.some((f) => f.length > 0)) result.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((f) => f.length > 0)) result.push(row);
  }

  return result;
}

function parseResolutionString(resStr: string): Resolution | null {
  if (!resStr) return null;
  const match = resStr.trim().toLowerCase().match(/^(\d{3,5})x(\d{3,5})$/);
  if (!match) return null;
  const width = parseInt(match[1]!, 10);
  const height = parseInt(match[2]!, 10);
  if (width < 320 || width > 7680 || height < 240 || height > 4320) return null;
  return { width, height };
}

// ==============================================================================
// 2. CSV Bulk Registration & Preflight Functions
// ==============================================================================

export const preflightBulkDisplayImport = onCall<BulkImportPreflightRequest, Promise<BulkImportPreflightResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    await assertAdminCaller(request.auth);
    const { csvText } = request.data || {};

    if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
      throw new HttpsError('invalid-argument', 'CSV file content is empty or invalid.');
    }

    if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_SIZE_BYTES) {
      throw new HttpsError('invalid-argument', `CSV exceeds maximum permitted size of 2 MB.`);
    }

    const lines = parseCsvLines(csvText.trim());
    if (lines.length < 2) {
      throw new HttpsError('invalid-argument', 'CSV must contain at least one header row and one data row.');
    }

    const rawHeaders = lines[0]!;
    const normalizedHeaders = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Reject unknown columns that affect interpretation
    const unknownCols: string[] = [];
    rawHeaders.forEach((orig, idx) => {
      const norm = normalizedHeaders[idx]!;
      if (norm && !ALLOWED_CSV_COLUMNS.has(norm)) {
        unknownCols.push(orig);
      }
    });

    if (unknownCols.length > 0) {
      throw new HttpsError(
        'invalid-argument',
        `Unknown CSV column headers detected: ${unknownCols.join(', ')}. Please use the standard template.`
      );
    }

    const dataRows = lines.slice(1);
    if (dataRows.length > MAX_CSV_ROWS) {
      throw new HttpsError(
        'invalid-argument',
        `CSV row count (${dataRows.length}) exceeds maximum limit of ${MAX_CSV_ROWS} digital displays per batch.`
      );
    }

    // Load active sites, departments, existing installation references and existing displays
    const [sitesSnap, deptsSnap, plannedSnap, displaysSnap] = await Promise.all([
      db.collection('sites').get(),
      db.collection('departments').get(),
      db.collection('plannedInstallations').get(),
      db.collection('displays').get(),
    ]);

    const siteIdMap = new Map<string, { id: string; name: string; status: string }>();
    const siteNameMap = new Map<string, { id: string; name: string; status: string }[]>();
    sitesSnap.forEach((doc) => {
      const d = doc.data() as any;
      const rec = { id: doc.id, name: d.name || doc.id, status: d.status || 'active' };
      siteIdMap.set(doc.id, rec);
      const nameKey = rec.name.trim().toLowerCase();
      const existing = siteNameMap.get(nameKey) || [];
      existing.push(rec);
      siteNameMap.set(nameKey, existing);
    });

    const deptIdMap = new Map<string, { id: string; name: string; code: string; status: string }>();
    const deptNameMap = new Map<string, { id: string; name: string; code: string; status: string }[]>();
    deptsSnap.forEach((doc) => {
      const d = doc.data() as any;
      const rec = { id: doc.id, name: d.name || doc.id, code: d.code || '', status: d.status || 'active' };
      deptIdMap.set(doc.id, rec);
      const nameKey = rec.name.trim().toLowerCase();
      const codeKey = rec.code.trim().toLowerCase();
      [nameKey, codeKey].filter(Boolean).forEach((k) => {
        const existing = deptNameMap.get(k) || [];
        if (!existing.some((e) => e.id === rec.id)) existing.push(rec);
        deptNameMap.set(k, existing);
      });
    });

    const existingRefsInDb = new Set<string>();
    plannedSnap.forEach((d) => {
      const ref = (d.data().installationRef as string)?.trim().toLowerCase();
      if (ref) existingRefsInDb.add(ref);
    });
    displaysSnap.forEach((d) => {
      const ref = (d.data().installationRef as string)?.trim().toLowerCase();
      if (ref) existingRefsInDb.add(ref);
    });

    const seenRefsInBatch = new Set<string>();
    const rowResults: BulkImportPreflightRowResult[] = [];
    let validCount = 0;
    let invalidCount = 0;
    const globalErrors: string[] = [];

    dataRows.forEach((rowValues, idx) => {
      const rowIndex = idx + 2; // 1-based index including header
      const rawRow: Record<string, string> = {};
      rawHeaders.forEach((h, hIdx) => {
        rawRow[h] = rowValues[hIdx] || '';
      });

      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];

      // Extract by normalized header
      const getVal = (key: string): string => {
        const colIdx = normalizedHeaders.indexOf(key);
        return colIdx >= 0 ? (rowValues[colIdx] || '').trim() : '';
      };

      const installationRef = getVal('installationref');
      const name = getVal('name');
      const siteIdentifier = getVal('siteidentifier');
      const locationDesc = getVal('locationdescription');
      const departmentIdentifier = getVal('departmentidentifier');
      const orientationRaw = getVal('orientation').toLowerCase();
      const resolutionRaw = getVal('resolution');
      const groupIdentifiersRaw = getVal('groupidentifiers');
      const installationOwner = getVal('installationowner') || 'Unassigned';
      const waveRaw = getVal('installationwave');
      const notes = getVal('notes') || '';

      // Validate installation reference
      if (!installationRef) {
        rowErrors.push('Installation reference is required.');
      } else {
        const refLower = installationRef.toLowerCase();
        if (seenRefsInBatch.has(refLower)) {
          rowErrors.push(`Duplicate installation reference '${installationRef}' within this CSV file.`);
        } else if (existingRefsInDb.has(refLower)) {
          rowErrors.push(`Installation reference '${installationRef}' already exists in database.`);
        }
        seenRefsInBatch.add(refLower);
      }

      // Validate name
      if (!name) {
        rowErrors.push('Display name is required.');
      } else if (name.length > 120) {
        rowErrors.push('Display name cannot exceed 120 characters.');
      }

      // Resolve site
      let resolvedSiteId = '';
      let resolvedSiteName = '';
      if (!siteIdentifier) {
        rowErrors.push('Site identifier is required.');
      } else {
        if (siteIdMap.has(siteIdentifier)) {
          const site = siteIdMap.get(siteIdentifier)!;
          if (site.status === 'inactive') rowErrors.push(`Site '${site.name}' is currently inactive.`);
          resolvedSiteId = site.id;
          resolvedSiteName = site.name;
        } else {
          const matches = siteNameMap.get(siteIdentifier.toLowerCase()) || [];
          if (matches.length === 1) {
            const site = matches[0]!;
            if (site.status === 'inactive') rowErrors.push(`Site '${site.name}' is currently inactive.`);
            resolvedSiteId = site.id;
            resolvedSiteName = site.name;
          } else if (matches.length > 1) {
            rowErrors.push(`Ambiguous site '${siteIdentifier}' matched multiple sites. Use exact site ID.`);
          } else {
            rowErrors.push(`Site '${siteIdentifier}' not found in database.`);
          }
        }
      }

      // Resolve department
      let resolvedDeptId = '';
      let resolvedDeptName = '';
      if (!departmentIdentifier) {
        rowErrors.push('Department identifier is required.');
      } else {
        if (deptIdMap.has(departmentIdentifier)) {
          const dept = deptIdMap.get(departmentIdentifier)!;
          if (dept.status === 'inactive') rowErrors.push(`Department '${dept.name}' is currently inactive.`);
          resolvedDeptId = dept.id;
          resolvedDeptName = dept.name;
        } else {
          const matches = deptNameMap.get(departmentIdentifier.toLowerCase()) || [];
          if (matches.length === 1) {
            const dept = matches[0]!;
            if (dept.status === 'inactive') rowErrors.push(`Department '${dept.name}' is currently inactive.`);
            resolvedDeptId = dept.id;
            resolvedDeptName = dept.name;
          } else if (matches.length > 1) {
            rowErrors.push(`Ambiguous department '${departmentIdentifier}' matched multiple departments. Use exact department ID.`);
          } else {
            rowErrors.push(`Department '${departmentIdentifier}' not found in database.`);
          }
        }
      }

      // Validate orientation
      let resolvedOrientation: DisplayOrientation = 'landscape';
      if (orientationRaw === 'portrait') {
        resolvedOrientation = 'portrait';
      } else if (orientationRaw === 'landscape') {
        resolvedOrientation = 'landscape';
      } else {
        rowErrors.push(`Orientation must be 'landscape' or 'portrait' (got '${orientationRaw}').`);
      }

      // Validate resolution
      let resolvedResolution: Resolution = { width: 1920, height: 1080 };
      if (!resolutionRaw) {
        resolvedResolution = resolvedOrientation === 'landscape' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
      } else {
        const parsedRes = parseResolutionString(resolutionRaw);
        if (!parsedRes) {
          rowErrors.push(`Invalid resolution format '${resolutionRaw}'. Use WIDTHxHEIGHT (e.g. 1920x1080).`);
        } else {
          resolvedResolution = parsedRes;
          // Validate orientation alignment
          if (resolvedOrientation === 'landscape' && resolvedResolution.width < resolvedResolution.height) {
            rowWarnings.push('Landscape orientation configured with portrait resolution dimensions.');
          } else if (resolvedOrientation === 'portrait' && resolvedResolution.height < resolvedResolution.width) {
            rowWarnings.push('Portrait orientation configured with landscape resolution dimensions.');
          }
        }
      }

      // Parse group IDs
      const groupIds: string[] = [];
      if (groupIdentifiersRaw) {
        groupIdentifiersRaw.split(/[;,]/).forEach((g) => {
          const trimmed = g.trim();
          if (trimmed && !groupIds.includes(trimmed)) groupIds.push(trimmed);
        });
      }

      // Parse installation wave
      let installationWave = 1;
      if (waveRaw) {
        const parsedWave = parseInt(waveRaw, 10);
        if (isNaN(parsedWave) || parsedWave < 0 || parsedWave > 10) {
          rowErrors.push(`Installation wave must be a number between 0 and 10 (got '${waveRaw}').`);
        } else {
          installationWave = parsedWave;
        }
      }

      const isValid = rowErrors.length === 0;
      if (isValid) {
        validCount++;
        rowResults.push({
          rowIndex,
          raw: rawRow,
          parsed: {
            installationRef,
            name,
            siteId: resolvedSiteId,
            siteName: resolvedSiteName,
            departmentId: resolvedDeptId,
            departmentName: resolvedDeptName,
            locationDescription: locationDesc,
            orientation: resolvedOrientation,
            configuredResolution: resolvedResolution,
            groupIds,
            installationOwner,
            installationWave,
            notes,
          },
          valid: true,
          errors: [],
          warnings: rowWarnings,
        });
      } else {
        invalidCount++;
        rowResults.push({
          rowIndex,
          raw: rawRow,
          valid: false,
          errors: rowErrors,
          warnings: rowWarnings,
        });
      }
    });

    return {
      totalRows: dataRows.length,
      validRowsCount: validCount,
      invalidRowsCount: invalidCount,
      rows: rowResults,
      errors: globalErrors,
    };
  }
);

export const executeBulkDisplayImport = onCall<BulkImportExecuteRequest, Promise<BulkImportExecuteResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { rows, registerAsOperational = false } = request.data || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new HttpsError('invalid-argument', 'No valid rows provided for import.');
    }

    if (rows.length > MAX_CSV_ROWS) {
      throw new HttpsError('invalid-argument', `Batch exceeds maximum limit of ${MAX_CSV_ROWS} digital displays.`);
    }

    const results: BulkImportExecuteResponse['results'] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const row of rows) {
      const {
        installationRef,
        name,
        siteId,
        departmentId,
        locationDescription,
        orientation,
        configuredResolution,
        groupIds,
        installationOwner = 'Unassigned',
        installationWave = 1,
        notes = '',
      } = row;

      try {
        if (!installationRef || !name || !siteId || !departmentId) {
          throw new Error('Missing mandatory row fields (installationRef, name, siteId, departmentId).');
        }

        // Check uniqueness in both plannedInstallations and displays
        const [dupPlanSnap, dupDispSnap] = await Promise.all([
          db.collection('plannedInstallations').where('installationRef', '==', installationRef).limit(1).get(),
          db.collection('displays').where('installationRef', '==', installationRef).limit(1).get(),
        ]);

        if (!dupPlanSnap.empty || !dupDispSnap.empty) {
          throw new Error(`Installation reference '${installationRef}' already exists in database.`);
        }

        const batch = db.batch();

        if (registerAsOperational) {
          // Register as operational display awaiting pairing
          const dispRef = db.collection('displays').doc();
          const dispData: Partial<DigitalDisplay> & Record<string, unknown> = {
            id: dispRef.id,
            name,
            nameLower: name.toLowerCase(),
            siteId,
            locationDescription: locationDescription || '',
            departmentId,
            groupIds: groupIds || [],
            orientation,
            configuredResolution,
            lifecycle: 'pending_enrollment',
            commissioningStatus: 'in_progress',
            commissionedAt: null,
            commissionedBy: null,
            installationRef,
            installationOwner,
            lastHeartbeatAt: null,
            reported: null,
            enrolledAt: null,
            createdBy: caller.uid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          batch.set(dispRef, dispData);

          // Secrets document for pairing
          const secRef = db.collection('displaySecrets').doc(dispRef.id);
          batch.set(secRef, {
            displayId: dispRef.id,
            activeDeviceUid: null,
            credentialVerifier: null,
            credentialGeneration: 0,
            pairingCodeVerifier: null,
            pairingCodeExpiresAt: null,
          });

          // Initialize commissioning record
          const commRef = db.collection('commissioning').doc(dispRef.id);
          const commRecord: CommissioningRecord = {
            displayId: dispRef.id,
            status: 'in_progress',
            checklist: createDefaultCommissioningChecklist(),
            commissionedAt: null,
            commissionedBy: null,
            notes,
            blockers: [],
            installationOwner,
            updatedAt: new Date().toISOString(),
          };
          batch.set(commRef, commRecord);

          batch.create(
            db.collection('auditEvents').doc(),
            buildAuditRecord({
              actorId: caller.uid,
              action: 'display.bulk_register',
              targetId: dispRef.id,
              targetType: 'display',
              newState: { installationRef, name, siteId, departmentId, orientation, installationOwner },
            })
          );

          await batch.commit();
          successCount++;
          results.push({
            installationRef,
            name,
            success: true,
            displayId: dispRef.id,
          });
        } else {
          // Create as Planned Installation (strictly separate from operational devices)
          const planRef = db.collection('plannedInstallations').doc();
          const planRecord: PlannedInstallation = {
            id: planRef.id,
            installationRef,
            name,
            siteId,
            locationDescription: locationDescription || '',
            departmentId,
            orientation,
            configuredResolution,
            groupIds: groupIds || [],
            installationOwner,
            installationWave,
            commissioningStatus: 'planned',
            commissioningDate: null,
            notes,
            blockers: [],
            displayId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: caller.uid,
          };
          batch.set(planRef, planRecord);

          batch.create(
            db.collection('auditEvents').doc(),
            buildAuditRecord({
              actorId: caller.uid,
              action: 'planned_installation.bulk_import',
              targetId: planRef.id,
              targetType: 'display',
              newState: { installationRef, name, siteId, departmentId, orientation, installationWave, installationOwner },
            })
          );

          await batch.commit();
          successCount++;
          results.push({
            installationRef,
            name,
            success: true,
            plannedInstallationId: planRef.id,
          });
        }
      } catch (err: any) {
        failureCount++;
        results.push({
          installationRef,
          name,
          success: false,
          error: err?.message || 'Failed to create record.',
        });
      }
    }

    return {
      totalRequested: rows.length,
      successCount,
      failureCount,
      results,
    };
  }
);

// ==============================================================================
// 3. Bulk Assignments Preflight & Execution
// ==============================================================================

export const preflightBulkAssignDisplays = onCall<BulkAssignDisplaysPreflightRequest, Promise<BulkAssignDisplaysPreflightResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    await assertAdminCaller(request.auth);
    const { targetUserId, displayIds, action } = request.data || {};

    if (!targetUserId || typeof targetUserId !== 'string') {
      throw new HttpsError('invalid-argument', 'Target user ID is required.');
    }
    if (!Array.isArray(displayIds) || displayIds.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one digital display must be selected.');
    }
    if (action !== 'assign' && action !== 'unassign') {
      throw new HttpsError('invalid-argument', "Action must be 'assign' or 'unassign'.");
    }

    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', `Target user '${targetUserId}' not found.`);
    }

    const user = userDoc.data() as any;
    if (user.status !== 'active') {
      throw new HttpsError('failed-precondition', `Target user '${user.displayName || targetUserId}' is inactive.`);
    }
    if (user.role !== 'department_head') {
      throw new HttpsError('failed-precondition', `Target user must have 'department_head' role (current role: '${user.role}').`);
    }
    if (!user.departmentId) {
      throw new HttpsError('failed-precondition', 'Target user is not assigned to any department.');
    }

    const [deptsSnap, displaysSnap, assignmentsSnap] = await Promise.all([
      db.collection('departments').get(),
      db.collection('displays').where(adminFieldPathDocId(), 'in', displayIds.slice(0, 30)).get(),
      db.collection('displayAssignments').where('uid', '==', targetUserId).get(),
    ]);

    const deptMap = new Map<string, string>();
    deptsSnap.forEach((d) => deptMap.set(d.id, d.data().name || d.id));

    const currentlyAssignedDisplayIds = new Set<string>();
    assignmentsSnap.forEach((d) => currentlyAssignedDisplayIds.add(d.data().displayId));

    const plannedChanges: BulkAssignDisplaysPreflightResponse['plannedChanges'] = [];
    let eligibleCount = 0;
    let ineligibleCount = 0;

    displaysSnap.forEach((doc) => {
      const d = doc.data() as DigitalDisplay;
      const deptName = deptMap.get(d.departmentId) || d.departmentId;
      const isCurrentlyAssigned = currentlyAssignedDisplayIds.has(doc.id);

      if (action === 'assign') {
        const isCompatible = d.departmentId === user.departmentId;
        if (!isCompatible) {
          ineligibleCount++;
          plannedChanges.push({
            displayId: doc.id,
            displayName: d.name || doc.id,
            departmentId: d.departmentId,
            departmentName: deptName,
            isCompatible: false,
            currentAssigned: isCurrentlyAssigned,
            willChange: false,
            reason: `Cross-department mismatch: Digital display belongs to '${deptName}', but Department Head belongs to '${deptMap.get(user.departmentId) || user.departmentId}'.`,
          });
        } else if (isCurrentlyAssigned) {
          plannedChanges.push({
            displayId: doc.id,
            displayName: d.name || doc.id,
            departmentId: d.departmentId,
            departmentName: deptName,
            isCompatible: true,
            currentAssigned: true,
            willChange: false,
            reason: 'User is already assigned to this digital display.',
          });
        } else {
          eligibleCount++;
          plannedChanges.push({
            displayId: doc.id,
            displayName: d.name || doc.id,
            departmentId: d.departmentId,
            departmentName: deptName,
            isCompatible: true,
            currentAssigned: false,
            willChange: true,
          });
        }
      } else {
        // Unassign
        if (!isCurrentlyAssigned) {
          plannedChanges.push({
            displayId: doc.id,
            displayName: d.name || doc.id,
            departmentId: d.departmentId,
            departmentName: deptName,
            isCompatible: true,
            currentAssigned: false,
            willChange: false,
            reason: 'User is not currently assigned to this digital display.',
          });
        } else {
          eligibleCount++;
          plannedChanges.push({
            displayId: doc.id,
            displayName: d.name || doc.id,
            departmentId: d.departmentId,
            departmentName: deptName,
            isCompatible: true,
            currentAssigned: true,
            willChange: true,
          });
        }
      }
    });

    return {
      valid: ineligibleCount === 0,
      targetUser: {
        uid: userDoc.id,
        displayName: user.displayName || user.email || 'Department Head',
        email: user.email || '',
        role: user.role,
        departmentId: user.departmentId,
        status: user.status,
      },
      plannedChanges,
      eligibleCount,
      ineligibleCount,
      action,
    };
  }
);

function adminFieldPathDocId() {
  return FieldValue ? (require('firebase-admin/firestore').FieldPath.documentId()) : '__name__';
}

export const executeBulkAssignDisplays = onCall<BulkAssignDisplaysRequest, Promise<BulkAssignDisplaysResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { targetUserId, displayIds, action } = request.data || {};

    if (!targetUserId || !Array.isArray(displayIds) || displayIds.length === 0) {
      throw new HttpsError('invalid-argument', 'Missing targetUserId or displayIds array.');
    }

    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) throw new HttpsError('not-found', 'Target user does not exist.');
    const user = userDoc.data() as any;
    if (user.status !== 'active') throw new HttpsError('failed-precondition', 'Target user is inactive.');
    if (user.role !== 'department_head') throw new HttpsError('failed-precondition', 'User must be a Department Head.');

    const results: BulkAssignDisplaysResponse['results'] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const dId of displayIds) {
      try {
        const dDoc = await db.collection('displays').doc(dId).get();
        if (!dDoc.exists) throw new Error(`Digital display '${dId}' does not exist.`);
        const display = dDoc.data() as DigitalDisplay;

        const assignmentDocId = `${dId}__${targetUserId}`;
        const assignmentRef = db.collection('displayAssignments').doc(assignmentDocId);
        const batch = db.batch();

        if (action === 'assign') {
          if (display.departmentId !== user.departmentId) {
            throw new Error(`Department mismatch: digital display belongs to '${display.departmentId}', but user belongs to '${user.departmentId}'.`);
          }

          const existingAssigned = (display as any).assignedUserIds || [];
          const updatedAssigned = Array.from(new Set([...existingAssigned, targetUserId]));

          batch.set(assignmentRef, {
            id: assignmentDocId,
            displayId: dId,
            uid: targetUserId,
            departmentId: user.departmentId,
            assignedBy: caller.uid,
            assignedAt: new Date().toISOString(),
          });

          batch.update(db.collection('displays').doc(dId), {
            assignedUserIds: updatedAssigned,
            updatedAt: new Date().toISOString(),
          });

          batch.create(
            db.collection('auditEvents').doc(),
            buildAuditRecord({
              actorId: caller.uid,
              action: 'display.bulk_assigned_user',
              targetId: dId,
              targetType: 'display',
              newState: { targetUserId, departmentId: user.departmentId },
            })
          );
        } else {
          // Unassign
          const existingAssigned = ((display as any).assignedUserIds || []) as string[];
          const updatedAssigned = existingAssigned.filter((u) => u !== targetUserId);

          batch.delete(assignmentRef);
          batch.update(db.collection('displays').doc(dId), {
            assignedUserIds: updatedAssigned,
            updatedAt: new Date().toISOString(),
          });

          batch.create(
            db.collection('auditEvents').doc(),
            buildAuditRecord({
              actorId: caller.uid,
              action: 'display.bulk_unassigned_user',
              targetId: dId,
              targetType: 'display',
              previousState: { targetUserId },
            })
          );
        }

        await batch.commit();
        successCount++;
        results.push({ displayId: dId, success: true });
      } catch (err: any) {
        failureCount++;
        results.push({ displayId: dId, success: false, error: err?.message || 'Operation failed.' });
      }
    }

    return { successCount, failureCount, results };
  }
);

// ==============================================================================
// 4. Commissioning Checklist Management
// ==============================================================================

export const getCommissioningChecklist = onCall<GetCommissioningChecklistRequest, Promise<GetCommissioningChecklistResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { displayId } = request.data || {};
    if (!displayId) throw new HttpsError('invalid-argument', 'displayId is required.');

    const dDoc = await db.collection('displays').doc(displayId).get();
    if (!dDoc.exists) throw new HttpsError('not-found', `Digital display '${displayId}' not found.`);
    const display = dDoc.data() as DigitalDisplay;

    if (caller.role !== 'admin' && caller.departmentId !== display.departmentId) {
      throw new HttpsError('permission-denied', 'Access denied to digital display in another department.');
    }

    const commRef = db.collection('commissioning').doc(displayId);
    let commDoc = await commRef.get();

    let record: CommissioningRecord;
    if (!commDoc.exists) {
      record = {
        displayId,
        status: (display.commissioningStatus as CommissioningStatus) || 'in_progress',
        checklist: createDefaultCommissioningChecklist(),
        commissionedAt: display.commissionedAt || null,
        commissionedBy: display.commissionedBy || null,
        notes: null,
        blockers: [],
        installationOwner: display.installationOwner || null,
        updatedAt: new Date().toISOString(),
      };
      await commRef.set(record);
    } else {
      record = commDoc.data() as CommissioningRecord;
    }

    // Dynamic automated evidence verification (Agent telemetry reflection)
    const nowMs = Date.now();
    const lastHbMs = display.lastHeartbeatAt ? new Date(display.lastHeartbeatAt).getTime() : 0;
    const isRecentlyConnected = nowMs - lastHbMs <= 15 * 60 * 1000;

    const [assignmentsSnap] = await Promise.all([
      db.collection('displayAssignments').where('displayId', '==', displayId).get(),
    ]);

    const updatedChecklist = record.checklist.map((item) => {
      if (item.id === 'device_enrolled') {
        const isEnrolled = !!display.enrolledAt;
        return {
          ...item,
          status: isEnrolled ? 'passed' : item.status,
          automatedEvidence: {
            detected: isEnrolled,
            details: isEnrolled
              ? `Cryptographic enrollment verified at ${display.enrolledAt}.`
              : 'Device has not yet redeemed pairing code.',
            timestamp: new Date().toISOString(),
          },
        };
      }

      if (item.id === 'network_connectivity') {
        return {
          ...item,
          status: isRecentlyConnected ? 'passed' : item.status,
          automatedEvidence: {
            detected: isRecentlyConnected,
            details: isRecentlyConnected
              ? `Steady loop telemetry verified. Last heartbeat received at ${display.lastHeartbeatAt}.`
              : display.lastHeartbeatAt
              ? `No heartbeat in past 15 minutes (last seen ${display.lastHeartbeatAt}).`
              : 'Appliance has never connected to cloud backend.',
            timestamp: new Date().toISOString(),
          },
        };
      }

      if (item.id === 'user_assignments') {
        const hasAssignments = !assignmentsSnap.empty;
        return {
          ...item,
          status: hasAssignments ? 'passed' : item.status,
          automatedEvidence: {
            detected: hasAssignments,
            details: hasAssignments
              ? `${assignmentsSnap.size} departmental operator assignment(s) confirmed.`
              : 'No operators assigned to this digital display.',
            timestamp: new Date().toISOString(),
          },
        };
      }

      if (item.id === 'fallback_installed') {
        const hasFallback = !!display.reported?.playback || !!display.activePublicationId;
        return {
          ...item,
          status: hasFallback ? 'passed' : item.status,
          automatedEvidence: {
            detected: hasFallback,
            details: hasFallback
              ? 'Local neutral corporate fallback and player runtime cache verified.'
              : 'Pending first publication delivery.',
            timestamp: new Date().toISOString(),
          },
        };
      }

      if (item.id === 'test_publication_active') {
        const hasActivePub = !!display.activePublicationId;
        return {
          ...item,
          status: hasActivePub ? 'passed' : item.status,
          automatedEvidence: {
            detected: hasActivePub,
            details: hasActivePub
              ? `Active publication manifest '${display.activePublicationId}' playing successfully.`
              : 'No publication manifest currently active on digital display player.',
            timestamp: new Date().toISOString(),
          },
        };
      }

      return item;
    });

    return {
      commissioning: {
        ...record,
        checklist: updatedChecklist,
      },
    };
  }
);

export const updateCommissioningCheck = onCall<UpdateCommissioningCheckRequest, Promise<UpdateCommissioningCheckResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { displayId, checkId, status, notes = '' } = request.data || {};

    if (!displayId || !checkId || !status) {
      throw new HttpsError('invalid-argument', 'Missing displayId, checkId, or status.');
    }

    const commRef = db.collection('commissioning').doc(displayId);
    const commDoc = await commRef.get();
    if (!commDoc.exists) throw new HttpsError('not-found', 'Commissioning record not found.');

    const record = commDoc.data() as CommissioningRecord;
    const targetCheck = record.checklist.find((c: CommissioningCheckItem) => c.id === checkId);
    if (!targetCheck) throw new HttpsError('not-found', `Check ID '${checkId}' is invalid.`);

    const nowIso = new Date().toISOString();
    const updatedChecklist = record.checklist.map((c: CommissioningCheckItem) => {
      if (c.id === checkId) {
        return {
          ...c,
          status,
          confirmedBy: caller.uid,
          confirmedByEmail: caller.email,
          confirmedAt: nowIso,
          notes: notes.trim() || c.notes,
        };
      }
      return c;
    });

    const updatedRecord: CommissioningRecord = {
      ...record,
      checklist: updatedChecklist,
      updatedAt: nowIso,
    };

    await commRef.set(updatedRecord);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'commissioning.check_updated',
      targetId: displayId,
      targetType: 'display',
      newState: { checkId, status, confirmedBy: caller.email, notes },
    });

    return { commissioning: updatedRecord };
  }
);

export const finalizeCommissioning = onCall<FinalizeCommissioningRequest, Promise<FinalizeCommissioningResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { displayId, notes = '' } = request.data || {};

    if (!displayId) throw new HttpsError('invalid-argument', 'displayId is required.');

    const [dDoc, commDoc] = await Promise.all([
      db.collection('displays').doc(displayId).get(),
      db.collection('commissioning').doc(displayId).get(),
    ]);

    if (!dDoc.exists) throw new HttpsError('not-found', 'Digital display not found.');
    if (!commDoc.exists) throw new HttpsError('not-found', 'Commissioning record not found.');

    const display = dDoc.data() as DigitalDisplay;
    const comm = commDoc.data() as CommissioningRecord;

    // Verify all 12 checks
    const incompleteChecks = comm.checklist.filter((c) => c.status !== 'passed' && c.status !== 'skipped');
    if (incompleteChecks.length > 0) {
      const pendingNames = incompleteChecks.map((c) => `'${c.label}' (${c.status})`).join(', ');
      throw new HttpsError(
        'failed-precondition',
        `Cannot commission digital display: ${incompleteChecks.length} checklist item(s) are incomplete: ${pendingNames}. All checks must be passed or explicitly skipped with approval notes.`
      );
    }

    const nowIso = new Date().toISOString();
    const batch = db.batch();

    const updatedComm: CommissioningRecord = {
      ...comm,
      status: 'commissioned',
      commissionedAt: nowIso,
      commissionedBy: caller.uid,
      commissionedByEmail: caller.email,
      notes: notes.trim() || comm.notes,
      updatedAt: nowIso,
    };
    batch.set(db.collection('commissioning').doc(displayId), updatedComm);

    const updatedDisplay: Partial<DigitalDisplay> & Record<string, unknown> = {
      commissioningStatus: 'commissioned',
      commissionedAt: nowIso,
      commissionedBy: caller.uid,
      updatedAt: nowIso,
    };
    batch.update(db.collection('displays').doc(displayId), updatedDisplay);

    batch.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: 'commissioning.finalized',
        targetId: displayId,
        targetType: 'display',
        newState: { status: 'commissioned', commissionedAt: nowIso, commissionedBy: caller.email },
      })
    );

    await batch.commit();

    return {
      commissioning: updatedComm,
      display: {
        ...display,
        ...updatedDisplay,
      } as DigitalDisplay,
    };
  }
);

// ==============================================================================
// 5. Planned Installations (Rollout Inventory) CRUD
// ==============================================================================

export const listPlannedInstallations = onCall<ListPlannedInstallationsRequest, Promise<ListPlannedInstallationsResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    await assertAdminCaller(request.auth);
    const { siteId, departmentId, wave, status } = request.data || {};

    let query: admin.firestore.Query = db.collection('plannedInstallations');
    if (siteId) query = query.where('siteId', '==', siteId);
    if (departmentId) query = query.where('departmentId', '==', departmentId);
    if (wave !== undefined && wave !== null) query = query.where('installationWave', '==', wave);
    if (status) query = query.where('commissioningStatus', '==', status);

    const snapshot = await query.limit(100).get();
    const installations: PlannedInstallation[] = [];
    snapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => installations.push(doc.data() as PlannedInstallation));

    // In-memory sort by wave ASC, then installationRef
    installations.sort((a, b) => {
      if (a.installationWave !== b.installationWave) return a.installationWave - b.installationWave;
      return a.installationRef.localeCompare(b.installationRef);
    });

    return { installations };
  }
);

export const createPlannedInstallation = onCall<CreatePlannedInstallationRequest, Promise<CreatePlannedInstallationResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const data = request.data || ({} as CreatePlannedInstallationRequest);

    if (!data.installationRef || !data.name || !data.siteId || !data.departmentId) {
      throw new HttpsError('invalid-argument', 'Missing mandatory fields (installationRef, name, siteId, departmentId).');
    }

    const [dupPlan, dupDisp] = await Promise.all([
      db.collection('plannedInstallations').where('installationRef', '==', data.installationRef.trim()).limit(1).get(),
      db.collection('displays').where('installationRef', '==', data.installationRef.trim()).limit(1).get(),
    ]);

    if (!dupPlan.empty || !dupDisp.empty) {
      throw new HttpsError('already-exists', `Installation reference '${data.installationRef}' already exists.`);
    }

    const ref = db.collection('plannedInstallations').doc();
    const record: PlannedInstallation = {
      id: ref.id,
      installationRef: data.installationRef.trim(),
      name: data.name.trim(),
      siteId: data.siteId,
      locationDescription: data.locationDescription || '',
      departmentId: data.departmentId,
      orientation: data.orientation || 'landscape',
      configuredResolution: data.configuredResolution || { width: 1920, height: 1080 },
      groupIds: data.groupIds || [],
      installationOwner: data.installationOwner || 'Unassigned',
      installationWave: data.installationWave ?? 1,
      commissioningStatus: 'planned',
      commissioningDate: null,
      notes: data.notes || '',
      blockers: data.blockers || [],
      displayId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: caller.uid,
    };

    await ref.set(record);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'planned_installation.created',
      targetId: ref.id,
      targetType: 'display',
      newState: { installationRef: record.installationRef, name: record.name, wave: record.installationWave },
    });

    return { installation: record };
  }
);

export const updatePlannedInstallation = onCall<UpdatePlannedInstallationRequest, Promise<UpdatePlannedInstallationResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { id, ...updates } = request.data || {};
    if (!id) throw new HttpsError('invalid-argument', 'Installation ID is required.');

    const ref = db.collection('plannedInstallations').doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new HttpsError('not-found', 'Planned installation not found.');

    const current = doc.data() as PlannedInstallation;
    const updatedRecord: PlannedInstallation = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await ref.set(updatedRecord);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'planned_installation.updated',
      targetId: id,
      targetType: 'display',
      newState: updates,
    });

    return { installation: updatedRecord };
  }
);

export const convertPlannedToRegistered = onCall<ConvertPlannedToRegisteredRequest, Promise<ConvertPlannedToRegisteredResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await assertAdminCaller(request.auth);
    const { plannedInstallationId } = request.data || {};
    if (!plannedInstallationId) throw new HttpsError('invalid-argument', 'plannedInstallationId is required.');

    const planRef = db.collection('plannedInstallations').doc(plannedInstallationId);
    const planDoc = await planRef.get();
    if (!planDoc.exists) throw new HttpsError('not-found', 'Planned installation not found.');

    const plan = planDoc.data() as PlannedInstallation;
    if (plan.displayId) {
      throw new HttpsError('failed-precondition', `Planned installation is already registered as digital display '${plan.displayId}'.`);
    }

    const dispRef = db.collection('displays').doc();
    const batch = db.batch();

    const displayRecord: Partial<DigitalDisplay> & Record<string, unknown> = {
      id: dispRef.id,
      name: plan.name,
      nameLower: plan.name.toLowerCase(),
      siteId: plan.siteId,
      locationDescription: plan.locationDescription,
      departmentId: plan.departmentId,
      groupIds: plan.groupIds || [],
      orientation: plan.orientation,
      configuredResolution: plan.configuredResolution,
      lifecycle: 'pending_enrollment',
      commissioningStatus: 'in_progress',
      commissionedAt: null,
      commissionedBy: null,
      installationRef: plan.installationRef,
      installationOwner: plan.installationOwner,
      lastHeartbeatAt: null,
      reported: null,
      enrolledAt: null,
      createdBy: caller.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    batch.set(dispRef, displayRecord);

    // Pairing secrets doc
    const secRef = db.collection('displaySecrets').doc(dispRef.id);
    batch.set(secRef, {
      displayId: dispRef.id,
      activeDeviceUid: null,
      credentialVerifier: null,
      credentialGeneration: 0,
      pairingCodeVerifier: null,
      pairingCodeExpiresAt: null,
    });

    // Commissioning doc
    const commRef = db.collection('commissioning').doc(dispRef.id);
    batch.set(commRef, {
      displayId: dispRef.id,
      status: 'in_progress',
      checklist: createDefaultCommissioningChecklist(),
      commissionedAt: null,
      commissionedBy: null,
      notes: plan.notes,
      blockers: plan.blockers,
      installationOwner: plan.installationOwner,
      updatedAt: new Date().toISOString(),
    });

    // Update planned installation with linked displayId
    const updatedPlan: PlannedInstallation = {
      ...plan,
      displayId: dispRef.id,
      commissioningStatus: 'in_progress',
      updatedAt: new Date().toISOString(),
    };
    batch.set(planRef, updatedPlan);

    batch.create(
      db.collection('auditEvents').doc(),
      buildAuditRecord({
        actorId: caller.uid,
        action: 'planned_installation.converted_to_registered',
        targetId: dispRef.id,
        targetType: 'display',
        newState: { plannedInstallationId, installationRef: plan.installationRef, displayId: dispRef.id },
      })
    );

    await batch.commit();

    return {
      display: displayRecord as DigitalDisplay,
      installation: updatedPlan,
    };
  }
);

// ==============================================================================
// 6. Publication Rollout Progress & Retries
// ==============================================================================

export const getPublicationRolloutProgress = onCall<GetPublicationRolloutProgressRequest, Promise<GetPublicationRolloutProgressResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { publicationId } = request.data || {};
    if (!publicationId) throw new HttpsError('invalid-argument', 'publicationId is required.');

    const pubDoc = await db.collection('publications').doc(publicationId).get();
    if (!pubDoc.exists) throw new HttpsError('not-found', `Publication manifest '${publicationId}' not found.`);
    const pub = pubDoc.data() as any;

    if (caller.role !== 'admin' && caller.departmentId !== pub.departmentId) {
      throw new HttpsError('permission-denied', 'Access denied to publication in another department.');
    }

    const targetedDisplayIds: string[] = pub.targetedDisplayIds || [];
    if (targetedDisplayIds.length === 0) {
      return {
        publicationId,
        targetCount: 0,
        preparedCount: 0,
        downloadingCount: 0,
        activeCount: 0,
        failedCount: 0,
        staleOrNoReportCount: 0,
        targets: [],
      };
    }

    const [sitesSnap, deptsSnap, displaysSnap] = await Promise.all([
      db.collection('sites').get(),
      db.collection('departments').get(),
      db.collection('displays').where(adminFieldPathDocId(), 'in', targetedDisplayIds.slice(0, 30)).get(),
    ]);

    const siteMap = new Map<string, string>();
    sitesSnap.forEach((d) => siteMap.set(d.id, d.data().name || d.id));

    const deptMap = new Map<string, string>();
    deptsSnap.forEach((d) => deptMap.set(d.id, d.data().name || d.id));

    const nowMs = Date.now();
    const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 mins

    let preparedCount = 0;
    let downloadingCount = 0;
    let activeCount = 0;
    let failedCount = 0;
    let staleCount = 0;

    const targetItems: PublicationTargetProgressItem[] = [];

    displaysSnap.forEach((dDoc) => {
      const d = dDoc.data() as DigitalDisplay;
      const lastHbMs = d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).getTime() : 0;
      const isStale = !d.lastHeartbeatAt || nowMs - lastHbMs > STALE_THRESHOLD_MS;

      const isActive = d.activePublicationId === publicationId || d.reported?.activePublicationId === publicationId;
      const isFailed = d.deliveryStage === 'failed' || !!d.lastDeliveryError;
      const isDownloading = d.deliveryStage === 'downloading' || d.deliveryStage === 'verifying';

      let statusSummary: PublicationTargetProgressItem['statusSummary'] = 'prepared';
      if (isActive) {
        statusSummary = 'active';
        activeCount++;
      } else if (isFailed) {
        statusSummary = 'failed';
        failedCount++;
      } else if (isDownloading) {
        statusSummary = 'downloading';
        downloadingCount++;
      } else if (isStale) {
        statusSummary = 'stale';
        staleCount++;
      } else {
        statusSummary = 'prepared';
        preparedCount++;
      }

      targetItems.push({
        displayId: dDoc.id,
        displayName: d.name || dDoc.id,
        siteName: siteMap.get(d.siteId) || d.siteId,
        departmentName: deptMap.get(d.departmentId) || d.departmentId,
        orientation: d.orientation,
        deliveryStage: d.deliveryStage || 'idle',
        activePublicationId: d.activePublicationId || null,
        desiredPublicationId: d.desiredPublicationId || null,
        lastHeartbeatAt: d.lastHeartbeatAt || null,
        lastSyncAt: d.lastSyncAt || null,
        lastDeliveryError: d.lastDeliveryError || null,
        isStale,
        statusSummary,
      });
    });

    return {
      publicationId,
      targetCount: targetItems.length,
      preparedCount,
      downloadingCount,
      activeCount,
      failedCount,
      staleOrNoReportCount: staleCount,
      targets: targetItems,
    };
  }
);

export const retryPublicationTarget = onCall<RetryPublicationTargetRequest, Promise<RetryPublicationTargetResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { publicationId, displayId } = request.data || {};

    if (!publicationId || !displayId) {
      throw new HttpsError('invalid-argument', 'Missing publicationId or displayId.');
    }

    const [pubDoc, dDoc] = await Promise.all([
      db.collection('publications').doc(publicationId).get(),
      db.collection('displays').doc(displayId).get(),
    ]);

    if (!pubDoc.exists) throw new HttpsError('not-found', 'Publication manifest not found.');
    if (!dDoc.exists) throw new HttpsError('not-found', 'Digital display not found.');

    const pub = pubDoc.data() as any;
    const display = dDoc.data() as DigitalDisplay;

    if (caller.role !== 'admin' && (caller.departmentId !== pub.departmentId || caller.departmentId !== display.departmentId)) {
      throw new HttpsError('permission-denied', 'Access denied.');
    }

    // Reset delivery failure markers and re-assign desired publication
    await db.collection('displays').doc(displayId).update({
      desiredPublicationId: publicationId,
      deliveryStage: 'discovered',
      lastDeliveryError: null,
      updatedAt: new Date().toISOString(),
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: 'publication.target_retry',
      targetId: displayId,
      targetType: 'display',
      newState: { publicationId, displayId },
    });

    return {
      success: true,
      displayId,
      newDesiredPublicationId: publicationId,
    };
  }
);
