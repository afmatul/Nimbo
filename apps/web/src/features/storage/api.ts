import {
  completeUploadResponseSchema,
  downloadUrlSchema,
  initUploadResponseSchema,
  resumeUploadResponseSchema,
  type DownloadUrlResponse,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';

import { createFoldersApi, type FoldersApi } from './folders-api';
import { createStorageHttp, parseResponse } from './storage-http';
import type { UploadClient } from './upload/upload-manager';

/** Cliente de la API de `storage` (planes 005 §5 y 006 §4): cargas, carpetas y descarga. */
export interface StorageApi extends UploadClient, FoldersApi {
  downloadUrl(fileId: string): Promise<DownloadUrlResponse>;
}

/**
 * Habla con la API solo por `auth-fetch` (Bearer y renovación ante `401`). Los `PUT` de los bytes van directo a MinIO
 * por `upload/xhr-put.ts`, sin credenciales de la app.
 */
export function createStorageApi(apiPublicUrl: string, authFetch: AuthFetch): StorageApi {
  const http = createStorageHttp(apiPublicUrl, authFetch);
  const uploadPath = (uploadId: string): string => `/uploads/${encodeURIComponent(uploadId)}`;

  return {
    ...createFoldersApi(http),
    init: async (body) =>
      parseResponse(await http.post('/uploads', body), initUploadResponseSchema),
    resume: async (uploadId) =>
      parseResponse(await http.post(`${uploadPath(uploadId)}/resume`), resumeUploadResponseSchema),
    complete: async (uploadId) =>
      parseResponse(
        await http.post(`${uploadPath(uploadId)}/complete`),
        completeUploadResponseSchema,
      ),
    cancel: async (uploadId) => {
      await http.delete(uploadPath(uploadId));
    },
    downloadUrl: async (fileId) =>
      parseResponse(
        await http.post(`/files/${encodeURIComponent(fileId)}/download-url`),
        downloadUrlSchema,
      ),
  };
}
