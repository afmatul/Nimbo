import {
  completeUploadResponseSchema,
  downloadUrlSchema,
  fileSummarySchema,
  initUploadResponseSchema,
  resumeUploadResponseSchema,
  type DownloadUrlResponse,
  type FileSummary,
  type MoveFileRequest,
  type RenameFileRequest,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';

import { createFoldersApi, type FoldersApi } from './folders-api';
import { createQuickAccessApi, type QuickAccessApi } from './quick-access-api';
import { createSpaceApi, type SpaceApi } from './space-api';
import { createStorageHttp, parseResponse } from './storage-http';
import { createTrashApi, type TrashApi } from './trash-api';
import type { UploadClient } from './upload/upload-manager';

/**
 * Cliente de la API de `storage` (planes 005 §5, 006 §4 y §9 y 007 §4): cargas, carpetas, papelera, espacio, descarga y
 * accesos rápidos.
 */
export interface StorageApi extends UploadClient, FoldersApi, TrashApi, QuickAccessApi, SpaceApi {
  downloadUrl(fileId: string): Promise<DownloadUrlResponse>;
  /** Nombre repetido: `409` con `details.suggestedName` salvo con `onConflict: 'keep_both'` (005 CA-6). */
  renameFile(fileId: string, body: RenameFileRequest): Promise<FileSummary>;
  /** `folderId: null` mueve a la raíz; nombre repetido como en `renameFile`. */
  moveFile(fileId: string, body: MoveFileRequest): Promise<FileSummary>;
}

/**
 * Habla con la API solo por `auth-fetch` (Bearer y renovación ante `401`). Los `PUT` de los bytes van directo a MinIO
 * por `upload/xhr-put.ts`, sin credenciales de la app.
 */
export function createStorageApi(apiPublicUrl: string, authFetch: AuthFetch): StorageApi {
  const http = createStorageHttp(apiPublicUrl, authFetch);
  const uploadPath = (uploadId: string): string => `/uploads/${encodeURIComponent(uploadId)}`;
  const filePath = (fileId: string): string => `/files/${encodeURIComponent(fileId)}`;

  return {
    ...createFoldersApi(http),
    ...createTrashApi(http),
    ...createQuickAccessApi(http),
    ...createSpaceApi(http),
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
    renameFile: async (fileId, body) =>
      parseResponse(await http.patch(filePath(fileId), body), fileSummarySchema),
    moveFile: async (fileId, body) =>
      parseResponse(await http.post(`${filePath(fileId)}/move`, body), fileSummarySchema),
  };
}
