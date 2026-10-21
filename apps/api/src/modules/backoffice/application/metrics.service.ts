import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';
import { PlanCatalogService, SubscriptionAdministration } from '../../billing';
import type { Plan, PlanClientCount } from '../../billing';
import { AccountDirectory } from '../../identity';
import type { AccountStatistics } from '../../identity';

import { InternalActionService } from './internal-action.service';

/** Clientes con suscripción en un plan, con su nombre y estado del catálogo (011 CA-12). */
export interface PlanClientMetric {
  readonly planId: string;
  readonly name: string;
  readonly deactivatedAt: Date | null;
  readonly clientCount: number;
}

/** Solo totales y conteos, nunca filas de una cuenta (CA-12). */
export interface BackofficeMetrics {
  readonly accounts: AccountStatistics;
  readonly byPlan: readonly PlanClientMetric[];
}

/**
 * Activos siempre (0 si no tienen clientes) y desactivados solo si aún los tienen, en el orden del catálogo. Un cliente
 * sin suscripción no está en ningún conteo, así que la suma puede quedar bajo el total de clientes (plan R-6).
 */
const byPlanOf = (
  plans: readonly Plan[],
  counts: readonly PlanClientCount[],
): PlanClientMetric[] => {
  const clientsOf = new Map(counts.map((count) => [count.planId, count.clientCount]));
  return plans
    .map((plan) => ({
      planId: plan.id,
      name: plan.name,
      deactivatedAt: plan.deactivatedAt,
      clientCount: clientsOf.get(plan.id) ?? 0,
    }))
    .filter((metric) => metric.deactivatedAt === null || metric.clientCount > 0);
};

/**
 * Tablero del Administrador y del Operador (011 CA-12; plan §2; nombre de M8). Compone fachadas: los totales de cuentas
 * y la suma de `usuario.espacio_usado` son de `identity`; los conteos por plan y el catálogo, de `billing`. Lectura sin
 * evento en `InternalActionService.read` (actor interno activo). No autoriza por rol: eso es `@Roles(ADMIN, OPERATOR)`.
 */
@Injectable()
export class MetricsService {
  constructor(
    @Inject(InternalActionService) private readonly internal: Pick<InternalActionService, 'read'>,
    @Inject(AccountDirectory) private readonly directory: Pick<AccountDirectory, 'statistics'>,
    @Inject(SubscriptionAdministration)
    private readonly subscriptions: Pick<SubscriptionAdministration, 'clientCountsByPlan'>,
    @Inject(PlanCatalogService) private readonly catalog: Pick<PlanCatalogService, 'listAll'>,
  ) {}

  read(actor: Actor): Promise<BackofficeMetrics> {
    return this.internal.read(actor, async () => {
      const accounts = await this.directory.statistics(actor);
      const counts = await this.subscriptions.clientCountsByPlan(actor);
      const plans = await this.catalog.listAll(actor);
      return { accounts, byPlan: byPlanOf(plans, counts) };
    });
  }
}
