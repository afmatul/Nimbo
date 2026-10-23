import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext, errorName, I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { sanitizeAttributes } from '../domain/attribute-sanitizer';
import type { AttributeRejection } from '../domain/attribute-sanitizer';
import { isSystemActor } from '../domain/audit-actor';
import type { AuditActor } from '../domain/audit-actor';
import { createAuditEntry } from '../domain/audit-entry';
import type { AuditAttributes, AuditEntry, AuditResourceType } from '../domain/audit-entry';
import type { AuditQuery } from '../domain/audit-query';

import { isAuditAction } from './audit-action';
import type { AuditAction } from './audit-action';
import { AUDIT_CATALOG, resourceTypeOf } from './audit-catalog';
import type { AuditRecord, IAuditLogger } from './i-audit-logger.port';
import { I_AUDIT_REPOSITORY } from './ports/i-audit.repository.port';
import type { AuditPage, IAuditRepository } from './ports/i-audit.repository.port';
import { UnknownAuditActionError } from './unknown-audit-action.error';

/** Lo mínimo que el servicio necesita del logger (se inyecta `PinoLogger`; permite un doble en las pruebas). */
interface AuditTechnicalLog {
  info(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}

const RECORD_FAILED = 'audit.record_failed';

interface AuditResource {
  readonly resourceType: AuditResourceType | null;
  readonly resourceId: string | null;
}

const NO_RESOURCE: AuditResource = { resourceType: null, resourceId: null };

/** Tipo e id del recurso van juntos (`ck_evento_recurso`): si falta uno, el evento queda sin recurso. */
function resourceOf(entry: AuditRecord, attributes: AuditAttributes): AuditResource {
  const resourceType = resourceTypeOf(entry.action, attributes);
  if (resourceType === null || entry.resourceId === undefined) return NO_RESOURCE;
  return { resourceType, resourceId: entry.resourceId };
}

/** Claves descartadas por motivo, en el orden en que aparecen: la bitácora nunca lleva el valor (CA-4). */
function keysByReason(rejections: readonly AttributeRejection[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const { code, key } of rejections) grouped.set(code, [...(grouped.get(code) ?? []), key]);
  return grouped;
}

/** La línea `audit.record` de 005 (D-11), ahora tras guardar: solo identificadores y atributos ya saneados. */
const recordLine = (entry: AuditEntry): Record<string, unknown> => ({
  event: 'audit.record',
  action: entry.action,
  actorId: entry.actorId,
  actorRole: entry.actorRole,
  targetUserId: entry.targetUserId,
  ...(entry.resourceId !== null && { resourceId: entry.resourceId }),
  attributes: entry.attributes,
  occurredAt: entry.occurredAt.toISOString(),
});

const errorNameOf = (error: unknown): string => errorName(error);

/** El sistema no tiene `actor_id` (`ck_evento_sistema`, 011 plan §3). */
const actorIdOf = (actor: AuditActor): string | null => (isSystemActor(actor) ? null : actor.id);

/**
 * `IAuditLogger` persistente (T2, plan 004 §2): `record` (mejor esfuerzo) y `recordInTransaction` (síncrona) delegan
 * en `append`, que sanea con el catálogo, arma el `AuditEntry` y lo inserta dentro de `withActor(entry.actor)`; así se
 * une a la transacción vigente del mismo actor o abre la suya. Con `SYSTEM_ACTOR` inserta dentro de `run`, que se une
 * al `run` del llamador (011 CA-7, T1). `listForUser` lee la actividad propia.
 */
@Injectable()
export class AuditService implements IAuditLogger {
  constructor(
    @Inject(I_AUDIT_REPOSITORY) private readonly repository: IAuditRepository,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: AuditTechnicalLog,
  ) {}

  async record(entry: AuditRecord): Promise<void> {
    if (!isAuditAction(entry.action)) {
      this.logger.error({ event: RECORD_FAILED, reason: 'unknown_action' });
      return;
    }
    try {
      this.logger.info(recordLine(await this.append(entry)));
    } catch (error) {
      this.logger.error({
        event: RECORD_FAILED,
        action: entry.action,
        reason: 'write_failed',
        errorName: errorNameOf(error),
      });
    }
  }

  async recordInTransaction(entry: AuditRecord): Promise<void> {
    if (!isAuditAction(entry.action)) throw new UnknownAuditActionError();
    await this.append(entry);
  }

  /** Página de los eventos donde `actor` es el afectado (CA-7, CA-12): el filtro va dentro del SQL, nunca después. */
  listForUser(actor: Actor, query: AuditQuery): Promise<AuditPage> {
    return this.transactions.withActor(actor, () => this.repository.listForTarget(actor, query));
  }

  /** Inserción estricta: lanza si no puede guardar. */
  private async append(entry: AuditRecord): Promise<AuditEntry> {
    const auditEntry = this.toEntry(entry);
    await this.inTransactionOf(entry.actor, () => this.repository.insert(entry.actor, auditEntry));
    return auditEntry;
  }

  /** Una persona escribe con su actor fijado en la base; el sistema, en la transacción sin actor (`run`). */
  private inTransactionOf(actor: AuditActor, work: () => Promise<void>): Promise<void> {
    if (isSystemActor(actor)) return this.transactions.run(work);
    return this.transactions.withActor(actor, work);
  }

  private toEntry(entry: AuditRecord): AuditEntry {
    const rules = AUDIT_CATALOG[entry.action].attributes;
    const { attributes, rejections } = sanitizeAttributes(rules, entry.attributes);
    this.logRejections(entry.action, rejections);
    return createAuditEntry({
      id: randomUUID(),
      action: entry.action,
      actorId: actorIdOf(entry.actor),
      actorRole: entry.actor.role,
      targetUserId: entry.targetUserId,
      ...resourceOf(entry, attributes),
      attributes,
      occurredAt: this.clock.now(),
      correlationId: CorrelationContext.get()?.correlationId ?? null,
    });
  }

  private logRejections(action: AuditAction, rejections: readonly AttributeRejection[]): void {
    for (const [reason, keys] of keysByReason(rejections)) {
      this.logger.error({ event: RECORD_FAILED, action, reason, keys });
    }
  }
}
