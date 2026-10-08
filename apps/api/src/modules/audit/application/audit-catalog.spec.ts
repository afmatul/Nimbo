import { AUDIT_NOTE_MAX_LENGTH as CONTRACT_NOTE_MAX_LENGTH } from '@nimbo/contracts';

import { AUDIT_NOTE_MAX_LENGTH, sanitizeAttributes } from '../domain/attribute-sanitizer';

import { AuditAction } from './audit-action';
import { AUDIT_CATALOG, resourceTypeOf } from './audit-catalog';

/** Lo que 005 (`upload.service`, `file.service`) y 006 (`trash.service`) emiten hoy. */
const REAL_ATTRIBUTES: Readonly<Record<AuditAction, Record<string, string | number>>> = {
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
  ] as const)('D-3: `%s` con %p es de tipo %p', (action, attributes, expected) => {
    expect(resourceTypeOf(action, attributes)).toBe(expected);
  });

  it('D-3: sin un `nodeType` válido, el tipo derivado es `null`', () => {
    expect(resourceTypeOf(AuditAction.NODE_TRASHED, {})).toBeNull();
    expect(resourceTypeOf(AuditAction.NODE_TRASHED, { nodeType: 'usuario' })).toBeNull();
  });
});
