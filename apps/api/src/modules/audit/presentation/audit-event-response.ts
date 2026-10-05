import type { AuditEventResponse } from '@nimbo/contracts';

import type { AuditAttributeValue, AuditEntry } from '../domain/audit-entry';
import type { AuditOrigin } from '../domain/audit-query';

const numberOrNull = (value: AuditAttributeValue | undefined): number | null =>
  typeof value === 'number' ? value : null;

/** «Yo» solo si el actor es el afectado; cualquier otro, incluido el actor anonimizado (`null`, D-8), es personal. */
const originOf = (entry: AuditEntry): AuditOrigin =>
  entry.actorId === entry.targetUserId ? 'self' : 'staff';

/**
 * Lista blanca `AuditEntry → AuditEventResponse` (plan 004 §2, CA-14): no copia `actorId`, `correlationId`,
 * `resourceId` ni atributos fuera de `itemCount`, `sizeBytes` y `note`; `note` solo sale si el evento lo tiene (RN-6).
 */
export function toAuditEventResponse(entry: AuditEntry): AuditEventResponse {
  const { itemCount, sizeBytes, note } = entry.attributes;
  return {
    id: entry.id,
    occurredAt: entry.occurredAt.toISOString(),
    action: entry.action,
    origin: originOf(entry),
    actorRole: entry.actorRole,
    resourceType: entry.resourceType,
    itemCount: numberOrNull(itemCount),
    sizeBytes: numberOrNull(sizeBytes),
    ...(typeof note === 'string' && { note }),
  };
}
