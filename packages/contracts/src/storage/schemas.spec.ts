import type { ZodTypeAny } from 'zod';

import type { FieldIssueResponse } from '../error';
import { toFieldIssues } from '../validation';

import { folderContentsQuerySchema } from './folder-schemas';
import { FILE_NAME_MAX_LENGTH, FILES_PAGE_DEFAULT, FILES_PAGE_MAX } from './parameters';
import {
  FILE_KINDS,
  completeUploadResponseSchema,
  downloadUrlSchema,
  fileSummarySchema,
  initUploadResponseSchema,
  initUploadSchema,
  resumeUploadResponseSchema,
} from './schemas';

const UUID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const AT = '2026-09-30T10:00:00.000Z';
const URL_A = 'https://s3.staging.nimbo.me/nimbo/u/a?X-Amz-Signature=abc';

function issuesOf(schema: ZodTypeAny, input: unknown): FieldIssueResponse[] {
  const result = schema.safeParse(input);
  return result.success ? [] : toFieldIssues(result.error);
}

function reasonsOf(input: unknown): string[] {
  return issuesOf(initUploadSchema, input).map((issue) => `${issue.field}:${issue.reason}`);
}

describe('initUploadSchema', () => {
  it('CA-1: acepta `{ name, sizeBytes }`; `onConflict` ausente es `ask` y `folderId` ausente es la raíz', () => {
    expect(initUploadSchema.parse({ name: 'informe.docx', sizeBytes: 1024 })).toEqual({
      name: 'informe.docx',
      sizeBytes: 1024,
      onConflict: 'ask',
      folderId: null,
    });
  });

  it('CA-6 (006): acepta la carpeta destino', () => {
    const parsed = initUploadSchema.parse({ name: 'a.pdf', sizeBytes: 1, folderId: UUID });

    expect(parsed.folderId).toBe(UUID);
  });

  it('CA-6: acepta `onConflict: keep_both`', () => {
    const parsed = initUploadSchema.parse({ name: 'a.pdf', sizeBytes: 1, onConflict: 'keep_both' });

    expect(parsed.onConflict).toBe('keep_both');
  });

  it('CA-7: `sizeBytes = 0` pasa el esquema (el 422 STORAGE_EMPTY_FILE lo decide el servicio)', () => {
    expect(initUploadSchema.safeParse({ name: 'a.txt', sizeBytes: 0 }).success).toBe(true);
  });

  it.each([
    [{ sizeBytes: 1 }, 'name:REQUIRED'],
    [{ name: '', sizeBytes: 1 }, 'name:REQUIRED'],
    [{ name: '   ', sizeBytes: 1 }, 'name:REQUIRED'],
    [{ name: 42, sizeBytes: 1 }, 'name:REQUIRED'],
    [{ name: 'a/b.txt', sizeBytes: 1 }, 'name:INVALID_NAME'],
    [{ name: 'a\\b.txt', sizeBytes: 1 }, 'name:INVALID_NAME'],
    [{ name: 'a\u0000b.txt', sizeBytes: 1 }, 'name:INVALID_NAME'],
    [{ name: 'a\u0007b.txt', sizeBytes: 1 }, 'name:INVALID_NAME'],
    [{ name: '..', sizeBytes: 1 }, 'name:INVALID_NAME'],
    [{ name: '.', sizeBytes: 1 }, 'name:INVALID_NAME'],
    [{ name: 'a'.repeat(FILE_NAME_MAX_LENGTH + 1), sizeBytes: 1 }, 'name:NAME_TOO_LONG'],
    [{ name: 'a.txt' }, 'sizeBytes:REQUIRED'],
    [{ name: 'a.txt', sizeBytes: 1.5 }, 'sizeBytes:INVALID_SIZE'],
    [{ name: 'a.txt', sizeBytes: -1 }, 'sizeBytes:INVALID_SIZE'],
    [{ name: 'a.txt', sizeBytes: '10' }, 'sizeBytes:INVALID_SIZE'],
    [{ name: 'a.txt', sizeBytes: Number.MAX_SAFE_INTEGER + 1 }, 'sizeBytes:INVALID_SIZE'],
    [{ name: 'a.txt', sizeBytes: 1, folderId: 'no-es-uuid' }, 'folderId:INVALID_FOLDER'],
    [{ name: 'a.txt', sizeBytes: 1, parentId: UUID }, 'parentId:UNKNOWN_FIELD'],
  ])('CA-7: %j se rechaza con %s', (input, expected) => {
    expect(reasonsOf(input)).toEqual([expected]);
  });

  it('CA-7: el largo se mide en puntos de código, no en unidades UTF-16', () => {
    const emojis = '😀'.repeat(FILE_NAME_MAX_LENGTH);

    expect(initUploadSchema.safeParse({ name: emojis, sizeBytes: 1 }).success).toBe(true);
  });

  it('CA-7: todo `fields[].reason` sale del conjunto cerrado de storage', () => {
    const issues = issuesOf(initUploadSchema, { name: '', sizeBytes: -1, extra: 1 });

    expect(issues.map((issue) => issue.reason).sort()).toEqual(
      ['INVALID_SIZE', 'REQUIRED', 'UNKNOWN_FIELD'].sort(),
    );
    for (const issue of issues) expect(issue.message).toMatch(/\.$/);
  });

  it('CA-6: rechaza un `onConflict` fuera de `ask` | `keep_both` (no existe «Reemplazar»)', () => {
    expect(
      initUploadSchema.safeParse({ name: 'a.txt', sizeBytes: 1, onConflict: 'replace' }).success,
    ).toBe(false);
  });
});

describe('initUploadResponseSchema', () => {
  const simple = {
    uploadId: UUID,
    mode: 'simple',
    name: 'informe.docx',
    expiresAt: AT,
    upload: { url: URL_A, method: 'PUT', expiresAt: AT },
  };
  const multipart = {
    uploadId: UUID,
    mode: 'multipart',
    name: 'video.mp4',
    expiresAt: AT,
    partSizeBytes: 8_388_608,
    totalParts: 2,
    parts: [
      { partNumber: 1, url: URL_A },
      { partNumber: 2, url: URL_A },
    ],
    urlsExpireAt: AT,
  };

  it('CA-1: la respuesta simple lleva un único `PUT`', () => {
    expect(initUploadResponseSchema.parse(simple)).toEqual(simple);
  });

  it('CA-2: la respuesta por partes lleva tamaño de parte, total y una URL por parte', () => {
    expect(initUploadResponseSchema.parse(multipart)).toEqual(multipart);
  });

  it('CA-2: una respuesta por partes sin `parts` no es válida', () => {
    const { parts: _omitted, ...withoutParts } = multipart;

    expect(initUploadResponseSchema.safeParse(withoutParts).success).toBe(false);
  });

  it('CA-1: un `mode` desconocido no es válido', () => {
    expect(initUploadResponseSchema.safeParse({ ...simple, mode: 'stream' }).success).toBe(false);
  });
});

describe('resumeUploadResponseSchema', () => {
  it('CA-8: por partes devuelve las partes completas y solo las URLs pendientes', () => {
    const resumed = {
      uploadId: UUID,
      mode: 'multipart',
      expiresAt: AT,
      completedParts: [{ partNumber: 1, sizeBytes: 8_388_608 }],
      pending: {
        partSizeBytes: 8_388_608,
        totalParts: 2,
        parts: [{ partNumber: 2, url: URL_A }],
        urlsExpireAt: AT,
      },
    };

    expect(resumeUploadResponseSchema.parse(resumed)).toEqual(resumed);
  });

  it('CA-8: simple devuelve la URL única de nuevo (empieza de cero)', () => {
    const resumed = {
      uploadId: UUID,
      mode: 'simple',
      expiresAt: AT,
      completedParts: [],
      pending: { url: URL_A, method: 'PUT', expiresAt: AT },
    };

    expect(resumeUploadResponseSchema.parse(resumed)).toEqual(resumed);
  });
});

describe('FileSummary, listado y descarga', () => {
  const file = {
    id: UUID,
    name: 'informe.docx',
    sizeBytes: 1024,
    kind: 'docx',
    folderId: null,
    createdAt: AT,
    updatedAt: AT,
  };

  it('CA-1: `FileSummary` es `{ id, name, sizeBytes, kind, folderId, createdAt, updatedAt }`', () => {
    expect(fileSummarySchema.parse(file)).toEqual(file);
    expect(fileSummarySchema.safeParse({ ...file, objectKey: 'u/x' }).success).toBe(false);
    expect(fileSummarySchema.safeParse({ ...file, folderId: 'x' }).success).toBe(false);
  });

  it('007 CA-10: `FileSummary` exige `updatedAt` (columna «Modificado»)', () => {
    expect(fileSummarySchema.safeParse({ ...file, updatedAt: undefined }).success).toBe(false);
    expect(fileSummarySchema.safeParse({ ...file, updatedAt: 'ayer' }).success).toBe(false);
  });

  it('CA-12: `kind` sale del catálogo de tipos', () => {
    expect([...FILE_KINDS].sort()).toEqual(
      ['docx', 'imagen', 'otro', 'pdf', 'pptx', 'texto', 'xlsx'].sort(),
    );
    expect(fileSummarySchema.safeParse({ ...file, kind: 'exe' }).success).toBe(false);
  });

  it('CA-1: `complete` devuelve `{ file }`', () => {
    expect(completeUploadResponseSchema.parse({ file })).toEqual({ file });
  });

  it('CA-13: la descarga es `{ url, expiresAt }`', () => {
    const download = { url: URL_A, expiresAt: AT };

    expect(downloadUrlSchema.parse(download)).toEqual(download);
    expect(downloadUrlSchema.safeParse({ url: 'no-es-url', expiresAt: AT }).success).toBe(false);
  });
});

describe('paginación de `GET /folders/contents` (la de `GET /files` de 005)', () => {
  it('CA-1: sin parámetros usa la página por defecto', () => {
    expect(folderContentsQuerySchema.parse({})).toEqual({ limit: FILES_PAGE_DEFAULT });
  });

  it.each([
    ['0', 1],
    ['-5', 1],
    ['20', 20],
    ['1000', FILES_PAGE_MAX],
    ['abc', FILES_PAGE_DEFAULT],
  ])('CA-1: `limit=%s` se ajusta a %d', (limit, expected) => {
    expect(folderContentsQuerySchema.parse({ limit }).limit).toBe(expected);
  });

  it('CA-1: conserva el cursor opaco', () => {
    expect(folderContentsQuerySchema.parse({ cursor: 'abc' }).cursor).toBe('abc');
  });

  it('CA-7: un cursor vacío es `INVALID_CURSOR`', () => {
    const issues = issuesOf(folderContentsQuerySchema, { cursor: '' });

    expect(issues.map((issue) => issue.reason)).toEqual(['INVALID_CURSOR']);
  });
});
