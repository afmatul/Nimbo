import { AUDIT_NOTE_MAX_LENGTH as CONTRACT_NOTE_MAX_LENGTH } from '@nimbo/contracts';

import { AUDIT_NOTE_MAX_LENGTH, sanitizeAttributes } from '../domain/attribute-sanitizer';

import { AuditAction } from './audit-action';
import { AUDIT_CATALOG, resourceTypeOf } from './audit-catalog';

const VERSION_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const SESSION_ID = '0b6f1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

/** Lo que emiten 005 (`upload.service`, `file.service`), 006 (`trash.service`), 014 (plan §5) y 011 (`backoffice`). */
const REAL_ATTRIBUTES: Readonly<Record<AuditAction, Record<string, string | number | boolean>>> = {
  [AuditAction.FILE_UPLOAD_COMPLETED]: { sizeBytes: 12_582_912, mode: 'multipart' },
  [AuditAction.FILE_UPLOAD_REJECTED]: { reason: 'TYPE_MISMATCH', mode: 'simple', sizeBytes: 2048 },
  [AuditAction.FILE_DOWNLOAD_URL_ISSUED]: { sizeBytes: 12_582_912 },
  [AuditAction.NODE_TRASHED]: { nodeType: 'folder', itemCount: 3, sizeBytes: 2048 },
  [AuditAction.NODE_RESTORED]: {
    nodeType: 'file',
    itemCount: 1,
    sizeBytes: 1024,
    note: 'El cliente lo pidió por teléfono',
  },
  [AuditAction.NODE_PURGED]: {
    nodeType: 'file',
    itemCount: 1,
    sizeBytes: 1024,
    trigger: 'scheduled',
  },
  [AuditAction.TRASH_EMPTIED]: { itemCount: 4, sizeBytes: 4096 },
  [AuditAction.FILE_VERSION_RESTORED]: {
    versionId: VERSION_ID,
    versionNumber: 4,
    restoredFromNumber: 2,
    sizeBytes: 2048,
  },
  [AuditAction.FILE_VERSION_PRUNED]: { versionId: VERSION_ID, versionNumber: 1, sizeBytes: 1024 },
  [AuditAction.ACCOUNT_SUSPENDED]: {},
  [AuditAction.ACCOUNT_REACTIVATED]: {},
  [AuditAction.ACCOUNT_INTERNAL_CREATED]: { role: 'SUPPORT' },
  [AuditAction.ACCOUNT_BOOTSTRAP_ADMIN]: {},
  [AuditAction.ACCOUNT_QUOTA_ADJUSTED]: {
    extraBytes: 5_368_709_120,
    until: '2026-12-01T06:00:00.000Z',
  },
  [AuditAction.ACCOUNT_VALIDITY_ADJUSTED]: { expiresAt: '2027-01-01T06:00:00.000Z' },
  [AuditAction.CLIENT_FILES_VIEWED]: {},
  [AuditAction.PLAN_CREATED]: {},
  [AuditAction.PLAN_DEACTIVATED]: {},
  [AuditAction.SUBSCRIPTION_AUTO_RENEW_CHANGED]: { enabled: false },
  [AuditAction.SUBSCRIPTION_RENEWED]: {
    trigger: 'scheduled',
    planSlug: 'equipo',
    amountCents: 11_000,
  },
  [AuditAction.SUBSCRIPTION_RENEWAL_REJECTED]: { trigger: 'manual', planSlug: 'equipo' },
  [AuditAction.SUBSCRIPTION_READ_ONLY_ENTERED]: {},
  [AuditAction.SUBSCRIPTION_READ_ONLY_EXITED]: {},
  [AuditAction.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED]: { planSlug: 'pro' },
  [AuditAction.SUBSCRIPTION_PLAN_CHANGE_CANCELLED]: {},
  [AuditAction.SUBSCRIPTION_PLAN_CHANGE_APPLIED]: { planSlug: 'pro' },
  [AuditAction.SUBSCRIPTION_PLAN_CHANGE_DISCARDED]: { planSlug: 'pro' },
  [AuditAction.FILE_VERSION_CREATED]: {
    versionId: VERSION_ID,
    versionNumber: 5,
    sizeBytes: 4096,
    sessionId: SESSION_ID,
  },
  [AuditAction.EDIT_SESSION_OPENED]: { sessionId: SESSION_ID },
  [AuditAction.EDIT_SAVE_FAILED]: { sessionId: SESSION_ID, reason: 'integridad' },
  [AuditAction.FILE_INDEXED]: { versionId: VERSION_ID, durationMs: 4210, fragmentCount: 37 },
  [AuditAction.FILE_INDEX_UNINDEXABLE]: {
    versionId: VERSION_ID,
    reason: 'sin_texto',
    durationMs: 830,
  },
  [AuditAction.FILE_INDEX_FAILED]: {
    versionId: VERSION_ID,
    reason: 'proveedor_no_disponible',
    durationMs: 12_400,
  },
  [AuditAction.FILE_INDEX_RETRIED]: { versionId: VERSION_ID },
  [AuditAction.SHARE_GRANTED]: { nodeType: 'folder', level: 'EDITOR' },
  [AuditAction.SHARE_LEVEL_CHANGED]: { nodeType: 'file', level: 'VIEWER' },
  [AuditAction.SHARE_REVOKED]: { nodeType: 'file', level: 'EDITOR' },
  [AuditAction.PUBLIC_LINK_CREATED]: { expiresInDays: 7, protection: 'password' },
  [AuditAction.PUBLIC_LINK_REVOKED]: { reason: 'replaced' },
  [AuditAction.PUBLIC_LINK_DOWNLOADED]: { trigger: 'public_link' },
  [AuditAction.PUBLIC_LINK_LOCKED]: { trigger: 'public_link' },
  [AuditAction.FILE_OPTIMIZED]: {
    optimizationId: SESSION_ID,
    sourceVersionId: VERSION_ID,
    versionId: VERSION_ID,
    originalBytes: 4_800_000,
    resultBytes: 2_000_000,
  },
  [AuditAction.FILE_OPTIMIZATION_DISCARDED]: {
    optimizationId: SESSION_ID,
    sourceVersionId: VERSION_ID,
    originalBytes: 4_800_000,
    resultBytes: 4_700_000,
    reason: 'ahorro_minimo',
  },
  [AuditAction.FILE_OPTIMIZATION_FAILED]: {
    optimizationId: SESSION_ID,
    sourceVersionId: VERSION_ID,
    originalBytes: 4_800_000,
    reason: 'integridad',
  },
};

describe('AUDIT_CATALOG', () => {
  it('RN-3: toda acción del catálogo cerrado tiene su entrada, y solo ellas', () => {
    expect(Object.keys(AUDIT_CATALOG).sort()).toEqual(Object.values(AuditAction).sort());
  });

  it.each(Object.values(AuditAction))(
    'CA-2: los atributos que emite hoy `%s` se guardan completos',
    (action) => {
      const raw = REAL_ATTRIBUTES[action];

      const result = sanitizeAttributes(AUDIT_CATALOG[action].attributes, raw);

      expect(result).toEqual({ attributes: raw, rejections: [] });
    },
  );

  it('011 §5: el alta interna guarda solo el rol, uno de los tres internos', () => {
    const rules = AUDIT_CATALOG[AuditAction.ACCOUNT_INTERNAL_CREATED].attributes;

    const result = sanitizeAttributes(rules, { role: 'CLIENT', email: 'ana@nimbo.me' });

    expect(result.attributes).toEqual({});
    expect(result.rejections.map((rejection) => rejection.key).sort()).toEqual(['email', 'role']);
  });

  it('014 CA-19: un reemplazo guarda en `file.upload_completed` que reemplazó, la versión y su número', () => {
    const raw = {
      sizeBytes: 2048,
      mode: 'simple',
      replaced: true,
      versionId: VERSION_ID,
      versionNumber: 2,
    };

    const result = sanitizeAttributes(
      AUDIT_CATALOG[AuditAction.FILE_UPLOAD_COMPLETED].attributes,
      raw,
    );

    expect(result).toEqual({ attributes: raw, rejections: [] });
  });

  it('010 §5: la suscripción no guarda datos de tarjeta ni la referencia del instrumento', () => {
    const rules = AUDIT_CATALOG[AuditAction.SUBSCRIPTION_RENEWED].attributes;

    const result = sanitizeAttributes(rules, {
      trigger: 'scheduled',
      planSlug: 'equipo',
      amountCents: 11_000,
      cardLast4: '4242',
      instrumentRef: 'SIM-TOK-x',
    });

    expect(result.attributes).toEqual({
      trigger: 'scheduled',
      planSlug: 'equipo',
      amountCents: 11_000,
    });
    expect(result.rejections.map((rejection) => rejection.key).sort()).toEqual([
      'cardLast4',
      'instrumentRef',
    ]);
  });

  it.each([
    AuditAction.FILE_INDEXED,
    AuditAction.FILE_INDEX_UNINDEXABLE,
    AuditAction.FILE_INDEX_FAILED,
    AuditAction.FILE_INDEX_RETRIED,
  ])(
    '019 CA-21: `%s` es sobre el archivo y descarta texto, nombre, extracto y vector',
    (action) => {
      const leaked = {
        text: 'contenido del cliente',
        fileName: 'informe.docx',
        excerpt: 'párrafo citado',
        embedding: '[0.1,0.2]',
      };

      const result = sanitizeAttributes(AUDIT_CATALOG[action].attributes, leaked);

      expect(AUDIT_CATALOG[action].resourceType).toBe('file');
      expect(result.attributes).toEqual({});
      expect(result.rejections.map((rejection) => rejection.key).sort()).toEqual(
        ['embedding', 'excerpt', 'fileName', 'text'].sort(),
      );
    },
  );

  it('019 CA-21: el motivo de indexación es uno del catálogo cerrado del contrato', () => {
    const rules = AUDIT_CATALOG[AuditAction.FILE_INDEX_FAILED].attributes;

    const result = sanitizeAttributes(rules, { reason: 'el proveedor respondió: clave inválida' });

    expect(result.attributes).toEqual({});
    expect(result.rejections.map((rejection) => rejection.key)).toEqual(['reason']);
  });

  it.each([AuditAction.SHARE_GRANTED, AuditAction.SHARE_LEVEL_CHANGED, AuditAction.SHARE_REVOKED])(
    '012 CA-19: `%s` guarda tipo de nodo y nivel, y descarta nombre, correo y `OWNER`',
    (action) => {
      const raw = {
        nodeType: 'file',
        level: 'OWNER',
        fileName: 'informe.pdf',
        email: 'b@nimbo.me',
      };

      const result = sanitizeAttributes(AUDIT_CATALOG[action].attributes, raw);

      expect(result.attributes).toEqual({ nodeType: 'file' });
      expect(result.rejections.map((rejection) => rejection.key).sort()).toEqual(
        ['email', 'fileName', 'level'].sort(),
      );
    },
  );

  it('013 CA-15: un enlace público guarda vencimiento, protección y motivo; descarta token, contraseña, IP y nombre', () => {
    const raw = {
      expiresInDays: 30,
      protection: 'clave',
      reason: 'expired',
      token: 'q3Zx',
      password: 'secreta-123',
      ip: '203.0.113.7',
      fileName: 'informe.pdf',
    };

    const created = sanitizeAttributes(
      AUDIT_CATALOG[AuditAction.PUBLIC_LINK_CREATED].attributes,
      raw,
    );
    const revoked = sanitizeAttributes(
      AUDIT_CATALOG[AuditAction.PUBLIC_LINK_REVOKED].attributes,
      raw,
    );

    expect(created.attributes).toEqual({ expiresInDays: 30 });
    expect(revoked.attributes).toEqual({});
    expect(created.rejections.map((rejection) => rejection.key).sort()).toEqual(
      ['fileName', 'ip', 'password', 'protection', 'reason', 'token'].sort(),
    );
  });

  it.each([AuditAction.PUBLIC_LINK_DOWNLOADED, AuditAction.PUBLIC_LINK_LOCKED])(
    '013 CA-18: `%s` guarda solo `trigger` del catálogo cerrado; descarta token, IP, contraseña y nombre',
    (action) => {
      const result = sanitizeAttributes(AUDIT_CATALOG[action].attributes, {
        trigger: 'public_link',
        token: 'q3Zx',
        ip: '203.0.113.7',
        password: 'secreta-123',
        fileName: 'informe.pdf',
      });

      expect(result.attributes).toEqual({ trigger: 'public_link' });
      for (const trigger of ['visitante', 'manual', 'scheduled']) {
        expect(
          sanitizeAttributes(AUDIT_CATALOG[action].attributes, { trigger }).attributes,
        ).toEqual({});
      }
    },
  );

  it('011b RN-4: solo `node.restored` admite el motivo escrito de Soporte (`note`)', () => {
    const withNote = Object.values(AuditAction).filter((action) =>
      Object.hasOwn(AUDIT_CATALOG[action].attributes, 'note'),
    );

    expect(withNote).toEqual([AuditAction.NODE_RESTORED]);
  });

  it('CA-4: el tope de texto del saneo es el del motivo en el contrato', () => {
    expect(AUDIT_NOTE_MAX_LENGTH).toBe(CONTRACT_NOTE_MAX_LENGTH);
  });
});

describe('resourceTypeOf', () => {
  it.each([
    [AuditAction.FILE_UPLOAD_COMPLETED, {}, 'file'],
    [AuditAction.FILE_UPLOAD_REJECTED, {}, 'upload'],
    [AuditAction.FILE_DOWNLOAD_URL_ISSUED, {}, 'file'],
    [AuditAction.NODE_TRASHED, { nodeType: 'folder' }, 'folder'],
    [AuditAction.NODE_RESTORED, { nodeType: 'file' }, 'file'],
    [AuditAction.NODE_PURGED, { nodeType: 'folder' }, 'folder'],
    [AuditAction.TRASH_EMPTIED, {}, null],
    [AuditAction.FILE_VERSION_RESTORED, {}, 'file'],
    [AuditAction.FILE_VERSION_PRUNED, {}, 'file'],
    [AuditAction.ACCOUNT_SUSPENDED, {}, 'account'],
    [AuditAction.ACCOUNT_REACTIVATED, {}, 'account'],
    [AuditAction.ACCOUNT_INTERNAL_CREATED, {}, 'account'],
    [AuditAction.ACCOUNT_BOOTSTRAP_ADMIN, {}, 'account'],
    [AuditAction.ACCOUNT_QUOTA_ADJUSTED, {}, 'account'],
    [AuditAction.ACCOUNT_VALIDITY_ADJUSTED, {}, 'account'],
    [AuditAction.CLIENT_FILES_VIEWED, {}, 'account'],
    [AuditAction.PLAN_CREATED, {}, 'plan'],
    [AuditAction.PLAN_DEACTIVATED, {}, 'plan'],
    [AuditAction.FILE_INDEXED, {}, 'file'],
    [AuditAction.FILE_INDEX_RETRIED, {}, 'file'],
    [AuditAction.SHARE_GRANTED, { nodeType: 'folder' }, 'folder'],
    [AuditAction.SHARE_LEVEL_CHANGED, { nodeType: 'file' }, 'file'],
    [AuditAction.SHARE_REVOKED, { nodeType: 'folder' }, 'folder'],
    [AuditAction.PUBLIC_LINK_CREATED, {}, 'file'],
    [AuditAction.PUBLIC_LINK_REVOKED, {}, 'file'],
    [AuditAction.PUBLIC_LINK_DOWNLOADED, {}, 'file'],
    [AuditAction.PUBLIC_LINK_LOCKED, {}, 'file'],
  ] as const)('D-3: `%s` con %p es de tipo %p', (action, attributes, expected) => {
    expect(resourceTypeOf(action, attributes)).toBe(expected);
  });

  it('D-3: sin un `nodeType` válido, el tipo derivado es `null`', () => {
    expect(resourceTypeOf(AuditAction.NODE_TRASHED, {})).toBeNull();
    expect(resourceTypeOf(AuditAction.NODE_TRASHED, { nodeType: 'usuario' })).toBeNull();
  });
});
