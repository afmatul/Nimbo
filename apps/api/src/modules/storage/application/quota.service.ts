import { Inject, Injectable } from '@nestjs/common';
import { formatBytes } from '@nimbo/contracts';

import { I_CLOCK } from '../../../shared';
import type { Actor, IClock } from '../../../shared';
import { FileTooLargeError, QuotaExceededError } from '../domain/errors';
import { QuotaPolicy } from '../domain/quota-policy';

import type { PlanLimits } from './plan-limits';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';

/**
 * Responde si cabe una carga (plan §6, CA-3, CA-4, CA-23). Corre **dentro** de la transacción `withActor` que el
 * llamador ya abrió: bloquea la fila del actor y lee lo usado más lo reservado. No abre transacción ni escribe
 * `espacio_usado`. Los límites llegan del llamador, que los pidió a `IPlanLimitsProvider` fuera de la transacción.
 */
@Injectable()
export class QuotaService {
  constructor(
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  /** Lanza `FileTooLargeError` (primero) o `QuotaExceededError`. */
  async assertCanUpload(actor: Actor, declaredBytes: bigint, limits: PlanLimits): Promise<void> {
    const usage = await this.quotas.lockAndReadUsage(actor, this.clock.now());
    const decision = QuotaPolicy.check(limits, usage, declaredBytes);
    if (decision.ok) return;
    if (decision.violation === 'FileTooLarge') {
      throw new FileTooLargeError(decision.sizeBytes, decision.maxBytes, formatBytes);
    }
    throw new QuotaExceededError(decision.missingBytes, formatBytes);
  }
}
