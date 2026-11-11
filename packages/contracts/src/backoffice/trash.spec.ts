import type { z } from 'zod';

import { AUDIT_NOTE_MAX_LENGTH } from '../audit';
import { FILES_PAGE_DEFAULT, FILES_PAGE_MAX } from '../storage';
import { toFieldIssues } from '../validation';

import { BACKOFFICE_FIELD_MESSAGES } from './error-codes';
import {
  clientTrashQuerySchema,
  clientTrashResponseSchema,
  restoreClientNodeRequestSchema,
} from './trash';

const ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const AT = '2026-10-07T12:00:00.000Z';

function reasonsOf(schema: z.ZodTypeAny, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : toFieldIssues(result.error).map((i) => `${i.field}:${i.reason}`);
}

describe('clientTrashQuerySchema (011b CA-10, CA-12)', () => {
  it('CA-10: correo exacto normalizado, sin cursor y con el límite por defecto', () => {
    expect(clientTrashQuerySchema.parse({ email: '  Ana@Nimbo.me ' })).toEqual({
      email: 'ana@nimbo.me',
      cursor: undefined,
      limit: FILES_PAGE_DEFAULT,
    });
  });

  it('acepta el cursor opaco y un límite dentro del rango', () => {
    expect(
      clientTrashQuerySchema.parse({ email: 'ana@nimbo.me', cursor: 'abc', limit: '20' }),
    ).toEqual({ email: 'ana@nimbo.me', cursor: 'abc', limit: 20 });
    expect(clientTrashQuerySchema.parse({ email: 'ana@nimbo.me', limit: FILES_PAGE_MAX })).toEqual(
      expect.objectContaining({ limit: FILES_PAGE_MAX }),
    );
  });

  it.each([
    ['sin correo', {}, ['email:REQUIRED']],
    ['correo inválido', { email: 'ana' }, ['email:INVALID_EMAIL']],
    ['cursor vacío', { email: 'ana@nimbo.me', cursor: '' }, ['cursor:INVALID_CURSOR']],
    ['cursor repetido', { email: 'ana@nimbo.me', cursor: ['a', 'b'] }, ['cursor:INVALID_CURSOR']],
    ['límite cero', { email: 'ana@nimbo.me', limit: '0' }, ['limit:INVALID_LIMIT']],
    ['límite negativo', { email: 'ana@nimbo.me', limit: '-5' }, ['limit:INVALID_LIMIT']],
    ['límite decimal', { email: 'ana@nimbo.me', limit: '2.5' }, ['limit:INVALID_LIMIT']],
    [
      'límite sobre el máximo',
      { email: 'ana@nimbo.me', limit: String(FILES_PAGE_MAX + 1) },
      ['limit:INVALID_LIMIT'],
    ],
  ])('CA-12: %s es un campo inválido, no se ajusta', (_label, input, reasons) => {
    expect(reasonsOf(clientTrashQuerySchema, input)).toEqual(reasons);
  });
});

describe('restoreClientNodeRequestSchema (011b CA-11, CA-12, RN-3)', () => {
  const valid = { email: 'ana@nimbo.me', note: '  Lo borró por error  ', type: 'folder' };

  it('CA-11: recorta el motivo y normaliza el correo', () => {
    expect(restoreClientNodeRequestSchema.parse({ ...valid, email: 'ANA@nimbo.me' })).toEqual({
      email: 'ana@nimbo.me',
      note: 'Lo borró por error',
      type: 'folder',
    });
  });

  it('RN-3: admite un motivo de exactamente el máximo', () => {
    const note = 'a'.repeat(AUDIT_NOTE_MAX_LENGTH);

    expect(restoreClientNodeRequestSchema.parse({ ...valid, note }).note).toBe(note);
  });

  it.each([
    ['motivo vacío', { ...valid, note: '   ' }, ['note:NOTE_REQUIRED']],
    ['sin motivo', { email: valid.email, type: 'file' }, ['note:NOTE_REQUIRED']],
    [
      'motivo largo',
      { ...valid, note: 'a'.repeat(AUDIT_NOTE_MAX_LENGTH + 1) },
      ['note:NOTE_TOO_LONG'],
    ],
    ['tipo desconocido', { ...valid, type: 'version' }, ['type:INVALID_NODE_TYPE']],
    ['sin tipo', { email: valid.email, note: 'x' }, ['type:INVALID_NODE_TYPE']],
    ['correo inválido', { ...valid, email: 'ana@' }, ['email:INVALID_EMAIL']],
    ['campo extra', { ...valid, ownerId: ID }, ['ownerId:UNKNOWN_FIELD']],
  ])('CA-12: %s', (_label, input, reasons) => {
    expect(reasonsOf(restoreClientNodeRequestSchema, input)).toEqual(reasons);
  });

  it('cada `reason` nuevo tiene su mensaje con la acción correctiva', () => {
    const result = restoreClientNodeRequestSchema.safeParse({ email: 'x', note: '', type: 1 });

    expect(result.success ? [] : toFieldIssues(result.error).map((i) => i.message)).toEqual([
      BACKOFFICE_FIELD_MESSAGES.INVALID_EMAIL,
      BACKOFFICE_FIELD_MESSAGES.NOTE_REQUIRED,
      BACKOFFICE_FIELD_MESSAGES.INVALID_NODE_TYPE,
    ]);
  });
});

describe('clientTrashResponseSchema (011b CA-10)', () => {
  const response = {
    client: { id: ID, fullName: 'Ana López', email: 'ana@nimbo.me' },
    items: [
      {
        id: ID,
        type: 'file',
        name: 'informe.docx',
        kind: 'docx',
        sizeBytes: 1024,
        originalFolder: null,
        deletedAt: AT,
        purgeAt: AT,
      },
    ],
    nextCursor: null,
  };

  it('CA-10: el cliente y sus raíces, con el elemento de la papelera de la 006', () => {
    expect(clientTrashResponseSchema.parse(response)).toEqual(response);
  });

  it('CA-10: no admite contenido, claves de objeto ni URLs', () => {
    const leaked = { ...response, items: [{ ...response.items[0], objectKey: 'k', url: 'u' }] };

    expect(clientTrashResponseSchema.safeParse(leaked).success).toBe(false);
  });
});
