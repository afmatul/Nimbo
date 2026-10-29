import { searchResponseSchema, type SearchHit, type SearchResponse } from '@nimbo/contracts';

/** Datos de prueba de la búsqueda (018), validados con el esquema de `contracts`. */

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type FolderHit = Extract<SearchHit, { type: 'folder' }>;
type FileHit = Extract<SearchHit, { type: 'file' }>;

export const LOGISTICA = { id: uuid(900), name: 'Logística' } as const;

export function folderHit(n: number, name = `Camiones ${String(n)}`): FolderHit {
  return {
    type: 'folder',
    id: uuid(n),
    name,
    parentId: LOGISTICA.id,
    createdAt: '2026-10-01T15:00:00.000Z',
    updatedAt: '2026-10-22T15:00:00.000Z',
    location: LOGISTICA,
  };
}

export function fileHit(n: number, name = `Camión_${String(n)}.docx`): FileHit {
  return {
    type: 'file',
    id: uuid(n),
    name,
    sizeBytes: 98_304,
    kind: 'docx',
    folderId: null,
    createdAt: '2026-10-01T15:00:00.000Z',
    updatedAt: '2026-10-20T15:00:00.000Z',
    location: null,
  };
}

export function searchPage(
  items: readonly SearchHit[],
  nextCursor: string | null = null,
): SearchResponse {
  return searchResponseSchema.parse({ items, nextCursor });
}
