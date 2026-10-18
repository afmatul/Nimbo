import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  ISubscriptionAdministrationReader,
  PlanClientCount,
} from '../../application/ports/i-subscription-administration.reader.port';

const PLAN_NAMES_SQL = 'SELECT usuario_id, plan FROM nombres_de_plan_por_cliente($1::uuid[])';
const CLIENT_COUNTS_SQL = 'SELECT plan_id, clientes FROM conteo_de_clientes_por_plan()';

/** `ISubscriptionAdministrationReader` sobre las funciones de ADR-0021 (spec 009 T-03), con el actor en la sesión. */
@Injectable()
export class SqlSubscriptionAdministrationReader implements ISubscriptionAdministrationReader {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async planNamesFor(
    actor: Actor,
    clientIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const rows = (await this.context
      .requireActorScope(actor)
      .query(PLAN_NAMES_SQL, [clientIds])) as { usuario_id: string; plan: string }[];
    return new Map(rows.map((row) => [row.usuario_id, row.plan]));
  }

  async clientCountsByPlan(actor: Actor): Promise<readonly PlanClientCount[]> {
    const rows = (await this.context.requireActorScope(actor).query(CLIENT_COUNTS_SQL)) as {
      plan_id: string;
      clientes: number;
    }[];
    return rows.map((row) => ({ planId: row.plan_id, clientCount: row.clientes }));
  }
}
