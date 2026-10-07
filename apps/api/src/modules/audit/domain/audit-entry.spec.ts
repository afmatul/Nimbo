import { Role } from '../../../shared/domain/role.enum';

import { createAuditEntry } from './audit-entry';
import type { AuditEntryProps } from './audit-entry';

const PROPS: AuditEntryProps = {
  id: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  action: 'node.trashed',
  actorId: '0b8f7c1e-1111-4a4a-9c9c-000000000001',
  actorRole: Role.SUPPORT,
  targetUserId: '0b8f7c1e-1111-4a4a-9c9c-000000000002',
  resourceType: 'folder',
  resourceId: '0b8f7c1e-1111-4a4a-9c9c-000000000003',
  attributes: { nodeType: 'folder', itemCount: 3 },
  occurredAt: new Date('2026-10-05T10:15:30.123Z'),
  correlationId: 'req-1',
};

describe('AuditEntry', () => {
  it('CA-1: guarda acción, actor y su rol, afectado, recurso, atributos, fecha y `correlationId`', () => {
    expect(createAuditEntry(PROPS)).toEqual(PROPS);
  });

  it('D-8: el actor puede faltar (anonimizado) sin perder su rol', () => {
    const entry = createAuditEntry({ ...PROPS, actorId: null });

    expect(entry.actorId).toBeNull();
    expect(entry.actorRole).toBe(Role.SUPPORT);
  });

  it('RN-2: es inmutable y no comparte los atributos de quien lo creó', () => {
    const attributes = { itemCount: 3 };

    const entry = createAuditEntry({ ...PROPS, attributes });
    attributes.itemCount = 99;

    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.attributes)).toBe(true);
    expect(entry.attributes).toEqual({ itemCount: 3 });
  });
});
