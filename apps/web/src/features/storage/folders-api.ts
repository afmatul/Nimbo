import {
  folderContentsResponseSchema,
  folderSummarySchema,
  type CreateFolderInput,
  type FolderContentsResponse,
  type FolderSummary,
  type MoveFolderInput,
  type RenameFolderInput,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from './storage-http';

/** Carpetas en la API (plan 006 §4). `GET /folders/contents` reemplaza a `GET /files` de 005. */
export interface FoldersApi {
  /** Primera página de la carpeta (`null` = raíz): carpetas primero, con las migas desde la raíz. */
  folderContents(folderId: string | null): Promise<FolderContentsResponse>;
  createFolder(body: CreateFolderInput): Promise<FolderSummary>;
  renameFolder(folderId: string, body: RenameFolderInput): Promise<FolderSummary>;
  /** `parentId: null` mueve a la raíz. */
  moveFolder(folderId: string, body: MoveFolderInput): Promise<FolderSummary>;
}

const folderPath = (folderId: string): string => `/folders/${encodeURIComponent(folderId)}`;

export function createFoldersApi(http: StorageHttp): FoldersApi {
  return {
    folderContents: async (folderId) => {
      const query = folderId === null ? '' : `?${new URLSearchParams({ folderId }).toString()}`;
      return parseResponse(
        await http.get(`/folders/contents${query}`),
        folderContentsResponseSchema,
      );
    },
    createFolder: async (body) =>
      parseResponse(await http.post('/folders', body), folderSummarySchema),
    renameFolder: async (folderId, body) =>
      parseResponse(await http.patch(folderPath(folderId), body), folderSummarySchema),
    moveFolder: async (folderId, body) =>
      parseResponse(await http.post(`${folderPath(folderId)}/move`, body), folderSummarySchema),
  };
}
