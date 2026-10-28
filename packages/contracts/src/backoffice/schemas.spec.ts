import type { z } from 'zod';

import { toFieldIssues } from '../validation';

import { BACKOFFICE_ERROR_CODES, BACKOFFICE_FIELD_ISSUE_REASONS } from './error-codes';
import { BACKOFFICE_PAGE_SIZE } from './parameters';
import {
  accountListItemSchema,
  accountListResponseSchema,
  backofficeMetricsResponseSchema,
  clientFilesQuerySchema,
  clientFilesResponseSchema,
  listAccountsQuerySchema,
} from './schemas';

const ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const PLAN_ID = '3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d';
const AT = '2026-10-07T12:00:00.000Z';
/** 3 GiB: no cabe en un entero de 32 bits y viaja como texto decimal (ADR-0016, PD-87). */
const THREE_GIB = '3221225472';

const clientItem = {
  id: ID,
  email: 'ana@nimbo.me',
  fullName: 'Ana López',
  role: 'CLIENT',
  status: 'active',
  emailVerified: true,
  planName: 'Personal',
  usedBytes: THREE_GIB,
  createdAt: AT,
  isSelf: false,
};

const internalItem = {
  ...clientItem,
  role: 'SUPPORT',
  status: 'suspended',
  planName: null,
  usedBytes: null,
};

const fileItem = {
  id: ID,
  name: 'informe.docx',
  kind: 'docx',
  sizeBytes: THREE_GIB,
  createdAt: AT,
  updatedAt: AT,
  trashedAt: null,
};

function reasonsOf(schema: z.ZodTypeAny, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : toFieldIssues(result.error).map((i) => `${i.field}:${i.reason}`);
}

describe('parámetros y códigos del backoffice (011 plan §4)', () => {
  it('Q-5: 10 elementos por página', () => {
    expect(BACKOFFICE_PAGE_SIZE).toBe(10);
  });

  it('declara los códigos propios del backoffice y sus `reason`', () => {
    expect(BACKOFFICE_ERROR_CODES).toEqual({
      INVALID_QUERY: 'BACKOFFICE_INVALID_QUERY',
      CLIENT_NOT_FOUND: 'BACKOFFICE_CLIENT_NOT_FOUND',
      QUOTA_INVALID: 'BACKOFFICE_QUOTA_INVALID',
      QUOTA_BELOW_USAGE: 'BACKOFFICE_QUOTA_BELOW_USAGE',
      VALIDITY_NOT_EXTENDED: 'BACKOFFICE_VALIDITY_NOT_EXTENDED',
    });
    expect([...BACKOFFICE_FIELD_ISSUE_REASONS]).toEqual([
      'REQUIRED',
      'INVALID_EMAIL',
      'INVALID_PAGE',
      'INVALID_EXTRA_BYTES',
      'INVALID_DAY',
    ]);
  });
});

describe('listAccountsQuerySchema (CA-1)', () => {
  it('CA-1: sin filtros es la página 1 sin prefijo', () => {
    expect(listAccountsQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it('Q-5: el prefijo del correo se recorta y pasa a minúsculas; vacío no filtra', () => {
    expect(listAccountsQuerySchema.parse({ email: '  Ana@ ', page: '3' })).toEqual({
      email: 'ana@',
      page: 3,
    });
    expect(listAccountsQuerySchema.parse({ email: '   ' })).toEqual({ page: 1 });
  });

  it.each([['0'], ['-1'], ['1.5'], ['dos'], [['1', '2']]])(
    'la página %p es `INVALID_PAGE`',
    (page) => {
      expect(reasonsOf(listAccountsQuerySchema, { page })).toEqual(['page:INVALID_PAGE']);
    },
  );

  it('un prefijo repetido o demasiado largo es `INVALID_EMAIL`', () => {
    expect(reasonsOf(listAccountsQuerySchema, { email: ['a', 'b'] })).toEqual([
      'email:INVALID_EMAIL',
    ]);
    expect(reasonsOf(listAccountsQuerySchema, { email: 'a'.repeat(255) })).toEqual([
      'email:INVALID_EMAIL',
    ]);
  });
});

describe('clientFilesQuerySchema (CA-13)', () => {
  it('CA-13: exige un correo exacto y válido; lo recorta y pasa a minúsculas', () => {
    expect(clientFilesQuerySchema.parse({ email: ' Ana@Nimbo.me ' })).toEqual({
      email: 'ana@nimbo.me',
      page: 1,
    });
  });

  it.each([
    [{}, 'email:REQUIRED'],
    [{ email: '' }, 'email:REQUIRED'],
    [{ email: 'ana@' }, 'email:INVALID_EMAIL'],
    [{ email: 'ana@nimbo.me', page: '0' }, 'page:INVALID_PAGE'],
  ])('%j da %s', (query, reason) => {
    expect(reasonsOf(clientFilesQuerySchema, query)).toEqual([reason]);
  });
});

describe('accountListItemSchema (CA-1)', () => {
  it('CA-1: un cliente trae plan y espacio usado en bytes como texto decimal', () => {
    expect(accountListItemSchema.parse(clientItem)).toEqual(clientItem);
  });

  it('CA-1: en una interna plan y espacio no aplican (`null`)', () => {
    expect(accountListItemSchema.parse(internalItem)).toEqual(internalItem);
  });

  it.each([
    ['un número', 3221225472],
    ['un decimal', '1.5'],
    ['un negativo', '-1'],
    ['ceros a la izquierda', '007'],
  ])('ADR-0016: rechaza los bytes como %s', (_case, usedBytes) => {
    expect(accountListItemSchema.safeParse({ ...clientItem, usedBytes }).success).toBe(false);
  });

  it('es estricto: un campo extra (datos de archivos, código de empleado) se rechaza', () => {
    expect(accountListItemSchema.safeParse({ ...clientItem, files: [] }).success).toBe(false);
    expect(accountListItemSchema.safeParse({ ...internalItem, employeeCode: 'X' }).success).toBe(
      false,
    );
  });

  it('el estado es `active` o `suspended`', () => {
    expect(accountListItemSchema.safeParse({ ...clientItem, status: 'activa' }).success).toBe(
      false,
    );
  });
});

describe('accountListResponseSchema (CA-1)', () => {
  it('CA-1: página con `page`, `pageSize` = 10 y `total`', () => {
    const page = { items: [clientItem, internalItem], page: 1, pageSize: 10, total: 2 };

    expect(accountListResponseSchema.parse(page)).toEqual(page);
    expect(accountListResponseSchema.safeParse({ ...page, pageSize: 20 }).success).toBe(false);
  });

  it('no admite más de 10 elementos', () => {
    const items = Array.from({ length: 11 }, () => clientItem);

    expect(
      accountListResponseSchema.safeParse({ items, page: 1, pageSize: 10, total: 11 }).success,
    ).toBe(false);
  });
});

describe('backofficeMetricsResponseSchema (CA-12)', () => {
  const metrics = {
    accounts: { total: 12, clients: 9, internal: 3, byStatus: { active: 11, suspended: 1 } },
    usedBytesTotal: THREE_GIB,
    byPlan: [{ planId: PLAN_ID, name: 'Personal', deactivatedAt: null, clientCount: 9 }],
  };

  it('CA-12: solo totales y conteos; la suma de bytes como texto decimal', () => {
    expect(backofficeMetricsResponseSchema.parse(metrics)).toEqual(metrics);
  });

  it('CA-12: es estricto: no admite filas de cuentas', () => {
    expect(
      backofficeMetricsResponseSchema.safeParse({ ...metrics, accountsList: [] }).success,
    ).toBe(false);
    expect(
      backofficeMetricsResponseSchema.safeParse({ ...metrics, usedBytesTotal: 3221225472 }).success,
    ).toBe(false);
  });
});

describe('clientFilesResponseSchema (CA-13)', () => {
  const page = {
    client: { id: ID, fullName: 'Ana López', email: 'ana@nimbo.me' },
    items: [fileItem, { ...fileItem, trashedAt: AT }],
    page: 1,
    pageSize: 10,
    total: 2,
  };

  it('CA-13: metadatos con estado de papelera y tamaño como texto decimal', () => {
    expect(clientFilesResponseSchema.parse(page)).toEqual(page);
  });

  it.each(['contentUrl', 'objectKey', 'versions', 'text'])(
    'CA-13: es estricto: un archivo con `%s` se rechaza',
    (key) => {
      const items = [{ ...fileItem, [key]: 'x' }];

      expect(clientFilesResponseSchema.safeParse({ ...page, items }).success).toBe(false);
    },
  );
});
