import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { I_SUBSCRIPTION_ADMINISTRATION_READER } from './ports/i-subscription-administration.reader.port';
import type {
  ISubscriptionAdministrationReader,
  PlanClientCount,
} from './ports/i-subscription-administration.reader.port';

/**
 * Fachada de `billing` para `backoffice` (spec 009 T-03; acuerdo con la 011, `arreglos-011.md` puntos 1 a 4): el nombre
 * del plan de cada cliente de una página (ficha del Administrador, «—» sin fila) y los clientes por plan (métricas; los
 * clientes sin fila no cuentan en ningún plan). El rol lo comprueba la base: Soporte no lee nada y Operador solo conteos.
 */
@Injectable()
export class SubscriptionAdministration {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_ADMINISTRATION_READER)
    private readonly reader: ISubscriptionAdministrationReader,
  ) {}

  planNamesFor(actor: Actor, clientIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (clientIds.length === 0) return Promise.resolve(new Map());
    return this.transactions.withActor(actor, () => this.reader.planNamesFor(actor, clientIds));
  }

  clientCountsByPlan(actor: Actor): Promise<readonly PlanClientCount[]> {
    return this.transactions.withActor(actor, () => this.reader.clientCountsByPlan(actor));
  }
}
