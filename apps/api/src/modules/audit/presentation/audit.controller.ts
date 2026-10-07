import { Controller, Get, Query } from '@nestjs/common';
import { listAuditEventsQuerySchema } from '@nimbo/contracts';
import type { ListAuditEventsQuery, ListAuditEventsResponse } from '@nimbo/contracts';

import { ALL_ROLES, CurrentActor, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor, DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import { AuditService } from '../application/audit.service';
import { createAuditQuery, InvalidAuditQueryError } from '../domain/audit-query';
import type { AuditQuery } from '../domain/audit-query';

import { toAuditEventResponse } from './audit-event-response';

/** Fábrica de `ZodValidationPipe`: 400 `AUDIT_INVALID_QUERY` con los motivos por campo del contrato. */
export const auditQueryValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new InvalidAuditQueryError(issues);

/** Los instantes ISO de la consulta a `Date`; lo ausente no viaja (D-8). */
function toAuditQuery({ from, to, origin, cursor }: ListAuditEventsQuery): AuditQuery {
  return createAuditQuery({
    ...(from !== undefined && { from: new Date(from) }),
    ...(to !== undefined && { to: new Date(to) }),
    ...(origin !== undefined && { origin }),
    ...(cursor !== undefined && { cursor }),
  });
}

/**
 * Actividad propia (plan 004 §4, D-10): una sola ruta de lectura, para los cuatro roles y siempre sobre la cuenta del
 * actor como afectado (CA-12). No hay ruta por id ni por usuario, ni ninguna que modifique un evento (CA-6, CA-8).
 */
@Roles(...ALL_ROLES)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('my-events')
  async myEvents(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(listAuditEventsQuerySchema, auditQueryValidationError))
    query: ListAuditEventsQuery,
  ): Promise<ListAuditEventsResponse> {
    const page = await this.audit.listForUser(actor, toAuditQuery(query));
    return { items: page.entries.map(toAuditEventResponse), nextCursor: page.nextCursor };
  }
}
