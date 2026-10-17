import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK } from '../../../shared';
import type { Actor, IClock } from '../../../shared';
import { PlanNotFoundError } from '../domain/errors';
import { PlanAlreadyDeactivatedError } from '../domain/errors/plan-already-deactivated.error';
import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import { NAME_TAKEN_ISSUE, PlanInvalidError } from '../domain/errors/plan-invalid.error';
import { Plan } from '../domain/plan.entity';
import type { NewPlan } from '../domain/plan.entity';

import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';

/** Lo mínimo que el servicio necesita del logger (se inyecta `PinoLogger`; permite un doble en las pruebas). */
interface PlanCatalogLogger {
  error(payload: Record<string, unknown>): void;
}

/**
 * Catálogo de planes (M4): la lista pública de la 008 y el alta y la baja del Administrador de la 011 (CA-9 a CA-11).
 * `backoffice` autoriza y audita antes de llamar y no revalida; estos métodos corren dentro de su transacción. Un plan
 * no se edita (RN-4). El `actor` sigue la convención del plan de la 011 (DF-01); el catálogo no lo filtra.
 */
@Injectable()
export class PlanCatalogService {
  constructor(
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: PlanCatalogLogger,
  ) {}

  /**
   * 008 CA-1, CA-3: solo el fallo de lectura del repositorio se registra como catálogo no disponible; cualquier otra
   * excepción sigue intacta al filtro global como `INTERNAL_ERROR` (plan 008 §5). La bitácora lleva el tipo, sin SQL ni
   * mensaje.
   */
  async list(): Promise<Plan[]> {
    try {
      return await this.plans.findActive();
    } catch (error) {
      if (error instanceof PlanCatalogUnavailableError) {
        this.logger.error({
          event: 'billing.plan_catalog_unavailable',
          code: error.code,
          errorName: error.causeName,
        });
      }
      throw error;
    }
  }

  /** 011 CA-9, CA-11: el plan nace activo; un nombre repetido es 422 con `NAME_TAKEN`. */
  async create(_actor: Actor, newPlan: NewPlan): Promise<Plan> {
    const plan = Plan.create(randomUUID(), newPlan);
    if (!(await this.plans.insert(plan))) throw new PlanInvalidError([NAME_TAKEN_ISSUE]);
    return plan;
  }

  /** 011 CA-10, CA-11: Personal y un plan ya desactivado se rechazan; quien lo tiene lo conserva. */
  async deactivate(_actor: Actor, planId: string): Promise<Plan> {
    const plan = await this.plans.findById(planId);
    if (plan === null) throw new PlanNotFoundError(planId);
    const deactivated = plan.deactivate(this.clock.now());
    if (!(await this.plans.deactivate(deactivated))) throw new PlanAlreadyDeactivatedError();
    return deactivated;
  }
}
