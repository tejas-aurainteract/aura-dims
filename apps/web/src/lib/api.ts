/**
 * Aura DIMS - Cloud Functions Callable API Client
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Provides strictly typed invocation of backend Cloud Functions for privileged mutations.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type {
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
  InitiateMediaUploadRequest,
  InitiateMediaUploadResponse,
  FinalizeMediaUploadRequest,
  FinalizeMediaUploadResponse,
  GetMediaPreviewUrlRequest,
  GetMediaPreviewUrlResponse,
  UpdateMediaMetadataRequest,
  UpdateMediaMetadataResponse,
  SetMediaArchivedRequest,
  SetMediaArchivedResponse,
  ListMediaAssetsRequest,
  ListMediaAssetsResponse,
  CleanupExpiredUploadsRequest,
  CleanupExpiredUploadsResponse,
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

export const api = {
  provisionUser: async (req: ProvisionUserRequest): Promise<ProvisionUserResponse> => {
    const fn = httpsCallable<ProvisionUserRequest, ProvisionUserResponse>(functions, 'provisionUser');
    const result = await fn(req);
    return result.data;
  },

  updateUser: async (req: UpdateUserRequest): Promise<UpdateUserResponse> => {
    const fn = httpsCallable<UpdateUserRequest, UpdateUserResponse>(functions, 'updateUser');
    const result = await fn(req);
    return result.data;
  },

  setUserStatus: async (req: SetUserStatusRequest): Promise<SetUserStatusResponse> => {
    const fn = httpsCallable<SetUserStatusRequest, SetUserStatusResponse>(functions, 'setUserActiveStatus');
    const result = await fn(req);
    return result.data;
  },

  triggerPasswordReset: async (req: TriggerPasswordResetRequest): Promise<TriggerPasswordResetResponse> => {
    const fn = httpsCallable<TriggerPasswordResetRequest, TriggerPasswordResetResponse>(functions, 'triggerPasswordReset');
    const result = await fn(req);
    return result.data;
  },

  createDepartment: async (req: CreateDepartmentRequest): Promise<CreateDepartmentResponse> => {
    const fn = httpsCallable<CreateDepartmentRequest, CreateDepartmentResponse>(functions, 'createDepartment');
    const result = await fn(req);
    return result.data;
  },

  updateDepartment: async (req: UpdateDepartmentRequest): Promise<UpdateDepartmentResponse> => {
    const fn = httpsCallable<UpdateDepartmentRequest, UpdateDepartmentResponse>(functions, 'updateDepartment');
    const result = await fn(req);
    return result.data;
  },

  setDepartmentStatus: async (req: SetDepartmentStatusRequest): Promise<SetDepartmentStatusResponse> => {
    const fn = httpsCallable<SetDepartmentStatusRequest, SetDepartmentStatusResponse>(functions, 'setDepartmentStatus');
    const result = await fn(req);
    return result.data;
  },

  // Media Library Operations
  initiateMediaUpload: async (req: InitiateMediaUploadRequest): Promise<InitiateMediaUploadResponse> => {
    const fn = httpsCallable<InitiateMediaUploadRequest, InitiateMediaUploadResponse>(functions, 'initiateMediaUpload');
    const result = await fn(req);
    return result.data;
  },

  finalizeMediaUpload: async (req: FinalizeMediaUploadRequest): Promise<FinalizeMediaUploadResponse> => {
    const fn = httpsCallable<FinalizeMediaUploadRequest, FinalizeMediaUploadResponse>(functions, 'finalizeMediaUpload');
    const result = await fn(req);
    return result.data;
  },

  getMediaPreviewUrl: async (req: GetMediaPreviewUrlRequest): Promise<GetMediaPreviewUrlResponse> => {
    const fn = httpsCallable<GetMediaPreviewUrlRequest, GetMediaPreviewUrlResponse>(functions, 'getMediaPreviewUrl');
    const result = await fn(req);
    return result.data;
  },

  updateMediaMetadata: async (req: UpdateMediaMetadataRequest): Promise<UpdateMediaMetadataResponse> => {
    const fn = httpsCallable<UpdateMediaMetadataRequest, UpdateMediaMetadataResponse>(functions, 'updateMediaMetadata');
    const result = await fn(req);
    return result.data;
  },

  setMediaArchivedStatus: async (req: SetMediaArchivedRequest): Promise<SetMediaArchivedResponse> => {
    const fn = httpsCallable<SetMediaArchivedRequest, SetMediaArchivedResponse>(functions, 'setMediaArchivedStatus');
    const result = await fn(req);
    return result.data;
  },

  listMediaAssets: async (req: ListMediaAssetsRequest): Promise<ListMediaAssetsResponse> => {
    const fn = httpsCallable<ListMediaAssetsRequest, ListMediaAssetsResponse>(functions, 'listMediaAssets');
    const result = await fn(req);
    return result.data;
  },

  cleanupExpiredUploads: async (req: CleanupExpiredUploadsRequest): Promise<CleanupExpiredUploadsResponse> => {
    const fn = httpsCallable<CleanupExpiredUploadsRequest, CleanupExpiredUploadsResponse>(functions, 'cleanupExpiredUploads');
    const result = await fn(req);
    return result.data;
  },

  // Design Operations
  createDesign: async (req: CreateDesignRequest): Promise<CreateDesignResponse> => {
    const fn = httpsCallable<CreateDesignRequest, CreateDesignResponse>(functions, 'createDesign');
    const result = await fn(req);
    return result.data;
  },

  getDesign: async (req: GetDesignRequest): Promise<GetDesignResponse> => {
    const fn = httpsCallable<GetDesignRequest, GetDesignResponse>(functions, 'getDesign');
    const result = await fn(req);
    return result.data;
  },

  updateDesign: async (req: UpdateDesignRequest): Promise<UpdateDesignResponse> => {
    const fn = httpsCallable<UpdateDesignRequest, UpdateDesignResponse>(functions, 'updateDesign');
    const result = await fn(req);
    return result.data;
  },

  duplicateDesign: async (req: DuplicateDesignRequest): Promise<DuplicateDesignResponse> => {
    const fn = httpsCallable<DuplicateDesignRequest, DuplicateDesignResponse>(functions, 'duplicateDesign');
    const result = await fn(req);
    return result.data;
  },

  setDesignArchivedStatus: async (req: SetDesignArchivedRequest): Promise<SetDesignArchivedResponse> => {
    const fn = httpsCallable<SetDesignArchivedRequest, SetDesignArchivedResponse>(functions, 'setDesignArchivedStatus');
    const result = await fn(req);
    return result.data;
  },

  listDesigns: async (req: ListDesignsRequest): Promise<ListDesignsResponse> => {
    const fn = httpsCallable<ListDesignsRequest, ListDesignsResponse>(functions, 'listDesigns');
    const result = await fn(req);
    return result.data;
  },

  convertDesignOrientation: async (req: ConvertDesignOrientationRequest): Promise<ConvertDesignOrientationResponse> => {
    const fn = httpsCallable<ConvertDesignOrientationRequest, ConvertDesignOrientationResponse>(functions, 'convertDesignOrientation');
    const result = await fn(req);
    return result.data;
  },

  // Template Operations
  listTemplates: async (req: ListTemplatesRequest): Promise<ListTemplatesResponse> => {
    const fn = httpsCallable<ListTemplatesRequest, ListTemplatesResponse>(functions, 'listTemplates');
    const result = await fn(req);
    return result.data;
  },

  createTemplate: async (req: CreateTemplateRequest): Promise<CreateTemplateResponse> => {
    const fn = httpsCallable<CreateTemplateRequest, CreateTemplateResponse>(functions, 'createTemplate');
    const result = await fn(req);
    return result.data;
  },

  instantiateTemplate: async (req: InstantiateTemplateRequest): Promise<InstantiateTemplateResponse> => {
    const fn = httpsCallable<InstantiateTemplateRequest, InstantiateTemplateResponse>(functions, 'instantiateTemplate');
    const result = await fn(req);
    return result.data;
  },

  setTemplateArchivedStatus: async (req: SetTemplateArchivedRequest): Promise<SetTemplateArchivedResponse> => {
    const fn = httpsCallable<SetTemplateArchivedRequest, SetTemplateArchivedResponse>(functions, 'setTemplateArchivedStatus');
    const result = await fn(req);
    return result.data;
  },

  seedStarterTemplates: async (req: SeedStarterTemplatesRequest): Promise<SeedStarterTemplatesResponse> => {
    const fn = httpsCallable<SeedStarterTemplatesRequest, SeedStarterTemplatesResponse>(functions, 'seedStarterTemplates');
    const result = await fn(req);
    return result.data;
  },
};
