/**
 * Aura DIMS - Media Upload Controller
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements resilient client upload transfer using Firebase Storage uploadBytesResumable
 * with progress tracking, pause/resume, cancellation, and server-side finalization.
 */

import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { storage } from './firebase';
import { api } from './api';
import { MEDIA_CONSTRAINTS, type MediaAsset, type AssetVisibility, type AssetShareTarget } from '@aura-dims/display-schema';

export type UploadStep = 'idle' | 'initiating' | 'uploading' | 'validating' | 'ready' | 'error';

export interface UploadProgressEvent {
  step: UploadStep;
  progressPercent: number;
  bytesTransferred: number;
  totalBytes: number;
  message: string;
}

export interface UploadMediaOptions {
  file: File;
  departmentId?: string;
  projectId?: string;
  visibility?: AssetVisibility;
  sharedWith?: Array<string | AssetShareTarget>;
  title?: string;
  description?: string;
  tags?: string[];
  onProgress?: (event: UploadProgressEvent) => void;
}

export interface ActiveUploadHandle {
  assetId: Promise<string>;
  cancel: () => void;
  done: Promise<MediaAsset>;
}

export function validateMediaFileClient(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const isImage =
    file.type === 'image/jpeg' ||
    file.type === 'image/png' ||
    /\.(jpe?g|png)$/i.test(file.name);
  const isVideo =
    file.type === 'video/mp4' ||
    file.type === 'video/quicktime' ||
    /\.(mp4|m4v|mov)$/i.test(file.name);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: `Unsupported file format "${file.type || file.name.split('.').pop()}". Supported formats are JPEG, PNG, and MP4 (H.264/AAC).`,
    };
  }

  if (isImage && file.size > MEDIA_CONSTRAINTS.MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image exceeds maximum size of 20 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    };
  }

  if (isVideo && file.size > MEDIA_CONSTRAINTS.MAX_VIDEO_SIZE_BYTES) {
    return {
      valid: false,
      error: `Video exceeds maximum size of 200 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    };
  }

  return { valid: true };
}

export interface ClientMediaMetadata {
  width: number;
  height: number;
  durationSeconds?: number;
  valid: boolean;
  error?: string;
}

export async function inspectMediaFileClient(file: File): Promise<ClientMediaMetadata> {
  const syncValidation = validateMediaFileClient(file);
  if (!syncValidation.valid) {
    return { width: 0, height: 0, valid: false, error: syncValidation.error };
  }

  const isImage = file.type === 'image/jpeg' || file.type === 'image/png' || /\.(jpe?g|png)$/i.test(file.name);
  const isVideo = file.type === 'video/mp4' || file.type === 'video/quicktime' || /\.(mp4|m4v|mov)$/i.test(file.name);

  if (isImage) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        const pixels = width * height;
        if (pixels > MEDIA_CONSTRAINTS.MAX_IMAGE_PIXELS) {
          resolve({
            width,
            height,
            valid: false,
            error: `Image resolution (${width}×${height}) exceeds maximum limit of 40 Megapixels.`,
          });
          return;
        }
        resolve({ width, height, valid: true });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: 0,
          height: 0,
          valid: false,
          error: 'Failed to decode image. Please ensure the file is a valid PNG or JPEG.',
        });
      };
      img.src = url;
    });
  }

  if (isVideo) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const width = video.videoWidth;
        const height = video.videoHeight;
        const duration = video.duration;

        if (width <= 0 || height <= 0) {
          resolve({
            width,
            height,
            durationSeconds: duration,
            valid: false,
            error: 'Could not detect video resolution. Please ensure it is an encoded MP4 video.',
          });
          return;
        }

        const pixels = width * height;
        if (pixels > MEDIA_CONSTRAINTS.MAX_VIDEO_PIXELS) {
          resolve({
            width,
            height,
            durationSeconds: duration,
            valid: false,
            error: `Video resolution (${width}×${height}) exceeds digital display maximum of Full HD (1920×1080 or 1080×1920). Please compress or scale down to 1080p before uploading.`,
          });
          return;
        }

        if (duration > MEDIA_CONSTRAINTS.MAX_VIDEO_DURATION_SECONDS) {
          resolve({
            width,
            height,
            durationSeconds: duration,
            valid: false,
            error: `Video duration (${Math.round(duration)}s) exceeds maximum limit of ${MEDIA_CONSTRAINTS.MAX_VIDEO_DURATION_SECONDS / 60} minutes.`,
          });
          return;
        }

        resolve({ width, height, durationSeconds: duration, valid: true });
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: 0,
          height: 0,
          valid: false,
          error: 'Failed to inspect video. Supported video format is MP4 (H.264/AAC).',
        });
      };
      video.src = url;
    });
  }

  return { width: 0, height: 0, valid: false, error: 'Unknown media file type.' };
}

export function startMediaUpload(options: UploadMediaOptions): ActiveUploadHandle {
  const { file, departmentId, projectId, visibility, sharedWith, title, description, tags, onProgress } = options;

  let uploadTask: UploadTask | null = null;
  let isCancelled = false;
  let resolveAssetId: (id: string) => void = () => {};
  const assetIdPromise = new Promise<string>((res) => {
    resolveAssetId = res;
  });

  const donePromise = (async (): Promise<MediaAsset> => {
    // 1. Client-side Validation & Metadata Inspection
    const inspection = await inspectMediaFileClient(file);
    if (!inspection.valid) {
      const err = new Error(inspection.error);
      onProgress?.({
        step: 'error',
        progressPercent: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
        message: inspection.error || 'Validation error',
      });
      throw err;
    }

    if (isCancelled) throw new Error('Upload cancelled by user.');

    // 2. Initiate Upload Intent via Cloud Function
    onProgress?.({
      step: 'initiating',
      progressPercent: 0,
      bytesTransferred: 0,
      totalBytes: file.size,
      message: 'Allocating secure staging path...',
    });

    const normalizedSharedWith: AssetShareTarget[] | undefined = sharedWith?.map((target) => {
      if (typeof target === 'string') {
        if (target.startsWith('dept:')) {
          return { type: 'department', id: target.slice(5) };
        }
        if (target.startsWith('proj:')) {
          return { type: 'project', id: target.slice(5) };
        }
        return { type: 'department', id: target };
      }
      return target;
    });

    const initResult = await api.initiateMediaUpload({
      fileName: file.name,
      fileSizeBytes: file.size,
      declaredMimeType: file.type,
      departmentId,
      projectId,
      visibility,
      sharedWith: normalizedSharedWith,
      title,
      description,
      tags,
    });

    resolveAssetId(initResult.assetId);

    if (isCancelled) throw new Error('Upload cancelled by user.');

    // 3. Perform Resumable Upload into Staging Path
    onProgress?.({
      step: 'uploading',
      progressPercent: 0,
      bytesTransferred: 0,
      totalBytes: file.size,
      message: 'Uploading to secure staging...',
    });

    const storageRef = ref(storage, initResult.stagingPath);
    uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        assetId: initResult.assetId,
        departmentId: initResult.departmentId,
      },
    });

    await new Promise<void>((resolve, reject) => {
      if (!uploadTask) return reject(new Error('Upload task failed to initialize.'));

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress?.({
            step: 'uploading',
            progressPercent: percent,
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            message: `Uploading: ${percent}% (${(snapshot.bytesTransferred / 1024 / 1024).toFixed(1)} / ${(snapshot.totalBytes / 1024 / 1024).toFixed(1)} MB)`,
          });
        },
        (error) => {
          if (isCancelled) {
            reject(new Error('Upload cancelled by user.'));
          } else {
            onProgress?.({
              step: 'error',
              progressPercent: 0,
              bytesTransferred: 0,
              totalBytes: file.size,
              message: `Storage transfer error: ${error.message}`,
            });
            reject(error);
          }
        },
        () => {
          resolve();
        }
      );
    });

    if (isCancelled) throw new Error('Upload cancelled by user.');

    // 4. Finalize & Validate on Server
    onProgress?.({
      step: 'validating',
      progressPercent: 100,
      bytesTransferred: file.size,
      totalBytes: file.size,
      message: 'Validating checksum, dimensions, and codecs on server...',
    });

    const finalizeResult = await api.finalizeMediaUpload({
      assetId: initResult.assetId,
    });

    onProgress?.({
      step: 'ready',
      progressPercent: 100,
      bytesTransferred: file.size,
      totalBytes: file.size,
      message: 'Media asset verified and ready for digital displays.',
    });

    return finalizeResult.asset;
  })();

  return {
    assetId: assetIdPromise,
    cancel: () => {
      isCancelled = true;
      if (uploadTask) {
        uploadTask.cancel();
      }
    },
    done: donePromise,
  };
}
