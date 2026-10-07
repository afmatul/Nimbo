import type { AuditEventResponse, ListAuditEventsResponse } from '@nimbo/contracts';

/** Evento del contrato para pruebas: una carga completada por la propia cuenta el 5 oct 2026. */
export function auditEvent(overrides: Partial<AuditEventResponse> = {}): AuditEventResponse {
  return {
    id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
    occurredAt: '2026-10-05T15:15:00.000Z',
    action: 'file.upload_completed',
    origin: 'self',
    actorRole: 'CLIENT',
    resourceType: 'file',
    itemCount: null,
    sizeBytes: 12_000_000,
    ...overrides,
  };
}

/** Restauración hecha por Soporte con su motivo (CA-13). */
export const SUPPORT_RESTORE = auditEvent({
  id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  action: 'node.restored',
  origin: 'staff',
  actorRole: 'SUPPORT',
  resourceType: 'folder',
  itemCount: 3,
  sizeBytes: null,
  note: 'Restauración pedida por ti en el caso 4821.',
});

export function activityPage(
  items: readonly AuditEventResponse[],
  nextCursor: string | null = null,
): ListAuditEventsResponse {
  return { items: [...items], nextCursor };
}
