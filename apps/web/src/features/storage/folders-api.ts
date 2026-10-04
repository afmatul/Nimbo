import {
  folderContentsResponseSchema,
  folderSummarySchema,
  type CreateFolderInput,
  type FolderContentsResponse,
  type FolderSummary,
  type MoveFolderInput,
  type NodeSort,
  type RenameFolderInput,
  type SortDirection,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from './storage-http';

/**
 * Orden y página de `GET /folders/contents` (007 CA-9, CA-10). Sin `sort` ni `dir`, el orden de 006; el `cursor` es el
 * `nextCursor` de la página anterior y se pide con el mismo orden con el que se emitió.
 */
export interface FolderPageQuery {
  readonly sort?: NodeSort;
  readonly dir?: SortDirection;
  readonly cursor?: string;
  /** Tamaño de página; sin él, el de la API (la API lo ajusta a su rango, 007 P-9). */
  readonly limit?: number;
}

/** Carpetas en la API (plan 006 §4). `GET /folders/contents` reemplaza a `GET /files` de 005. */
export interface FoldersApi {
  /** Una página de la carpeta (`null` = raíz): carpetas primero, con las migas desde la raíz. */
  folderContents(folderId: string | null, page?: FolderPageQuery): Promise<FolderContentsResponse>;
  createFolder(body: CreateFolderInput): Promise<FolderSummary>;
  renameFolder(folderId: string, body: RenameFolderInput): Promise<FolderSummary>;
  /** `parentId: null` mueve a la raíz. */
  moveFolder(folderId: string, body: MoveFolderInput): Promise<FolderSummary>;
}

const folderPath = (folderId: string): string => `/folders/${encodeURIComponent(folderId)}`;

function contentsQuery(folderId: string | null, page: FolderPageQuery): string {
  const params = Object.entries({ folderId, ...page }).flatMap(([key, value]) =>
    typeof value === 'string' || typeof value === 'number' ? [[key, String(value)]] : [],
  );
  const query = new URLSearchParams(params).toString();
  return query === '' ? '' : `?${query}`;
}

export function createFoldersApi(http: StorageHttp): FoldersApi {
  return {
    folderContents: async (folderId, page = {}) =>
      parseResponse(
        await http.get(`/folders/contents${contentsQuery(folderId, page)}`),
        folderContentsResponseSchema,
      ),
    createFolder: async (body) =>
      parseResponse(await http.post('/folders', body), folderSummarySchema),
    renameFolder: async (folderId, body) =>
      parseResponse(await http.patch(folderPath(folderId), body), folderSummarySchema),
    moveFolder: async (folderId, body) =>
      parseResponse(await http.post(`${folderPath(folderId)}/move`, body), folderSummarySchema),
  };
}
