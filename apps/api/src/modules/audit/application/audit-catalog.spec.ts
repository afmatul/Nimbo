import { AUDIT_NOTE_MAX_LENGTH as CONTRACT_NOTE_MAX_LENGTH } from '@nimbo/contracts';

import { AUDIT_NOTE_MAX_LENGTH, sanitizeAttributes } from '../domain/attribute-sanitizer';

import { AuditAction } from './audit-action';
import { AUDIT_CATALOG, resourceTypeOf } from './audit-catalog';

const VERSION_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/** Lo que emiten 005 (`upload.service`, `file.service`), 006 (`trash.service`), 014 (plan §5) y 011 (`backoffice`). */
const REAL_ATTRIBUTES: Readonly<Record<AuditAction, Record<string, string | number | boolean>>> = {
  [AuditAction.FILE_UPLOAD_COMPLETED]: { sizeBytes: 12_582_912, mode: 'multipart' },
  [AuditAction.FILE_UPLOAD_REJECTED]: { reason: 'TYPE_MISMATCH', mode: 'simple', sizeBytes: 2048 },
  [AuditAction.FILE_DOWNLOAD_URL_ISSUED]: { sizeBytes: 12_582_912 },
  [AuditAction.NODE_TRASHED]: { nodeType: 'folder', itemCount: 3, sizeBytes: 2048 },
  [AuditAction.NODE_RESTORED]: { nodeType: 'file', itemCount: 1, sizeBytes: 1024 },
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
  [AuditAction.CLIENT_FILES_VIEWED]: {},
  [AuditAction.PLAN_CREATED]: {},
  [AuditAction.PLAN_DEACTIVATED]: {},
  [AuditAction.SUBSCRIPTION_AUTO_RENEW_CHANGED]: { enabled: false },
  [AuditAction.SUBSCRIPTION_RENEWED]: {
    trigger: 'automatic',
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
      trigger: 'automatic',
      planSlug: 'equipo',
      amountCents: 11_000,
      cardLast4: '4242',
      instrumentRef: 'SIM-TOK-x',
    });

    expect(result.attributes).toEqual({
      trigger: 'automatic',
      planSlug: 'equipo',
      amountCents: 11_000,
    });
    expect(result.rejections.map((rejection) => rejection.key).sort()).toEqual([
      'cardLast4',
      'instrumentRef',
    ]);
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
    [AuditAction.CLIENT_FILES_VIEWED, {}, 'account'],
    [AuditAction.PLAN_CREATED, {}, 'plan'],
    [AuditAction.PLAN_DEACTIVATED, {}, 'plan'],
  ] as const)('D-3: `%s` con %p es de tipo %p', (action, attributes, expected) => {
    expect(resourceTypeOf(action, attributes)).toBe(expected);
  });

  it('D-3: sin un `nodeType` válido, el tipo derivado es `null`', () => {
    expect(resourceTypeOf(AuditAction.NODE_TRASHED, {})).toBeNull();
    expect(resourceTypeOf(AuditAction.NODE_TRASHED, { nodeType: 'usuario' })).toBeNull();
  });
});
