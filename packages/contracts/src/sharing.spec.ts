import {
  accessEntrySchema,
  accessListQuerySchema,
  accessListSchema,
  receivedShareSchema,
  receivedSharesSchema,
  SHARE_LEVELS,
  shareRequestSchema,
  SHARING_ERROR_CODES,
  SHARING_FIELD_MESSAGES,
} from './sharing';
import { toFieldIssues } from './validation';

const NODE_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const SHARE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const GRANTEE = {
  id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
  displayName: 'Bruno Pérez',
  email: 'bruno@ejemplo.com',
};
const CREATED_AT = '2026-10-30T10:00:00.000Z';

const REQUEST = {
  nodeType: 'folder',
  nodeId: NODE_ID,
  email: 'bruno@ejemplo.com',
  level: 'EDITOR',
};

const DIRECT = {
  shareId: SHARE_ID,
  grantee: GRANTEE,
  level: 'VIEWER',
  origin: 'direct',
  inheritedFrom: null,
  createdAt: CREATED_AT,
};

const INHERITED = {
  ...DIRECT,
  shareId: null,
  origin: 'inherited',
  inheritedFrom: { folderId: NODE_ID, folderName: 'Proyectos' },
};

const RECEIVED = {
  shareId: SHARE_ID,
  nodeType: 'file',
  nodeId: NODE_ID,
  name: 'informe.docx',
  owner: { displayName: 'Ana López' },
  level: 'EDITOR',
  createdAt: CREATED_AT,
};

/** Las razones de los campos que rechaza `shareRequestSchema`, por campo. */
const reasonsOf = (input: unknown): Record<string, unknown> => {
  const result = shareRequestSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    toFieldIssues(result.error).map((issue) => [issue.field, issue.reason]),
  );
};

describe('contratos de `sharing` (plan 012 §4)', () => {
  it('CA-1: la petición de compartir admite archivo o carpeta, `VIEWER` o `EDITOR`, y normaliza el correo', () => {
    expect(shareRequestSchema.parse({ ...REQUEST, email: '  Bruno@Ejemplo.COM ' })).toEqual(
      REQUEST,
    );
    expect(shareRequestSchema.parse({ ...REQUEST, nodeType: 'file', level: 'VIEWER' })).toEqual({
      ...REQUEST,
      nodeType: 'file',
      level: 'VIEWER',
    });
    expect(SHARE_LEVELS).toEqual(['VIEWER', 'EDITOR']);
  });

  it.each(['OWNER', 'viewer', 'ADMIN', '', 3, undefined])(
    'CA-2: el nivel %p se rechaza con la razón `INVALID_LEVEL` y el mensaje de la spec',
    (level) => {
      const result = shareRequestSchema.safeParse({ ...REQUEST, level });

      expect(result.success).toBe(false);
      expect(reasonsOf({ ...REQUEST, level })).toEqual({ level: 'INVALID_LEVEL' });
      expect(result.error?.issues[0]?.message).toBe('Elige si la persona puede ver o editar.');
    },
  );

  it.each([
    ['sin arroba', 'bruno'],
    ['sin dominio', 'bruno@'],
    ['vacío', ''],
    ['de más de 254 caracteres', `${'a'.repeat(250)}@ejemplo.com`],
    ['que no es texto', 42],
  ])('CA-3: un correo %s es un error de validación del campo `email`', (_case, email) => {
    expect(reasonsOf({ ...REQUEST, email })).toEqual({ email: 'INVALID_EMAIL' });
  });

  it('CA-3: un campo desconocido, un tipo de nodo inválido o un id que no es UUID se rechazan', () => {
    expect(shareRequestSchema.safeParse({ ...REQUEST, extra: true }).success).toBe(false);
    expect(shareRequestSchema.safeParse({ ...REQUEST, nodeType: 'upload' }).success).toBe(false);
    expect(shareRequestSchema.safeParse({ ...REQUEST, nodeId: 'abc' }).success).toBe(false);
  });

  it('CA-8: la consulta de accesos pide un tipo de nodo y un UUID, sin campos de más', () => {
    const query = { nodeType: 'file', nodeId: NODE_ID };

    expect(accessListQuerySchema.parse(query)).toEqual(query);
    const result = accessListQuerySchema.safeParse({ nodeType: 'upload', nodeId: 'abc', x: '1' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      toFieldIssues(result.error)
        .map((issue) => `${issue.field}:${issue.reason}`)
        .sort(),
    ).toEqual(['nodeId:INVALID_NODE', 'nodeType:INVALID_NODE', 'x:UNKNOWN_FIELD']);
  });

  it('CA-8: una entrada directa lleva `shareId` y ninguna carpeta de origen', () => {
    expect(accessEntrySchema.parse(DIRECT)).toEqual(DIRECT);
    expect(accessEntrySchema.safeParse({ ...DIRECT, shareId: null }).success).toBe(false);
    expect(
      accessEntrySchema.safeParse({ ...DIRECT, inheritedFrom: INHERITED.inheritedFrom }).success,
    ).toBe(false);
  });

  it('CA-8: una entrada heredada lleva la carpeta que la comparte y ningún `shareId`', () => {
    expect(accessEntrySchema.parse(INHERITED)).toEqual(INHERITED);
    expect(accessEntrySchema.safeParse({ ...INHERITED, shareId: SHARE_ID }).success).toBe(false);
    expect(accessEntrySchema.safeParse({ ...INHERITED, inheritedFrom: null }).success).toBe(false);
  });

  it('CA-2: una entrada nunca tiene nivel `OWNER` (DF-31)', () => {
    expect(accessEntrySchema.safeParse({ ...DIRECT, level: 'OWNER' }).success).toBe(false);
  });

  it('CA-8: la lista de accesos agrupa directos y heredados', () => {
    const list = { entries: [DIRECT, INHERITED] };

    expect(accessListSchema.parse(list)).toEqual(list);
  });

  it('CA-22: lo compartido conmigo lleva nodo, propietario visible, nivel y fecha; sin correo del propietario', () => {
    const list = { entries: [RECEIVED] };

    expect(receivedSharesSchema.parse(list)).toEqual(list);
    expect(receivedSharesSchema.parse({ entries: [] })).toEqual({ entries: [] });
    expect(
      receivedShareSchema.safeParse({
        ...RECEIVED,
        owner: { displayName: 'Ana López', email: 'ana@ejemplo.com' },
      }).success,
    ).toBe(false);
  });

  it('códigos `SHARING_*` estables y mensajes de campo en español', () => {
    expect(Object.values(SHARING_ERROR_CODES)).toEqual([
      'SHARING_INVALID_REQUEST',
      'SHARING_INVALID_LEVEL',
      'SHARING_RECIPIENT_NOT_FOUND',
      'SHARING_CANNOT_SHARE_WITH_SELF',
      'SHARING_SHARE_NOT_FOUND',
    ]);
    expect(SHARING_FIELD_MESSAGES.INVALID_LEVEL).toBe('Elige si la persona puede ver o editar.');
  });
});
