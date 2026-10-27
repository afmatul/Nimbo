import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { endOfGuatemalaDay } from '../domain/subscription-adjustment';

import { I_SUBSCRIPTION_ADMINISTRATION_READER } from './ports/i-subscription-administration.reader.port';
import type {
  ISubscriptionAdministrationReader,
  PlanClientCount,
} from './ports/i-subscription-administration.reader.port';
import { I_SUBSCRIPTION_ADMINISTRATION_REPOSITORY } from './ports/i-subscription-administration.repository.port';
import type {
  ISubscriptionAdministrationRepository,
  QuotaChange,
  SubscriptionLimits,
  ValidityAdjustment,
} from './ports/i-subscription-administration.repository.port';

/** Un extra de `bytes` hasta el final de `lastDay`, día de Guatemala `YYYY-MM-DD` (011b RN-1). */
export interface ExtraQuota {
  readonly bytes: bigint;
  readonly lastDay: string;
}

/** `extra: null` quita el extra (`DELETE`, CA-4). */
export interface AdjustQuotaCommand {
  readonly clientId: string;
  readonly extra: ExtraQuota | null;
}

/** El último día de la vigencia nueva, día de Guatemala `YYYY-MM-DD` (011b RN-2). */
export interface AdjustValidityCommand {
  readonly clientId: string;
  readonly lastDay: string;
}

const quotaChangeOf = ({ clientId, extra }: AdjustQuotaCommand): QuotaChange =>
  extra === null
    ? { clientId, extraBytes: 0n, until: null }
    : { clientId, extraBytes: extra.bytes, until: endOfGuatemalaDay(extra.lastDay) };

/**
 * Fachada de `billing` para `backoffice` (spec 009 T-03; acuerdo con la 011, `arreglos-011.md` puntos 1 a 4): el nombre
 * del plan de cada cliente de una página (ficha del Administrador, «—» sin fila) y los clientes por plan (métricas; los
 * clientes sin fila no cuentan en ningún plan). El rol lo comprueba la base: Soporte no lee nada y Operador solo conteos.
 * Con la 011b (DF-81), los límites de una cuenta y los ajustes de cuota y vigencia del Administrador: aquí solo se
 * convierte el día elegido; las reglas viven en las funciones de ADR-0035. Todo corre en la transacción del llamador.
 */
@Injectable()
export class SubscriptionAdministration {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_ADMINISTRATION_READER)
    private readonly reader: ISubscriptionAdministrationReader,
    @Inject(I_SUBSCRIPTION_ADMINISTRATION_REPOSITORY)
    private readonly repository: ISubscriptionAdministrationRepository,
  ) {}

  planNamesFor(actor: Actor, clientIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (clientIds.length === 0) return Promise.resolve(new Map());
    return this.transactions.withActor(actor, () => this.reader.planNamesFor(actor, clientIds));
  }

  clientCountsByPlan(actor: Actor): Promise<readonly PlanClientCount[]> {
    return this.transactions.withActor(actor, () => this.reader.clientCountsByPlan(actor));
  }

  /** HU-5: `null` si la cuenta no tiene suscripción. */
  limitsOf(actor: Actor, clientId: string): Promise<SubscriptionLimits | null> {
    return this.transactions.withActor(actor, () => this.repository.limitsOf(actor, clientId));
  }

  /** CA-1 a CA-4: el extra reemplaza al anterior, o se quita. */
  adjustQuota(actor: Actor, cmd: AdjustQuotaCommand): Promise<SubscriptionLimits> {
    const change = quotaChangeOf(cmd);
    return this.transactions.withActor(actor, () => this.repository.adjustQuota(actor, change));
  }

  /** CA-6 a CA-8: solo el `vence_en` nuevo; ni cobro, ni renovación, ni cambio programado. */
  adjustValidity(actor: Actor, cmd: AdjustValidityCommand): Promise<ValidityAdjustment> {
    const change = { clientId: cmd.clientId, expiresAt: endOfGuatemalaDay(cmd.lastDay) };
    return this.transactions.withActor(actor, () => this.repository.adjustValidity(actor, change));
  }
}
