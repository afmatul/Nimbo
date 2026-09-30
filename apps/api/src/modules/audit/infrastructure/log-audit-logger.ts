import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext, I_CLOCK, redactDeep } from '../../../shared';
import type { IClock } from '../../../shared';
import { isAuditAction } from '../application/audit-action';
import type { AuditRecord, IAuditLogger } from '../application/i-audit-logger.port';

/** Lo mínimo que el adaptador necesita del logger (se inyecta `PinoLogger`; permite un doble en las pruebas). */
interface AuditSink {
  info(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}

/**
 * Adaptador provisional de `IAuditLogger` (005 D-11): escribe el evento `audit.record` en Pino, redactado.
 * La tabla de auditoría llega con 004. Nunca lanza: un fallo se anota como `audit.record_failed`.
 */
@Injectable()
export class LogAuditLogger implements IAuditLogger {
  constructor(
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: AuditSink,
  ) {}

  record(entry: AuditRecord): Promise<void> {
    if (!isAuditAction(entry.action)) {
      this.logger.error({ event: 'audit.record_failed', reason: 'unknown_action' });
      return Promise.resolve();
    }
    try {
      this.logger.info(redactDeep(this.toEvent(entry)) as Record<string, unknown>);
    } catch {
      this.logger.error({
        event: 'audit.record_failed',
        action: entry.action,
        reason: 'sink_error',
      });
    }
    return Promise.resolve();
  }

  private toEvent(entry: AuditRecord): Record<string, unknown> {
    const correlationId = CorrelationContext.get()?.correlationId;
    return {
      event: 'audit.record',
      action: entry.action,
      actorId: entry.actor.id,
      actorRole: entry.actor.role,
      targetUserId: entry.targetUserId,
      ...(entry.resourceId !== undefined && { resourceId: entry.resourceId }),
      ...(entry.attributes !== undefined && { attributes: { ...entry.attributes } }),
      occurredAt: this.clock.now().toISOString(),
      ...(correlationId !== undefined && { correlationId }),
    };
  }
}
