import type { ZodTypeAny } from 'zod';

import { toFieldIssues } from '../validation';

import { STORAGE_NODE_FIELD_MESSAGES } from './error-codes';
import {
  createFolderSchema,
  folderContentsQuerySchema,
  folderContentsResponseSchema,
  folderSummarySchema,
  moveFileSchema,
  moveFolderSchema,
  nodeSummarySchema,
  renameFileSchema,
  renameFolderSchema,
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

const folder = { id: FOLDER_ID, name: 'Fotos', parentId: null, createdAt: AT };
const file = {
  id: FILE_ID,
  name: 'informe.docx',
  sizeBytes: 1024,
  kind: 'docx',
  folderId: FOLDER_ID,
  createdAt: AT,
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

  it('CA-5: la respuesta lleva carpeta, migas, elementos de ambos tipos y cursor', () => {
    const response = {
      folder: { id: FOLDER_ID, name: 'Fotos' },
      breadcrumbs: [{ id: FOLDER_ID, name: 'Fotos' }],
      items: [
        { type: 'folder', ...folder },
        { type: 'file', ...file },
      ],
      nextCursor: null,
    };

    expect(folderContentsResponseSchema.parse(response)).toEqual(response);
  });

  it('CA-5: en la raíz `folder` es `null` y no hay migas', () => {
    const root = { folder: null, breadcrumbs: [], items: [], nextCursor: 'abc' };

    expect(folderContentsResponseSchema.parse(root)).toEqual(root);
  });

  it('CA-1: `FolderSummary` y `NodeSummary` son estrictos y se discriminan por `type`', () => {
    expect(folderSummarySchema.parse(folder)).toEqual(folder);
    expect(nodeSummarySchema.safeParse({ type: 'folder', ...file }).success).toBe(false);
    expect(nodeSummarySchema.safeParse({ type: 'link', ...folder }).success).toBe(false);
  });
});
