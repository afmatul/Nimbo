import {
  batchShareRequestSchema,
  accessEntrySchema,
  accessListQuerySchema,
  accessListSchema,
  createdPublicLinkSchema,
  createPublicLinkSchema,
  currentPublicLinkSchema,
  PUBLIC_LINK_DEFAULT_EXPIRY_DAYS,
  PUBLIC_LINK_EXPIRY_OPTIONS,
  PUBLIC_LINK_PASSWORD_MAX_LENGTH,
  PUBLIC_LINK_PASSWORD_MIN_LENGTH,
  publicLinkDetailsSchema,
  publicLinkDownloadSchema,
  publicLinkOpenSchema,
  publicLinkQuerySchema,
  publicLinkSummarySchema,
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
      'SHARING_LINK_NOT_FOUND',
      'SHARING_LINK_UNAVAILABLE',
      'SHARING_LINK_PASSWORD_INVALID',
    ]);
    expect(SHARING_FIELD_MESSAGES.INVALID_LEVEL).toBe('Elige si la persona puede ver o editar.');
  });
});

const TOKEN = 'q3Vb0Zt9yQh2mXo4LkN8rT1sW6uE5aJc7dF0gH2iK4M';
const EXPIRES_AT = '2026-11-06T10:00:00.000Z';
const SUMMARY = {
  id: SHARE_ID,
  fileId: NODE_ID,
  expiresAt: EXPIRES_AT,
  hasPassword: true,
  status: 'active',
  createdAt: CREATED_AT,
};
const DETAILS = {
  name: 'informe.docx',
  sizeBytes: 12_582_912,
  sharedBy: { displayName: 'Ana López' },
  expiresAt: EXPIRES_AT,
  requiresPassword: false,
};

/** Las razones de los campos que rechaza `createPublicLinkSchema`, por campo. */
const linkReasonsOf = (input: unknown): Record<string, unknown> => {
  const result = createPublicLinkSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    toFieldIssues(result.error).map((issue) => [issue.field, issue.reason]),
  );
};

describe('contratos de enlaces públicos (plan 013 §4)', () => {
  it('CA-1: el vencimiento es 1, 7 o 30 días, 7 por omisión, y la contraseña es opcional', () => {
    expect(PUBLIC_LINK_EXPIRY_OPTIONS).toEqual([1, 7, 30]);
    expect(PUBLIC_LINK_DEFAULT_EXPIRY_DAYS).toBe(7);
    expect(createPublicLinkSchema.parse({ fileId: NODE_ID })).toEqual({
      fileId: NODE_ID,
      expiresInDays: 7,
    });
    expect(
      createPublicLinkSchema.parse({ fileId: NODE_ID, expiresInDays: 30, password: 'abcdefgh' }),
    ).toEqual({ fileId: NODE_ID, expiresInDays: 30, password: 'abcdefgh' });
  });

  it.each([0, 2, 31, '7', null, 7.5])(
    'CA-2: el vencimiento %p se rechaza con la razón `INVALID_EXPIRY` y su mensaje',
    (expiresInDays) => {
      const result = createPublicLinkSchema.safeParse({ fileId: NODE_ID, expiresInDays });

      expect(linkReasonsOf({ fileId: NODE_ID, expiresInDays })).toEqual({
        expiresInDays: 'INVALID_EXPIRY',
      });
      expect(result.error?.issues[0]?.message).toBe('Elige un vencimiento de 1, 7 o 30 días.');
    },
  );

  it.each([
    ['de 7 caracteres', 'a'.repeat(PUBLIC_LINK_PASSWORD_MIN_LENGTH - 1)],
    ['de 129 caracteres', 'a'.repeat(PUBLIC_LINK_PASSWORD_MAX_LENGTH + 1)],
    ['vacía', ''],
    ['que no es texto', 12345678],
  ])('CA-2: una contraseña %s se rechaza con la razón `INVALID_PASSWORD`', (_case, password) => {
    expect(linkReasonsOf({ fileId: NODE_ID, password })).toEqual({
      password: 'INVALID_PASSWORD',
    });
  });

  it('CA-16 (013b): el mensaje de una contraseña inválida pide de 8 a 128 caracteres, sin «deja el campo vacío»', () => {
    const result = createPublicLinkSchema.safeParse({ fileId: NODE_ID, password: '' });

    expect(SHARING_FIELD_MESSAGES.INVALID_PASSWORD).toBe(
      'Escribe una contraseña de 8 a 128 caracteres.',
    );
    expect(result.error?.issues[0]?.message).toBe(SHARING_FIELD_MESSAGES.INVALID_PASSWORD);
  });

  it('CA-2: la contraseña admite de 8 a 128 caracteres (S-2)', () => {
    expect(PUBLIC_LINK_PASSWORD_MIN_LENGTH).toBe(8);
    expect(PUBLIC_LINK_PASSWORD_MAX_LENGTH).toBe(128);
    for (const password of ['a'.repeat(8), 'a'.repeat(128)]) {
      expect(createPublicLinkSchema.safeParse({ fileId: NODE_ID, password }).success).toBe(true);
    }
  });

  it('CA-2: un archivo que no es UUID o un campo de más se rechazan al generar', () => {
    expect(linkReasonsOf({ fileId: 'abc' })).toEqual({ fileId: 'INVALID_NODE' });
    expect(linkReasonsOf({ fileId: NODE_ID, folderId: NODE_ID })).toEqual({
      folderId: 'UNKNOWN_FIELD',
    });
  });

  it('CA-7: la consulta del enlace vigente pide solo un `fileId` UUID', () => {
    expect(publicLinkQuerySchema.parse({ fileId: NODE_ID })).toEqual({ fileId: NODE_ID });
    expect(publicLinkQuerySchema.safeParse({ fileId: 'abc' }).success).toBe(false);
    expect(publicLinkQuerySchema.safeParse({ fileId: NODE_ID, x: '1' }).success).toBe(false);
  });

  it('CA-7: el resumen lleva vencimiento, contraseña, estado y creación; nunca token ni URL', () => {
    expect(publicLinkSummarySchema.parse(SUMMARY)).toEqual(SUMMARY);
    expect(publicLinkSummarySchema.parse({ ...SUMMARY, status: 'expired' }).status).toBe('expired');
    expect(publicLinkSummarySchema.safeParse({ ...SUMMARY, status: 'revoked' }).success).toBe(
      false,
    );
    expect(publicLinkSummarySchema.safeParse({ ...SUMMARY, token: TOKEN }).success).toBe(false);
    expect(publicLinkSummarySchema.safeParse({ ...SUMMARY, url: 'https://x' }).success).toBe(false);
  });

  it('CA-7: el enlace vigente de un archivo es su resumen o `null`', () => {
    expect(currentPublicLinkSchema.parse({ link: SUMMARY })).toEqual({ link: SUMMARY });
    expect(currentPublicLinkSchema.parse({ link: null })).toEqual({ link: null });
  });

  it('CA-1: la respuesta de generar lleva el resumen y la URL, sin el token aparte', () => {
    const created = { link: SUMMARY, url: `https://nimbo.app/enlace#${TOKEN}` };

    expect(createdPublicLinkSchema.parse(created)).toEqual(created);
    expect(createdPublicLinkSchema.safeParse({ ...created, token: TOKEN }).success).toBe(false);
  });

  it('CA-17, D-4: abrir acepta solo el token; descargar, el token y la contraseña opcional', () => {
    expect(publicLinkOpenSchema.parse({ token: TOKEN })).toEqual({ token: TOKEN });
    expect(publicLinkDownloadSchema.parse({ token: TOKEN })).toEqual({ token: TOKEN });
    expect(publicLinkDownloadSchema.parse({ token: TOKEN, password: 'secreta1' })).toEqual({
      token: TOKEN,
      password: 'secreta1',
    });
  });

  it.each([
    ['`fileId`', { fileId: NODE_ID }],
    ['`ownerId`', { ownerId: NODE_ID }],
    ['`linkId`', { linkId: SHARE_ID }],
  ])('CA-17, D-4: un cuerpo público con %s de más se rechaza', (_field, extra) => {
    expect(publicLinkOpenSchema.safeParse({ token: TOKEN, ...extra }).success).toBe(false);
    expect(publicLinkDownloadSchema.safeParse({ token: TOKEN, ...extra }).success).toBe(false);
  });

  it('CA-12, D-4: descargar acepta `""` (ausente para CA-12) y hasta 128 caracteres; con más se rechaza', () => {
    const longest = 'x'.repeat(PUBLIC_LINK_PASSWORD_MAX_LENGTH);

    expect(publicLinkDownloadSchema.parse({ token: TOKEN, password: '' })).toEqual({
      token: TOKEN,
      password: '',
    });
    expect(publicLinkDownloadSchema.parse({ token: TOKEN, password: longest }).password).toBe(
      longest,
    );
    expect(
      publicLinkDownloadSchema.safeParse({ token: TOKEN, password: `${longest}x` }).success,
    ).toBe(false);
  });

  it('CA-17, D-4: abrir no acepta contraseña', () => {
    expect(publicLinkOpenSchema.safeParse({ token: TOKEN, password: 'secreta1' }).success).toBe(
      false,
    );
  });

  it.each([
    ['sin token', {}],
    ['con un token que no es texto', { token: 42 }],
    ['con una contraseña que no es texto', { token: TOKEN, password: 42 }],
  ])('CA-11: un cuerpo de descarga %s se rechaza', (_case, body) => {
    expect(publicLinkDownloadSchema.safeParse(body).success).toBe(false);
  });

  it('CA-9: la ficha lleva nombre, tamaño, quien comparte, vencimiento y si pide contraseña; nada más', () => {
    expect(publicLinkDetailsSchema.parse(DETAILS)).toEqual(DETAILS);
    for (const extra of [{ fileId: NODE_ID }, { folderId: NODE_ID }, { ownerId: NODE_ID }]) {
      expect(publicLinkDetailsSchema.safeParse({ ...DETAILS, ...extra }).success).toBe(false);
    }
    expect(
      publicLinkDetailsSchema.safeParse({
        ...DETAILS,
        sharedBy: { displayName: 'Ana López', email: 'ana@ejemplo.com' },
      }).success,
    ).toBe(false);
  });
});

describe('batchShareRequestSchema (compartir por lote)', () => {
  const items = [{ type: 'folder', id: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' }];

  it('normaliza el correo y acepta los mismos niveles que `POST /shares`', () => {
    expect(
      batchShareRequestSchema.parse({ items, email: ' Bruno@Ejemplo.com ', level: 'EDITOR' }),
    ).toEqual({ items, email: 'bruno@ejemplo.com', level: 'EDITOR' });
  });

  it('rechaza un nivel desconocido, un correo inválido o un lote vacío', () => {
    const base = { items, email: 'bruno@ejemplo.com', level: 'VIEWER' };

    expect(batchShareRequestSchema.safeParse({ ...base, level: 'OWNER' }).success).toBe(false);
    expect(batchShareRequestSchema.safeParse({ ...base, email: 'bruno' }).success).toBe(false);
    expect(batchShareRequestSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });
});
