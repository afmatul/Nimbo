import {
  completeUploadResponseSchema,
  downloadUrlSchema,
  initUploadResponseSchema,
  listFilesResponseSchema,
  resumeUploadResponseSchema,
  type DownloadUrlResponse,
  type ListFilesResponse,
} from '@nimbo/contracts';
import type { ZodType } from 'zod';

import { ApiClientError } from '../../lib/api-error';
import type { AuthFetch } from '../identity/session/auth-fetch';

import { StorageRequestError } from './storage-request-error';
import type { UploadClient } from './upload/upload-manager';

/** Cliente de la API de `storage` (plan 005 §5): lo que usan el manager de cargas, el explorador y el menú de fila. */
export interface StorageApi extends UploadClient {
  listFiles(cursor?: string): Promise<ListFilesResponse>;
  downloadUrl(fileId: string): Promise<DownloadUrlResponse>;
}

/** Una respuesta 2xx que no cumple el contrato se trata como falla del servidor (se rechaza), no como corte de red. */
const UNEXPECTED_RESPONSE_STATUS = 500;
const UNEXPECTED_RESPONSE_CODE = 'INTERNAL_ERROR';

/**
 * Error HTTP → `StorageRequestError` con `status`, `code` y `details`. Sin respuesta (red caída) se deja pasar tal cual
 * para que el manager lo trate como corte (CA-8).
 */
function toStorageError(caught: unknown): unknown {
  if (caught instanceof ApiClientError && caught.status !== undefined) {
    return new StorageRequestError(caught.status, caught.code, caught.details);
  }
  return caught;
}

function parse<T>(raw: unknown, schema: ZodType<T>): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new StorageRequestError(UNEXPECTED_RESPONSE_STATUS, UNEXPECTED_RESPONSE_CODE);
  }
  return parsed.data;
}

/**
 * Habla con la API solo por `auth-fetch` (Bearer y renovación ante `401`). Los `PUT` de los bytes van directo a MinIO
 * por `upload/xhr-put.ts`, sin credenciales de la app.
 */
export function createStorageApi(apiPublicUrl: string, authFetch: AuthFetch): StorageApi {
  const base = apiPublicUrl.replace(/\/$/, '');

  const call = async (path: string, init: RequestInit): Promise<unknown> => {
    try {
      return await authFetch(`${base}${path}`, init);
    } catch (caught) {
      throw toStorageError(caught);
    }
  };

  const post = (path: string, body?: unknown): Promise<unknown> =>
    call(
      path,
      body === undefined
        ? { method: 'POST' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
    );

  const uploadPath = (uploadId: string): string => `/uploads/${encodeURIComponent(uploadId)}`;

  return {
    init: async (body) => parse(await post('/uploads', body), initUploadResponseSchema),
    resume: async (uploadId) =>
      parse(await post(`${uploadPath(uploadId)}/resume`), resumeUploadResponseSchema),
    complete: async (uploadId) =>
      parse(await post(`${uploadPath(uploadId)}/complete`), completeUploadResponseSchema),
    cancel: async (uploadId) => {
      await call(uploadPath(uploadId), { method: 'DELETE' });
    },
    listFiles: async (cursor) => {
      const query = cursor === undefined ? '' : `?${new URLSearchParams({ cursor }).toString()}`;
      return parse(await call(`/files${query}`, { method: 'GET' }), listFilesResponseSchema);
    },
    downloadUrl: async (fileId) =>
      parse(await post(`/files/${encodeURIComponent(fileId)}/download-url`), downloadUrlSchema),
  };
}
