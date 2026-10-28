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
};

