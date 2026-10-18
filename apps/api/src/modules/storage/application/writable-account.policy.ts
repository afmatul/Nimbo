import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';
import { AccountReadOnlyError } from '../domain/errors';

import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider, PlanLimits } from './plan-limits';

/** ADR-0029 regla 2: para los servicios que ya leyeron los límites (carga y restauración de versión). */
export const assertWritableLimits = (limits: Pick<PlanLimits, 'readOnly'>): void => {
  if (limits.readOnly) throw new AccountReadOnlyError();
};

/**
 * Único lugar de `storage` que interpreta `PlanLimits.readOnly` (spec 010 CA-13, RN-6; ADR-0029). No es un guard de
 * Nest: los servicios de escritura lo llaman antes de abrir su transacción, en el `api` o en el `worker`.
 */
@Injectable()
export class WritableAccountPolicy {
  constructor(@Inject(I_PLAN_LIMITS_PROVIDER) private readonly plans: IPlanLimitsProvider) {}

  async assertWritable(actor: Actor): Promise<void> {
    assertWritableLimits(await this.plans.limitsFor(actor));
  }
}
