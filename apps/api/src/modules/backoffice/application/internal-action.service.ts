import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { I_AUDIT_LOGGER } from '../../audit';
import type { AuditRecord, IAuditLogger } from '../../audit';
import { AccountAdministration, ActorNotActiveError } from '../../identity';

import type { BackofficeLogger } from './backoffice-logger';
import { BackofficeRateLimiter } from './backoffice-rate-limiter';

/** Una acción del backoffice y el evento que la deja en la auditoría del cliente (RN-2). */
export interface InternalAction<T> {
  /** Acciones sobre cuentas (RN-7): toman el candado del padrón de Administradores antes de comprobar al actor. */
  readonly locksAdminRoster: boolean;
  work(): Promise<T>;
  /**
   * El evento se arma con lo que devolvió la acción (p. ej. el id de la cuenta creada). Puede ser una lista, en orden:
   * extender la vigencia suma la salida de solo lectura de la 010 (011b RN-4, DF-81).
   */
  event(result: T): AuditRecord | readonly AuditRecord[];
}

const isRecordList = (
  event: AuditRecord | readonly AuditRecord[],
): event is readonly AuditRecord[] => Array.isArray(event);

/** Un evento o una lista, siempre como lista: los llamadores que devuelven uno solo no cambian. */
const recordsOf = (event: AuditRecord | readonly AuditRecord[]): readonly AuditRecord[] =>
  isRecordList(event) ? event : [event];

/** Lo que este servicio usa de `AccountAdministration`; permite un doble en las pruebas. */
type ActorGate = Pick<AccountAdministration, 'lockAdminRoster' | 'assertActorActive'>;

/** Lo que este servicio usa del limitador de tasa; permite un doble en las pruebas. */
type RateGate = Pick<BackofficeRateLimiter, 'assertAllowed'>;

/**
 * Única dueña de «transacción + actor activo + evento» en el backoffice (011 plan §1, §2; nombre de M8; clase sin
 * interfaz, Art. V.2). Toda operación, lecturas incluidas, corre en `withActor` y comprueba una vez que el actor interno
 * sigue `activa` (RN-7, CA-14: si no, `403 SHARED_FORBIDDEN` aunque su token valga). No autoriza por rol (`RolesGuard`)
 * ni valida: eso lo hacen el controlador y el módulo dueño. Antes de la transacción comprueba el límite de tasa de la
 * cuenta interna (T-14, PD-103), que es el único paso por el que pasa toda operación del backoffice.
 */
@Injectable()
export class InternalActionService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(AccountAdministration) private readonly accounts: ActorGate,
    @Inject(BackofficeRateLimiter) private readonly limiter: RateGate,
    @Inject(I_AUDIT_LOGGER) private readonly audit: Pick<IAuditLogger, 'recordInTransaction'>,
    @Inject(PinoLogger) private readonly logger: Pick<BackofficeLogger, 'warn'>,
  ) {}

  /** Lectura sin evento: comprueba al actor y lee en su transacción. */
  async read<T>(actor: Actor, work: () => Promise<T>): Promise<T> {
    await this.limiter.assertAllowed(actor);
    return this.transactions.withActor(actor, async () => {
      await this.assertActive(actor);
      return work();
    });
  }

  /**
   * Acción y evento en la misma transacción (004 D-5): si el evento no se guarda, la acción se revierte. El candado va
   * antes de la comprobación para que una suspensión concurrente del propio actor se vea (plan §7 R-2).
   */
  async run<T>(actor: Actor, action: InternalAction<T>): Promise<T> {
    await this.limiter.assertAllowed(actor);
    return this.transactions.withActor(actor, async () => {
      if (action.locksAdminRoster) {
        await this.accounts.lockAdminRoster();
      }
      await this.assertActive(actor);
      const result = await action.work();
      for (const record of recordsOf(action.event(result))) {
        await this.audit.recordInTransaction(record);
      }
      return result;
    });
  }

  /** Un interno suspendido que aún usa su token deja rastro (RN-7), solo con su id y su rol (RNF-17). */
  private async assertActive(actor: Actor): Promise<void> {
    try {
      await this.accounts.assertActorActive(actor);
    } catch (error: unknown) {
      if (error instanceof ActorNotActiveError) {
        this.logger.warn({
          event: 'backoffice.actor.inactive',
          actorId: actor.id,
          actorRole: actor.role,
        });
      }
      throw error;
    }
  }
}
