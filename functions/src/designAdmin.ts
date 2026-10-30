/**
 * Aura DIMS - Visual Content Creator & Reusable Templates Backend
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Scope: Privileged Design Document Management, Versioning, Optimistic Concurrency,
 * Reusable Templates, Starter Pack Seeding, and Asset Reference Integrity.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'node:crypto';
import type {
  UserProfile,
  DesignRecord,
  DesignDocument,
  DesignWithDocument,
  TemplateRecord,
  CreateDesignRequest,
  CreateDesignResponse,
  GetDesignRequest,
  GetDesignResponse,
  UpdateDesignRequest,
  UpdateDesignResponse,
  DuplicateDesignRequest,
  DuplicateDesignResponse,
  SetDesignArchivedRequest,
  SetDesignArchivedResponse,
  ListDesignsRequest,
  ListDesignsResponse,
  ConvertDesignOrientationRequest,
  ConvertDesignOrientationResponse,
  ListTemplatesRequest,
  ListTemplatesResponse,
  CreateTemplateRequest,
  CreateTemplateResponse,
  InstantiateTemplateRequest,
  InstantiateTemplateResponse,
  SetTemplateArchivedRequest,
  SetTemplateArchivedResponse,
  SeedStarterTemplatesRequest,
  SeedStarterTemplatesResponse,
} from '@aura-dims/display-schema';
import {
  DESIGN_CONSTRAINTS,
  validateDesignDocument,
  extractReferencedAssetIds,
} from '@aura-dims/display-schema';

const db = admin.firestore();
const REGION = 'asia-south1'; // India (Mumbai) regional target
const CALLABLE_OPTS = { region: REGION, cors: true };

// ==============================================================================
// Authorization & Audit Helper Functions
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

async function writeAuditLog(params: {
  actorId: string;
  action: string;
  targetId: string;
  targetType: 'design' | 'template';
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}): Promise<void> {
  try {
    const eventId = `audit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await db.collection('auditEvents').doc(eventId).set({
      id: eventId,
      actorId: params.actorId,
      action: params.action,
      targetId: params.targetId,
      targetType: params.targetType,
      previousState: params.previousState || null,
      newState: params.newState || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Aura DIMS] Failed to write audit event:', err);
  }
}

/**
 * Validates that all referenced assets exist and are accessible to the target department.
 */
async function validateReferencedAssets(
  assetIds: string[],
  departmentId: string,
  caller: UserProfile
): Promise<void> {
  if (assetIds.length === 0) return;

  const validIds = assetIds.filter((id) => id && typeof id === 'string' && id.trim() !== '');
  if (validIds.length === 0) return;

  for (const assetId of validIds) {
    const assetDoc = await db.collection('assets').doc(assetId).get();
    if (!assetDoc.exists) {
      throw new HttpsError(
        'not-found',
        `Referenced media asset '${assetId}' does not exist in the Media Library.`
      );
    }
    const assetData = assetDoc.data();
    if (caller.role !== 'admin' && assetData?.departmentId !== departmentId) {
      throw new HttpsError(
        'permission-denied',
        `Referenced media asset '${assetId}' belongs to another department and cannot be used in this design.`
      );
    }
  }
}

/**
 * Generates an initial default blank DesignDocument.
 */
function createBlankDesignDocument(
  orientation: 'landscape' | 'portrait'
): DesignDocument {
  const dimensions =
    orientation === 'landscape'
      ? DESIGN_CONSTRAINTS.LANDSCAPE_DIMENSIONS
      : DESIGN_CONSTRAINTS.PORTRAIT_DIMENSIONS;

  return {
    schemaVersion: '1.0.0',
    orientation,
    dimensions,
    slides: [
      {
        id: `slide-${crypto.randomBytes(4).toString('hex')}`,
        durationSeconds: DESIGN_CONSTRAINTS.DEFAULT_SLIDE_DURATION_SECONDS,
        background: {
          type: 'color',
          value: '#0f172a', // Slate 900
        },
        elements: [],
      },
    ],
  };
}

// ==============================================================================
// Design Cloud Functions
// ==============================================================================

/**
 * Create a new Design document (from blank or with initial layout).
 */
export const createDesign = onCall<CreateDesignRequest, Promise<CreateDesignResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { title, description, orientation, departmentId, initialDocument } = request.data;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new HttpsError('invalid-argument', 'Design title is required.');
    }

    const cleanTitle = title.trim().slice(0, DESIGN_CONSTRAINTS.MAX_TITLE_LENGTH);
    const cleanDesc = (description || '').trim().slice(0, DESIGN_CONSTRAINTS.MAX_DESCRIPTION_LENGTH);

    if (orientation !== 'landscape' && orientation !== 'portrait') {
      throw new HttpsError('invalid-argument', "Orientation must be 'landscape' or 'portrait'.");
    }

    // Determine target department
    let targetDeptId: string;
    if (caller.role === 'admin') {
      targetDeptId = departmentId || caller.departmentId || 'dept-general';
    } else {
      if (!caller.departmentId) {
        throw new HttpsError('failed-precondition', 'Department Head must have an assigned department.');
      }
      targetDeptId = caller.departmentId;
    }

    // Validate initial document or generate blank
    let docToSave: DesignDocument;
    if (initialDocument) {
      const val = validateDesignDocument(initialDocument);
      if (!val.valid) {
        throw new HttpsError(
          'invalid-argument',
          `Invalid initial design document: ${val.errors.join('; ')}`
        );
      }
      docToSave = initialDocument;
    } else {
      docToSave = createBlankDesignDocument(orientation);
    }

    // Validate referenced assets
    const referencedAssetIds = extractReferencedAssetIds(docToSave);
    await validateReferencedAssets(referencedAssetIds, targetDeptId, caller);

    const designId = `des-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const record: DesignRecord = {
      id: designId,
      title: cleanTitle,
      description: cleanDesc,
      orientation,
      dimensions: docToSave.dimensions,
      departmentId: targetDeptId,
      ownerId: caller.uid,
      uploaderDisplayName: caller.displayName || caller.email,
      status: 'draft',
      revision: 1,
      slideCount: docToSave.slides.length,
      referencedAssetIds,
      thumbnailSvg: null,
      schemaVersion: '1.0.0',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('designs').doc(designId).set({
      ...record,
      document: docToSave,
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: 'design.create',
      targetId: designId,
      targetType: 'design',
      newState: { title: cleanTitle, orientation, departmentId: targetDeptId },
    });

    return {
      design: {
        ...record,
        document: docToSave,
      },
    };
  }
);

/**
 * Fetch a Design with full document payload, checking departmental permissions.
 */
export const getDesign = onCall<GetDesignRequest, Promise<GetDesignResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { designId } = request.data;

    if (!designId) {
      throw new HttpsError('invalid-argument', 'designId is required.');
    }

    const docSnap = await db.collection('designs').doc(designId).get();
    if (!docSnap.exists) {
      throw new HttpsError('not-found', `Design '${designId}' not found.`);
    }

    const data = docSnap.data() as DesignWithDocument;

    // Enforce departmental access control
    if (caller.role !== 'admin' && data.departmentId !== caller.departmentId) {
      throw new HttpsError(
        'permission-denied',
        'You do not have permission to view designs from another department.'
      );
    }

    return { design: data };
  }
);

/**
 * Update a Design with optimistic concurrency revision checking and schema validation.
 */
export const updateDesign = onCall<UpdateDesignRequest, Promise<UpdateDesignResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { designId, title, description, expectedRevision, document, thumbnailSvg } = request.data;

    if (!designId) {
      throw new HttpsError('invalid-argument', 'designId is required.');
    }
    if (typeof expectedRevision !== 'number') {
      throw new HttpsError('invalid-argument', 'expectedRevision number is required.');
    }
    if (!document) {
      throw new HttpsError('invalid-argument', 'document is required.');
    }

    // 1. Validate Schema
    const val = validateDesignDocument(document);
    if (!val.valid) {
      throw new HttpsError('invalid-argument', `Design document invalid: ${val.errors.join('; ')}`);
    }

    // 2. Transactional optimistic concurrency check
    const designRef = db.collection('designs').doc(designId);

    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(designRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', `Design '${designId}' not found.`);
      }

      const current = snap.data() as DesignWithDocument;

      // Departmental check
      if (caller.role !== 'admin' && current.departmentId !== caller.departmentId) {
        throw new HttpsError(
          'permission-denied',
          'You do not have permission to modify designs from another department.'
        );
      }

      // Optimistic concurrency check
      if (current.revision !== expectedRevision) {
        throw new HttpsError(
          'failed-precondition',
          `Concurrent edit conflict: current server revision is ${current.revision}, but your draft was based on revision ${expectedRevision}. Please reload latest or save as a copy.`
        );
      }

      // Revalidate referenced assets
      const referencedAssetIds = extractReferencedAssetIds(document);
      await validateReferencedAssets(referencedAssetIds, current.departmentId, caller);

      const nextRevision = current.revision + 1;
      const now = new Date().toISOString();

      const updatedRecord: DesignRecord = {
        ...current,
        title: title !== undefined ? title.trim().slice(0, DESIGN_CONSTRAINTS.MAX_TITLE_LENGTH) : current.title,
        description: description !== undefined ? description.trim().slice(0, DESIGN_CONSTRAINTS.MAX_DESCRIPTION_LENGTH) : current.description,
        dimensions: document.dimensions,
        orientation: document.orientation,
        revision: nextRevision,
        slideCount: document.slides.length,
        referencedAssetIds,
        thumbnailSvg: thumbnailSvg !== undefined ? thumbnailSvg : current.thumbnailSvg,
        updatedAt: now,
      };

      tx.set(designRef, {
        ...updatedRecord,
        document,
      });

      return {
        design: {
          ...updatedRecord,
          document,
        },
      };
    });
  }
);

/**
 * Duplicate a Design into an independent fresh copy.
 */
export const duplicateDesign = onCall<DuplicateDesignRequest, Promise<DuplicateDesignResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { designId, newTitle } = request.data;

    const sourceSnap = await db.collection('designs').doc(designId).get();
    if (!sourceSnap.exists) {
      throw new HttpsError('not-found', `Design '${designId}' not found.`);
    }

    const source = sourceSnap.data() as DesignWithDocument;

    // Check access
    if (caller.role !== 'admin' && source.departmentId !== caller.departmentId) {
      throw new HttpsError('permission-denied', 'Cannot duplicate designs from another department.');
    }

    // Revalidate referenced assets
    const assetIds = extractReferencedAssetIds(source.document);
    await validateReferencedAssets(assetIds, source.departmentId, caller);

    // Deep clone slides with new stable IDs
    const clonedSlides = source.document.slides.map((s) => ({
      ...s,
      id: `slide-${crypto.randomBytes(4).toString('hex')}`,
      elements: s.elements.map((el) => ({
        ...el,
        id: `el-${crypto.randomBytes(4).toString('hex')}`,
      })),
    }));

    const clonedDocument: DesignDocument = {
      ...source.document,
      slides: clonedSlides,
    };

    const newDesignId = `des-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const cleanTitle = (newTitle || `${source.title} (Copy)`).slice(0, DESIGN_CONSTRAINTS.MAX_TITLE_LENGTH);
    const now = new Date().toISOString();

    const newRecord: DesignRecord = {
      id: newDesignId,
      title: cleanTitle,
      description: source.description,
      orientation: source.orientation,
      dimensions: source.dimensions,
      departmentId: source.departmentId,
      ownerId: caller.uid,
      uploaderDisplayName: caller.displayName || caller.email,
      status: 'draft',
      revision: 1,
      slideCount: clonedSlides.length,
      referencedAssetIds: assetIds,
      thumbnailSvg: source.thumbnailSvg || null,
      schemaVersion: '1.0.0',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('designs').doc(newDesignId).set({
      ...newRecord,
      document: clonedDocument,
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: 'design.duplicate',
      targetId: newDesignId,
      targetType: 'design',
      newState: { sourceDesignId: designId, title: cleanTitle },
    });

    return {
      design: {
        ...newRecord,
        document: clonedDocument,
      },
    };
  }
);

/**
 * Archive or restore a Design.
 */
export const setDesignArchivedStatus = onCall<SetDesignArchivedRequest, Promise<SetDesignArchivedResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { designId, archived } = request.data;

    const ref = db.collection('designs').doc(designId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', `Design '${designId}' not found.`);
    }

    const current = snap.data() as DesignRecord;

    if (caller.role !== 'admin' && current.departmentId !== caller.departmentId) {
      throw new HttpsError('permission-denied', 'Cannot modify designs belonging to another department.');
    }

    const status = archived ? 'archived' : 'draft';
    const now = new Date().toISOString();

    await ref.update({
      status,
      revision: admin.firestore.FieldValue.increment(1),
      updatedAt: now,
    });

    return {
      design: {
        ...current,
        status,
        revision: current.revision + 1,
        updatedAt: now,
      },
    };
  }
);

/**
 * List Designs with pagination and departmental filtering.
 */
export const listDesigns = onCall<ListDesignsRequest, Promise<ListDesignsResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { departmentId, orientation, status, search, pageSize = 12, cursor } = request.data;

    let query: admin.firestore.Query = db.collection('designs');

    // Scoping
    if (caller.role !== 'admin') {
      query = query.where('departmentId', '==', caller.departmentId || '__none__');
    } else if (departmentId && departmentId !== 'all') {
      query = query.where('departmentId', '==', departmentId);
    }

    // Filter by status (default: draft/non-archived if not specified or 'all')
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }

    // Filter by orientation
    if (orientation && orientation !== 'all') {
      query = query.where('orientation', '==', orientation);
    }

    let snapshotDocs: admin.firestore.QueryDocumentSnapshot[] = [];
    try {
      let orderedQuery = query.orderBy('updatedAt', 'desc').limit(Math.min(pageSize, 50));
      if (cursor) {
        const cursorSnap = await db.collection('designs').doc(cursor).get();
        if (cursorSnap.exists) {
          orderedQuery = orderedQuery.startAfter(cursorSnap);
        }
      }
      const snapshot = await orderedQuery.get();
      snapshotDocs = snapshot.docs;
    } catch (queryErr: any) {
      console.warn('[listDesigns] Ordered query failed (index building/missing), falling back to in-memory sort:', queryErr?.message || queryErr);
      const snapshot = await query.limit(Math.min(pageSize, 50)).get();
      snapshotDocs = [...snapshot.docs].sort((a, b) => {
        const aDate = (a.data().updatedAt as string) || '';
        const bDate = (b.data().updatedAt as string) || '';
        return bDate.localeCompare(aDate);
      });
    }

    let designs: DesignRecord[] = snapshotDocs.map((d) => {
      const data = d.data();
      // Omit the full document payload in listing to keep wire transfers bounded
      const { document, ...record } = data;
      return record as DesignRecord;
    });

    // In-memory substring search for title/description if provided
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      designs = designs.filter(
        (des) =>
          des.title.toLowerCase().includes(q) ||
          (des.description && des.description.toLowerCase().includes(q))
      );
    }

    const nextCursor =
      snapshotDocs.length >= pageSize ? snapshotDocs[snapshotDocs.length - 1]?.id || null : null;

    return {
      designs,
      nextCursor,
    };
  }
);

/**
 * Explicit conversion between landscape (1920x1080) and portrait (1080x1920).
 * Scales element bounding boxes proportionally to new dimensions without stretching media.
 */
export const convertDesignOrientation = onCall<
  ConvertDesignOrientationRequest,
  Promise<ConvertDesignOrientationResponse>
>(CALLABLE_OPTS, async (request) => {
  const caller = await getAuthenticatedCaller(request.auth);
  const { designId, targetOrientation, expectedRevision } = request.data;

  if (targetOrientation !== 'landscape' && targetOrientation !== 'portrait') {
    throw new HttpsError('invalid-argument', "Target orientation must be 'landscape' or 'portrait'.");
  }

  const designRef = db.collection('designs').doc(designId);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(designRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', `Design '${designId}' not found.`);
    }

    const current = snap.data() as DesignWithDocument;

    if (caller.role !== 'admin' && current.departmentId !== caller.departmentId) {
      throw new HttpsError('permission-denied', 'Cannot modify designs belonging to another department.');
    }

    if (current.revision !== expectedRevision) {
      throw new HttpsError(
        'failed-precondition',
        `Revision conflict: current revision is ${current.revision}, expected ${expectedRevision}.`
      );
    }

    if (current.orientation === targetOrientation) {
      return { design: current };
    }

    const oldDims = current.dimensions;
    const newDims =
      targetOrientation === 'landscape'
        ? DESIGN_CONSTRAINTS.LANDSCAPE_DIMENSIONS
        : DESIGN_CONSTRAINTS.PORTRAIT_DIMENSIONS;

    const scaleX = newDims.width / oldDims.width;
    const scaleY = newDims.height / oldDims.height;

    // Adapt slide elements without distorting media aspect ratio
    const convertedSlides = current.document.slides.map((s) => ({
      ...s,
      elements: s.elements.map((el) => {
        const newX = Math.round(el.x * scaleX);
        const newY = Math.round(el.y * scaleY);
        const newW = Math.max(20, Math.min(newDims.width, Math.round(el.width * scaleX)));
        const newH = Math.max(20, Math.min(newDims.height, Math.round(el.height * scaleY)));

        return {
          ...el,
          x: Math.min(newX, newDims.width - 20),
          y: Math.min(newY, newDims.height - 20),
          width: newW,
          height: newH,
        };
      }),
    }));

    const convertedDoc: DesignDocument = {
      schemaVersion: '1.0.0',
      orientation: targetOrientation,
      dimensions: newDims,
      slides: convertedSlides,
    };

    const nextRev = current.revision + 1;
    const now = new Date().toISOString();

    const updated: DesignRecord = {
      ...current,
      orientation: targetOrientation,
      dimensions: newDims,
      revision: nextRev,
      updatedAt: now,
    };

    tx.set(designRef, {
      ...updated,
      document: convertedDoc,
    });

    await writeAuditLog({
      actorId: caller.uid,
      action: 'design.convert_orientation',
      targetId: designId,
      targetType: 'design',
      previousState: { orientation: current.orientation },
      newState: { orientation: targetOrientation },
    });

    return {
      design: {
        ...updated,
        document: convertedDoc,
      },
    };
  });
});

// ==============================================================================
// Templates Cloud Functions
// ==============================================================================

/**
 * List available templates (global + department scoped).
 */
export const listTemplates = onCall<ListTemplatesRequest, Promise<ListTemplatesResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { departmentId, category, orientation, includeArchived = false } = request.data;

    let query: admin.firestore.Query = db.collection('templates');

    if (!includeArchived) {
      query = query.where('status', '==', 'active');
    }

    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    if (orientation && orientation !== 'all') {
      query = query.where('orientation', '==', orientation);
    }

    let snapDocs: admin.firestore.QueryDocumentSnapshot[] = [];
    try {
      const orderedQuery = query.orderBy('updatedAt', 'desc').limit(50);
      const snap = await orderedQuery.get();
      snapDocs = snap.docs;
    } catch (queryErr: any) {
      console.warn('[listTemplates] Ordered query failed (index building/missing), falling back to in-memory sort:', queryErr?.message || queryErr);
      const snap = await query.limit(50).get();
      snapDocs = [...snap.docs].sort((a, b) => {
        const aDate = (a.data().updatedAt as string) || '';
        const bDate = (b.data().updatedAt as string) || '';
        return bDate.localeCompare(aDate);
      });
    }

    let templates = snapDocs.map((d) => d.data() as TemplateRecord);

    // Apply authorization filter
    if (caller.role !== 'admin') {
      templates = templates.filter(
        (t) => t.scope === 'global' || (t.scope === 'department' && t.departmentId === caller.departmentId)
      );
    } else if (departmentId && departmentId !== 'all') {
      templates = templates.filter(
        (t) => t.scope === 'global' || t.departmentId === departmentId
      );
    }

    return { templates };
  }
);

/**
 * Create a reusable template.
 */
export const createTemplate = onCall<CreateTemplateRequest, Promise<CreateTemplateResponse>>(
  CALLABLE_OPTS,
  async (request) => {
    const caller = await getAuthenticatedCaller(request.auth);
    const { title, description, category, scope, departmentId, document, thumbnailSvg } = request.data;

    if (!title || !title.trim()) {
      throw new HttpsError('invalid-argument', 'Template title is required.');
    }
    if (!document) {
      throw new HttpsError('invalid-argument', 'Template design document is required.');
    }

    // Role check: Only admin can create global templates
    if (scope === 'global' && caller.role !== 'admin') {
      throw new HttpsError(
        'permission-denied',
        'Only System Administrators can create or publish global master templates.'
      );
    }

    const targetDeptId = scope === 'department' ? (departmentId || caller.departmentId || null) : null;

    // Validate document schema
    const val = validateDesignDocument(document);
    if (!val.valid) {
      throw new HttpsError('invalid-argument', `Template document invalid: ${val.errors.join('; ')}`);
    }

    // Global templates must NOT leak private departmental media
    if (scope === 'global') {
      const assetIds = extractReferencedAssetIds(document);
      if (assetIds.length > 0) {
        throw new HttpsError(
          'invalid-argument',
          'Global templates cannot reference departmental private media assets. Use neutral placeholders.'
        );
      }
    }

    const templateId = `tpl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const record: TemplateRecord = {
      id: templateId,
      title: title.trim().slice(0, DESIGN_CONSTRAINTS.MAX_TITLE_LENGTH),
      description: (description || '').trim().slice(0, DESIGN_CONSTRAINTS.MAX_DESCRIPTION_LENGTH),
      category: category || 'notice',
      scope,
      departmentId: targetDeptId,
      orientation: document.orientation,
      dimensions: document.dimensions,
      schemaVersion: '1.0.0',
      status: 'active',
      document,
      thumbnailSvg: thumbnailSvg || null,
      createdBy: caller.uid,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('templates').doc(templateId).set(record);

    await writeAuditLog({
      actorId: caller.uid,
      action: 'template.create',
      targetId: templateId,
      targetType: 'template',
      newState: { title: record.title, scope, category },
    });

    return { template: record };
  }
);

/**
 * Instantiate a template into a new independent design record.
 */
export const instantiateTemplate = onCall<
  InstantiateTemplateRequest,
  Promise<InstantiateTemplateResponse>
>(CALLABLE_OPTS, async (request) => {
  const caller = await getAuthenticatedCaller(request.auth);
  const { templateId, title, departmentId } = request.data;

  const tplSnap = await db.collection('templates').doc(templateId).get();
  if (!tplSnap.exists) {
    throw new HttpsError('not-found', `Template '${templateId}' not found.`);
  }

  const tpl = tplSnap.data() as TemplateRecord;

  // Verify caller can use this template
  if (caller.role !== 'admin') {
    if (tpl.scope === 'department' && tpl.departmentId !== caller.departmentId) {
      throw new HttpsError(
        'permission-denied',
        'Cannot instantiate templates belonging to another department.'
      );
    }
  }

  const targetDeptId = caller.role === 'admin' ? (departmentId || tpl.departmentId || 'dept-general') : (caller.departmentId || '');
  if (!targetDeptId) {
    throw new HttpsError('failed-precondition', 'An assigned department is required to instantiate a design.');
  }

  // Deep clone slides with fresh IDs
  const clonedSlides = tpl.document.slides.map((s) => ({
    ...s,
    id: `slide-${crypto.randomBytes(4).toString('hex')}`,
    elements: s.elements.map((el) => ({
      ...el,
      id: `el-${crypto.randomBytes(4).toString('hex')}`,
    })),
  }));

  const clonedDoc: DesignDocument = {
    ...tpl.document,
    slides: clonedSlides,
  };

  const newDesignId = `des-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const cleanTitle = (title || `${tpl.title} (Draft)`).slice(0, DESIGN_CONSTRAINTS.MAX_TITLE_LENGTH);
  const now = new Date().toISOString();

  const newRecord: DesignRecord = {
    id: newDesignId,
    title: cleanTitle,
    description: `Created from template: ${tpl.title}`,
    orientation: tpl.orientation,
    dimensions: tpl.dimensions,
    departmentId: targetDeptId,
    ownerId: caller.uid,
    uploaderDisplayName: caller.displayName || caller.email,
    status: 'draft',
    revision: 1,
    slideCount: clonedSlides.length,
    referencedAssetIds: extractReferencedAssetIds(clonedDoc),
    thumbnailSvg: tpl.thumbnailSvg || null,
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('designs').doc(newDesignId).set({
    ...newRecord,
    document: clonedDoc,
  });

  await writeAuditLog({
    actorId: caller.uid,
    action: 'template.instantiate',
    targetId: newDesignId,
    targetType: 'design',
    newState: { templateId, title: cleanTitle, departmentId: targetDeptId },
  });

  return {
    design: {
      ...newRecord,
      document: clonedDoc,
    },
  };
});

/**
 * Archive or restore a template.
 */
export const setTemplateArchivedStatus = onCall<
  SetTemplateArchivedRequest,
  Promise<SetTemplateArchivedResponse>
>(CALLABLE_OPTS, async (request) => {
  const caller = await getAuthenticatedCaller(request.auth);
  const { templateId, archived } = request.data;

  const ref = db.collection('templates').doc(templateId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Template '${templateId}' not found.`);
  }

  const current = snap.data() as TemplateRecord;

  if (caller.role !== 'admin') {
    if (current.scope === 'global' || current.departmentId !== caller.departmentId) {
      throw new HttpsError(
        'permission-denied',
        'Cannot modify global master templates or templates from another department.'
      );
    }
  }

  const status = archived ? 'archived' : 'active';
  const now = new Date().toISOString();

  await ref.update({
    status,
    updatedAt: now,
  });

  return {
    template: {
      ...current,
      status,
      updatedAt: now,
    },
  };
});

// ==============================================================================
// Starter Templates Seeding
// ==============================================================================

/**
 * Builds the 8 starter template definitions (4 types × 2 orientations).
 */
function buildStarterTemplateDefinitions(): Array<{
  id: string;
  title: string;
  description: string;
  category: 'notice' | 'poster' | 'announcement' | 'board';
  orientation: 'landscape' | 'portrait';
  document: DesignDocument;
}> {
  const L = DESIGN_CONSTRAINTS.LANDSCAPE_DIMENSIONS;
  const P = DESIGN_CONSTRAINTS.PORTRAIT_DIMENSIONS;

  return [
    // 1. Text Notice - Landscape (1920x1080)
    {
      id: 'tpl-starter-text-notice-landscape',
      title: 'Operational Notice (Landscape)',
      description: 'High-contrast typography notice for operational announcements, safety alerts, or policy updates.',
      category: 'notice',
      orientation: 'landscape',
      document: {
        schemaVersion: '1.0.0',
        orientation: 'landscape',
        dimensions: L,
        slides: [
          {
            id: 'slide-1',
            durationSeconds: 15,
            background: { type: 'color', value: '#0f172a' },
            elements: [
              {
                id: 'el-badge',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Category Pill',
                x: 100,
                y: 100,
                width: 280,
                height: 52,
                rotation: 0,
                zIndex: 1,
                opacity: 1,
                fillColor: '#0d9488',
                borderColor: '#14b8a6',
                borderWidth: 1,
                borderRadius: 26,
              },
              {
                id: 'el-badge-text',
                type: 'text',
                name: 'Category Label',
                x: 100,
                y: 112,
                width: 280,
                height: 32,
                rotation: 0,
                zIndex: 2,
                opacity: 1,
                content: 'OPERATIONAL NOTICE',
                fontFamily: 'Inter',
                fontSize: 18,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'center',
                lineHeight: 1.2,
                letterSpacing: 2,
              },
              {
                id: 'el-heading',
                type: 'text',
                name: 'Main Heading',
                x: 100,
                y: 200,
                width: 1720,
                height: 120,
                rotation: 0,
                zIndex: 3,
                opacity: 1,
                content: 'Shift Schedule & Safety Briefing',
                fontFamily: 'Inter',
                fontSize: 64,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-subheading-gu',
                type: 'text',
                name: 'Gujarati Subtitle',
                x: 100,
                y: 340,
                width: 1720,
                height: 60,
                rotation: 0,
                zIndex: 4,
                opacity: 0.9,
                content: 'શિફ્ટ સમયપત્રક અને સુરક્ષા માર્ગદર્શિકા',
                fontFamily: 'Noto Sans Gujarati',
                fontSize: 32,
                fontWeight: 'medium',
                color: '#5eead4',
                textAlign: 'left',
                lineHeight: 1.4,
                letterSpacing: 0,
                language: 'gu',
              },
              {
                id: 'el-body',
                type: 'text',
                name: 'Body Notice Text',
                x: 100,
                y: 440,
                width: 1720,
                height: 400,
                rotation: 0,
                zIndex: 5,
                opacity: 0.85,
                content:
                  'All shift supervisors and floor personnel must assemble at the designated safety zones before equipment changeover.\n\nPersonal protective equipment (PPE) must be verified and worn at all production lines. Report any facility maintenance requirements to Operations.',
                fontFamily: 'Inter',
                fontSize: 32,
                fontWeight: 'normal',
                color: '#cbd5e1',
                textAlign: 'left',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
              {
                id: 'el-footer-line',
                type: 'shape',
                shapeType: 'line',
                name: 'Divider Line',
                x: 100,
                y: 920,
                width: 1720,
                height: 2,
                rotation: 0,
                zIndex: 6,
                opacity: 0.3,
                fillColor: '#94a3b8',
                borderColor: '#94a3b8',
                borderWidth: 2,
              },
              {
                id: 'el-footer-text',
                type: 'text',
                name: 'Footer Disclaimer',
                x: 100,
                y: 950,
                width: 1720,
                height: 40,
                rotation: 0,
                zIndex: 7,
                opacity: 0.6,
                content: 'Aurainteract Private Limited • Aura DIMS Digital Signage Platform',
                fontFamily: 'Inter',
                fontSize: 20,
                fontWeight: 'normal',
                color: '#94a3b8',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 1,
              },
            ],
          },
        ],
      },
    },

    // 2. Text Notice - Portrait (1080x1920)
    {
      id: 'tpl-starter-text-notice-portrait',
      title: 'Operational Notice (Portrait)',
      description: 'Vertical totem format for reception kiosks, entryways, and plant floor pillars.',
      category: 'notice',
      orientation: 'portrait',
      document: {
        schemaVersion: '1.0.0',
        orientation: 'portrait',
        dimensions: P,
        slides: [
          {
            id: 'slide-1',
            durationSeconds: 15,
            background: { type: 'color', value: '#0f172a' },
            elements: [
              {
                id: 'el-badge',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Category Pill',
                x: 80,
                y: 120,
                width: 300,
                height: 60,
                rotation: 0,
                zIndex: 1,
                opacity: 1,
                fillColor: '#0d9488',
                borderColor: '#14b8a6',
                borderWidth: 1,
                borderRadius: 30,
              },
              {
                id: 'el-badge-text',
                type: 'text',
                name: 'Category Text',
                x: 80,
                y: 135,
                width: 300,
                height: 35,
                rotation: 0,
                zIndex: 2,
                opacity: 1,
                content: 'FACILITY NOTICE',
                fontFamily: 'Inter',
                fontSize: 20,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'center',
                lineHeight: 1.2,
                letterSpacing: 2,
              },
              {
                id: 'el-heading',
                type: 'text',
                name: 'Heading',
                x: 80,
                y: 240,
                width: 920,
                height: 180,
                rotation: 0,
                zIndex: 3,
                opacity: 1,
                content: 'Visitor & Staff Guidelines',
                fontFamily: 'Inter',
                fontSize: 56,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-hi-text',
                type: 'text',
                name: 'Hindi Notice',
                x: 80,
                y: 450,
                width: 920,
                height: 100,
                rotation: 0,
                zIndex: 4,
                opacity: 0.9,
                content: 'आगंतुक और कर्मचारी सुरक्षा निर्देश',
                fontFamily: 'Noto Sans Devanagari',
                fontSize: 36,
                fontWeight: 'medium',
                color: '#5eead4',
                textAlign: 'left',
                lineHeight: 1.4,
                letterSpacing: 0,
                language: 'hi',
              },
              {
                id: 'el-card',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Notice Container Card',
                x: 80,
                y: 590,
                width: 920,
                height: 1050,
                rotation: 0,
                zIndex: 5,
                opacity: 0.7,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 2,
                borderRadius: 24,
              },
              {
                id: 'el-body',
                type: 'text',
                name: 'Body Instructions',
                x: 120,
                y: 640,
                width: 840,
                height: 950,
                rotation: 0,
                zIndex: 6,
                opacity: 0.9,
                content:
                  '1. Check-In Registration\nAll visitors must register at the reception desk with digital ID verification.\n\n2. Mandatory Badging\nWear security badges prominently at all times within the facility.\n\n3. Restricted Production Areas\nEntry to fabrication bays requires authorization from the Shift In-Charge.\n\n4. Emergency Assembly\nIn case of siren, proceed to Assembly Point Alpha via marked fire exits.',
                fontFamily: 'Inter',
                fontSize: 30,
                fontWeight: 'normal',
                color: '#e2e8f0',
                textAlign: 'left',
                lineHeight: 1.7,
                letterSpacing: 0,
              },
              {
                id: 'el-footer',
                type: 'text',
                name: 'Footer',
                x: 80,
                y: 1780,
                width: 920,
                height: 50,
                rotation: 0,
                zIndex: 7,
                opacity: 0.5,
                content: 'Aurainteract Private Limited • Aura DIMS',
                fontFamily: 'Inter',
                fontSize: 20,
                fontWeight: 'normal',
                color: '#94a3b8',
                textAlign: 'center',
                lineHeight: 1.2,
                letterSpacing: 1,
              },
            ],
          },
        ],
      },
    },

    // 3. Image Poster - Landscape (1920x1080)
    {
      id: 'tpl-starter-image-poster-landscape',
      title: 'Image Poster Showcase (Landscape)',
      description: 'Side-by-side layout pairing high-impact photography with prominent headlines and descriptive body.',
      category: 'poster',
      orientation: 'landscape',
      document: {
        schemaVersion: '1.0.0',
        orientation: 'landscape',
        dimensions: L,
        slides: [
          {
            id: 'slide-1',
            durationSeconds: 12,
            background: { type: 'color', value: '#0f172a' },
            elements: [
              // Left Content Column
              {
                id: 'el-heading',
                type: 'text',
                name: 'Poster Title',
                x: 100,
                y: 120,
                width: 800,
                height: 140,
                rotation: 0,
                zIndex: 1,
                opacity: 1,
                content: 'Excellence in Precision Engineering',
                fontFamily: 'Inter',
                fontSize: 54,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-sub',
                type: 'text',
                name: 'Poster Subtitle',
                x: 100,
                y: 290,
                width: 800,
                height: 60,
                rotation: 0,
                zIndex: 2,
                opacity: 0.9,
                content: 'આધુનિક ઔદ્યોગિક ઉત્કૃષ્ટતા',
                fontFamily: 'Noto Sans Gujarati',
                fontSize: 32,
                fontWeight: 'medium',
                color: '#14b8a6',
                textAlign: 'left',
                lineHeight: 1.4,
                letterSpacing: 0,
                language: 'gu',
              },
              {
                id: 'el-desc',
                type: 'text',
                name: 'Description Text',
                x: 100,
                y: 380,
                width: 800,
                height: 400,
                rotation: 0,
                zIndex: 3,
                opacity: 0.85,
                content:
                  'Our Gujarat manufacturing hubs deliver high-tolerance manufacturing solutions for global infrastructure.\n\nZero defects. Uncompromising safety. Continuous innovation.',
                fontFamily: 'Inter',
                fontSize: 28,
                fontWeight: 'normal',
                color: '#cbd5e1',
                textAlign: 'left',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
              // Right Column: Image Placeholder
              {
                id: 'el-img-frame',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Photo Frame Border',
                x: 960,
                y: 100,
                width: 860,
                height: 860,
                rotation: 0,
                zIndex: 4,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#0d9488',
                borderWidth: 3,
                borderRadius: 24,
              },
              {
                id: 'el-image',
                type: 'image',
                name: 'Hero Photograph',
                assetId: '', // Neutral placeholder to be selected from Media Library
                fit: 'cover',
                preserveAspectRatio: true,
                x: 970,
                y: 110,
                width: 840,
                height: 840,
                rotation: 0,
                zIndex: 5,
                opacity: 1,
              },
            ],
          },
        ],
      },
    },

    // 4. Image Poster - Portrait (1080x1920)
    {
      id: 'tpl-starter-image-poster-portrait',
      title: 'Image Poster Showcase (Portrait)',
      description: 'Vertical presentation pairing a large photo banner with announcement copy below.',
      category: 'poster',
      orientation: 'portrait',
      document: {
        schemaVersion: '1.0.0',
        orientation: 'portrait',
        dimensions: P,
        slides: [
          {
            id: 'slide-1',
            durationSeconds: 12,
            background: { type: 'color', value: '#0f172a' },
            elements: [
              // Top Image Area
              {
                id: 'el-img-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Image Container',
                x: 60,
                y: 80,
                width: 960,
                height: 960,
                rotation: 0,
                zIndex: 1,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 2,
                borderRadius: 24,
              },
              {
                id: 'el-image',
                type: 'image',
                name: 'Poster Image',
                assetId: '',
                fit: 'cover',
                preserveAspectRatio: true,
                x: 70,
                y: 90,
                width: 940,
                height: 940,
                rotation: 0,
                zIndex: 2,
                opacity: 1,
              },
              // Bottom Text Section
              {
                id: 'el-heading',
                type: 'text',
                name: 'Heading Text',
                x: 60,
                y: 1100,
                width: 960,
                height: 140,
                rotation: 0,
                zIndex: 3,
                opacity: 1,
                content: 'Industrial Innovation',
                fontFamily: 'Inter',
                fontSize: 56,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'center',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-sub-hi',
                type: 'text',
                name: 'Hindi Subtitle',
                x: 60,
                y: 1260,
                width: 960,
                height: 60,
                rotation: 0,
                zIndex: 4,
                opacity: 0.9,
                content: 'सुरक्षा और गुणवत्ता हमारी सर्वोच्च प्राथमिकता',
                fontFamily: 'Noto Sans Devanagari',
                fontSize: 32,
                fontWeight: 'medium',
                color: '#2dd4bf',
                textAlign: 'center',
                lineHeight: 1.4,
                letterSpacing: 0,
                language: 'hi',
              },
              {
                id: 'el-body',
                type: 'text',
                name: 'Body Description',
                x: 80,
                y: 1360,
                width: 920,
                height: 380,
                rotation: 0,
                zIndex: 5,
                opacity: 0.85,
                content:
                  'Celebrating 1,000 consecutive days of safe operations without lost-time incidents across our Gujarat manufacturing divisions.\n\nThank you to our dedicated engineering and maintenance teams.',
                fontFamily: 'Inter',
                fontSize: 28,
                fontWeight: 'normal',
                color: '#cbd5e1',
                textAlign: 'center',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
            ],
          },
        ],
      },
    },

    // 5. Video Announcement - Landscape (1920x1080)
    {
      id: 'tpl-starter-video-announcement-landscape',
      title: 'Video Announcement (Landscape)',
      description: 'Dedicated 16:9 video player region accompanied by live presentation bullet points.',
      category: 'announcement',
      orientation: 'landscape',
      document: {
        schemaVersion: '1.0.0',
        orientation: 'landscape',
        dimensions: L,
        slides: [
          {
            id: 'slide-1',
            durationSeconds: 30,
            background: { type: 'color', value: '#0f172a' },
            elements: [
              // Video Player Box (Left 16:9)
              {
                id: 'el-video-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Video Frame',
                x: 80,
                y: 100,
                width: 1152,
                height: 648,
                rotation: 0,
                zIndex: 1,
                opacity: 1,
                fillColor: '#000000',
                borderColor: '#0d9488',
                borderWidth: 2,
                borderRadius: 20,
              },
              {
                id: 'el-video',
                type: 'video',
                name: 'Announcement Video Stream',
                assetId: '',
                fit: 'contain',
                muted: true,
                loop: true,
                autoDuration: true,
                x: 80,
                y: 100,
                width: 1152,
                height: 648,
                rotation: 0,
                zIndex: 2,
                opacity: 1,
              },
              // Video Caption / Tag
              {
                id: 'el-caption',
                type: 'text',
                name: 'Video Subtitle',
                x: 80,
                y: 780,
                width: 1152,
                height: 60,
                rotation: 0,
                zIndex: 3,
                opacity: 0.8,
                content: 'Managing Director Address • Corporate Operations Broadcast',
                fontFamily: 'Inter',
                fontSize: 24,
                fontWeight: 'medium',
                color: '#94a3b8',
                textAlign: 'left',
                lineHeight: 1.3,
                letterSpacing: 0,
              },
              // Right Column Information Panel
              {
                id: 'el-panel-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Key Highlights Panel',
                x: 1280,
                y: 100,
                width: 560,
                height: 860,
                rotation: 0,
                zIndex: 4,
                opacity: 0.9,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 1,
                borderRadius: 20,
              },
              {
                id: 'el-panel-title',
                type: 'text',
                name: 'Panel Title',
                x: 1320,
                y: 140,
                width: 480,
                height: 60,
                rotation: 0,
                zIndex: 5,
                opacity: 1,
                content: 'Key Highlights',
                fontFamily: 'Inter',
                fontSize: 32,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-panel-bullets',
                type: 'text',
                name: 'Bullet Points',
                x: 1320,
                y: 230,
                width: 480,
                height: 680,
                rotation: 0,
                zIndex: 6,
                opacity: 0.85,
                content:
                  '• Q3 Plant Production targets achieved at 104% efficiency.\n\n• New automated CNC line operational at Vadodara facility.\n\n• ISO 14001 environmental compliance recertification verified.\n\n• Annual safety rewards ceremony scheduled for Friday at 16:00 IST.',
                fontFamily: 'Inter',
                fontSize: 22,
                fontWeight: 'normal',
                color: '#cbd5e1',
                textAlign: 'left',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
            ],
          },
        ],
      },
    },

    // 6. Video Announcement - Portrait (1080x1920)
    {
      id: 'tpl-starter-video-announcement-portrait',
      title: 'Video Announcement (Portrait)',
      description: 'Vertical video display arrangement with supporting notes below.',
      category: 'announcement',
      orientation: 'portrait',
      document: {
        schemaVersion: '1.0.0',
        orientation: 'portrait',
        dimensions: P,
        slides: [
          {
            id: 'slide-1',
            durationSeconds: 30,
            background: { type: 'color', value: '#0f172a' },
            elements: [
              // Header
              {
                id: 'el-title',
                type: 'text',
                name: 'Title Text',
                x: 60,
                y: 80,
                width: 960,
                height: 100,
                rotation: 0,
                zIndex: 1,
                opacity: 1,
                content: 'Corporate Briefing Video',
                fontFamily: 'Inter',
                fontSize: 48,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'center',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              // Video Player Box (960x540 16:9)
              {
                id: 'el-vid-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Video Container',
                x: 60,
                y: 200,
                width: 960,
                height: 540,
                rotation: 0,
                zIndex: 2,
                opacity: 1,
                fillColor: '#000000',
                borderColor: '#0d9488',
                borderWidth: 2,
                borderRadius: 20,
              },
              {
                id: 'el-video',
                type: 'video',
                name: 'Announcement Video Stream',
                assetId: '',
                fit: 'contain',
                muted: true,
                loop: true,
                autoDuration: true,
                x: 60,
                y: 200,
                width: 960,
                height: 540,
                rotation: 0,
                zIndex: 3,
                opacity: 1,
              },
              // Details Card
              {
                id: 'el-card-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Notes Card',
                x: 60,
                y: 780,
                width: 960,
                height: 1020,
                rotation: 0,
                zIndex: 4,
                opacity: 0.9,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 1,
                borderRadius: 24,
              },
              {
                id: 'el-card-heading',
                type: 'text',
                name: 'Notes Heading',
                x: 100,
                y: 830,
                width: 880,
                height: 60,
                rotation: 0,
                zIndex: 5,
                opacity: 1,
                content: 'Summary & Shift Briefing',
                fontFamily: 'Inter',
                fontSize: 34,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'left',
                lineHeight: 1.3,
                letterSpacing: 0,
              },
              {
                id: 'el-card-sub',
                type: 'text',
                name: 'Hindi Heading',
                x: 100,
                y: 910,
                width: 880,
                height: 50,
                rotation: 0,
                zIndex: 6,
                opacity: 0.9,
                content: 'मुख्य घोषणा और दिशा-निर्देश',
                fontFamily: 'Noto Sans Devanagari',
                fontSize: 28,
                fontWeight: 'medium',
                color: '#2dd4bf',
                textAlign: 'left',
                lineHeight: 1.4,
                letterSpacing: 0,
                language: 'hi',
              },
              {
                id: 'el-card-body',
                type: 'text',
                name: 'Body Notes',
                x: 100,
                y: 1000,
                width: 880,
                height: 750,
                rotation: 0,
                zIndex: 7,
                opacity: 0.85,
                content:
                  'Please review the video presentation above regarding updated plant procedures.\n\nAll operators must confirm completion with their section lead. Contact Environmental Health and Safety for questions.',
                fontFamily: 'Inter',
                fontSize: 26,
                fontWeight: 'normal',
                color: '#cbd5e1',
                textAlign: 'left',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
            ],
          },
        ],
      },
    },

    // 7. Mixed Notice Board - Landscape (1920x1080)
    {
      id: 'tpl-starter-mixed-board-landscape',
      title: 'Mixed Notice Board (Landscape)',
      description: 'Multi-widget grid layout combining imagery, announcements, and operational schedule data.',
      category: 'board',
      orientation: 'landscape',
      document: {
        schemaVersion: '1.0.0',
        orientation: 'landscape',
        dimensions: L,
        slides: [
          {
            id: 'slide-1',
            durationSeconds: 20,
            background: { type: 'color', value: '#0f172a' },
            elements: [
              // Header Bar
              {
                id: 'el-header-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Top Header Bar',
                x: 60,
                y: 50,
                width: 1800,
                height: 90,
                rotation: 0,
                zIndex: 1,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 1,
                borderRadius: 16,
              },
              {
                id: 'el-header-title',
                type: 'text',
                name: 'Header Title',
                x: 100,
                y: 75,
                width: 1000,
                height: 40,
                rotation: 0,
                zIndex: 2,
                opacity: 1,
                content: 'Facility Daily Bulletin • દૈનિક બુલેટિન',
                fontFamily: 'Noto Sans Gujarati',
                fontSize: 28,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-header-time',
                type: 'text',
                name: 'Clock Note',
                x: 1200,
                y: 78,
                width: 620,
                height: 35,
                rotation: 0,
                zIndex: 3,
                opacity: 0.8,
                content: 'Indian Standard Time (IST, UTC+05:30)',
                fontFamily: 'Inter',
                fontSize: 20,
                fontWeight: 'normal',
                color: '#94a3b8',
                textAlign: 'right',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              // Card 1 (Left Image Photo)
              {
                id: 'el-card1-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Card 1 Photo Box',
                x: 60,
                y: 170,
                width: 560,
                height: 840,
                rotation: 0,
                zIndex: 4,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 1,
                borderRadius: 20,
              },
              {
                id: 'el-card1-img',
                type: 'image',
                name: 'Bulletin Image',
                assetId: '',
                fit: 'cover',
                preserveAspectRatio: true,
                x: 80,
                y: 190,
                width: 520,
                height: 520,
                rotation: 0,
                zIndex: 5,
                opacity: 1,
              },
              {
                id: 'el-card1-caption',
                type: 'text',
                name: 'Image Caption',
                x: 80,
                y: 740,
                width: 520,
                height: 240,
                rotation: 0,
                zIndex: 6,
                opacity: 0.85,
                content: 'Manufacturing Division Safety Milestone • Vadodara Facility Clean Room',
                fontFamily: 'Inter',
                fontSize: 22,
                fontWeight: 'normal',
                color: '#cbd5e1',
                textAlign: 'center',
                lineHeight: 1.5,
                letterSpacing: 0,
              },
              // Card 2 (Center Bulletins)
              {
                id: 'el-card2-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Card 2 Announcement Box',
                x: 660,
                y: 170,
                width: 600,
                height: 840,
                rotation: 0,
                zIndex: 7,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#0d9488',
                borderWidth: 2,
                borderRadius: 20,
              },
              {
                id: 'el-card2-title',
                type: 'text',
                name: 'Card 2 Title',
                x: 700,
                y: 210,
                width: 520,
                height: 50,
                rotation: 0,
                zIndex: 8,
                opacity: 1,
                content: 'Shift Updates',
                fontFamily: 'Inter',
                fontSize: 32,
                fontWeight: 'bold',
                color: '#14b8a6',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-card2-body',
                type: 'text',
                name: 'Card 2 Body',
                x: 700,
                y: 290,
                width: 520,
                height: 680,
                rotation: 0,
                zIndex: 9,
                opacity: 0.85,
                content:
                  '• Shift A: Regular operations conclude at 15:30.\n\n• Shift B: Team briefing in Conference Room 2 at 15:45.\n\n• Plant HVAC maintenance scheduled for Bay 4 from 18:00 to 20:00.\n\n• Please verify raw material batch tags before line feed.',
                fontFamily: 'Inter',
                fontSize: 24,
                fontWeight: 'normal',
                color: '#cbd5e1',
                textAlign: 'left',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
              // Card 3 (Right Contacts & Info)
              {
                id: 'el-card3-bg',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Card 3 Info Box',
                x: 1300,
                y: 170,
                width: 560,
                height: 840,
                rotation: 0,
                zIndex: 10,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 1,
                borderRadius: 20,
              },
              {
                id: 'el-card3-title',
                type: 'text',
                name: 'Card 3 Title',
                x: 1340,
                y: 210,
                width: 480,
                height: 50,
                rotation: 0,
                zIndex: 11,
                opacity: 1,
                content: 'Emergency Contacts',
                fontFamily: 'Inter',
                fontSize: 32,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-card3-body',
                type: 'text',
                name: 'Card 3 Body',
                x: 1340,
                y: 290,
                width: 480,
                height: 680,
                rotation: 0,
                zIndex: 12,
                opacity: 0.85,
                content:
                  'Control Room: Ext 4001\nSecurity Desk: Ext 4002\nMedical First Aid: Ext 4009\n\nShift Officer:\nRamesh Patel (Ops)\n\nSafety Supervisor:\nAnil Desai (EHS)',
                fontFamily: 'Inter',
                fontSize: 24,
                fontWeight: 'normal',
                color: '#94a3b8',
                textAlign: 'left',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
            ],
          },
        ],
      },
    },

    // 8. Mixed Notice Board - Portrait (1080x1920)
    {
      id: 'tpl-starter-mixed-board-portrait',
      title: 'Mixed Notice Board (Portrait)',
      description: 'Stacked vertical information bulletin with visual image slot, announcement card, and safety roster.',
      category: 'board',
      orientation: 'portrait',
      document: {
        schemaVersion: '1.0.0',
        orientation: 'portrait',
        dimensions: P,
        slides: [
          {
            id: 'slide-1',
            durationSeconds: 20,
            background: { type: 'color', value: '#0f172a' },
            elements: [
              // Header Card
              {
                id: 'el-header',
                type: 'text',
                name: 'Board Title',
                x: 60,
                y: 60,
                width: 960,
                height: 90,
                rotation: 0,
                zIndex: 1,
                opacity: 1,
                content: 'Plant Floor Bulletin Board',
                fontFamily: 'Inter',
                fontSize: 44,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'center',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              // Middle Top: Image Slot
              {
                id: 'el-img-box',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Photo Frame',
                x: 60,
                y: 170,
                width: 960,
                height: 520,
                rotation: 0,
                zIndex: 2,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 1,
                borderRadius: 20,
              },
              {
                id: 'el-img',
                type: 'image',
                name: 'Bulletin Photo',
                assetId: '',
                fit: 'cover',
                preserveAspectRatio: true,
                x: 80,
                y: 190,
                width: 920,
                height: 480,
                rotation: 0,
                zIndex: 3,
                opacity: 1,
              },
              // Middle: Notice Card
              {
                id: 'el-notice-box',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Notice Box',
                x: 60,
                y: 720,
                width: 960,
                height: 600,
                rotation: 0,
                zIndex: 4,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#0d9488',
                borderWidth: 2,
                borderRadius: 20,
              },
              {
                id: 'el-notice-title',
                type: 'text',
                name: 'Notice Heading',
                x: 100,
                y: 760,
                width: 880,
                height: 50,
                rotation: 0,
                zIndex: 5,
                opacity: 1,
                content: 'Operational Guidelines • સુરક્ષા નિયમો',
                fontFamily: 'Noto Sans Gujarati',
                fontSize: 32,
                fontWeight: 'bold',
                color: '#14b8a6',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-notice-body',
                type: 'text',
                name: 'Notice Content',
                x: 100,
                y: 830,
                width: 880,
                height: 460,
                rotation: 0,
                zIndex: 6,
                opacity: 0.85,
                content:
                  '1. Zero accident target maintained for the current quarter.\n\n2. Calibration checks for pressure sensors scheduled at 14:00.\n\n3. Tooling changes must follow lockout/tagout (LOTO) protocols.',
                fontFamily: 'Inter',
                fontSize: 26,
                fontWeight: 'normal',
                color: '#cbd5e1',
                textAlign: 'left',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
              // Bottom: Quick Directory
              {
                id: 'el-dir-box',
                type: 'shape',
                shapeType: 'rounded_rectangle',
                name: 'Directory Box',
                x: 60,
                y: 1350,
                width: 960,
                height: 480,
                rotation: 0,
                zIndex: 7,
                opacity: 1,
                fillColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 1,
                borderRadius: 20,
              },
              {
                id: 'el-dir-title',
                type: 'text',
                name: 'Directory Title',
                x: 100,
                y: 1390,
                width: 880,
                height: 50,
                rotation: 0,
                zIndex: 8,
                opacity: 1,
                content: 'Duty Officers & Roster',
                fontFamily: 'Inter',
                fontSize: 30,
                fontWeight: 'bold',
                color: '#ffffff',
                textAlign: 'left',
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              {
                id: 'el-dir-body',
                type: 'text',
                name: 'Directory Content',
                x: 100,
                y: 1460,
                width: 880,
                height: 340,
                rotation: 0,
                zIndex: 9,
                opacity: 0.8,
                content:
                  'Operations Lead: Jayesh Shah (Ext 102)\nEHS Coordinator: Priya Sharma (Ext 104)\nMaintenance Engineer: Rahul Verma (Ext 108)\n\nFacility Status: Normal Operating Mode',
                fontFamily: 'Inter',
                fontSize: 24,
                fontWeight: 'normal',
                color: '#94a3b8',
                textAlign: 'left',
                lineHeight: 1.6,
                letterSpacing: 0,
              },
            ],
          },
        ],
      },
    },
  ];
}

/**
 * Idempotent seeder for the 8 starter templates.
 */
export const seedStarterTemplates = onCall<
  SeedStarterTemplatesRequest,
  Promise<SeedStarterTemplatesResponse>
>(CALLABLE_OPTS, async (request) => {
  const caller = await getAuthenticatedCaller(request.auth);

  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only System Administrators can seed starter templates.');
  }

  const defs = buildStarterTemplateDefinitions();
  const templateIds: string[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const def of defs) {
    templateIds.push(def.id);
    const ref = db.collection('templates').doc(def.id);
    const snap = await ref.get();
    const now = new Date().toISOString();

    if (!snap.exists) {
      createdCount++;
      const record: TemplateRecord = {
        id: def.id,
        title: def.title,
        description: def.description,
        category: def.category,
        scope: 'global',
        departmentId: null,
        orientation: def.orientation,
        dimensions: def.document.dimensions,
        schemaVersion: '1.0.0',
        status: 'active',
        document: def.document,
        thumbnailSvg: null,
        createdBy: caller.uid,
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(record);
    } else {
      updatedCount++;
      await ref.update({
        title: def.title,
        description: def.description,
        document: def.document,
        dimensions: def.document.dimensions,
        orientation: def.orientation,
        updatedAt: now,
      });
    }
  }

  return {
    createdCount,
    updatedCount,
    templateIds,
  };
});

