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
  CreateDesignRevisionRequest,
  CreateDesignRevisionResponse,
  ListDesignRevisionsRequest,
  ListDesignRevisionsResponse,
  GetDesignRevisionRequest,
  GetDesignRevisionResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  UpdatePlaylistRequest,
  UpdatePlaylistResponse,
  GetPlaylistRequest,
  GetPlaylistResponse,
  ListPlaylistsRequest,
  ListPlaylistsResponse,
  SetPlaylistArchivedRequest,
  SetPlaylistArchivedResponse,
  CreatePlaylistRevisionRequest,
  CreatePlaylistRevisionResponse,
  GetPlaylistRevisionRequest,
  GetPlaylistRevisionResponse,
  CreateScheduleRequest,
  CreateScheduleResponse,
  UpdateScheduleRequest,
  UpdateScheduleResponse,
  GetScheduleRequest,
  GetScheduleResponse,
  ListSchedulesRequest,
  ListSchedulesResponse,
  SetScheduleStatusRequest,
  SetScheduleStatusResponse,
  SubmitForApprovalRequest,
  SubmitForApprovalResponse,
  ReviewApprovalRequest,
  ReviewApprovalResponse,
  WithdrawApprovalRequest,
  WithdrawApprovalResponse,
  ListApprovalsRequest,
  ListApprovalsResponse,
  GetApprovalRequest,
  GetApprovalResponse,
  PreparePublicationRequest,
  PreparePublicationResponse,
  RollbackPublicationRequest,
  RollbackPublicationResponse,
  SetUserDirectPublishPermissionRequest,
  SetUserDirectPublishPermissionResponse,
  EvaluateSchedulePreviewRequest,
  EvaluateSchedulePreviewResponse,
  RegisterDisplayRequest,
  UpdateDisplayRequest,
  DisplayMutationResponse,
  SetDisplayLifecycleRequest,
  GeneratePairingCodeRequest,
  GeneratePairingCodeResponse,
  ResetEnrollmentRequest,
  ListDisplaysRequest,
  ListDisplaysResponse,
  GetDisplayRequest,
  GetDisplayResponse,
  BulkImportPreflightRequest,
  BulkImportPreflightResponse,
  BulkImportExecuteRequest,
  BulkImportExecuteResponse,
  BulkAssignDisplaysPreflightRequest,
  BulkAssignDisplaysPreflightResponse,
  BulkAssignDisplaysRequest,
  BulkAssignDisplaysResponse,
  GetCommissioningChecklistRequest,
  GetCommissioningChecklistResponse,
  UpdateCommissioningCheckRequest,
  UpdateCommissioningCheckResponse,
  FinalizeCommissioningRequest,
  FinalizeCommissioningResponse,
  ListPlannedInstallationsRequest,
  ListPlannedInstallationsResponse,
  CreatePlannedInstallationRequest,
  CreatePlannedInstallationResponse,
  UpdatePlannedInstallationRequest,
  UpdatePlannedInstallationResponse,
  ConvertPlannedToRegisteredRequest,
  ConvertPlannedToRegisteredResponse,
  GetPublicationRolloutProgressRequest,
  GetPublicationRolloutProgressResponse,
  RetryPublicationTargetRequest,
  RetryPublicationTargetResponse,
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

  // Design Revisions
  createDesignRevision: async (req: CreateDesignRevisionRequest): Promise<CreateDesignRevisionResponse> => {
    const fn = httpsCallable<CreateDesignRevisionRequest, CreateDesignRevisionResponse>(functions, 'createDesignRevision');
    const result = await fn(req);
    return result.data;
  },

  listDesignRevisions: async (req: ListDesignRevisionsRequest): Promise<ListDesignRevisionsResponse> => {
    const fn = httpsCallable<ListDesignRevisionsRequest, ListDesignRevisionsResponse>(functions, 'listDesignRevisions');
    const result = await fn(req);
    return result.data;
  },

  getDesignRevision: async (req: GetDesignRevisionRequest): Promise<GetDesignRevisionResponse> => {
    const fn = httpsCallable<GetDesignRevisionRequest, GetDesignRevisionResponse>(functions, 'getDesignRevision');
    const result = await fn(req);
    return result.data;
  },

  // Playlists
  createPlaylist: async (req: CreatePlaylistRequest): Promise<CreatePlaylistResponse> => {
    const fn = httpsCallable<CreatePlaylistRequest, CreatePlaylistResponse>(functions, 'createPlaylist');
    const result = await fn(req);
    return result.data;
  },

  updatePlaylist: async (req: UpdatePlaylistRequest): Promise<UpdatePlaylistResponse> => {
    const fn = httpsCallable<UpdatePlaylistRequest, UpdatePlaylistResponse>(functions, 'updatePlaylist');
    const result = await fn(req);
    return result.data;
  },

  getPlaylist: async (req: GetPlaylistRequest): Promise<GetPlaylistResponse> => {
    const fn = httpsCallable<GetPlaylistRequest, GetPlaylistResponse>(functions, 'getPlaylist');
    const result = await fn(req);
    return result.data;
  },

  listPlaylists: async (req: ListPlaylistsRequest): Promise<ListPlaylistsResponse> => {
    const fn = httpsCallable<ListPlaylistsRequest, ListPlaylistsResponse>(functions, 'listPlaylists');
    const result = await fn(req);
    return result.data;
  },

  setPlaylistArchivedStatus: async (req: SetPlaylistArchivedRequest): Promise<SetPlaylistArchivedResponse> => {
    const fn = httpsCallable<SetPlaylistArchivedRequest, SetPlaylistArchivedResponse>(functions, 'setPlaylistArchivedStatus');
    const result = await fn(req);
    return result.data;
  },

  createPlaylistRevision: async (req: CreatePlaylistRevisionRequest): Promise<CreatePlaylistRevisionResponse> => {
    const fn = httpsCallable<CreatePlaylistRevisionRequest, CreatePlaylistRevisionResponse>(functions, 'createPlaylistRevision');
    const result = await fn(req);
    return result.data;
  },

  getPlaylistRevision: async (req: GetPlaylistRevisionRequest): Promise<GetPlaylistRevisionResponse> => {
    const fn = httpsCallable<GetPlaylistRevisionRequest, GetPlaylistRevisionResponse>(functions, 'getPlaylistRevision');
    const result = await fn(req);
    return result.data;
  },

  // Schedules
  createSchedule: async (req: CreateScheduleRequest): Promise<CreateScheduleResponse> => {
    const fn = httpsCallable<CreateScheduleRequest, CreateScheduleResponse>(functions, 'createSchedule');
    const result = await fn(req);
    return result.data;
  },

  updateSchedule: async (req: UpdateScheduleRequest): Promise<UpdateScheduleResponse> => {
    const fn = httpsCallable<UpdateScheduleRequest, UpdateScheduleResponse>(functions, 'updateSchedule');
    const result = await fn(req);
    return result.data;
  },

  getSchedule: async (req: GetScheduleRequest): Promise<GetScheduleResponse> => {
    const fn = httpsCallable<GetScheduleRequest, GetScheduleResponse>(functions, 'getSchedule');
    const result = await fn(req);
    return result.data;
  },

  listSchedules: async (req: ListSchedulesRequest): Promise<ListSchedulesResponse> => {
    const fn = httpsCallable<ListSchedulesRequest, ListSchedulesResponse>(functions, 'listSchedules');
    const result = await fn(req);
    return result.data;
  },

  setScheduleStatus: async (req: SetScheduleStatusRequest): Promise<SetScheduleStatusResponse> => {
    const fn = httpsCallable<SetScheduleStatusRequest, SetScheduleStatusResponse>(functions, 'setScheduleStatus');
    const result = await fn(req);
    return result.data;
  },

  // Approvals
  submitForApproval: async (req: SubmitForApprovalRequest): Promise<SubmitForApprovalResponse> => {
    const fn = httpsCallable<SubmitForApprovalRequest, SubmitForApprovalResponse>(functions, 'submitForApproval');
    const result = await fn(req);
    return result.data;
  },

  reviewApproval: async (req: ReviewApprovalRequest): Promise<ReviewApprovalResponse> => {
    const fn = httpsCallable<ReviewApprovalRequest, ReviewApprovalResponse>(functions, 'reviewApproval');
    const result = await fn(req);
    return result.data;
  },

  withdrawApproval: async (req: WithdrawApprovalRequest): Promise<WithdrawApprovalResponse> => {
    const fn = httpsCallable<WithdrawApprovalRequest, WithdrawApprovalResponse>(functions, 'withdrawApproval');
    const result = await fn(req);
    return result.data;
  },

  listApprovals: async (req: ListApprovalsRequest): Promise<ListApprovalsResponse> => {
    const fn = httpsCallable<ListApprovalsRequest, ListApprovalsResponse>(functions, 'listApprovals');
    const result = await fn(req);
    return result.data;
  },

  getApproval: async (req: GetApprovalRequest): Promise<GetApprovalResponse> => {
    const fn = httpsCallable<GetApprovalRequest, GetApprovalResponse>(functions, 'getApproval');
    const result = await fn(req);
    return result.data;
  },

  // Publications & Rollback
  preparePublication: async (req: PreparePublicationRequest): Promise<PreparePublicationResponse> => {
    const fn = httpsCallable<PreparePublicationRequest, PreparePublicationResponse>(functions, 'preparePublication');
    const result = await fn(req);
    return result.data;
  },

  rollbackPublication: async (req: RollbackPublicationRequest): Promise<RollbackPublicationResponse> => {
    const fn = httpsCallable<RollbackPublicationRequest, RollbackPublicationResponse>(functions, 'rollbackPublication');
    const result = await fn(req);
    return result.data;
  },

  setUserDirectPublishPermission: async (req: SetUserDirectPublishPermissionRequest): Promise<SetUserDirectPublishPermissionResponse> => {
    const fn = httpsCallable<SetUserDirectPublishPermissionRequest, SetUserDirectPublishPermissionResponse>(functions, 'setUserDirectPublishPermission');
    const result = await fn(req);
    return result.data;
  },

  evaluateSchedulePreview: async (req: EvaluateSchedulePreviewRequest): Promise<EvaluateSchedulePreviewResponse> => {
    const fn = httpsCallable<EvaluateSchedulePreviewRequest, EvaluateSchedulePreviewResponse>(functions, 'evaluateSchedulePreview');
    const result = await fn(req);
    return result.data;
  },

  // Digital Displays Fleet
  listDisplays: async (req: ListDisplaysRequest): Promise<ListDisplaysResponse> => {
    const fn = httpsCallable<ListDisplaysRequest, ListDisplaysResponse>(functions, 'listDisplays');
    const result = await fn(req);
    return result.data;
  },

  getDisplay: async (req: GetDisplayRequest): Promise<GetDisplayResponse> => {
    const fn = httpsCallable<GetDisplayRequest, GetDisplayResponse>(functions, 'getDisplay');
    const result = await fn(req);
    return result.data;
  },

  registerDisplay: async (req: RegisterDisplayRequest): Promise<DisplayMutationResponse> => {
    const fn = httpsCallable<RegisterDisplayRequest, DisplayMutationResponse>(functions, 'registerDisplay');
    const result = await fn(req);
    return result.data;
  },

  updateDisplay: async (req: UpdateDisplayRequest): Promise<DisplayMutationResponse> => {
    const fn = httpsCallable<UpdateDisplayRequest, DisplayMutationResponse>(functions, 'updateDisplay');
    const result = await fn(req);
    return result.data;
  },

  setDisplayLifecycle: async (req: SetDisplayLifecycleRequest): Promise<DisplayMutationResponse> => {
    const fn = httpsCallable<SetDisplayLifecycleRequest, DisplayMutationResponse>(functions, 'setDisplayLifecycle');
    const result = await fn(req);
    return result.data;
  },

  resetEnrollment: async (req: ResetEnrollmentRequest): Promise<DisplayMutationResponse> => {
    const fn = httpsCallable<ResetEnrollmentRequest, DisplayMutationResponse>(functions, 'resetEnrollment');
    const result = await fn(req);
    return result.data;
  },

  generateDisplayPairingCode: async (req: GeneratePairingCodeRequest): Promise<GeneratePairingCodeResponse> => {
    const fn = httpsCallable<GeneratePairingCodeRequest, GeneratePairingCodeResponse>(functions, 'generateDisplayPairingCode');
    const result = await fn(req);
    return result.data;
  },

  // Bulk Operations & Rollout Inventory
  preflightBulkDisplayImport: async (req: BulkImportPreflightRequest): Promise<BulkImportPreflightResponse> => {
    const fn = httpsCallable<BulkImportPreflightRequest, BulkImportPreflightResponse>(functions, 'preflightBulkDisplayImport');
    const result = await fn(req);
    return result.data;
  },

  executeBulkDisplayImport: async (req: BulkImportExecuteRequest): Promise<BulkImportExecuteResponse> => {
    const fn = httpsCallable<BulkImportExecuteRequest, BulkImportExecuteResponse>(functions, 'executeBulkDisplayImport');
    const result = await fn(req);
    return result.data;
  },

  preflightBulkAssignDisplays: async (req: BulkAssignDisplaysPreflightRequest): Promise<BulkAssignDisplaysPreflightResponse> => {
    const fn = httpsCallable<BulkAssignDisplaysPreflightRequest, BulkAssignDisplaysPreflightResponse>(functions, 'preflightBulkAssignDisplays');
    const result = await fn(req);
    return result.data;
  },

  executeBulkAssignDisplays: async (req: BulkAssignDisplaysRequest): Promise<BulkAssignDisplaysResponse> => {
    const fn = httpsCallable<BulkAssignDisplaysRequest, BulkAssignDisplaysResponse>(functions, 'executeBulkAssignDisplays');
    const result = await fn(req);
    return result.data;
  },

  // 12-Item Digital Display Commissioning
  getCommissioningChecklist: async (req: GetCommissioningChecklistRequest): Promise<GetCommissioningChecklistResponse> => {
    const fn = httpsCallable<GetCommissioningChecklistRequest, GetCommissioningChecklistResponse>(functions, 'getCommissioningChecklist');
    const result = await fn(req);
    return result.data;
  },

  updateCommissioningCheck: async (req: UpdateCommissioningCheckRequest): Promise<UpdateCommissioningCheckResponse> => {
    const fn = httpsCallable<UpdateCommissioningCheckRequest, UpdateCommissioningCheckResponse>(functions, 'updateCommissioningCheck');
    const result = await fn(req);
    return result.data;
  },

  finalizeCommissioning: async (req: FinalizeCommissioningRequest): Promise<FinalizeCommissioningResponse> => {
    const fn = httpsCallable<FinalizeCommissioningRequest, FinalizeCommissioningResponse>(functions, 'finalizeCommissioning');
    const result = await fn(req);
    return result.data;
  },

  // Planned Installations Management
  listPlannedInstallations: async (req: ListPlannedInstallationsRequest): Promise<ListPlannedInstallationsResponse> => {
    const fn = httpsCallable<ListPlannedInstallationsRequest, ListPlannedInstallationsResponse>(functions, 'listPlannedInstallations');
    const result = await fn(req);
    return result.data;
  },

  createPlannedInstallation: async (req: CreatePlannedInstallationRequest): Promise<CreatePlannedInstallationResponse> => {
    const fn = httpsCallable<CreatePlannedInstallationRequest, CreatePlannedInstallationResponse>(functions, 'createPlannedInstallation');
    const result = await fn(req);
    return result.data;
  },

  updatePlannedInstallation: async (req: UpdatePlannedInstallationRequest): Promise<UpdatePlannedInstallationResponse> => {
    const fn = httpsCallable<UpdatePlannedInstallationRequest, UpdatePlannedInstallationResponse>(functions, 'updatePlannedInstallation');
    const result = await fn(req);
    return result.data;
  },

  convertPlannedToRegistered: async (req: ConvertPlannedToRegisteredRequest): Promise<ConvertPlannedToRegisteredResponse> => {
    const fn = httpsCallable<ConvertPlannedToRegisteredRequest, ConvertPlannedToRegisteredResponse>(functions, 'convertPlannedToRegistered');
    const result = await fn(req);
    return result.data;
  },

  // Publication Rollout Monitoring
  getPublicationRolloutProgress: async (req: GetPublicationRolloutProgressRequest): Promise<GetPublicationRolloutProgressResponse> => {
    const fn = httpsCallable<GetPublicationRolloutProgressRequest, GetPublicationRolloutProgressResponse>(functions, 'getPublicationRolloutProgress');
    const result = await fn(req);
    return result.data;
  },

  retryPublicationTarget: async (req: RetryPublicationTargetRequest): Promise<RetryPublicationTargetResponse> => {
    const fn = httpsCallable<RetryPublicationTargetRequest, RetryPublicationTargetResponse>(functions, 'retryPublicationTarget');
    const result = await fn(req);
    return result.data;
  },
};

/**
 * Normalizes backend Firebase Callable errors into clear, actionable user messages.
 */
export function getApiErrorMessage(err: any, fallback = 'Operation failed'): string {
  if (!err) return fallback;
  const code = (err.code || '').toLowerCase();
  const msg = (err.message || '').toLowerCase();
  if (code.includes('internal') || msg === 'internal') {
    return 'Cloud backend service unavailable. If running in live cloud mode, ensure Cloud Functions are deployed and Blaze billing is active on project aura-dims.';
  }
  if (code.includes('permission-denied') || msg.includes('permission-denied')) {
    return 'Access denied: your account is not authorized to perform this operation.';
  }
  if (code.includes('unauthenticated') || msg.includes('unauthenticated')) {
    return 'Authentication expired or invalid. Please sign in again.';
  }
  if (code.includes('unavailable') || msg.includes('unavailable') || msg.includes('failed to fetch')) {
    return 'Network or service unavailable. Please check your internet connection or retry shortly.';
  }
  return msg || fallback;
}
