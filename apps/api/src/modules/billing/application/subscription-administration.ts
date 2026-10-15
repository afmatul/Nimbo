import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';
import { PlanNotFoundError } from '../domain/errors';
import { PERSONAL_PLAN_SLUG } from '../domain/plan-slug';
import type { Plan } from '../domain/plan.entity';

import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';

/** Clientes de un plan, para las métricas (011 CA-12). `backoffice` suma nombre, estado y los planes sin clientes. */
export interface PlanClientCount {
  readonly planId: string;
  readonly clientCount: number;
}

/**
 * Fachada de suscripciones para `backoffice` (spec 011 CA-1 y CA-12, PD-80; clase sin interfaz, DF-04). Solo nombres
 * y conteos: ningún rol interno lee filas de suscripción. Hasta la 009 no existe `suscripcion` y rige la regla de
 * `PlanLimitsAdapter`: todo cliente es Personal (011 R-6). La 009 T-03 la cambia por la lectura de la suscripción.
 */
@Injectable()
export class SubscriptionAdministration {
  constructor(@Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  /** CA-1: el nombre del plan de cada cliente, por id. */
  async planNamesFor(
    _actor: Actor,
    clientIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const { name } = await this.personal();
    return new Map(clientIds.map((id) => [id, name]));
  }

  /** CA-12: cuántos clientes tiene cada plan (`clientCount` es el total de clientes de `identity`). */
  async clientCountsByPlan(
    _actor: Actor,
    clientCount: number,
  ): Promise<readonly PlanClientCount[]> {
    const { id } = await this.personal();
    return [{ planId: id, clientCount }];
  }

  private async personal(): Promise<Plan> {
    const plan = await this.plans.findBySlug(PERSONAL_PLAN_SLUG);
    if (plan === null) throw new PlanNotFoundError(PERSONAL_PLAN_SLUG);
    return plan;
  }
}
