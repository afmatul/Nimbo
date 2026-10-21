import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import { PlanCatalogService, SubscriptionAdministration } from '../../billing';
import type { NewPlan, Plan, PlanClientCount } from '../../billing';

import type { BackofficeLogger } from './backoffice-logger';
import { InternalActionService } from './internal-action.service';

/** Un plan del catálogo con cuántos clientes con suscripción lo tienen (011 CA-8; conteo agregado, sin nombres). */
export interface PlanCatalogEntry {
  readonly plan: Plan;
  readonly clientCount: number;
}

/** Los cambios de catálogo se auditan sin afectado: ningún cliente los ve en «Mi actividad» (plan §3). */
const planEvent = (action: AuditAction, actor: Actor, planId: string): AuditRecord => ({
  action,
  actor,
  targetUserId: null,
  resourceId: planId,
});

const clientCountOf = (counts: readonly PlanClientCount[], planId: string): number =>
  counts.find((count) => count.planId === planId)?.clientCount ?? 0;

/**
 * Catálogo de planes para el Administrador (011 CA-8 a CA-11; plan §2; nombre de M8). Compone fachadas de `billing`:
 * el catálogo y los conteos de suscripciones. Las reglas de un plan (CA-11, RN-4) las valida `billing`: aquí no se
 * revalida. La transacción, el actor activo y el evento los pone `InternalActionService`; sin candado del padrón, que
 * es solo de las cuentas. No autoriza por rol: eso es `@Roles(ADMIN)`.
 */
@Injectable()
export class CatalogAdminService {
  constructor(
    @Inject(InternalActionService)
    private readonly internal: Pick<InternalActionService, 'read' | 'run'>,
    @Inject(PlanCatalogService)
    private readonly catalog: Pick<PlanCatalogService, 'listAll' | 'create' | 'deactivate'>,
    @Inject(SubscriptionAdministration)
    private readonly subscriptions: Pick<SubscriptionAdministration, 'clientCountsByPlan'>,
    @Inject(PinoLogger) private readonly logger: Pick<BackofficeLogger, 'info'>,
  ) {}

  /** CA-8: todos los planes, activos y desactivados, en el orden del catálogo. */
  list(actor: Actor): Promise<PlanCatalogEntry[]> {
    return this.internal.read(actor, async () => {
      const plans = await this.catalog.listAll(actor);
      const counts = await this.subscriptions.clientCountsByPlan(actor);
      return plans.map((plan) => ({ plan, clientCount: clientCountOf(counts, plan.id) }));
    });
  }

  /** CA-9: el plan nace activo y sin clientes. */
  async create(actor: Actor, newPlan: NewPlan): Promise<PlanCatalogEntry> {
    const plan = await this.internal.run(actor, {
      locksAdminRoster: false,
      work: () => this.catalog.create(actor, newPlan),
      event: (created) => planEvent(AuditAction.PLAN_CREATED, actor, created.id),
    });
    this.logger.info({ event: 'backoffice.plan.created', actorId: actor.id, planId: plan.id });
    return { plan, clientCount: 0 };
  }

  /** CA-10, CA-11: quien ya lo tiene lo conserva, así que el conteo sigue igual. */
  async deactivate(actor: Actor, planId: string): Promise<PlanCatalogEntry> {
    const entry = await this.internal.run(actor, {
      locksAdminRoster: false,
      work: async () => {
        const plan = await this.catalog.deactivate(actor, planId);
        const counts = await this.subscriptions.clientCountsByPlan(actor);
        return { plan, clientCount: clientCountOf(counts, plan.id) };
      },
      event: () => planEvent(AuditAction.PLAN_DEACTIVATED, actor, planId),
    });
    this.logger.info({ event: 'backoffice.plan.deactivated', actorId: actor.id, planId });
    return entry;
  }
}
