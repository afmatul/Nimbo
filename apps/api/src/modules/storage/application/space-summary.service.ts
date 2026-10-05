import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { QuotaPolicy } from '../domain/quota-policy';
import type { SpaceBreakdown } from '../domain/space-breakdown';

import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider } from './plan-limits';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { SpaceMeasurer } from './space-measurer';

/** Resumen de espacio de la cuenta (spec 007 CA-1 a CA-3, CA-6), en bytes `bigint`. */
export interface SpaceSummary {
  readonly planName: string;
  readonly usedBytes: bigint;
  /** Cargas en curso (005 RN-13). */
  readonly reservedBytes: bigint;
  readonly quotaBytes: bigint;
  readonly availableBytes: bigint;
  readonly maxFileBytes: bigint;
  readonly trashRetentionDays: number;
  readonly breakdown: SpaceBreakdown;
}

/**
 * `GET /storage/summary` (plan 007 §2): los límites del plan fuera de la transacción (D-15) y, dentro de `withActor`,
 * lo usado y lo reservado sin bloqueo (D-1) más la medición del desglose. Leerlo no se audita (spec §5).
 */
@Injectable()
export class SpaceSummaryService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly plans: IPlanLimitsProvider,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(SpaceMeasurer) private readonly measurer: SpaceMeasurer,
  ) {}

  async summary(actor: Actor): Promise<SpaceSummary> {
    const limits = await this.plans.limitsFor(actor);
    const { usage, breakdown } = await this.transactions.withActor(actor, async () => ({
      usage: await this.quotas.readUsage(actor, this.clock.now()),
      breakdown: await this.measurer.measure(actor),
    }));
    return {
      planName: limits.planName,
      ...usage,
      quotaBytes: limits.storageQuotaBytes,
      availableBytes: QuotaPolicy.available(limits, usage),
      maxFileBytes: limits.maxFileBytes,
      trashRetentionDays: limits.trashRetentionDays,
      breakdown,
    };
  }
}
