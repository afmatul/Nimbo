import {
  downloadUrlSchema,
  fileVersionSummarySchema,
  fileVersionsResponseSchema,
  type DownloadUrlResponse,
  type FileVersionSummary,
  type FileVersionsResponse,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from './storage-http';

/** Historial de versiones de un archivo en la API (plan 014 §4). Solo el propietario; nada trae la clave del objeto. */
export interface VersionsApi {
  /** `GET /files/:fileId/versions`: de la más nueva a la más antigua y las que conserva el plan (CA-6). */
  fileVersions(fileId: string): Promise<FileVersionsResponse>;
  /** Crea una versión nueva con el contenido de `versionId` y la devuelve (CA-9). */
  restoreVersion(fileId: string, versionId: string): Promise<FileVersionSummary>;
  /** URL firmada de 5 min de una versión retenida (CA-8). */
  versionDownloadUrl(fileId: string, versionId: string): Promise<DownloadUrlResponse>;
}

function versionPath(fileId: string, versionId: string): string {
  return `/files/${encodeURIComponent(fileId)}/versions/${encodeURIComponent(versionId)}`;
}

export function createVersionsApi(http: StorageHttp): VersionsApi {
  return {
    fileVersions: async (fileId) =>
      parseResponse(
        await http.get(`/files/${encodeURIComponent(fileId)}/versions`),
        fileVersionsResponseSchema,
      ),
    restoreVersion: async (fileId, versionId) =>
      parseResponse(
        await http.post(`${versionPath(fileId, versionId)}/restore`),
        fileVersionSummarySchema,
      ),
    versionDownloadUrl: async (fileId, versionId) =>
      parseResponse(
        await http.post(`${versionPath(fileId, versionId)}/download-url`),
        downloadUrlSchema,
      ),
  };
}
