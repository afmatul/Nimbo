import type { ZodTypeAny } from 'zod';

import { toFieldIssues } from '../validation';

import { STORAGE_NODE_FIELD_MESSAGES } from './error-codes';
import {
  createFolderSchema,
  explorerFileSchema,
  explorerFolderSchema,
  FILE_INDEX_STATUSES,
  fileDetailResponseSchema,
  folderContentsQuerySchema,
  folderContentsResponseSchema,
  folderSummarySchema,
  moveFileSchema,
  moveFolderSchema,
  nodeSummarySchema,
  renameFileSchema,
  NODE_ACCESS_LEVELS,
  NODE_SORTS,
  renameFolderSchema,
  SORT_DIRECTIONS,
} from './folder-schemas';
import { FILE_NAME_MAX_LENGTH, FILES_PAGE_DEFAULT } from './parameters';

const FOLDER_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const FILE_ID = '3f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const AT = '2026-09-30T10:00:00.000Z';

function reasonsOf(schema: ZodTypeAny, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : toFieldIssues(result.error).map((issue) => `${issue.field}:${issue.reason}`);
}

const folder = { id: FOLDER_ID, name: 'Fotos', parentId: null, createdAt: AT, updatedAt: AT };
const file = {
  id: FILE_ID,
  name: 'informe.docx',
  sizeBytes: 1024,
  kind: 'docx',
  folderId: FOLDER_ID,
  createdAt: AT,
  updatedAt: AT,
};

describe('createFolderSchema', () => {
  it('CA-1: acepta un nombre en la raíz (`parentId: null`) o dentro de otra carpeta', () => {
    expect(createFolderSchema.parse({ name: 'Fotos', parentId: null })).toEqual({
      name: 'Fotos',
      parentId: null,
    });
    expect(createFolderSchema.parse({ name: 'Fotos', parentId: FOLDER_ID }).parentId).toBe(
      FOLDER_ID,
    );
  });

  it.each([
    [{ parentId: null }, 'name:REQUIRED'],
    [{ name: '   ', parentId: null }, 'name:REQUIRED'],
    [{ name: 'a/b', parentId: null }, 'name:INVALID_NAME'],
    [{ name: 'a'.repeat(FILE_NAME_MAX_LENGTH + 1), parentId: null }, 'name:NAME_TOO_LONG'],
    [{ name: 'Fotos' }, 'parentId:REQUIRED'],
    [{ name: 'Fotos', parentId: 'no-es-uuid' }, 'parentId:INVALID_FOLDER'],
    [{ name: 'Fotos', parentId: null, color: 'azul' }, 'color:UNKNOWN_FIELD'],
  ])('CA-2: %j se rechaza con %s', (input, expected) => {
    expect(reasonsOf(createFolderSchema, input)).toEqual([expected]);
  });

  it('CA-2: los mensajes de nombre de carpetas no hablan de «subir»', () => {
    const result = createFolderSchema.safeParse({ name: 'a/b', parentId: null });
    const messages = result.success ? [] : toFieldIssues(result.error).map((i) => i.message);

    expect(messages).toEqual([STORAGE_NODE_FIELD_MESSAGES.INVALID_NAME]);
    for (const message of Object.values(STORAGE_NODE_FIELD_MESSAGES)) {
      expect(message).not.toMatch(/subir/i);
    }
  });
});

describe('renombrar y mover', () => {
  it('CA-4: renombrar una carpeta es `{ name }` estricto', () => {
    expect(renameFolderSchema.parse({ name: 'Viajes' })).toEqual({ name: 'Viajes' });
    expect(reasonsOf(renameFolderSchema, { name: '' })).toEqual(['name:REQUIRED']);
    expect(reasonsOf(renameFolderSchema, { name: 'a', parentId: null })).toEqual([
      'parentId:UNKNOWN_FIELD',
    ]);
  });

  it('CA-4: renombrar un archivo admite `onConflict` y por defecto pregunta', () => {
    expect(renameFileSchema.parse({ name: 'a.txt' })).toEqual({ name: 'a.txt', onConflict: 'ask' });
    expect(renameFileSchema.parse({ name: 'a.txt', onConflict: 'keep_both' }).onConflict).toBe(
      'keep_both',
    );
    expect(renameFileSchema.safeParse({ name: 'a.txt', onConflict: 'replace' }).success).toBe(
      false,
    );
  });

  it('CA-7: mover una carpeta es `{ parentId }` (null = raíz)', () => {
    expect(moveFolderSchema.parse({ parentId: null })).toEqual({ parentId: null });
    expect(reasonsOf(moveFolderSchema, {})).toEqual(['parentId:REQUIRED']);
    expect(reasonsOf(moveFolderSchema, { parentId: 7 })).toEqual(['parentId:INVALID_FOLDER']);
  });

  it('CA-7: mover un archivo es `{ folderId, onConflict }`', () => {
    expect(moveFileSchema.parse({ folderId: FOLDER_ID })).toEqual({
      folderId: FOLDER_ID,
      onConflict: 'ask',
    });
    expect(reasonsOf(moveFileSchema, { onConflict: 'ask' })).toEqual(['folderId:REQUIRED']);
  });

  it('014 CA-1: «Reemplazar» es solo de la carga: renombrar y mover un archivo rechazan `replace`', () => {
    expect(renameFileSchema.safeParse({ name: 'a.txt', onConflict: 'replace' }).success).toBe(
      false,
    );
    expect(moveFileSchema.safeParse({ folderId: null, onConflict: 'replace' }).success).toBe(false);
  });
});

describe('contenido de una carpeta', () => {
  it('CA-5: sin `folderId` lista la raíz con la página por defecto', () => {
    expect(folderContentsQuerySchema.parse({})).toEqual({ limit: FILES_PAGE_DEFAULT });
    expect(folderContentsQuerySchema.parse({ folderId: FOLDER_ID }).folderId).toBe(FOLDER_ID);
  });

  it('CA-5: un `folderId` mal formado es `INVALID_FOLDER`; un cursor vacío, `INVALID_CURSOR`', () => {
    expect(reasonsOf(folderContentsQuerySchema, { folderId: 'x' })).toEqual([
      'folderId:INVALID_FOLDER',
    ]);
    expect(reasonsOf(folderContentsQuerySchema, { cursor: '' })).toEqual(['cursor:INVALID_CURSOR']);
  });

  it('007 CA-10: sin `sort` ni `dir` la consulta es la de 006 (el orden por defecto lo resuelve la API)', () => {
    expect(folderContentsQuerySchema.parse({ folderId: FOLDER_ID })).toEqual({
      folderId: FOLDER_ID,
      limit: FILES_PAGE_DEFAULT,
    });
  });

  it.each(NODE_SORTS.flatMap((sort) => SORT_DIRECTIONS.map((dir) => [sort, dir] as const)))(
    '007 CA-10: acepta `sort=%s` y `dir=%s`',
    (sort, dir) => {
      expect(folderContentsQuerySchema.parse({ sort, dir })).toEqual({
        sort,
        dir,
        limit: FILES_PAGE_DEFAULT,
      });
    },
  );

  it('007 CA-10: los órdenes son nombre, tamaño, modificación y creación; las direcciones, asc y desc', () => {
    expect([...NODE_SORTS].sort()).toEqual(['created', 'name', 'size', 'updated']);
    expect([...SORT_DIRECTIONS].sort()).toEqual(['asc', 'desc']);
  });

  it.each([
    [{ sort: 'tamano' }, 'sort:INVALID_SORT'],
    [{ sort: '' }, 'sort:INVALID_SORT'],
    [{ sort: ['name'] }, 'sort:INVALID_SORT'],
    [{ dir: 'up' }, 'dir:INVALID_DIRECTION'],
    [{ dir: 'DESC' }, 'dir:INVALID_DIRECTION'],
  ])('007 CA-11: %j se rechaza con %s', (input, expected) => {
    expect(reasonsOf(folderContentsQuerySchema, input)).toEqual([expected]);
  });

  it('007 CA-11: un `limit` fuera de rango no es error: se ajusta como en 006', () => {
    expect(folderContentsQuerySchema.parse({ sort: 'name', limit: '0' }).limit).toBe(1);
  });

  it('CA-5: la respuesta lleva carpeta, migas, elementos de ambos tipos y cursor', () => {
    const response = {
      folder: { id: FOLDER_ID, name: 'Fotos' },
      breadcrumbs: [{ id: FOLDER_ID, name: 'Fotos' }],
      items: [
        { type: 'folder', ...folder, shared: true },
        { type: 'file', ...file, shared: false, indexStatus: 'indexed' },
      ],
      nextCursor: null,
      accessLevel: 'VIEWER',
    };

    expect(folderContentsResponseSchema.parse(response)).toEqual(response);
  });

  it('Explorador: cada elemento dice si está compartido y cada archivo su estado de indexación', () => {
    const page = (items: unknown[]) => ({
      folder: null,
      breadcrumbs: [],
      items,
      nextCursor: null,
      accessLevel: 'OWNER',
    });

    expect(FILE_INDEX_STATUSES).toEqual([
      'pending',
      'processing',
      'indexed',
      'failed',
      'unsupported',
    ]);
    expect(
      folderContentsResponseSchema.safeParse(page([{ type: 'folder', ...folder }])).success,
    ).toBe(false);
    expect(
      folderContentsResponseSchema.safeParse(page([{ type: 'file', ...file, shared: true }]))
        .success,
    ).toBe(false);
    expect(
      folderContentsResponseSchema.safeParse(
        page([{ type: 'file', ...file, shared: true, indexStatus: 'indexando' }]),
      ).success,
    ).toBe(false);
    expect(
      folderContentsResponseSchema.safeParse(
        page([{ type: 'folder', ...folder, shared: false, indexStatus: 'indexed' }]),
      ).success,
    ).toBe(false);
  });

  it('Explorador: crear, renombrar y mover responden la carpeta o el archivo con sus distintivos', () => {
    const explorerFolder = { type: 'folder', ...folder, shared: false };
    const explorerFile = { type: 'file', ...file, shared: true, indexStatus: 'pending' };

    expect(explorerFolderSchema.parse(explorerFolder)).toEqual(explorerFolder);
    expect(explorerFileSchema.parse(explorerFile)).toEqual(explorerFile);
    expect(explorerFolderSchema.safeParse(folder).success).toBe(false);
    expect(explorerFileSchema.safeParse({ ...explorerFile, indexStatus: undefined }).success).toBe(
      false,
    );
    expect(explorerFolderSchema.safeParse({ ...explorerFolder, extra: 1 }).success).toBe(false);
  });

  it('CA-5: en la raíz `folder` es `null` y no hay migas', () => {
    const root = {
      folder: null,
      breadcrumbs: [],
      items: [],
      nextCursor: 'abc',
      accessLevel: 'OWNER',
    };

    expect(folderContentsResponseSchema.parse(root)).toEqual(root);
  });

  it('012 CA-13: `accessLevel` es obligatorio y solo `OWNER`, `EDITOR` o `VIEWER`', () => {
    const root = { folder: null, breadcrumbs: [], items: [], nextCursor: null };

    expect(NODE_ACCESS_LEVELS).toEqual(['OWNER', 'EDITOR', 'VIEWER']);
    expect(folderContentsResponseSchema.safeParse(root).success).toBe(false);
    expect(folderContentsResponseSchema.safeParse({ ...root, accessLevel: 'ADMIN' }).success).toBe(
      false,
    );
  });

  it('012 CA-12: la ficha es `{ file: FileSummary, accessLevel }`, estricta', () => {
    const detail = { file, accessLevel: 'EDITOR' };

    expect(fileDetailResponseSchema.parse(detail)).toEqual(detail);
    expect(fileDetailResponseSchema.safeParse({ file }).success).toBe(false);
    expect(fileDetailResponseSchema.safeParse({ ...detail, accessLevel: 'ADMIN' }).success).toBe(
      false,
    );
    expect(fileDetailResponseSchema.safeParse({ ...detail, versions: [] }).success).toBe(false);
  });

  it('CA-1: `FolderSummary` y `NodeSummary` son estrictos y se discriminan por `type`', () => {
    expect(folderSummarySchema.parse(folder)).toEqual(folder);
    expect(folderSummarySchema.safeParse({ ...folder, updatedAt: undefined }).success).toBe(false);
    expect(nodeSummarySchema.safeParse({ type: 'folder', ...file }).success).toBe(false);
    expect(nodeSummarySchema.safeParse({ type: 'link', ...folder }).success).toBe(false);
  });
});
