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
import { MEDIA_CONSTRAINTS, type MediaAsset } from '@aura-dims/display-schema';

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

  const isImage = file.type === 'image/jpeg' || file.type === 'image/png';
  const isVideo = file.type === 'video/mp4';

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

export function startMediaUpload(options: UploadMediaOptions): ActiveUploadHandle {
  const { file, departmentId, title, description, tags, onProgress } = options;

  let uploadTask: UploadTask | null = null;
  let isCancelled = false;
  let resolveAssetId: (id: string) => void = () => {};
  const assetIdPromise = new Promise<string>((res) => {
    resolveAssetId = res;
  });

  const donePromise = (async (): Promise<MediaAsset> => {
    // 1. Client-side Validation
    const validation = validateMediaFileClient(file);
    if (!validation.valid) {
      const err = new Error(validation.error);
      onProgress?.({
        step: 'error',
        progressPercent: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
        message: validation.error || 'Validation error',
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

    const initResult = await api.initiateMediaUpload({
      fileName: file.name,
      fileSizeBytes: file.size,
      declaredMimeType: file.type,
      departmentId,
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
