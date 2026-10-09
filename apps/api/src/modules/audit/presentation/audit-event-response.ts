import { AUDIT_TRIGGERS } from '@nimbo/contracts';
import type { AuditEventResponse, AuditTrigger } from '@nimbo/contracts';

import type { AuditAttributeValue, AuditEntry } from '../domain/audit-entry';
import type { AuditOrigin } from '../domain/audit-query';

const numberOrNull = (value: AuditAttributeValue | undefined): number | null =>
  typeof value === 'number' ? value : null;

const isTrigger = (value: AuditAttributeValue | undefined): value is AuditTrigger =>
  (AUDIT_TRIGGERS as readonly unknown[]).includes(value);

/** «Yo» solo si el actor es el afectado; cualquier otro, incluido el actor anonimizado (`null`, D-8), es personal. */
const originOf = (entry: AuditEntry): AuditOrigin =>
  entry.actorId === entry.targetUserId ? 'self' : 'staff';

/**
 * Lista blanca `AuditEntry → AuditEventResponse` (plan 004 §2, CA-14): no copia `actorId`, `correlationId`,
 * `resourceId` ni atributos fuera de `itemCount`, `sizeBytes`, `note` y `trigger`; `note` solo sale si el evento lo
 * tiene (RN-6) y `trigger` solo si es uno de los valores cerrados del contrato (CA-7).
 */
export function toAuditEventResponse(entry: AuditEntry): AuditEventResponse {
  const { itemCount, sizeBytes, note, trigger } = entry.attributes;
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
    ...(isTrigger(trigger) && { trigger }),
  };
}
