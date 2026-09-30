import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { Actor } from '../../../../shared';
import type { IPlanLimitsProvider, PlanLimits } from '../../../storage';
import { PlanNotFoundError } from '../../domain/errors';
import { PlanOrmEntity } from '../persistence/plan.orm-entity';

/**
 * Límites de Personal mientras no existe `suscripcion` (CA-5). No se leen de `usuario` ni de `identity`.
 */
const PERSONAL_MAX_FILE_BYTES = 52428800n;
const PERSONAL_STORAGE_QUOTA_BYTES = 16106127360n;

/**
 * Implementación de `IPlanLimitsProvider` (spec 006a, RN-4). `storage` declara el puerto; este adaptador
 * no importa entidades de `storage`.
 */
@Injectable()
export class PlanLimitsAdapter implements IPlanLimitsProvider {
  constructor(
    @InjectRepository(PlanOrmEntity)
    private readonly planRepository: Repository<PlanOrmEntity>,
  ) {}

  async limitsFor(_actor: Actor): Promise<PlanLimits> {
    return {
      maxFileBytes: PERSONAL_MAX_FILE_BYTES,
      storageQuotaBytes: PERSONAL_STORAGE_QUOTA_BYTES,
    };
  }

  /** CA-2 y CA-4. No está en el puerto de `storage`: 005 fijó `limitsFor` como único método (ISP). */
  async getLimitsByPlanId(planId: string): Promise<PlanLimits> {
    const plan = await this.planRepository.findOneBy({ id: planId });
    if (!plan) {
      throw new PlanNotFoundError(planId);
    }
    return this.toLimits(plan);
  }

  /** CA-3 y CA-4. Misma salvedad que `getLimitsByPlanId`. */
  async getLimitsBySlug(slug: string): Promise<PlanLimits> {
    const plan = await this.planRepository.findOneBy({ slug });
    if (!plan) {
      throw new PlanNotFoundError(slug);
    }
    return this.toLimits(plan);
  }

  private toLimits(plan: PlanOrmEntity): PlanLimits {
    return {
      maxFileBytes: plan.maxArchivoBytes,
      storageQuotaBytes: plan.cuotaBytes,
    };
  }
}
