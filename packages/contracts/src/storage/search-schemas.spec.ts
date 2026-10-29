import { toFieldIssues } from '../validation';

import { STORAGE_FIELD_MESSAGES } from './error-codes';
import { FILE_NAME_MAX_LENGTH, FILES_PAGE_DEFAULT, FILES_PAGE_MAX } from './parameters';
import {
  SEARCH_TYPES,
  STORAGE_SEARCH_FIELD_MESSAGES,
  searchHitSchema,
  searchQuerySchema,
  searchResponseSchema,
} from './search-schemas';

const FOLDER_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const FILE_ID = '3f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const AT = '2026-09-30T10:00:00.000Z';
const EARLIER = '2026-10-01T06:00:00.000Z';
const LATER = '2026-10-08T06:00:00.000Z';

function issuesOf(input: unknown): { field: string; reason: string; message: string }[] {
  const result = searchQuerySchema.safeParse(input);
  return result.success ? [] : toFieldIssues(result.error);
}

function reasonsOf(input: unknown): string[] {
  return issuesOf(input).map((issue) => `${issue.field}:${issue.reason}`);
}

const folderHit = {
  type: 'folder',
  id: FOLDER_ID,
  name: 'Informes',
  parentId: null,
  createdAt: AT,
  updatedAt: AT,
  location: null,
};
const fileHit = {
  type: 'file',
  id: FILE_ID,
  name: 'Informe del Camión.docx',
  sizeBytes: 1024,
  kind: 'docx',
  folderId: FOLDER_ID,
  createdAt: AT,
  updatedAt: AT,
  location: { id: FOLDER_ID, name: 'Informes' },
};

describe('searchQuerySchema', () => {
  it('CA-1: recorta el texto y aplica la página por defecto', () => {
    expect(searchQuerySchema.parse({ q: '  camion informe  ' })).toEqual({
      q: 'camion informe',
      limit: FILES_PAGE_DEFAULT,
    });
  });

  it('CA-3: `limit` y `cursor` son los de la paginación del explorador', () => {
    expect(searchQuerySchema.parse({ q: 'a', limit: '500', cursor: 'abc' })).toEqual({
      q: 'a',
      limit: FILES_PAGE_MAX,
      cursor: 'abc',
    });
    expect(reasonsOf({ q: 'a', cursor: '' })).toEqual(['cursor:INVALID_CURSOR']);
  });

  it.each([[{}], [{ q: '' }], [{ q: '   ' }], [{ q: ['a', 'b'] }]])(
    'CA-6: %j sin texto es `REQUIRED` con «Escribe qué quieres buscar.»',
    (input) => {
      expect(issuesOf(input)).toEqual([
        { field: 'q', reason: 'REQUIRED', message: 'Escribe qué quieres buscar.' },
      ]);
    },
  );

  it('CA-6: hasta 255 caracteres tras recortar; con más, `NAME_TOO_LONG` con su mensaje', () => {
    const longest = 'ñ'.repeat(FILE_NAME_MAX_LENGTH);

    expect(searchQuerySchema.parse({ q: ` ${longest} ` }).q).toBe(longest);
    expect(issuesOf({ q: `${longest}a` })).toEqual([
      {
        field: 'q',
        reason: 'NAME_TOO_LONG',
        message: STORAGE_SEARCH_FIELD_MESSAGES.NAME_TOO_LONG,
      },
    ]);
    expect(STORAGE_SEARCH_FIELD_MESSAGES.NAME_TOO_LONG).toMatch(/^Usa 255 caracteres o menos/);
  });

  it('CA-4: los comodines de `LIKE` son texto como cualquier otro', () => {
    expect(searchQuerySchema.parse({ q: '50%' }).q).toBe('50%');
    expect(searchQuerySchema.parse({ q: 'a_b' }).q).toBe('a_b');
  });

  it.each(SEARCH_TYPES)('CA-7: acepta el tipo `%s`', (type) => {
    expect(searchQuerySchema.parse({ q: 'a', type }).type).toBe(type);
  });

  it('CA-7: los tipos son las categorías del resumen de espacio (007)', () => {
    expect([...SEARCH_TYPES].sort()).toEqual(['documents', 'images', 'other']);
  });

  it.each([['docx'], ['Documents'], [''], [['images']]])(
    'CA-9: el tipo %j es `INVALID_TYPE`',
    (type) => {
      expect(reasonsOf({ q: 'a', type })).toEqual(['type:INVALID_TYPE']);
    },
  );

  it('CA-8: `from` y `to` son instantes ISO, juntos o por separado', () => {
    expect(searchQuerySchema.parse({ q: 'a', from: EARLIER, to: LATER })).toMatchObject({
      from: EARLIER,
      to: LATER,
    });
    expect(searchQuerySchema.parse({ q: 'a', from: EARLIER }).to).toBeUndefined();
    expect(searchQuerySchema.parse({ q: 'a', to: LATER }).from).toBeUndefined();
  });

  it('CA-9: una fecha mal formada es `INVALID_DATE`', () => {
    expect(reasonsOf({ q: 'a', from: 'ayer', to: '05/10/2026' })).toEqual([
      'from:INVALID_DATE',
      'to:INVALID_DATE',
    ]);
  });

  it.each([[LATER], [EARLIER]])(
    'CA-9: `to` que no es posterior a `from` (%s) es `INVALID_RANGE` en `to`',
    (from) => {
      expect(reasonsOf({ q: 'a', from, to: EARLIER })).toEqual(['to:INVALID_RANGE']);
    },
  );

  it('CA-9: los motivos nuevos tienen mensaje en español con acción', () => {
    for (const reason of ['INVALID_TYPE', 'INVALID_DATE', 'INVALID_RANGE'] as const) {
      expect(STORAGE_FIELD_MESSAGES[reason]).toMatch(/\.$/);
      expect(STORAGE_SEARCH_FIELD_MESSAGES[reason]).toBe(STORAGE_FIELD_MESSAGES[reason]);
    }
  });
});

describe('searchResponseSchema', () => {
  it('CA-2: un resultado es un `NodeSummary` con su ubicación (`null` = «Mis archivos»)', () => {
    expect(searchHitSchema.parse(folderHit)).toEqual(folderHit);
    expect(searchHitSchema.parse(fileHit)).toEqual(fileHit);
    expect(searchHitSchema.safeParse({ ...fileHit, location: undefined }).success).toBe(false);
    expect(searchHitSchema.safeParse({ ...fileHit, path: '/x' }).success).toBe(false);
  });

  it('CA-3: la página lleva resultados y cursor, sin total', () => {
    const page = { items: [folderHit, fileHit], nextCursor: 'abc' };

    expect(searchResponseSchema.parse(page)).toEqual(page);
    expect(searchResponseSchema.safeParse({ ...page, total: 2 }).success).toBe(false);
  });
});
