import { auditEventResponseSchema } from '@nimbo/contracts';

import { Role } from '../../../shared';
import { createAuditEntry } from '../domain/audit-entry';
import type { AuditEntry, AuditEntryProps } from '../domain/audit-entry';

import { toAuditEventResponse } from './audit-event-response';

const EVENT_ID = '0b8f7c1e-4444-4a4a-9c9c-000000000004';
const CLIENT_ID = '0b8f7c1e-1111-4a4a-9c9c-000000000001';
const SUPPORT_ID = '0b8f7c1e-2222-4a4a-9c9c-000000000002';
const FOLDER_ID = '0b8f7c1e-3333-4a4a-9c9c-000000000003';
const CORRELATION_ID = 'corr-123';
const OCCURRED_AT = new Date('2026-10-05T12:00:00.000Z');
const FILE_NAME = 'presupuesto-secreto.docx';

const entryOf = (overrides: Partial<AuditEntryProps> = {}): AuditEntry =>
  createAuditEntry({
    id: EVENT_ID,
    action: 'node.trashed',
    actorId: CLIENT_ID,
    actorRole: Role.CLIENT,
    targetUserId: CLIENT_ID,
    resourceType: 'folder',
    resourceId: FOLDER_ID,
    attributes: { nodeType: 'folder', itemCount: 3, sizeBytes: 2048 },
    occurredAt: OCCURRED_AT,
    correlationId: CORRELATION_ID,
    ...overrides,
  });

describe('toAuditEventResponse (lista blanca, CA-14)', () => {
  it('CA-7: arma el DTO con fecha ISO, acción, origen, rol, tipo de recurso, conteo y tamaño', () => {
    const response = toAuditEventResponse(entryOf());

    expect(response).toEqual({
      id: EVENT_ID,
      occurredAt: OCCURRED_AT.toISOString(),
      action: 'node.trashed',
      origin: 'self',
      actorRole: Role.CLIENT,
      resourceType: 'folder',
      itemCount: 3,
      sizeBytes: 2048,
    });
    expect(auditEventResponseSchema.safeParse(response).success).toBe(true);
  });

  it('CA-14: no copia `actorId`, `correlationId`, `resourceId` ni atributos no previstos', () => {
    const entry = entryOf({
      actorId: SUPPORT_ID,
      actorRole: Role.SUPPORT,
      attributes: { itemCount: 1, fileName: FILE_NAME, url: 'https://minio.local/firmada' },
    });

    const response = toAuditEventResponse(entry);
    const serialized = JSON.stringify(response);

    expect(Object.keys(response).sort()).toEqual([
      'action',
      'actorRole',
      'id',
      'itemCount',
      'occurredAt',
      'origin',
      'resourceType',
      'sizeBytes',
    ]);
    for (const forbidden of [SUPPORT_ID, CORRELATION_ID, FOLDER_ID, FILE_NAME, 'minio.local']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('RN-6: `note` sale solo si el evento lo tiene', () => {
    const withNote = toAuditEventResponse(entryOf({ attributes: { note: 'Ajuste pedido.' } }));
    const withoutNote = toAuditEventResponse(entryOf());

    expect(withNote.note).toBe('Ajuste pedido.');
    expect(withoutNote).not.toHaveProperty('note');
  });

  it('D-3: conteo y tamaño ausentes o no numéricos son `null`', () => {
    const response = toAuditEventResponse(entryOf({ attributes: { itemCount: '3' } }));

    expect(response).toMatchObject({ itemCount: null, sizeBytes: null });
  });

  it.each([
    ['el actor es el afectado', CLIENT_ID, 'self'],
    ['el actor es personal de Nimbo', SUPPORT_ID, 'staff'],
    ['el actor se anonimizó (D-8)', null, 'staff'],
  ] as const)('CA-10: si %s, el origen es `%s`', (_case, actorId, origin) => {
    expect(toAuditEventResponse(entryOf({ actorId })).origin).toBe(origin);
  });
});
